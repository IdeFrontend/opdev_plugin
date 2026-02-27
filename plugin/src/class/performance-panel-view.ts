import * as vscode from 'vscode';
import * as path from 'path';

import { HtmlTransformer } from './html-transformer';
import webviewMessageList from './webview-message-list';
import { ApiServer } from '@plugin/core/api-server';
import {
  COMMAND_OPEN_PERFORMANCE_PANEL_VIEW,
  VIEW_PERFORMANCE_RUN_DATA,
} from '@plugin/constants';

export class PerformancePanelViewProvider
implements vscode.WebviewViewProvider {
  public static readonly viewType = 'performancePanelView';

  _view?: vscode.WebviewView;
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
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    this._apiServer.addWebview(VIEW_PERFORMANCE_RUN_DATA, webviewView.webview);

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
        `sidebars/${VIEW_PERFORMANCE_RUN_DATA}`,
      );
    }
    catch (error) {
      console.error('[PerformancePanelViewProvider] HTML加载失败:', error);
      throw error;
    }
  }

  private handleWebviewMessage(message: any): void {
    for (const messageItem of webviewMessageList) {
      if (message.command === messageItem.command) {
        messageItem.callback(message, this);
      }
    }
  }

  getWebview(): vscode.Webview | undefined {
    return this._view?.webview;
  }
}

export const getPerformancePanelViewProvider = (
  context: vscode.ExtensionContext,
  apiServer: ApiServer,
) => {
  const performancePanelViewProvider = new PerformancePanelViewProvider(
    context,
    apiServer,
  );
  const performancePanelView = vscode.window.registerWebviewViewProvider(
    PerformancePanelViewProvider.viewType,
    performancePanelViewProvider,
    { webviewOptions: { retainContextWhenHidden: true } },
  );

  const openPerformanceDisposable = vscode.commands.registerCommand(
    COMMAND_OPEN_PERFORMANCE_PANEL_VIEW,
    async () => {
      await vscode.commands.executeCommand('workbench.action.togglePanel');
      await vscode.commands.executeCommand('performancePanelView.focus');
    },
  );

  return {
    performancePanelView,
    openPerformanceDisposable,
    getWebview: () => performancePanelViewProvider.getWebview(),
  };
};
