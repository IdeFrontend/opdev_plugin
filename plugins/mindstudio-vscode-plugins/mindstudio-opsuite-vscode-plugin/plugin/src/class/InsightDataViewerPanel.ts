/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import { NodeWebviewSocketBridge } from './NodeWebviewSocketBridge';

export class InsightDataViewerPanel implements vscode.Disposable {
  private static currentPanel: InsightDataViewerPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly context: vscode.ExtensionContext;
  private socketBridge: NodeWebviewSocketBridge | undefined;
  private profilerServerProcess: ChildProcess | null = null;
  private serverPort: number | null = null;
  private readonly serverPath: string;

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext, binPath: string) {
    this.panel = panel;
    this.context = context;
    
    // 构建 profiler_server 文件路径
    this.serverPath = path.join(context.extensionPath, 'plugin', 'insight-vscode-plugin', 'server', 'profiler_server');

    // 设置 webview 内容
    this.setupWebview(binPath);

    // 监听面板关闭事件
    this.panel.onDidDispose(() => this.dispose(), null, context.subscriptions);

    // 监听 webview 消息
    this.panel.webview.onDidReceiveMessage(
      (message: any) => {
        this.handleWebviewMessage(message);
      },
      null,
      context.subscriptions
    );

    // 启动 profiler_server
    this.startProfilerServer();
  }

  /**
   * 创建或显示 panel
   */
  public static createOrShow(context: vscode.ExtensionContext, binPath: string): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // 如果已经存在 panel，直接显示
    if (InsightDataViewerPanel.currentPanel) {
      InsightDataViewerPanel.currentPanel.panel.reveal(column);
      // 更新 bin 文件路径
      InsightDataViewerPanel.currentPanel.panel.webview.postMessage({
        command: 'setBinPath',
        data: binPath,
      });
      return;
    }

    // 创建新的 panel
    const panel = vscode.window.createWebviewPanel(
      'insightDataViewer',
      '数据查看器',
      column || vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    InsightDataViewerPanel.currentPanel = new InsightDataViewerPanel(panel, context, binPath);
  }

  /**
   * 设置 webview 内容
   */
  private setupWebview(binPath: string): void {
    const htmlPath = path.join(
      this.context.extensionPath,
      'plugin',
      'insight-vscode-plugin',
      'index.html'
    );

    let htmlContent = '';
    if (fs.existsSync(htmlPath)) {
      htmlContent = fs.readFileSync(htmlPath, 'utf8');
    } else {
      htmlContent = this.getDefaultHtml();
    }

    this.panel.webview.html = htmlContent;

    // 使用 NodeWebviewSocketBridge 处理 WebSocket 桥接
    this.socketBridge = new NodeWebviewSocketBridge(this.panel.webview);

    // 发送 bin 文件路径
    setTimeout(() => {
      this.panel.webview.postMessage({
        command: 'setBinPath',
        data: binPath,
      });
    }, 100);
  }

  /**
   * 获取默认 HTML 内容
   */
  private getDefaultHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>数据查看器</title>
</head>
<body>
    <div id="app">
        <h1>数据查看器</h1>
        <p>BIN 文件路径: <span id="binPath">等待加载...</span></p>
        <p>WebSocket 端口: <span id="wsPort">等待启动...</span></p>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        
        // 监听来自扩展的消息
        window.addEventListener('message', event => {
            const message = event.data;
            
            // 处理设置 bin 文件路径的消息
            if (message.command === 'setBinPath') {
                const binPathElement = document.getElementById('binPath');
                if (binPathElement) {
                    binPathElement.textContent = message.data;
                }
            }
            
            // 处理设置 WebSocket 端口的消息
            if (message.command === 'setWsPort') {
                const wsPortElement = document.getElementById('wsPort');
                if (wsPortElement) {
                    wsPortElement.textContent = message.data;
                }
            }
            
            // 处理 WebSocket 桥接消息（来自 NodeWebviewSocketBridge）
            if (message.type && message.type.startsWith('ws:')) {
                console.log('WebSocket bridge message:', message);
                
                switch (message.type) {
                    case 'ws:opened':
                        console.log('WebSocket opened:', message.id);
                        break;
                    case 'ws:message':
                        console.log('WebSocket message received:', message.id, message.payload);
                        break;
                    case 'ws:error':
                        console.error('WebSocket error:', message.id, message.reason);
                        break;
                    case 'ws:closed':
                        console.log('WebSocket closed:', message.id, message.code, message.reason);
                        break;
                }
            }
        });
        
        // 通知扩展已准备好接收消息
        vscode.postMessage({ command: 'ready' });
    </script>
