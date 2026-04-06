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
    // Configure WebView
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    // Register webview to ApiServer
    this._apiServer.addWebview(VIEW_OPERATE, webviewView.webview);

    // Set HTML content
    const distPath = path.join(this._extensionUri.fsPath, 'out', 'web');

    webviewView.webview.html = await HtmlTransformer.transformDistHtml(
      distPath,
      webviewView.webview,
      `sidebars/${VIEW_OPERATE}`,
      { lang: vscode.env.language.toLowerCase() },
    );

    // Listen to VSCode theme changes and notify Webview
    this._themeChangeDisposable = vscode.window.onDidChangeActiveColorTheme((theme) => {
      webviewView.webview.postMessage({
        command: 'updateTheme',
        themeName: theme.kind === vscode.ColorThemeKind.Dark || theme.kind === vscode.ColorThemeKind.HighContrast ? 'dark' : 'light',
      });
    });

    // Send the current topic on initialization
    webviewView.webview.postMessage({
      command: 'updateTheme',
      themeName: vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark || vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrast ? 'dark' : 'light',
    });

    // Message processing
    webviewView.webview.onDidReceiveMessage(
      (message: any) => {
        this.handleWebviewMessage(message);
      },
      undefined,
      this._context.subscriptions,
    );
  }

  /**
   * Handle messages from Webview
   */
  private handleWebviewMessage(message: any): void {
    for (const messageItem of webviewMessageList) {
      if (message.command === messageItem.command) {
        messageItem.callback(message, this);
      }
    }
  }

  /**
   * Clean up resources
   */
  public dispose() {
    if (this._themeChangeDisposable) {
      this._themeChangeDisposable.dispose();
      this._themeChangeDisposable = undefined;
    }
  }
}
