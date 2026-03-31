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
        { lang: vscode.env.language.toLowerCase() },
      );
    }
    catch (error) {
      console.error('[PerformancePanelViewProvider] HTML load failed:', error);
      throw error;
    }

    // Listen to VSCode theme changes and notify Webview
    this._themeChangeDisposable = vscode.window.onDidChangeActiveColorTheme((theme) => {
      webviewView.webview.postMessage({
        command: 'updateTheme',
        themeName: theme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light',
      });
    });

    // Send the current topic on initialization
    webviewView.webview.postMessage({
      command: 'updateTheme',
      themeName: vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light',
    });
  }

  private handleWebviewMessage(message: any): void {
    // Handle gettopic command
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
   * Clean up resources
   */
  public dispose() {
    if (this._themeChangeDisposable) {
      this._themeChangeDisposable.dispose();
      this._themeChangeDisposable = undefined;
    }
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
