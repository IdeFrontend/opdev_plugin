/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import {
  spawn, ChildProcess, exec,
} from 'child_process';
import { EventEmitter } from 'events';
import * as vscode from 'vscode';

import {
  appendLog,
  getOperatorToolOutputChannel,
  type OperatorToolOutputLabel,
} from '@plugin/helpers/output-channel';

const COMMAND_LOG_SCOPE = 'op-devtools/command';

const ASCEND_SPAWN_ENV_KEYS = [
  'SOC_VERSION',
  'NPU_ARCH',
] as const;

function pickAscendSpawnEnv(env?: NodeJS.ProcessEnv): Record<string, string> | undefined {
  if (!env) {
    return undefined;
  }

  const picked: Record<string, string> = {};

  for (const key of ASCEND_SPAWN_ENV_KEYS) {
    const value = env[key];

    if (value !== undefined && value !== '') {
      picked[key] = value;
    }
  }

  return Object.keys(picked).length > 0 ? picked : undefined;
}

interface CommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeout?: number;
  // Whether to output in real time (streaming output)
  streaming?: boolean;
  /** Per-run tool output tab label, e.g. compile / run (see Op Dev Tools: …). */
  toolOutputLabel?: OperatorToolOutputLabel | string;
}

interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
  output: string;
  interruptedByUserStop: boolean;
  timedOut: boolean;
}

/**
 * Grace period between the child exiting and giving up on its stdio pipes.
 *
 * `close` only fires once every process holding the inherited stdout/stderr
 * write ends is gone, so a lingering grandchild (daemon, profiling agent,
 * orphaned worker) keeps the run pending forever even though the command
 * itself already finished — the same command run by hand in a terminal returns
 * immediately, because the shell only waits for the foreground job.
 */
const STREAM_DRAIN_GRACE_MS = 2000;

/**
 * Deadline for the escalated `taskkill` retry on Windows.
 *
 * `taskkill` itself can hang (a wedged child, a busy WMI provider), and an
 * unbounded escalation is the same bug as no escalation: the run is reported
 * as stopped while the child keeps holding the build directory. Bounding it
 * lets the callback fire so the direct child is terminated anyway.
 */
const TASKKILL_ESCALATION_TIMEOUT_MS = 2000;

class CommandExecutor extends EventEmitter {
  private process: ChildProcess | null = null;
  private stdout: string = '';
  private stderr: string = '';
  private output: string = '';
  private interruptedByUserStop = false;
  private timedOut = false;

