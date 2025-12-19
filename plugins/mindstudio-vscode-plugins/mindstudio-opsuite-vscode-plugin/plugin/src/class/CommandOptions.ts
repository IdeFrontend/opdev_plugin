/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { spawn, ChildProcess, exec } from 'child_process';
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
  signal: NodeJS.Signals | null;
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
   * @returns Promise<CommandResult>
   */
  async execute(
    command: string,
    stopKeywords: string[] = [],
    args: string[] = [],
    options: CommandOptions = {},
    isOpenTerminal: boolean = false
  ): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      this.stdout = '';
      this.stderr = '';
      this.output = '';

      let outputChannel: any = null;
      console.log('isOpenTerminal', isOpenTerminal);

      if (isOpenTerminal) {
        outputChannel = vscode.window.createOutputChannel('OpsTite outputChannel');
        outputChannel.show();
        outputChannel.appendLine(command + '\r\n');
      }

      this.process = spawn(command, args, {
        cwd: options.cwd || process.cwd(),
        env: { ...process.env, ...options.env },
        shell: true,
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
          resolve(this.getResult(-1, null));
          this.cleanup();
        }

        // 检查是否包含停止关键字
        if (this.checkStopKeywords(text, stopKeywords)) {
          this.cleanup();
          resolve(this.getResult(0, null));
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
          resolve(this.getResult(0, null));
        }
      });

      // 处理进程结束
      this.process.on('close', (code: number, signal: NodeJS.Signals) => {
        cleanup();
        const result = this.getResult(code, signal);

        if (code === 0) {
          resolve(result);
        } else {
          this.stderr += `Command failed with code ${code}: ${command} ${args.join(' ')}`;
          resolve(this.getResult(code, signal));
        }
      });

      // 处理进程错误
      this.process.on('error', (error: any) => {
        cleanup();
        resolve(this.getResult(-1, error));
      });
    });
  }

  /**
   * 检查是否包含停止关键字
   */
  private checkStopKeywords(text: string, stopKeywords: string[]): boolean {
    if (stopKeywords.length === 0) return false;

    return stopKeywords.some((keyword) => text.toLowerCase().includes(keyword.toLowerCase()));
  }

  /**
   * 检查是否包含异常关键字
   */
  private checkErrorKeywords(text: string): boolean {
    return text.toLowerCase().includes('[error]');
  }

  /**
   * 获取执行结果
   */
  private getResult(code: number | null, signal: NodeJS.Signals | null): CommandResult {
    return {
      code,
      signal,
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
      this.process.kill('SIGTERM');
      this.process = null;
    }
  }

  /**
   * 强制终止命令执行
   */
  kill(): void {
    this.cleanup();
  }

  /**
   * 获取实时输出（用于长时间运行的命令）
   */
  onOutput(callback: (data: string) => void): void {
    this.on('stdout', callback);
    this.on('stderr', callback);
  }

  /**
   * 获取标准输出
   */
  onStdout(callback: (data: string) => void): void {
    this.on('stdout', callback);
  }

  /**
   * 获取错误输出
   */
  onStderr(callback: (data: string) => void): void {
    this.on('stderr', callback);
  }
}

export { CommandExecutor, CommandOptions, CommandResult };
