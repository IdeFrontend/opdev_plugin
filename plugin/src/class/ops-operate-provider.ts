import * as vscode from 'vscode';
import * as path from 'path';

import { HtmlTransformer } from './html-transformer';
import webviewMessageList from './webview-message-list';
import { ApiServer } from 'plugin:/core/api-server';

export class OpsOperateProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'OpsOperateProvider';

  private _view?: vscode.WebviewView;
  private _extensionUri: vscode.Uri;
  private _context: vscode.ExtensionContext;
  private _apiServer: ApiServer;

  constructor(context: vscode.ExtensionContext, apiServer: ApiServer) {
    this._extensionUri = context.extensionUri;
    this._context = context;
    this._apiServer = apiServer;
  }

  async resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    // 配置WebView
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    // 注册 webview 到 ApiServer
    this._apiServer.addWebview('operate', webviewView.webview);

    // 消息处理
    webviewView.webview.onDidReceiveMessage(
      (message: any) => {
        this.handleWebviewMessage(message);
      },
      undefined,
      this._context.subscriptions,
    );

    // 设置HTML内容
    const distPath = path.join(this._extensionUri.fsPath, 'out', 'web');

    webviewView.webview.html = HtmlTransformer.transformDistHtml(
      distPath,
      webviewView.webview,
      'operate',
    );
  }

  /**
   * 处理来自Webview的消息
   */
  private handleWebviewMessage(message: any): void {
    for (const messageItem of webviewMessageList) {
      if (message.command === messageItem.command) {
        messageItem.callback(message, this);
      }
    }
  }
}