  // ANSI escape code regular expression
  private readonly ansiRegex = /\x1b\[[0-9;]*[a-zA-Z]/g;

  // Backspace character regular expression (\b or \x08)
  private readonly backspaceRegex = /\x08/g;

  constructor() {
    super();
  }

  /**
   * Filter ANSI escape codes and backspace characters (synchronous mode)
   */
  private stripAnsiCodes(text: string): string {
    // Filter backspace characters first
    let cleanText = text.replace(this.backspaceRegex, '');

    // Then filter ANSI escape codes
    cleanText = cleanText.replace(this.ansiRegex, '');

    return cleanText;
  }

  /**
   * execute command
   * @param command The command to execute
   * @param args command parameters
   * @param options configuration options
   * @param stopKeywords array of keywords that trigger early termination
   * @param isOpenTerminal
   * @returns Promise<CommandResult>
   */
  async execute(
    command: string,
    stopKeywords: string[] = [],
    args: string[] = [],
    options: CommandOptions = {},
    isOpenTerminal: boolean = false,
  ): Promise<CommandResult> {
    return new Promise((resolve) => {
      this.stdout = '';
      this.stderr = '';
      this.output = '';
      this.interruptedByUserStop = false;
      this.timedOut = false;

      const cwd = options.cwd || process.cwd();
      const ascendEnv = pickAscendSpawnEnv(options.env);

      appendLog(COMMAND_LOG_SCOPE, 'Executing', {
        command,
        cwd,
        ...(args.length > 0 ? { args } : {}),
        ...(ascendEnv ? { env: ascendEnv } : {}),
      });

      let outputChannel: vscode.OutputChannel | null = null;

      if (isOpenTerminal) {
        const label = options.toolOutputLabel ?? 'tool';

        outputChannel = getOperatorToolOutputChannel(label);
        outputChannel.show();
        outputChannel.appendLine(command);
      }

      const child = spawn(command, args, {
        cwd,
        env: {
          ...process.env,
          ...options.env,
        },
        shell: true,
        // stdin is never written to, so hand the command /dev/null instead of an
        // idle pipe: anything that reads stdin (a confirmation prompt, `read`,
        // python `input()`) gets EOF at once rather than blocking forever.
        stdio: [
          'ignore',
          'pipe',
          'pipe',
        ],
        // On Windows, detached: false needs to be set, otherwise it cannot be terminated.
        // Set detached: true on Linux/macOS to create a process group
        detached: process.platform !== 'win32',
      });

      this.process = child;

      let timeoutId: NodeJS.Timeout | null = null;
      let drainId: NodeJS.Timeout | null = null;
      let settled = false;

      /** Returns false once the run has already produced its result. */
      const beginSettlement = (): boolean => {
        if (settled) {
          return false;
        }

        settled = true;

        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        if (drainId) {
          clearTimeout(drainId);
          drainId = null;
        }

        return true;
      };

      /**
       * `this.process` and the output buffers live on the executor, which is a shared singleton
       * (ProjectManager.getExecutor()). The drain timer settles up to STREAM_DRAIN_GRACE_MS
       * after exit, so a run started inside that window already owns them: this run then answers
       * from `snapshotAtExit` and leaves the handle alone, instead of resolving with the other
       * run's stdout and nulling out the process its `kill()` needs.
       */
      const settleNow = (code: number | null, snapshotAtExit?: CommandResult) => {
        if (!beginSettlement()) {
          return;
        }

        if (this.process !== child) {
          resolve(snapshotAtExit ?? this.getResult(code));

          return;
        }

        this.process = null;
        resolve(this.getResult(code));
      };

      const settleAfterCleanup = async (code: number | null) => {
        if (!beginSettlement()) {
          return;
        }

        // Snapshot before awaiting: cleanup can take up to 5s, and the executor is a
        // shared singleton (ProjectManager.getExecutor()). A run started inside that
        // window resets stdout/stderr/output/timedOut, so reading them afterwards
        // hands this caller the other run's output and timedOut: false.
        const result = this.getResult(code);

        await this.cleanup();
        resolve(result);
      };

      // Set timeout
      if (options.timeout && options.timeout > 0) {
        timeoutId = setTimeout(async () => {
          if (settled) {
            return;
          }

          this.timedOut = true;
          const message = `Command timed out after ${options.timeout}ms: ${command}`;

          this.stderr += message;
          this.output += message;
          appendLog(COMMAND_LOG_SCOPE, 'Timeout', {
            command,
            timeout: options.timeout,
          });

          if (outputChannel) {
            outputChannel.appendLine(message);
          }

          // cleanup() takes down the whole process group, not just the shell wrapper.
          await settleAfterCleanup(null);
        }, options.timeout);
      }

      // Process standard output
      child.stdout?.on('data', async (data: Buffer) => {
        const text = data.toString();
        // Filter ANSI escape codes
        const cleanText = this.stripAnsiCodes(text);

        if (outputChannel) {
          outputChannel.appendLine(cleanText);
        }

        console.log('execute command, stdout:', cleanText);
        this.stdout += cleanText;
        this.output += cleanText;

        this.emit('stdout', cleanText);

        if (options.streaming) {
          process.stdout.write(cleanText);
        }

        // Check if stop keyword is included
        if (this.checkStopKeywords(cleanText, stopKeywords)) {
          await settleAfterCleanup(0);
        }
      });

      // A stream error (EPIPE when the child is killed mid-write, a closed fd) has no listener
      // otherwise and would come back as an uncaught exception in the extension host. `close`
      // still fires afterwards, so the run settles through the normal path.
      child.stdout?.on('error', (error: Error) => {
        console.error('execute command, stdout stream error:', error);
      });
      child.stderr?.on('error', (error: Error) => {
        console.error('execute command, stderr stream error:', error);
      });

      // Handle error output
      child.stderr?.on('data', async (data: Buffer) => {
        const text = data.toString();
        // Filter ANSI escape codes
        const cleanText = this.stripAnsiCodes(text);

        console.error('execute command, stderr:', cleanText);
        this.stderr += cleanText;
        this.output += cleanText;

        if (outputChannel) {
          outputChannel.appendLine(cleanText);
        }

        this.emit('stderr', cleanText);

        if (options.streaming) {
          process.stderr.write(cleanText);
        }

        // Check if stop keyword is included
        if (this.checkStopKeywords(cleanText, stopKeywords)) {
          await settleAfterCleanup(0);
        }
      });

      const finish = (code: number | null, snapshotAtExit?: CommandResult) => {
        if (code !== 0 && !settled && this.process === child) {
          this.stderr += `Command failed with code ${code}: ${command} ${args.join(' ')}`;
        }

        settleNow(code, snapshotAtExit);
      };

      // The command itself is done here; `close` may still be minutes away (or
      // never arrive) when a grandchild holds the inherited pipes, so only give
      // the remaining output a short window to drain.
      child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
        if (settled || drainId) {
          return;
        }

        const exitCode = code ?? (signal ? -1 : 0);
        // Everything this run produced, taken while the buffers are still unambiguously its
        // own — the drain below settles seconds later, by which time another run may have
        // reset them (see settleNow).
        const snapshotAtExit = this.getResult(exitCode);

        drainId = setTimeout(() => {
          appendLog(COMMAND_LOG_SCOPE, 'Stdio still open after exit', {
            command,
            code: exitCode,
          });
          child.stdout?.destroy();
          child.stderr?.destroy();
          finish(exitCode, snapshotAtExit);
        }, STREAM_DRAIN_GRACE_MS);
      });

      // Processing ends
      child.on('close', (code: number | null) => {
        finish(code);
      });

      // Handling process errors
      child.on('error', () => {
        settleNow(-1);
      });
    });
  }

  async executeDetached(
    command: string,
    readyKeyword: string = 'ready',
    args: string[] = [],
    options: CommandOptions = {},
    isOpenTerminal: boolean = false,
  ): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      this.stdout = '';
      this.stderr = '';
      this.output = '';
      this.timedOut = false;
      this.interruptedByUserStop = false;

      const cwd = options.cwd || process.cwd();
      const ascendEnv = pickAscendSpawnEnv(options.env);

      appendLog(COMMAND_LOG_SCOPE, 'Executing detached', {
        command,
        cwd,
        ...(args.length > 0 ? { args } : {}),
        ...(ascendEnv ? { env: ascendEnv } : {}),
      });

      let outputChannel: vscode.OutputChannel | null = null;

      if (isOpenTerminal) {
        const label = options.toolOutputLabel ?? 'tool';

        outputChannel = getOperatorToolOutputChannel(label);
        outputChannel.show();
        outputChannel.appendLine(command);
      }

      const child = spawn(command, args, {
        cwd,
        env: {
          ...process.env,
          ...options.env,
        },
        shell: true,
        detached: process.platform !== 'win32',
      });

      this.process = child;

      let timeoutId: NodeJS.Timeout | null = null;
      let settled = false;

      const release = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        this.process = null;
      };

      const settleResolve = (result: CommandResult) => {
        if (settled) {
          return;
        }

        settled = true;
        release();
        resolve(result);
      };

      const settleReject = (error: Error) => {
        if (settled) {
          return;
        }

        settled = true;
        release();
        reject(error);
      };

      if (options.timeout && options.timeout > 0) {
        timeoutId = setTimeout(async () => {
          await this.cleanup();
          settleReject(new Error(`Command execution timeout after ${options.timeout}ms`));
        }, options.timeout);
      }

      if (process.platform !== 'win32') {
        child.unref();
      }

      child.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        const cleanText = this.stripAnsiCodes(text);

        if (outputChannel) {
          outputChannel.appendLine(cleanText);
        }

        console.log('executeDetached command, stdout:', cleanText);
        this.stdout += cleanText;
        this.output += cleanText;

        this.emit('stdout', cleanText);

        if (options.streaming) {
          process.stdout.write(cleanText);
        }

        if (cleanText.includes(readyKeyword)) {
          settleResolve(this.getResult(0));
        }
      });

      child.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        const cleanText = this.stripAnsiCodes(text);

        console.error('executeDetached command, stderr:', cleanText);
        this.stderr += cleanText;
        this.output += cleanText;

        if (outputChannel) {
          outputChannel.appendLine(cleanText);
        }

        this.emit('stderr', cleanText);

        if (options.streaming) {
          process.stderr.write(cleanText);
        }

        if (cleanText.includes(readyKeyword)) {
          settleResolve(this.getResult(0));
        }
      });

      child.on('close', (code: number) => {
        const result = this.getResult(code);

        settleResolve(result);
      });

      child.on('error', () => {
        settleResolve(this.getResult(-1));
      });
    });
  }

  /**
   * Check if stop keyword is included
   */
  private checkStopKeywords(text: string, stopKeywords: string[]): boolean {
    if (stopKeywords.length === 0) {
      return false;
    }

    return stopKeywords.some((keyword) =>
      text.toLowerCase()
        .includes(keyword.toLowerCase()));
  }

  /**
   * Get execution results
   */
  private getResult(code: number | null): CommandResult {
    return {
      code,
      stdout: this.stdout,
      stderr: this.stderr,
      output: this.output,
      interruptedByUserStop: this.interruptedByUserStop,
      timedOut: this.timedOut,
    };
  }

  /**
   * Clean up resources (terminate process asynchronously and wait for exit)
   */
  private async cleanup(markInterruptedByUserStop = false): Promise<void> {
    const child = this.process;

    if (!child) {
      return;
    }

    if (markInterruptedByUserStop) {
      this.interruptedByUserStop = true;
    }

    // Immediately clear member variable references to prevent repeated calls to this method
    this.process = null;

    return new Promise<void>((resolve) => {
      let timeoutId: NodeJS.Timeout | null = null;
      let finished = false;

      const finish = () => {
        if (finished) {
          return;
        }

        finished = true;

        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        // Remove listeners to avoid memory leaks
        child.removeListener('exit', finish);
        child.removeListener('close', finish);
        child.removeListener('error', finish);
        resolve();
      };

      // Listen for process exit events
      child.once('exit', finish);
      child.once('close', finish);
      child.once('error', finish);

      // Set a 5-second timeout to prevent the process from getting stuck
      timeoutId = setTimeout(() => {
        console.warn('CommandExecutor: kill process timed out after 5s, escalating to SIGKILL');

        // SIGTERM is catchable, so a workload that traps or ignores it would keep
        // running after the run was already reported as stopped/timed out.
        if (child.pid) {
          if (process.platform === 'win32') {
            // The first taskkill either failed or is still hanging, otherwise the
            // child would have exited by now. Retry it under a hard deadline and
            // terminate the direct child when even the retry does not report back.
            exec(
              `taskkill /pid ${child.pid} /T /F`,
              { timeout: TASKKILL_ESCALATION_TIMEOUT_MS },
              (error) => {
                if (error) {
                  console.error('CommandExecutor: taskkill escalation failed, terminating child directly:', error);
                  child.kill('SIGKILL');
                }
              },
            );
          }
          else {
            try {
              process.kill(-child.pid, 'SIGKILL');
            }
            catch (e) {
              child.kill('SIGKILL');
            }
          }
        }

        finish();
      }, 5000);

      try {
        if (process.platform === 'win32') {
          const pid = child.pid;

          if (pid) {
            // Use taskkill on Windows to force kill a process and all its children (/F /T)
            exec(`taskkill /pid ${pid} /T /F`, (error) => {
              if (error) {
                console.error('CommandExecutor: failed to kill process tree:', error);
              }
            });
          }
          else {
            finish();
          }
        }
        else {
          // On Linux/macOS, kill an entire process group with a negative PID
          if (child.pid) {
            try {
              process.kill(-child.pid, 'SIGTERM');
            }
            catch (e) {
              // If process group termination fails, fall back to terminating a single process
              child.kill('SIGTERM');
            }
          }
          else {
            finish();
          }
        }
      }
      catch (error) {
        console.error('CommandExecutor: error during process cleanup:', error);
        finish();
      }
    });
  }

  /**
   * Forcefully terminate command execution (asynchronously)
   */
  async kill(): Promise<void> {
    await this.cleanup(true);
  }
}

export { CommandExecutor };

export type {
  CommandOptions, CommandResult,
};
