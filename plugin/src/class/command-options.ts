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

  // ANSI 转义码正则表达式
  private readonly ansiRegex = /\x1b\[[0-9;]*[a-zA-Z]/g;
  
  // 退格字符正则表达式（\b 或 \x08）
  private readonly backspaceRegex = /\x08/g;

  constructor() {
    super();
  }

  /**
   * 过滤 ANSI 转义码和退格字符（同步方式）
   */
  private stripAnsiCodes(text: string): string {
    // 先过滤退格字符
    let cleanText = text.replace(this.backspaceRegex, '');
    // 再过滤 ANSI 转义码
    cleanText = cleanText.replace(this.ansiRegex, '');
    return cleanText;
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

      const child = spawn(command, args, {
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

      this.process = child;

      let timeoutId: NodeJS.Timeout | null = null;

      // 设置超时
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

      // 处理标准输出
      child.stdout?.on('data', async (data: Buffer) => {
        const text = data.toString();
        // 过滤 ANSI 转义码
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

        if (this.checkErrorKeywords(cleanText)) {
          await this.cleanup();
          resolve(this.getResult(-1));
        }

        // 检查是否包含停止关键字
        if (this.checkStopKeywords(cleanText, stopKeywords)) {
          await this.cleanup();
          resolve(this.getResult(0));
        }
      });

      // 处理错误输出
      child.stderr?.on('data', async (data: Buffer) => {
        const text = data.toString();
        // 过滤 ANSI 转义码
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

        // 检查是否包含停止关键字
        if (this.checkStopKeywords(cleanText, stopKeywords)) {
          await this.cleanup();
          resolve(this.getResult(0));
        }
      });

      // 处理进程结束
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

      // 处理进程错误
      child.on('error', () => {
        localCleanup();
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
   * 清理资源（异步终止进程并等待退出）
   */
  private async cleanup(): Promise<void> {
    const child = this.process;
    if (!child) {
      return;
    }

    // 立即清除成员变量引用，防止重复调用此方法
    this.process = null;

    return new Promise<void>((resolve) => {
      let timeoutId: NodeJS.Timeout | null = null;
      let finished = false;

      const finish = () => {
        if (finished) return;
        finished = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        // 移除监听器以避免内存泄漏
        child.removeListener('exit', finish);
        child.removeListener('close', finish);
        child.removeListener('error', finish);
        resolve();
      };

      // 监听进程退出事件
      child.once('exit', finish);
      child.once('close', finish);
      child.once('error', finish);

      // 设置 5 秒超时，防止进程卡死
      timeoutId = setTimeout(() => {
        console.warn('CommandExecutor: kill process timed out after 5s, force resolving');
        finish();
      }, 5000);

      try {
        if (process.platform === 'win32') {
          const pid = child.pid;
          if (pid) {
            // 在 Windows 上使用 taskkill 强制终止进程及其所有子进程 (/F /T)
            exec(`taskkill /pid ${pid} /T /F`, (error) => {
              if (error) {
                console.error('CommandExecutor: failed to kill process tree:', error);
              }
            });
          } else {
            finish();
          }
        } else {
          // 在 Linux/macOS 上，使用负 PID 终止整个进程组
          if (child.pid) {
            try {
              process.kill(-child.pid, 'SIGTERM');
            } catch (e) {
              // 如果进程组终止失败，退回到终止单个进程
              child.kill('SIGTERM');
            }
          } else {
            finish();
          }
        }
      } catch (error) {
        console.error('CommandExecutor: error during process cleanup:', error);
        finish();
      }
    });
  }

  /**
   * 强制终止命令执行（异步）
   */
  async kill(): Promise<void> {
    await this.cleanup();
  }
}

export { CommandExecutor };

export type {
  CommandOptions, CommandResult,
};
