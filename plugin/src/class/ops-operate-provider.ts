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
    // 配置WebView
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    // 注册 webview 到 ApiServer
    this._apiServer.addWebview(VIEW_OPERATE, webviewView.webview);

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

    webviewView.webview.html = await HtmlTransformer.transformDistHtml(
      distPath,
      webviewView.webview,
      `sidebars/${VIEW_OPERATE}`,
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
