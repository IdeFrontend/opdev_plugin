/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { t } from 'i18next';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import {
  spawn, ChildProcess, exec,
} from 'child_process';
import AdmZip from 'adm-zip';
import { NodeWebviewSocketBridge } from './node-webview-socket-bridge';
import webviewMessageList from './webview-message-list';
import { CommandExecutor } from './command-options';
import { EnvironmentVariableReader } from './environment-variable-reader';

export class InsightDataViewerPanel implements vscode.Disposable {
  private static openedFiles = new Map<string, InsightDataViewerPanel>();
  private readonly panel: vscode.WebviewPanel;
  private readonly context: vscode.ExtensionContext;
  private socketBridge: NodeWebviewSocketBridge | undefined;
  private readonly binPath: string;
  private profilerServerProcess: ChildProcess | null = null;
  private serverPort: number | null = null;
  private readonly serverPath: string = '';
  private readonly serverDir: string = '';
  private readonly zipDir: string = '';
  private readonly insightPluginBasePath: string;
  private readonly serverPortReady!: Promise<void>;

  constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    binPath: string,
  ) {
    this.panel = panel;
    this.context = context;
    this.binPath = binPath;
    // Get the path from environment variables (preferably from process.env, if failed, read from .arts/.env file)
    this.insightPluginBasePath = this.getInsightPluginBasePath();

    if (this.insightPluginBasePath === '') {
      vscode.window.showInformationMessage(t('insight.insightPathFailed'));

      return;
    }

    this.serverDir = path.join(this.insightPluginBasePath, 'server');
    this.serverPath = path.join(this.serverDir, 'profiler_server');
    this.zipDir = path.join(this.insightPluginBasePath, 'zip');
    let resolvePortReady: ()=> void;

    this.serverPortReady = new Promise((resolve) => {
      resolvePortReady = resolve;
    });
    const resolvePort = resolvePortReady!;

    // Start profiler_server (asynchronous, but sets this.serverPort in the background)
    this.startProfilerServer(resolvePort)
      .catch((error) => {
        console.error(
          '[InsightDataViewerPanel] ✗ Failed to start profiler_server:',
          error,
        );
      });

    // Set webview content
    this.setupWebview();

    // Send initial theme and subscribe to theme changes
    const getThemeName = (kind: vscode.ColorThemeKind) =>
      kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';

    this.panel.webview.postMessage({
      command: 'updateTheme',
      themeName: getThemeName(vscode.window.activeColorTheme.kind),
    });

    context.subscriptions.push(
      vscode.window.onDidChangeActiveColorTheme((theme) => {
        this.panel.webview.postMessage({
          command: 'updateTheme',
          themeName: getThemeName(theme.kind),
        });
      }),
    );

    // Listen for panel closing events
    this.panel.onDidDispose(() => this.dispose(), null, context.subscriptions);

    // Listen to webview messages
    this.panel.webview.onDidReceiveMessage(
      (message: any) => {
        this.handleWebviewMessage(message);
      },
      null,
      context.subscriptions,
    );

    // Wait for serverPort to be ready before loading and sending iframe content
    console.log('[InsightDataViewerPanel] Panel created, waiting for service port before loading all iframe content...');
    this.loadAndSendAllIframes()
      .catch((error) => {
        console.error('[InsightDataViewerPanel] ✗ Failed to pre-load iframe:', error);
      });
  }

  /**
   * Get the insight-vscode-plugin base path
   * Read from process.env first, if not, read from .arts/.env file
   */
  private getInsightPluginBasePath(): string {
    const envPath = EnvironmentVariableReader.getEnv('INSIGHT_HOME_PATH');

    if (envPath) {
      console.log(`[InsightDataViewerPanel] Got insight-vscode-plugin path from environment variable: ${envPath}`);

      return envPath;
    }

    return '';
  }

  /**
   * Create or display a panel
   */
  public static createOrShow(
    context: vscode.ExtensionContext,
    binPath: string,
  ): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If the panel already exists, display it directly
    if (InsightDataViewerPanel.openedFiles.has(binPath)) {
      InsightDataViewerPanel.openedFiles.get(binPath)?.panel.reveal(column);

      return;
    }

    // Create new panel
    const panel = vscode.window.createWebviewPanel(
      'insightDataViewer',
      t('insight.performanceAnalysis'),
      column || vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    InsightDataViewerPanel.openedFiles.set(
      binPath,
      new InsightDataViewerPanel(panel, context, binPath),
    );
  }

  /**
   * Set webview content
   */
  private setupWebview(): void {
    const htmlPath = path.join(this.insightPluginBasePath, 'index.html');

    let htmlContent: string;

    if (fs.existsSync(htmlPath)) {
      htmlContent = fs.readFileSync(htmlPath, 'utf8');
    }
    else {
      htmlContent = this.getDefaultHtml();
    }

    this.panel.webview.html = htmlContent;

    // Handle WebSocket bridging using NodeWebviewSocketBridge
    console.log('[InsightDataViewerPanel] Initializing NodeWebviewSocketBridge');
    this.socketBridge = new NodeWebviewSocketBridge(this.panel.webview);
    console.log('[InsightDataViewerPanel] NodeWebviewSocketBridge initialization completed');
  }

  /**
   * Get default HTML content
   */
  private getDefaultHtml(): string {
    const title = t('insight.dataViewerTitle');
    const binLabel = t('insight.binFilePathLabel');
    const wsLabel = t('insight.wsPortLabel');
    const loading = t('insight.placeholderLoading');
    const starting = t('insight.placeholderWsStarting');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body {
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            margin: 0;
            padding: 20px;
        }
        h1 {
            font-weight: 400;
            margin-bottom: 16px;
        }
        p {
            margin: 8px 0;
            color: var(--vscode-editor-foreground);
        }
        span {
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div id="app">
        <h1>${title}</h1>
        <p>${binLabel} <span id="binPath">${loading}</span></p>
        <p>${wsLabel} <span id="wsPort">${starting}</span></p>
    </div>
    <script>
        const vscode = acquireVsCodeApi();

        // Listen for messages from extensions
        window.addEventListener('message', event => {
            const message = event.data;

            // Handle WebSocket bridge messages (from NodeWebviewSocketBridge)
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

        // Notify extension that the webview is ready to receive messages
        vscode.postMessage({ command: 'ready' });
    </script>
</body>
</html>`;
  }

  /**
   * Handle messages from webview
   */
  private handleWebviewMessage(message: any): void {
    console.log(
      '[InsightDataViewerPanel] Received webview message:',
      JSON.stringify(message, null, 2),
    );

    // Check if it is a WebSocket bridge message (these messages should be handled by NodeWebviewSocketBridge)
    if (
      message.type
      && (message.type === 'ws:open'
        || message.type === 'ws:send'
        || message.type === 'ws:close')
    ) {
      console.log(
        '[InsightDataViewerPanel] Detected WebSocket bridge message, should be handled by NodeWebviewSocketBridge:',
        message.type,
      );

      // These messages will be processed by handleMessage of NodeWebviewSocketBridge
      // But we need to make sure the message is delivered correctly
      if (this.socketBridge) {
        console.log('[InsightDataViewerPanel] NodeWebviewSocketBridge is initialized; messages should be processed');
      }
      else {
        console.error('[InsightDataViewerPanel] NodeWebviewSocketBridge is not initialized!');
      }

      // Don't handle it here, let NodeWebviewSocketBridge handle it
      return;
    }

    // First try to find the corresponding processor from WebviewMessageList
    for (const messageItem of webviewMessageList) {
      if (message.command === messageItem.command) {
        console.log(`[InsightDataViewerPanel] Found handler: ${message.command}`);
        // Create a that object like WebviewProvider
        const that = {
          context: this.context,
          panel: this.panel,
          _view: undefined,
        };

        messageItem.callback(message, that);
        break;
      }
    }
  }

  /**
   * Detection system architecture
   */
  private detectArchitecture(): 'x86' | 'arm' {
    const arch = os.arch()
      .toLowerCase();

    // x86_64, ia32, x32, x64, etc. all belong to the x86 architecture
    if (
      arch.includes('x64')
      || arch.includes('x86')
      || arch.includes('ia32')
      || arch === 'x32'
    ) {
      return 'x86';
    }

    // arm64, aarch64, arm, etc. all belong to the arm architecture
    if (arch.includes('arm') || arch.includes('aarch')) {
      return 'arm';
    }

    // Returns x86 by default (most cases)
    console.warn(`Unknown architecture: ${arch}, defaulting to x86`);

    return 'x86';
  }

  /**
   * Unzip the zip file
   */
  private async extractZip(zipPath: string, extractTo: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Make sure the target directory exists
        if (!fs.existsSync(extractTo)) {
          fs.mkdirSync(extractTo, { recursive: true });
        }

        // Unzip using adm-zip (cross-platform compatible)
        const zip = new AdmZip(zipPath);

        zip.extractAllTo(extractTo, true);

        console.log(`Unzip successful: ${zipPath} -> ${extractTo}`);
        resolve();
      }
      catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`Unzip failed: ${errMsg}`);
        reject(new Error(t('insight.unzipFailed', { error: errMsg })));
      }
    });
  }

  /**
   * Make sure the server directory exists, if it does not exist, unzip the corresponding zip file
   */
  private async ensureServerDirectoryExists(): Promise<boolean> {
    // If the server directory already exists, return directly
    if (fs.existsSync(this.serverDir)) {
      console.log(`[InsightDataViewerPanel] server directory already exists: ${this.serverDir}`);

      // Execute the chmod -R o-w command on the insightPluginBasePath directory (remove write permissions for other users)
      // Only executed on non-Windows systems
      if (os.platform() !== 'win32') {
        try {
          const commandExecutor = new CommandExecutor();
          const chmodCommand = `chmod -R o-w ${this.insightPluginBasePath}`;

          console.log(`[InsightDataViewerPanel] Executing command: ${chmodCommand}`);
          const result = await commandExecutor.execute(chmodCommand, [], [], { cwd: process.cwd() });

          if (result.code === 0) {
            console.log('[InsightDataViewerPanel] ✓ chmod command executed successfully');
          }
          else {
            console.warn(`[InsightDataViewerPanel] chmod command failed, exit code: ${result.code}`);

            if (result.stderr) {
              console.warn(`[InsightDataViewerPanel] chmod stderr: ${result.stderr}`);
            }
          }
        }
        catch (error: any) {
          console.warn(`[InsightDataViewerPanel] Error while running chmod command: ${error.message}`);
        }
      }

      // Check if profiler_server file exists
      if (fs.existsSync(this.serverPath)) {
        return true;
      }
      else {
        console.warn(`[InsightDataViewerPanel] server directory exists but profiler_server file does not: ${this.serverPath}`);
        // If the directory exists but the file does not exist, you may need to re-extract it.
      }
    }

    // Detection system architecture
    const architecture = this.detectArchitecture();
    const zipFileName =
      architecture === 'x86' ? 'server_x86.zip' : 'server_arm.zip';
    const zipPath = path.join(this.zipDir, zipFileName);

    // Check if zip file exists
    if (!fs.existsSync(zipPath)) {
      const errorMsg = t('insight.serverZipMissing', { path: zipPath });

      console.error(`[InsightDataViewerPanel] ${errorMsg}`);
      vscode.window.showErrorMessage(errorMsg);

      return false;
    }

    try {
      // Show progress information
      console.log(`[InsightDataViewerPanel] Start unzipping: ${zipPath}`);

      // Unzip the zip file to the insight-vscode-plugin directory (the compressed package already contains the server directory)
      await this.extractZip(zipPath, this.insightPluginBasePath);

      // Check whether the server directory exists after decompression
      if (!fs.existsSync(this.serverDir)) {
        const errorMsg = t('insight.serverDirStillMissing', { path: this.serverDir });

        console.error(`[InsightDataViewerPanel] ${errorMsg}`);
        vscode.window.showErrorMessage(errorMsg);

        return false;
      }

      // Check if profiler_server file exists
      if (!fs.existsSync(this.serverPath)) {
        const errorMsg = t('insight.profilerServerFileStillMissing', { path: this.serverPath });

        console.error(`[InsightDataViewerPanel] ${errorMsg}`);
        vscode.window.showErrorMessage(errorMsg);

        return false;
      }

      // Set execution permissions (may fail on Windows, but does not affect execution)
      try {
        fs.chmodSync(this.serverPath, 0o755);
        console.log('[InsightDataViewerPanel] profiler_server executable permission set');
      }
      catch (chmodError) {
        console.warn(
          '[InsightDataViewerPanel] Failed to set execute permission (can be ignored on Windows):',
          chmodError,
        );
      }

      console.log('[InsightDataViewerPanel] ✓ server directory is ready');

      return true;
    }
    catch (error: any) {
      const errorMsg = t('insight.unzipArchiveFailed', {
        fileName: zipFileName,
        error: error?.message ?? String(error),
      });

      console.error(`[InsightDataViewerPanel] ${errorMsg}`, error);
      vscode.window.showErrorMessage(errorMsg);

      return false;
    }
  }

  /**
   * Start profiler_server
   * @param resolvePort callback function when the port is ready
   */
  private async startProfilerServer(resolvePort: ()=> void): Promise<void> {
    try {
      // Windows system does not start the service
      if (os.platform() === 'win32') {
        console.log('[InsightDataViewerPanel] Windows detected, skipping profiler_server startup');
        // Windows systems do not start the service, but still need to set a default port (if needed)
        // Or resolve directly and let loadAndSendAllIframes continue execution.
        resolvePort();

        return;
      }

      // Make sure the server directory exists, unzip it if it does not exist
      console.log('[InsightDataViewerPanel] Checking server directory...');
      await this.ensureServerDirectoryExists();

      // Get available ports
      console.log('[InsightDataViewerPanel] Scanning available ports...');
      const port = await this.scanPort();

      if (!port) {
        const errorMsg = t('insight.cannotGetPort');

        console.error(`[InsightDataViewerPanel] ${errorMsg}`);
        vscode.window.showErrorMessage(errorMsg);
        resolvePort(); // Resolve even if it fails to avoid permanent blocking

        return;
      }

      // Record port number
      this.serverPort = port;
      console.log(`[InsightDataViewerPanel] Found available port: ${this.serverPort}`);

      // Start profiler_server
      // Note: The export command needs to be executed in the shell, so use bash -c
      // Set LD_LIBRARY_PATH to the current directory
      const command = `chmod +x ${this.serverPath} && export LD_LIBRARY_PATH=\`pwd\` && ${this.serverPath} --wsPort=${this.serverPort} --wsHost=0.0.0.0`;

      console.log(`[InsightDataViewerPanel] Starting profiler_server: ${command}`);

      // Use bash -c to execute the command to ensure that the export command can be executed correctly
      this.profilerServerProcess = spawn('bash', [
        '-c',
        command,
      ], {
        cwd: this.serverDir,
        env: {
          ...process.env,
          // Make sure LD_LIBRARY_PATH is set
          LD_LIBRARY_PATH: this.serverDir,
        },
        shell: false,
      });

      // Handle process output
      this.profilerServerProcess.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();

        console.log(`[profiler_server] ${output}`);
      });

      this.profilerServerProcess.stderr?.on('data', (data: Buffer) => {
        const output = data.toString();

        console.error(`[profiler_server] ${output}`);
      });

      // Process shutdown
      this.profilerServerProcess.on('close', (code: number) => {
        console.log(`[InsightDataViewerPanel] profiler_server process exited, code: ${code}`);
        this.profilerServerProcess = null;

        if (code !== 0 && code !== null) {
          vscode.window.showWarningMessage(t('insight.profilerServerExitCode', { code: String(code) }));
        }
      });

      // Handling process errors
      this.profilerServerProcess.on('error', (error: Error) => {
        console.error(
          '[InsightDataViewerPanel] Failed to start profiler_server:',
          error,
        );
        vscode.window.showErrorMessage(t('insight.profilerServerStartFailed', { error: error.message }));
        this.profilerServerProcess = null;
      });

      console.log(`[InsightDataViewerPanel] ✓ profiler_server started, port: ${this.serverPort}`);

      // Notification port is ready
      resolvePort();
    }
    catch (error: any) {
      const errorMsg = t('insight.profilerServerStartFailed', {
        error: error?.message ?? String(error),
      });

      console.error(`[InsightDataViewerPanel] ${errorMsg}`, error);
      vscode.window.showErrorMessage(errorMsg);
      // Resolve even if an error occurs to avoid permanent blocking
      resolvePort();
    }
  }

  /**
   * Load all HTML files concurrently and send them to webview uniformly
   */
  private async loadAndSendAllIframes(): Promise<void> {
    console.log('[InsightDataViewerPanel] ========== Start loading all iframe content ==========');
    const startTime = Date.now();

    try {
      // Wait for serverPort to be ready
      console.log('[InsightDataViewerPanel] Waiting for service port...');

      console.log(`[InsightDataViewerPanel] Service port is ready: ${this.serverPort}`);

      // Plug-in directory list (consistent with webview-message-list.ts)
      const pluginDirs = [
        {
          model: 'Cluster',
          path: 'communication.html',
          iframeName: 'Communication',
        },
        {
          model: 'Cluster',
          path: 'summary.html',
          iframeName: 'Summary',
        },
        {
          model: 'Compute',
          path: 'cache.html',
          iframeName: 'CacheFrame',
        },
        {
          model: 'Compute',
          path: 'detail.html',
          iframeName: 'Details',
        },
        {
          model: 'Compute',
          path: 'source.html',
          iframeName: 'Source',
        },
        {
          model: 'Compute',
          path: 'index.html',
          iframeName: 'Compute',
        },
        { model: 'leaks' },
        { model: 'Memory' },
        { model: 'Operator' },
        { model: 'RL' },
        { model: 'Statistic' },
        { model: 'Timeline' },
      ];

      console.log(`[InsightDataViewerPanel] Preparing to load ${pluginDirs.length} plugin files`);

      // Plugin directory path
      const pluginsBasePath = path.join(this.insightPluginBasePath, 'plugins');

      console.log(`[InsightDataViewerPanel] Plugin base path: ${pluginsBasePath}`);

      // Create concurrent read Promise for all files
      const readPromises = pluginDirs.map(async (pluginModel) => {
        const pluginDirPath = path.join(pluginsBasePath, pluginModel.model);
        const indexPath = path.join(
          pluginDirPath,
          pluginModel.path || 'index.html',
        );
        const pluginName = pluginModel.iframeName || pluginModel.model;

        console.log(`[InsightDataViewerPanel] [${pluginName}] Start reading file: ${indexPath}`);

        try {
          // Check if the file exists
          if (fs.existsSync(indexPath)) {
            const fileStartTime = Date.now();
            // Concurrently read file contents
            const content = await fs.promises.readFile(indexPath, 'utf8');
            const fileEndTime = Date.now();
            const fileSize = content.length;

            console.log(`[InsightDataViewerPanel] [${pluginName}] ✓ File read succeeded, size: ${fileSize} bytes, time: ${fileEndTime - fileStartTime}ms`);

            return {
              pluginName: pluginName,
              content: content,
              filePath: indexPath,
            };
          }
          else {
            console.warn(`[InsightDataViewerPanel] [${pluginName}] ✗ Plugin file does not exist: ${indexPath}`);

            return null;
          }
        }
        catch (error: any) {
          console.error(
            `[InsightDataViewerPanel] [${pluginName}] ✗ Failed to read plugin file: ${indexPath}`,
            error,
          );

          return null;
        }
      });

      console.log(`[InsightDataViewerPanel] Starting ${readPromises.length} file read operations concurrently...`);

      // Perform all read operations concurrently
      const results = await Promise.all(readPromises);

      // Filter out null values ​​(cases where the file does not exist or the read failed)
      const iframes = results.filter((item): item is { pluginName: string;
        content: string;
        filePath: string } =>
        item !== null);

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      console.log('[InsightDataViewerPanel] ========== Concurrent reads completed ==========');
      console.log(`[InsightDataViewerPanel] Successfully read: ${iframes.length}/${pluginDirs.length} files`);
      console.log(`[InsightDataViewerPanel] Total time: ${totalTime}ms`);
      console.log(
        '[InsightDataViewerPanel] Successfully read plugin list:',
        iframes.map((i) => i.pluginName)
          .join(', '),
      );

      // Send all iframe content, port number and binPath to webview uniformly
      console.log(`[InsightDataViewerPanel] Preparing to send ${iframes.length} iframe contents to webview`);
      console.log(`[InsightDataViewerPanel] wsPort: ${this.serverPort}, binPath: ${this.binPath}`);

      await this.serverPortReady;

      this.panel.webview.postMessage({
        command: 'renderAllIframes',
        iframes: iframes,
        wsPort: this.serverPort,
        binPath: this.binPath,
      });

      console.log('[InsightDataViewerPanel] ✓ Message sent to webview');
    }
    catch (error: any) {
      console.error(
        '[InsightDataViewerPanel] ✗ Failed to load and send iframe content:',
        error,
      );
      console.error('[InsightDataViewerPanel] Error stack:', error.stack);
    }
  }

  /**
   * Scan available ports (using Linux native commands)
   */
  private async scanPort(): Promise<number | null> {
    return new Promise((resolve) => {
      try {
        // Find available ports using native Linux commands
        // Starting from port 9000, use the ss command to check whether the port is occupied
        // If ss is not available, use netstat as an alternative
        const command =
          'port=9000; while [ $port -le 9999 ]; do if command -v ss >/dev/null 2>&1; then if ! ss -tuln | grep -q ":$port "; then echo $port; exit 0; fi; elif command -v netstat >/dev/null 2>&1; then if ! netstat -tuln | grep -q ":$port "; then echo $port; exit 0; fi; else exit 1; fi; port=$((port+1)); done; exit 1';

        exec(command, { shell: '/bin/bash' }, (error, stdout, stderr) => {
          if (error) {
            console.error(`[InsightDataViewerPanel] Port scan failed: ${error.message}`);

            if (stderr) {
              console.error(`[InsightDataViewerPanel] stderr: ${stderr}`);
            }

            resolve(null);

            return;
          }

          // Extract port number from output
          const portMatch = stdout.trim()
            .match(/^\d+$/);

          if (portMatch) {
            const port = parseInt(portMatch[0], 10);

            if (!isNaN(port) && port > 0 && port <= 65535) {
              console.log(`[InsightDataViewerPanel] Found available port: ${port}`);
              resolve(port);

              return;
            }
          }

          console.error(`[InsightDataViewerPanel] Unable to parse port number from output: ${stdout}`);
          resolve(null);
        });
      }
      catch (error: any) {
        console.error('[InsightDataViewerPanel] Port scan exception:', error);
        resolve(null);
      }
    });
  }

  /**
   * Stop profiler_server
   */
  private stopProfilerServer(): void {
    if (this.profilerServerProcess) {
      try {
        this.profilerServerProcess.kill('SIGTERM');
        console.log('Stopped profiler_server process');
      }
      catch (error) {
        console.error('Failed to stop profiler_server:', error);
      }

      this.profilerServerProcess = null;
    }
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    // Stop profiler_server
    this.stopProfilerServer();

    // Clean up the WebSocket bridge
    if (this.socketBridge) {
      this.socketBridge.dispose();
      this.socketBridge = undefined;
    }

    // Clean up panel references
    InsightDataViewerPanel.openedFiles.delete(this.binPath);

    // Destroy panel
    this.panel.dispose();
  }
}
