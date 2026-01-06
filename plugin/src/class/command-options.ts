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

interface CommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeout?: number;
  // 是否实时输出（流式输出）
  streaming?: boolean;
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

  constructor() {
    super();
  }

  /**
   * 执行命令
   * @param command 要执行的命令
   * @param args 命令参数
   * @param options 配置选项
   * @param stopKeywords 触发提前结束的关键字数组
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

      let outputChannel: vscode.OutputChannel | null = null;

      console.log('isOpenTerminal', isOpenTerminal);

      if (isOpenTerminal) {
        outputChannel = vscode.window.createOutputChannel('OP DevTools');
        outputChannel.show();
        outputChannel.appendLine(command + '\r\n');
      }

      this.process = spawn(command, args, {
        cwd: options.cwd || process.cwd(),
        env: {
          ...process.env,
          ...options.env,
        },
        shell: true,
        // Windows 上需要设置 detached: false，否则无法终止
        // Linux/macOS 上设置 detached: true 可以创建进程组
        detached: process.platform !== 'win32',
      });

      let timeoutId: NodeJS.Timeout | null = null;

      // 设置超时
      if (options.timeout && options.timeout > 0) {
        timeoutId = setTimeout(() => {
          this.cleanup();
          reject(new Error(`Command execution timeout after ${options.timeout}ms`));
        }, options.timeout);
      }

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        this.process = null;
      };

      // 处理标准输出
      this.process.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();

        if (outputChannel) {
          outputChannel.appendLine(text);
        }

        console.log('execute command, stdout:', text);
        this.stdout += text;
        this.output += text;

        this.emit('stdout', text);

        if (options.streaming) {
          process.stdout.write(text);
        }

        if (this.checkErrorKeywords(text)) {
          resolve(this.getResult(-1));
          this.cleanup();
        }

        // 检查是否包含停止关键字
        if (this.checkStopKeywords(text, stopKeywords)) {
          this.cleanup();
          resolve(this.getResult(0));
        }
      });

      // 处理错误输出
      this.process.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();

        console.error('execute command, stderr:', text);
        this.stderr += text;
        this.output += text;

        if (outputChannel) {
          outputChannel.appendLine(text);
        }

        this.emit('stderr', text);

        if (options.streaming) {
          process.stderr.write(text);
        }

        // 检查是否包含停止关键字
        if (this.checkStopKeywords(text, stopKeywords)) {
          this.cleanup();
          resolve(this.getResult(0));
        }
      });

      // 处理进程结束
      this.process.on('close', (code: number) => {
        cleanup();
        const result = this.getResult(code);

        if (code === 0) {
          resolve(result);
        }
        else {
          this.stderr += `Command failed with code ${code}: ${command} ${args.join(' ')}`;
          resolve(this.getResult(code));
        }
      });

      // 处理进程错误
      this.process.on('error', () => {
        cleanup();
        resolve(this.getResult(-1));
      });
    });
  }

  /**
   * 检查是否包含停止关键字
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
   * 检查是否包含异常关键字
   */
  private checkErrorKeywords(text: string): boolean {
    return text.toLowerCase()
      .includes('[error]');
  }

  /**
   * 获取执行结果
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
   * 清理资源
   */
  private cleanup(): void {
    if (this.process) {
      try {
        // 在 Windows 上，使用 taskkill 终止整个进程树
        if (process.platform === 'win32') {
          const pid = this.process.pid;

          if (pid) {
            // /F 强制终止, /T 终止子进程树
            exec(`taskkill /pid ${pid} /T /F`, (error) => {
              if (error) {
                console.error('Failed to kill process tree:', error);
              }
            });
          }
        }
        else {
          // 在 Linux/macOS 上，使用负PID终止整个进程组
          // 负号表示终止整个进程组
          if (this.process.pid) {
            process.kill(-this.process.pid, 'SIGTERM');
          }
        }
      }
      catch (error) {
        console.error('Error killing process:', error);
      }
      finally {
        this.process = null;
      }
    }
  }

  /**
   * 强制终止命令执行
   */
  kill(): void {
    this.cleanup();
  }
}

export {
  CommandExecutor, CommandOptions, CommandResult,
};
