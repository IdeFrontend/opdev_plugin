import * as vscode from 'vscode';
import * as path from 'path';

import { HtmlTransformer } from './html-transformer';
import webviewMessageList from './webview-message-list';
import { ApiServer } from '@plugin/core/api-server';
import {
  COMMAND_OPEN_DUMP_TENSOR_PANEL_VIEW,
  VIEW_DUMP_TENSOR_DATA,
} from '@plugin/constants';

export class DumpTensorPanelViewProvider
implements vscode.WebviewViewProvider {
  public static readonly viewType = 'dumpTensorPanelView';

  _view?: vscode.WebviewView;
  private _extensionUri: vscode.Uri;
  private _context: vscode.ExtensionContext;
  private _apiServer: ApiServer;
  private _themeChangeDisposable: vscode.Disposable | undefined;

  constructor(context: vscode.ExtensionContext, apiServer: ApiServer) {
    this._extensionUri = context.extensionUri;
    this._context = context;
    this._apiServer = apiServer;
  }

  async resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    this._apiServer.addWebview(VIEW_DUMP_TENSOR_DATA, webviewView.webview);

    webviewView.webview.onDidReceiveMessage(
      (message: any) => {
        this.handleWebviewMessage(message);
      },
      undefined,
      this._context.subscriptions,
    );

    const distPath = path.join(this._extensionUri.fsPath, 'out', 'web');

    try {
      webviewView.webview.html = await HtmlTransformer.transformDistHtml(
        distPath,
        webviewView.webview,
        `sidebars/${VIEW_DUMP_TENSOR_DATA}`,
      );
    }
    catch (error) {
      console.error('[DumpTensorPanelViewProvider] HTML 加载失败:', error);
      throw error;
    }

    // 监听 VSCode 主题变化并通知 Webview
    this._themeChangeDisposable = vscode.window.onDidChangeActiveColorTheme((theme) => {
      webviewView.webview.postMessage({
        command: 'updateTheme',
        themeName: theme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light',
      });
    });

    // 初始化时发送当前主题
    webviewView.webview.postMessage({
      command: 'updateTheme',
      themeName: vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light',
    });
  }

  private async handleWebviewMessage(message: any) {
    // 处理获取主题命令
    if (message.command === 'getTheme') {
      const currentTheme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';
      this._view?.webview.postMessage({
        command: 'updateTheme',
        themeName: currentTheme,
      });
      return;
    }

    // 处理导入DumpTensor .bin文件命令
    if (message.command === 'importDumpTensorBinFile') {
      await this.importDumpTensorBinFile();
      return;
    }

    for (const messageItem of webviewMessageList) {
      if (message.command === messageItem.command) {
        messageItem.callback(message, this);
      }
    }
  }

  private async importDumpTensorBinFile() {
    try {
      // 打开文件选择对话框，只允许选择.bin文件
      const fileUri = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
          'Binary Files': ['bin'],
          'All Files': ['*']
        },
        title: '选择DumpTensor .bin文件'
      });

      if (fileUri && fileUri.length > 0) {
        const binFilePath = fileUri[0].fsPath;
        console.log('[DumpTensorPanelView] 选择的.bin文件路径:', binFilePath);
        
        // 调用API导入文件
        const { buildService } = await import('../service/build-service.js');
        await buildService.importDumpTensorBinFile(binFilePath);
      }
    } catch (error) {
      console.error('[DumpTensorPanelView] 导入DumpTensor .bin文件失败:', error);
      vscode.window.showErrorMessage('导入DumpTensor .bin文件失败');
    }
  }

  getWebview(): vscode.Webview | undefined {
    return this._view?.webview;
  }

  /**
   * 清理资源
   */
  public dispose() {
    if (this._themeChangeDisposable) {
      this._themeChangeDisposable.dispose();
      this._themeChangeDisposable = undefined;
    }
  }
}

export const getDumpTensorPanelViewProvider = (
  context: vscode.ExtensionContext,
  apiServer: ApiServer,
) => {
  const dumpTensorPanelViewProvider = new DumpTensorPanelViewProvider(
    context,
    apiServer,
  );
  const dumpTensorPanelView = vscode.window.registerWebviewViewProvider(
    DumpTensorPanelViewProvider.viewType,
    dumpTensorPanelViewProvider,
    { webviewOptions: { retainContextWhenHidden: true } },
  );

  const openDumpTensorDisposable = vscode.commands.registerCommand(
    COMMAND_OPEN_DUMP_TENSOR_PANEL_VIEW,
    async () => {
      await vscode.commands.executeCommand('workbench.action.togglePanel');
      await vscode.commands.executeCommand('dumpTensorPanelView.focus');
    },
  );

  return {
    dumpTensorPanelView,
    openDumpTensorDisposable,
    getWebview: () => dumpTensorPanelViewProvider.getWebview(),
  };
};