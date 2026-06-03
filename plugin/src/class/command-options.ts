/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
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
}

class CommandExecutor extends EventEmitter {
  private process: ChildProcess | null = null;
  private stdout: string = '';
  private stderr: string = '';
  private output: string = '';

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
    return new Promise((resolve, reject) => {
      this.stdout = '';
      this.stderr = '';
      this.output = '';

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
        // On Windows, detached: false needs to be set, otherwise it cannot be terminated.
        // Set detached: true on Linux/macOS to create a process group
        detached: process.platform !== 'win32',
      });

      this.process = child;

      let timeoutId: NodeJS.Timeout | null = null;

      // Set timeout
      if (options.timeout && options.timeout > 0) {
        timeoutId = setTimeout(async () => {
          await this.cleanup();
          reject(new Error(`Command execution timeout after ${options.timeout}ms`));
        }, options.timeout);
      }

      const localCleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        this.process = null;
      };

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
          await this.cleanup();
          resolve(this.getResult(0));
        }
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
          await this.cleanup();
          resolve(this.getResult(0));
        }
      });

      // Processing ends
      child.on('close', (code: number) => {
        localCleanup();
        const result = this.getResult(code);

        if (code === 0) {
          resolve(result);
        }
        else {
          this.stderr += `Command failed with code ${code}: ${command} ${args.join(' ')}`;
          resolve(this.getResult(code));
        }
      });

      // Handling process errors
      child.on('error', () => {
        localCleanup();
        resolve(this.getResult(-1));
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
  private getResult(code: number): CommandResult {
    return {
      code,
      stdout: this.stdout,
      stderr: this.stderr,
      output: this.output,
    };
  }

  /**
   * Clean up resources (terminate process asynchronously and wait for exit)
   */
  private async cleanup(): Promise<void> {
    const child = this.process;

    if (!child) {
      return;
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
        console.warn('CommandExecutor: kill process timed out after 5s, force resolving');
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
    await this.cleanup();
  }
}

export { CommandExecutor };

export type {
  CommandOptions, CommandResult,
};
