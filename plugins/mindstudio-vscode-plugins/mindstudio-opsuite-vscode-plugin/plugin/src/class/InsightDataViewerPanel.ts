/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn, ChildProcess, exec } from 'child_process';
import { promisify } from 'util';
import { NodeWebviewSocketBridge } from './NodeWebviewSocketBridge';
import webviewMessageList from './WebviewMessageList';
import { CommandExecutor } from './CommandOptions';

const execAsync = promisify(exec);

export class InsightDataViewerPanel implements vscode.Disposable {
  private static openedFiles = new Map<string, InsightDataViewerPanel>();
  private readonly panel: vscode.WebviewPanel;
  private readonly context: vscode.ExtensionContext;
  private socketBridge: NodeWebviewSocketBridge | undefined;
  private binPath: string;
  private profilerServerProcess: ChildProcess | null = null;
  private serverPort: number | null = null;
  private readonly serverPath: string='';
  private readonly serverDir: string='';
  private readonly zipDir: string='';
  private readonly insightPluginBasePath: string;
  private serverPortReady!: Promise<void>; 

  constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext, binPath: string) {
    this.panel = panel;
    this.context = context;
    this.binPath = binPath;
    this.insightPluginBasePath = this.getInsightPluginBasePath();
    if(this.insightPluginBasePath === ''){
      return;
    }
    this.serverDir = path.join(this.insightPluginBasePath, 'server');
    this.serverPath = path.join(this.serverDir, 'profiler_server');
    this.zipDir = path.join(this.insightPluginBasePath, 'zip');
    let resolvePortReady: () => void;
    this.serverPortReady = new Promise((resolve) => {
      resolvePortReady = resolve;
    });
    const resolvePort = resolvePortReady!;

    // 启动 profiler_server（异步，但会在后台设置 this.serverPort）
    this.startProfilerServer(resolvePort).catch((error) => {
      console.error('[InsightDataViewerPanel] ✗ 启动 profiler_server 失败:', error);
    });

    // 设置 webview 内容
    this.setupWebview();

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

    // 等待 serverPort 就绪后再加载并发送 iframe 内容
    console.log('[InsightDataViewerPanel] Panel 创建完成，等待服务端口就绪后加载所有 iframe 内容...');
    this.loadAndSendAllIframes().catch((error) => {
      console.error('[InsightDataViewerPanel] ✗ 提前加载 iframe 失败:', error);
    });
  }

  /**
   * 获取 insight-vscode-plugin 基础路径
   * 优先从环境变量获取，如果环境变量不存在则使用默认路径
   */
  private getInsightPluginBasePath(): string {
    // 优先从环境变量获取
    const envPath = process.env.INSIGHT_HOME_PATH;
    if (envPath) {
      console.log(`[InsightDataViewerPanel] 从环境变量获取 insight-vscode-plugin 路径: ${envPath}`);
      return envPath;
    }else{
      vscode.window.showInformationMessage(`从环境变量获取 insight-vscode-plugin 路径失败，请检查环境变量 INSIGHT_HOME_PATH 是否正确，如不存在请联系管理员设置`);
      return '';
    }
  }

  /**
   * 创建或显示 panel
   */
  public static createOrShow(context: vscode.ExtensionContext, binPath: string): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // 如果已经存在 panel，直接显示
    if (InsightDataViewerPanel.openedFiles.has(binPath)) {
      InsightDataViewerPanel.openedFiles.get(binPath)?.panel.reveal(column);
      return;
    }

    // 创建新的 panel
    const panel = vscode.window.createWebviewPanel(
      'insightDataViewer',
      '性能分析',
      column || vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    InsightDataViewerPanel.openedFiles.set(binPath, new InsightDataViewerPanel(panel, context, binPath));
  }

  /**
   * 设置 webview 内容
   */
  private setupWebview(): void {
    const htmlPath = path.join(this.insightPluginBasePath, 'index.html');

    let htmlContent = '';
    if (fs.existsSync(htmlPath)) {
      htmlContent = fs.readFileSync(htmlPath, 'utf8');
    } else {
      htmlContent = this.getDefaultHtml();
    }

    this.panel.webview.html = htmlContent;

    // 使用 NodeWebviewSocketBridge 处理 WebSocket 桥接
    console.log('[InsightDataViewerPanel] 初始化 NodeWebviewSocketBridge');
    this.socketBridge = new NodeWebviewSocketBridge(this.panel.webview);
    console.log('[InsightDataViewerPanel] NodeWebviewSocketBridge 初始化完成');
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
    console.log('[InsightDataViewerPanel] 收到 webview 消息:', JSON.stringify(message, null, 2));

    // 检查是否是 WebSocket 桥接消息（这些消息应该由 NodeWebviewSocketBridge 处理）
    if (message.type && (message.type === 'ws:open' || message.type === 'ws:send' || message.type === 'ws:close')) {
      console.log(`[InsightDataViewerPanel] 检测到 WebSocket 桥接消息，应该由 NodeWebviewSocketBridge 处理:`, message.type);
      // 这些消息会被 NodeWebviewSocketBridge 的 handleMessage 处理
      // 但我们需要确保消息能正确传递过去
      if (this.socketBridge) {
        console.log('[InsightDataViewerPanel] NodeWebviewSocketBridge 已初始化，消息应该会被处理');
      } else {
        console.error('[InsightDataViewerPanel] NodeWebviewSocketBridge 未初始化！');
      }
      // 不在这里处理，让 NodeWebviewSocketBridge 处理
      return;
    }

    // 先尝试从 WebviewMessageList 中查找对应的处理器
    let handled = false;
    for (const messageItem of webviewMessageList) {
      if (message.command === messageItem.command) {
        console.log(`[InsightDataViewerPanel] 找到处理器: ${message.command}`);
        // 创建一个类似 WebviewProvider 的 that 对象
        const that = {
          context: this.context,
          panel: this.panel,
          _view: undefined,
        };
        messageItem.callback(message, that);
        handled = true;
        break;
      }
    }
  }

  /**
   * 检测系统架构
   */
  private detectArchitecture(): 'x86' | 'arm' {
    const arch = os.arch().toLowerCase();
    // x86_64, ia32, x32, x64 等都属于 x86 架构
    if (arch.includes('x64') || arch.includes('x86') || arch.includes('ia32') || arch === 'x32') {
      return 'x86';
    }
    // arm64, aarch64, arm 等都属于 arm 架构
    if (arch.includes('arm') || arch.includes('aarch')) {
      return 'arm';
    }
    // 默认返回 x86（大多数情况）
    console.warn(`未知架构: ${arch}，默认使用 x86`);
    return 'x86';
  }

  /**
   * 解压 zip 文件
   */
  private async extractZip(zipPath: string, extractTo: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // 确保目标目录存在
      if (!fs.existsSync(extractTo)) {
        fs.mkdirSync(extractTo, { recursive: true });
      }

      // 根据平台选择解压命令
      const platform = os.platform();
      let command: string;

      if (platform === 'win32') {
        // Windows 使用 PowerShell 解压
        command = `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractTo}' -Force"`;
      } else {
        // Linux/Unix 使用 unzip 命令
        command = `unzip -o "${zipPath}" -d "${extractTo}"`;
      }

      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`解压失败: ${error.message}`);
          if (stderr) {
            console.error(`stderr: ${stderr}`);
          }
          reject(new Error(`解压失败: ${error.message}`));
          return;
        }
        console.log(`解压成功: ${zipPath} -> ${extractTo}`);
        if (stdout) {
          console.log(`解压输出: ${stdout}`);
        }
        resolve();
      });
    });
  }

  /**
   * 确保 server 目录存在，如果不存在则解压对应的 zip 文件
   */
  private async ensureServerDirectoryExists(): Promise<boolean> {
    // 如果 server 目录已存在，直接返回
    if (fs.existsSync(this.serverDir)) {
      console.log(`[InsightDataViewerPanel] server 目录已存在: ${this.serverDir}`);
      
      // 对 insightPluginBasePath 目录执行 chmod -R o-w 命令（移除其他用户的写权限）
      // 只在非 Windows 系统上执行
      if (os.platform() !== 'win32') {
        try {
          const commandExecutor = new CommandExecutor();
          const chmodCommand = `chmod -R o-w "${this.insightPluginBasePath}"`;
          console.log(`[InsightDataViewerPanel] 执行命令: ${chmodCommand}`);
          const result = await commandExecutor.execute(chmodCommand, [], [], {
            cwd: process.cwd(),
          });
          
          if (result.code === 0) {
            console.log(`[InsightDataViewerPanel] ✓ 成功执行 chmod 命令`);
          } else {
            console.warn(`[InsightDataViewerPanel] chmod 命令执行失败，退出码: ${result.code}`);
            if (result.stderr) {
              console.warn(`[InsightDataViewerPanel] chmod 错误输出: ${result.stderr}`);
            }
          }
        } catch (error: any) {
          console.warn(`[InsightDataViewerPanel] 执行 chmod 命令时出错: ${error.message}`);
        }
      }
      
      // 检查 profiler_server 文件是否存在
      if (fs.existsSync(this.serverPath)) {
        return true;
      } else {
        console.warn(`[InsightDataViewerPanel] server 目录存在但 profiler_server 文件不存在: ${this.serverPath}`);
        // 如果目录存在但文件不存在，可能需要重新解压
      }
    }

    // 检测系统架构
    const architecture = this.detectArchitecture();
    const zipFileName = architecture === 'x86' ? 'server_x86.zip' : 'server_arm.zip';
    const zipPath = path.join(this.zipDir, zipFileName);

    // 检查 zip 文件是否存在
    if (!fs.existsSync(zipPath)) {
      const errorMsg = `server 目录不存在，且找不到对应的 zip 文件: ${zipPath}`;
      console.error(`[InsightDataViewerPanel] ${errorMsg}`);
      vscode.window.showErrorMessage(errorMsg);
      return false;
    }

    try {
      // 显示进度信息
      console.log(`[InsightDataViewerPanel] 开始解压: ${zipPath}`);

      // 解压 zip 文件到 insight-vscode-plugin 目录（压缩包中已有 server 目录）
      await this.extractZip(zipPath, this.insightPluginBasePath);

      // 检查解压后 server 目录是否存在
      if (!fs.existsSync(this.serverDir)) {
        const errorMsg = `解压完成，但 server 目录仍不存在: ${this.serverDir}`;
        console.error(`[InsightDataViewerPanel] ${errorMsg}`);
        vscode.window.showErrorMessage(errorMsg);
        return false;
      }

      // 检查 profiler_server 文件是否存在
      if (!fs.existsSync(this.serverPath)) {
        const errorMsg = `解压完成，但 profiler_server 文件仍不存在: ${this.serverPath}`;
        console.error(`[InsightDataViewerPanel] ${errorMsg}`);
        vscode.window.showErrorMessage(errorMsg);
        return false;
      }

      // 设置执行权限（在 Windows 上可能失败，但不影响执行）
      try {
        fs.chmodSync(this.serverPath, 0o755);
        console.log(`[InsightDataViewerPanel] 已设置 profiler_server 执行权限`);
      } catch (chmodError) {
        console.warn('[InsightDataViewerPanel] 设置执行权限失败（Windows 系统可忽略）:', chmodError);
      }

      console.log(`[InsightDataViewerPanel] ✓ server 目录准备完成`);
      return true;
    } catch (error: any) {
      const errorMsg = `解压 ${zipFileName} 失败: ${error.message}`;
      console.error(`[InsightDataViewerPanel] ${errorMsg}`, error);
      vscode.window.showErrorMessage(errorMsg);
      return false;
    }
  }

  /**
   * 启动 profiler_server
   * @param resolvePort 端口就绪时的回调函数
   */
  private async startProfilerServer(resolvePort: () => void): Promise<void> {
    try {
      // Windows 系统不启动服务
      if (os.platform() === 'win32') {
        console.log('[InsightDataViewerPanel] Windows 系统，跳过 profiler_server 启动');
        // Windows 系统不启动服务，但仍需要设置一个默认端口（如果需要的话）
        // 或者直接 resolve，让 loadAndSendAllIframes 继续执行
        resolvePort();
        return;
      }

      // 确保 server 目录存在，如果不存在则解压
      console.log('[InsightDataViewerPanel] 检查 server 目录...');
      await this.ensureServerDirectoryExists();

      // 获取可用端口
      console.log('[InsightDataViewerPanel] 扫描可用端口...');
      const port = await this.scanPort();
      if (!port) {
        const errorMsg = '无法获取可用端口';
        console.error(`[InsightDataViewerPanel] ${errorMsg}`);
        vscode.window.showErrorMessage(errorMsg);
        resolvePort(); // 即使失败也 resolve，避免永久阻塞
        return;
      }

      // 记录端口号
      this.serverPort = port;
      console.log(`[InsightDataViewerPanel] 找到可用端口: ${this.serverPort}`);

      // 启动 profiler_server
      // 注意：export 命令需要在 shell 中执行，所以使用 bash -c
      // 设置 LD_LIBRARY_PATH 为当前目录
      const command = `export LD_LIBRARY_PATH=\`pwd\` && ${this.serverPath} --wsPort=${this.serverPort} --wsHost=0.0.0.0`;

      console.log(`[InsightDataViewerPanel] 启动 profiler_server: ${command}`);

      // 使用 bash -c 执行命令，确保 export 命令能够正确执行
      this.profilerServerProcess = spawn('bash', ['-c', command], {
        cwd: this.serverDir,
        env: {
          ...process.env,
          // 确保 LD_LIBRARY_PATH 被设置
          LD_LIBRARY_PATH: this.serverDir
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
        console.log(`[InsightDataViewerPanel] profiler_server 进程退出，退出码: ${code}`);
        this.profilerServerProcess = null;

        if (code !== 0 && code !== null) {
          vscode.window.showWarningMessage(`profiler_server 进程异常退出，退出码: ${code}`);
        }
      });

      // 处理进程错误
      this.profilerServerProcess.on('error', (error: Error) => {
        console.error('[InsightDataViewerPanel] 启动 profiler_server 失败:', error);
        vscode.window.showErrorMessage(`启动 profiler_server 失败: ${error.message}`);
        this.profilerServerProcess = null;
      });

      console.log(`[InsightDataViewerPanel] ✓ profiler_server 已启动，端口: ${this.serverPort}`);

      // 通知端口已就绪
      resolvePort();
    } catch (error: any) {
      const errorMsg = `启动 profiler_server 失败: ${error.message}`;
      console.error(`[InsightDataViewerPanel] ${errorMsg}`, error);
      vscode.window.showErrorMessage(errorMsg);
      // 即使出错也 resolve，避免永久阻塞
      resolvePort();
    }
  }

  /**
   * 并发加载所有 HTML 文件并统一发送给 webview
   */
  private async loadAndSendAllIframes(): Promise<void> {
    console.log('[InsightDataViewerPanel] ========== 开始加载所有 iframe 内容 ==========');
    const startTime = Date.now();
    
    try {
      // 等待 serverPort 就绪
      console.log('[InsightDataViewerPanel] 等待服务端口就绪...');
     
      console.log(`[InsightDataViewerPanel] 服务端口已就绪: ${this.serverPort}`);

      // 插件目录列表（与 WebviewMessageList.ts 中的保持一致）
      const pluginDirs = [
        { model: 'Cluster', path: 'communication.html', iframeName: 'Communication' },
        { model: 'Cluster', path: 'summary.html', iframeName: 'Summary' },
        { model: 'Compute', path: 'cache.html', iframeName: 'CacheFrame' },
        { model: 'Compute', path: 'detail.html', iframeName: 'Details' },
        { model: 'Compute', path: 'source.html', iframeName: 'Source' },
        { model: 'Compute', path: 'index.html', iframeName: 'Compute' },
        { model: 'leaks' },
        { model: 'Memory' },
        { model: 'Operator' },
        { model: 'RL' },
        { model: 'Statistic' },
        { model: 'Timeline' },
      ];

      console.log(`[InsightDataViewerPanel] 准备加载 ${pluginDirs.length} 个插件文件`);

      // 插件目录路径
      const pluginsBasePath = path.join(this.insightPluginBasePath, 'plugins');
      console.log(`[InsightDataViewerPanel] 插件基础路径: ${pluginsBasePath}`);

      // 创建所有文件的并发读取 Promise
      const readPromises = pluginDirs.map(async (pluginModel) => {
        const pluginDirPath = path.join(pluginsBasePath, pluginModel.model);
        const indexPath = path.join(pluginDirPath, pluginModel.path || 'index.html');
        const pluginName = pluginModel.iframeName || pluginModel.model;
        
        console.log(`[InsightDataViewerPanel] [${pluginName}] 开始读取文件: ${indexPath}`);

        try {
          // 检查文件是否存在
          if (fs.existsSync(indexPath)) {
            const fileStartTime = Date.now();
            // 并发读取文件内容
            const content = await fs.promises.readFile(indexPath, 'utf8');
            const fileEndTime = Date.now();
            const fileSize = content.length;
            console.log(`[InsightDataViewerPanel] [${pluginName}] ✓ 文件读取成功，大小: ${fileSize} 字节，耗时: ${fileEndTime - fileStartTime}ms`);
            
            return {
              pluginName: pluginName,
              content: content,
              filePath: indexPath,
            };
          } else {
            console.warn(`[InsightDataViewerPanel] [${pluginName}] ✗ 插件文件不存在: ${indexPath}`);
            return null;
          }
        } catch (error: any) {
          console.error(`[InsightDataViewerPanel] [${pluginName}] ✗ 读取插件文件失败: ${indexPath}`, error);
          return null;
        }
      });

      console.log(`[InsightDataViewerPanel] 开始并发执行 ${readPromises.length} 个文件读取操作...`);
      
      // 并发执行所有读取操作
      const results = await Promise.all(readPromises);

      // 过滤掉 null 值（文件不存在或读取失败的情况）
      const iframes = results.filter(
        (item): item is { pluginName: string; content: string; filePath: string } => item !== null
      );

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      console.log(`[InsightDataViewerPanel] ========== 并发读取完成 ==========`);
      console.log(`[InsightDataViewerPanel] 成功读取: ${iframes.length}/${pluginDirs.length} 个文件`);
      console.log(`[InsightDataViewerPanel] 总耗时: ${totalTime}ms`);
      console.log(`[InsightDataViewerPanel] 成功读取的插件列表:`, iframes.map(i => i.pluginName).join(', '));

      // 统一发送所有 iframe 内容、端口号和 binPath 给 webview
      console.log(`[InsightDataViewerPanel] 准备发送 ${iframes.length} 个 iframe 内容到 webview`);
      console.log(`[InsightDataViewerPanel] wsPort: ${this.serverPort}, binPath: ${this.binPath}`);

       await this.serverPortReady;
       
      this.panel.webview.postMessage({
        command: 'renderAllIframes',
        iframes: iframes,
        wsPort: this.serverPort,
        binPath: this.binPath,
      });
      
      console.log(`[InsightDataViewerPanel] ✓ 消息已发送到 webview`);
    } catch (error: any) {
      console.error('[InsightDataViewerPanel] ✗ 加载并发送 iframe 内容失败:', error);
      console.error('[InsightDataViewerPanel] 错误堆栈:', error.stack);
    }
  }

  /**
   * 扫描可用端口（使用 Linux 原生命令）
   */
  private async scanPort(): Promise<number | null> {
    return new Promise((resolve) => {
      try {
        // 使用 Linux 原生命令查找可用端口
        // 从端口 9000 开始，使用 ss 命令检查端口是否被占用
        // 如果 ss 不可用，则使用 netstat 作为备选
        const command = 'port=9000; while [ $port -le 9999 ]; do if command -v ss >/dev/null 2>&1; then if ! ss -tuln | grep -q ":$port "; then echo $port; exit 0; fi; elif command -v netstat >/dev/null 2>&1; then if ! netstat -tuln | grep -q ":$port "; then echo $port; exit 0; fi; else exit 1; fi; port=$((port+1)); done; exit 1';
        
        exec(command, { shell: '/bin/bash' }, (error, stdout, stderr) => {
          if (error) {
            console.error(`[InsightDataViewerPanel] 扫描端口失败: ${error.message}`);
            if (stderr) {
              console.error(`[InsightDataViewerPanel] stderr: ${stderr}`);
            }
            resolve(null);
            return;
          }

          // 从输出中提取端口号
          const portMatch = stdout.trim().match(/^\d+$/);
          if (portMatch) {
            const port = parseInt(portMatch[0], 10);
            if (!isNaN(port) && port > 0 && port <= 65535) {
              console.log(`[InsightDataViewerPanel] 找到可用端口: ${port}`);
              resolve(port);
              return;
            }
          }

          console.error(`[InsightDataViewerPanel] 无法从输出中解析端口号: ${stdout}`);
          resolve(null);
        });
      } catch (error: any) {
        console.error(`[InsightDataViewerPanel] 扫描端口异常:`, error);
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
    InsightDataViewerPanel.openedFiles.delete(this.binPath)

    // 销毁 panel
    this.panel.dispose();
  }
}