</body>
</html>`;
  }

  /**
   * 处理来自 webview 的消息
   */
  private handleWebviewMessage(message: any): void {
    if (message.command === 'ready') {
      // Webview 已准备好，发送 bin 文件路径和端口号
      this.panel.webview.postMessage({
        command: 'setBinPath',
        data: message.binPath || '',
      });
      
      if (this.serverPort) {
        this.panel.webview.postMessage({
          command: 'setWsPort',
          data: this.serverPort,
        });
      }
    }
  }

  /**
   * 启动 profiler_server
   */
  private async startProfilerServer(): Promise<void> {
    try {
      // 检查 profiler_server 文件是否存在
      if (!fs.existsSync(this.serverPath)) {
        vscode.window.showErrorMessage(`profiler_server 文件不存在: ${this.serverPath}`);
        return;
      }

      // 确保文件有执行权限
      const serverDir = path.dirname(this.serverPath);
      
      // 首先获取可用端口
      const port = await this.scanPort();
      if (!port) {
        vscode.window.showErrorMessage('无法获取可用端口');
        return;
      }

      this.serverPort = port;

      // 发送端口号到 webview
      this.panel.webview.postMessage({
        command: 'setWsPort',
        data: this.serverPort,
      });

      // 启动 profiler_server
      // 注意：export 命令需要在 shell 中执行，所以使用 bash -c
      // 设置 LD_LIBRARY_PATH 为当前目录
      const command = `export LD_LIBRARY_PATH=\`pwd\` && ${this.serverPath} --wsPort=${this.serverPort} --wsHost=0.0.0.0`;
      
      // 使用 bash -c 执行命令，确保 export 命令能够正确执行
      this.profilerServerProcess = spawn('bash', ['-c', command], {
        cwd: serverDir,
        env: { 
          ...process.env,
          // 确保 LD_LIBRARY_PATH 被设置
          LD_LIBRARY_PATH: serverDir
        },
        shell: false,
      });

      // 处理进程输出
      this.profilerServerProcess.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        console.log(`[profiler_server] ${output}`);
      });

      this.profilerServerProcess.stderr?.on('data', (data: Buffer) => {
        const output = data.toString();
        console.error(`[profiler_server] ${output}`);
      });

      // 处理进程关闭
      this.profilerServerProcess.on('close', (code: number) => {
        console.log(`profiler_server 进程退出，退出码: ${code}`);
        this.profilerServerProcess = null;
        
        if (code !== 0 && code !== null) {
          vscode.window.showWarningMessage(`profiler_server 进程异常退出，退出码: ${code}`);
        }
      });

      // 处理进程错误
      this.profilerServerProcess.on('error', (error: Error) => {
        console.error('启动 profiler_server 失败:', error);
        vscode.window.showErrorMessage(`启动 profiler_server 失败: ${error.message}`);
        this.profilerServerProcess = null;
      });

      vscode.window.showInformationMessage(`profiler_server 已启动，端口: ${this.serverPort}`);
    } catch (error: any) {
      vscode.window.showErrorMessage(`启动 profiler_server 失败: ${error.message}`);
      console.error('启动 profiler_server 失败:', error);
    }
  }

  /**
   * 扫描可用端口
   */
  private async scanPort(): Promise<number | null> {
    return new Promise((resolve) => {
      try {
        const serverDir = path.dirname(this.serverPath);
        
        // 执行 profiler_server --scanPort 命令
        const scanProcess = spawn(this.serverPath, ['--scanPort'], {
          cwd: serverDir,
          env: { ...process.env },
        });

        let stdout = '';
        let stderr = '';

        scanProcess.stdout?.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        scanProcess.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        scanProcess.on('close', (code: number) => {
          if (code === 0) {
            // 从输出中提取端口号
            const portMatch = stdout.match(/(\d+)/);
            if (portMatch) {
              const port = parseInt(portMatch[1], 10);
              if (!isNaN(port) && port > 0) {
                resolve(port);
                return;
              }
            }
          }
          
          console.error(`扫描端口失败: code=${code}, stdout=${stdout}, stderr=${stderr}`);
          resolve(null);
        });

        scanProcess.on('error', (error: Error) => {
          console.error('执行 scanPort 命令失败:', error);
          resolve(null);
        });
      } catch (error: any) {
        console.error('扫描端口异常:', error);
        resolve(null);
      }
    });
  }

  /**
   * 停止 profiler_server
   */
  private stopProfilerServer(): void {
    if (this.profilerServerProcess) {
      try {
        this.profilerServerProcess.kill('SIGTERM');
        console.log('已停止 profiler_server 进程');
      } catch (error) {
        console.error('停止 profiler_server 失败:', error);
      }
      this.profilerServerProcess = null;
    }
  }

  /**
   * 清理资源
   */
  public dispose(): void {
    // 停止 profiler_server
    this.stopProfilerServer();

    // 清理 WebSocket 桥接
    if (this.socketBridge) {
      this.socketBridge.dispose();
      this.socketBridge = undefined;
    }

    // 清理 panel 引用
    if (InsightDataViewerPanel.currentPanel === this) {
      InsightDataViewerPanel.currentPanel = undefined;
    }

    // 销毁 panel
    this.panel.dispose();
  }
}

