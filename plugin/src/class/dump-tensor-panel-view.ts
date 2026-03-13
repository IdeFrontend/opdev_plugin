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

  private handleWebviewMessage(message: any): void {
    // 处理获取主题命令
    if (message.command === 'getTheme') {
      const currentTheme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';
      this._view?.webview.postMessage({
        command: 'updateTheme',
        themeName: currentTheme,
      });
      return;
    }

    for (const messageItem of webviewMessageList) {
      if (message.command === messageItem.command) {
        messageItem.callback(message, this);
      }
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