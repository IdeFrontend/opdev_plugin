import * as vscode from 'vscode';
import * as path from 'path';
import { t } from 'i18next';

import { HtmlTransformer } from './html-transformer';
import webviewMessageList from './webview-message-list';
import { ApiServer } from '@plugin/core/api-server';
import {
  handleThemeRequest,
  registerWebviewThemeBridge,
} from '@plugin/core/view/webview-theme';
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
      console.error('[DumpTensorPanelViewProvider] Failed to load HTML:', error);
      throw error;
    }

    this._themeChangeDisposable = registerWebviewThemeBridge(webviewView.webview);
  }

  private async handleWebviewMessage(message: any) {
    if (this._view && handleThemeRequest(this._view.webview, message)) {
      return;
    }

    // Handle DumpTensor .bin import command.
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
      // Open file dialog and limit to .bin files.
      const fileUri = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
          'Binary Files': ['bin'],
          'All Files': ['*']
        },
        title: t('extension.selectDumpTensorBinFile')
      });

      if (fileUri && fileUri.length > 0) {
        const binFilePath = fileUri[0].fsPath;
        console.log('[DumpTensorPanelView] Selected .bin file path:', binFilePath);
        
        // Import selected file.
        const { buildService } = await import('../service/build-service.js');
        await buildService.importDumpTensorBinFile(binFilePath);
      }
    } catch (error) {
      console.error('[DumpTensorPanelView] Failed to import DumpTensor .bin file:', error);
      vscode.window.showErrorMessage(t('extension.importDumpTensorBinFailed'));
    }
  }

  getWebview(): vscode.Webview | undefined {
    return this._view?.webview;
  }

  /**
   * Dispose resources.
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
