import * as vscode from 'vscode';
import * as path from 'path';

import { HtmlTransformer } from './html-transformer';
import webviewMessageList from './webview-message-list';
import { ApiServer } from '@plugin/core/api-server';
import { VIEW_OPERATE } from '@plugin/constants';

export class OpsOperateProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'OpsOperateProvider';

  private readonly _extensionUri: vscode.Uri;
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
    // 配置 WebView
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    // 注册 webview 到 ApiServer
    this._apiServer.addWebview(VIEW_OPERATE, webviewView.webview);

    // 设置 HTML 内容
    const distPath = path.join(this._extensionUri.fsPath, 'out', 'web');

    webviewView.webview.html = await HtmlTransformer.transformDistHtml(
      distPath,
      webviewView.webview,
      `sidebars/${VIEW_OPERATE}`,
      { lang: vscode.env.language.toLowerCase() },
    );

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

    // 消息处理
    webviewView.webview.onDidReceiveMessage(
      (message: any) => {
        this.handleWebviewMessage(message);
      },
      undefined,
      this._context.subscriptions,
    );
  }

  /**
   * 处理来自 Webview 的消息
   */
  private handleWebviewMessage(message: any): void {
    for (const messageItem of webviewMessageList) {
      if (message.command === messageItem.command) {
        messageItem.callback(message, this);
      }
    }
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
