import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ExceptionParser } from './exception-parser';

import { HtmlTransformer } from './html-transformer';
import webviewMessageList from './webview-message-list';
import { ApiServer } from '@plugin/core/api-server';
import {
  COMMAND_OPEN_MS_SANITIZER_PANEL_VIEW,
  VIEW_MS_SANITIZER,
} from '@plugin/constants';
import { resolveSanitizerSourceFsPath } from '@plugin/helpers/sanitizer-source-path';
import {
  msAgentBridgeService,
  type MsAgentAiFixQueueSnapshot,
  type MsAgentAiFixState,
} from '@plugin/service/ms-agent-bridge.service';
import { sanitizerDiagnosticsService } from '@plugin/service/sanitizer-diagnostics.service';

export class MsSanitizerPanelViewProvider
implements vscode.WebviewViewProvider {
  public static readonly viewType = 'msSanitizerPanelView';

  public static getMsSanitizerPanelViewDataParams = null;

  _view?: vscode.WebviewView;
  private _extensionUri: vscode.Uri;
  private _context: vscode.ExtensionContext;
  private _apiServer: ApiServer;
  private _themeChangeDisposable: vscode.Disposable | undefined;
  private _msAgentFixStatesPoll: ReturnType<typeof setInterval> | undefined;
  /** In-flight sanitizer AI fix calls; used to avoid empty bulk updates clearing UI and to stop polling safely. */
  private _pendingMsAgentFixRequests = 0;

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
    console.log('[MsSanitizerPanelViewProvider.resolveWebviewView] Start resolving webview view');
    console.log(`[MsSanitizerPanelViewProvider.resolveWebviewView] viewType: ${MsSanitizerPanelViewProvider.viewType}`);
    console.log(`[MsSanitizerPanelViewProvider.resolveWebviewView] extensionUri: ${this._extensionUri.toString()}`);

    this._view = webviewView;

    // Configure WebView
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };
    console.log('[MsSanitizerPanelViewProvider.resolveWebviewView] WebView configuration completed');

    // Register webview to ApiServer
    this._apiServer.addWebview('MsSanitizerPanelView', webviewView.webview);
    console.log('[MsSanitizerPanelViewProvider.resolveWebviewView] WebView registered to ApiServer');

    // Message processing
    webviewView.webview.onDidReceiveMessage(
      async (message: any) => {
        console.log('[MsSanitizerPanelViewProvider] Received message:', message.command);

        if (message.command === 'vscodeRequestMsAgentSanitizerIntegration') {
          const available = await msAgentBridgeService.isMsAgentIntegrationAvailable();

          webviewView.webview.postMessage({
            command: 'iframeMsAgentSanitizerIntegration',
            available,
          });

          return;
        }

        if (message.command === 'vscodeMsAgentAiFix') {
          const inner = message.message ?? message;
          const raw = message.index
            ?? message.data?.index
            ?? inner.index
            ?? inner.data?.index;
          const idx = typeof raw === 'number' ? raw : Number(raw);

          if (Number.isInteger(idx) && idx >= 0) {
            console.log('[MsSanitizerPanelViewProvider] AI Fix requested for index', idx);
            void this.runMsAgentAiFixForIndex(webviewView.webview, idx);
          }

          return;
        }
        if (message.command === 'vscodeRequestMsAgentAiFixStates') {
          console.log('[MsSanitizerPanelViewProvider] Explicit AI Fix state snapshot requested');
          await this.pushMsAgentFixStatesBulk(webviewView.webview);

          return;
        }

        if (message.command === 'vscodeGetMsSanitizerPanelViewData') {
          // Send data for subsequent optimization. First deliver content through _view.webview.
          if (!MsSanitizerPanelViewProvider.getMsSanitizerPanelViewDataParams) {
            console.log('[MsSanitizerPanelViewProvider] No data params, sending empty data');
            webviewView.webview.postMessage({
              command: 'iframeRemoteMsSanitizerPanelViewSetRenderList',
              data: {},
            });

            return;
          }

          console.log('[MsSanitizerPanelViewProvider] Start fetching panel data');
          const panelData = await getPanelData(MsSanitizerPanelViewProvider.getMsSanitizerPanelViewDataParams);

          MsSanitizerPanelViewProvider.getMsSanitizerPanelViewDataParams = null;
          console.log('[MsSanitizerPanelViewProvider] Panel data fetched, sending data');
          webviewView.webview.postMessage({
            command: 'iframeRemoteMsSanitizerPanelViewSetRenderList',
            data: panelData,
          });
          await this.pushMsAgentFixStatesBulk(webviewView.webview);
        }
        else if (message.command === 'vscodeLoadMsSanitizerReport') {
          // When you click the report list item on the left, the report is loaded and the detection results are displayed on the right (supports direct postMessage or format forwarded via main)
          const params = message.message?.data ?? message.data ?? message.message;

          if (!params?.path) {
            webviewView.webview.postMessage({
              command: 'iframeRemoteMsSanitizerPanelViewSetRenderList',
              data: {},
            });

            return;
          }

          try {
            const panelData = await getPanelData(params);

            webviewView.webview.postMessage({
              command: 'iframeRemoteMsSanitizerPanelViewSetRenderList',
              data: panelData,
            });
            await this.pushMsAgentFixStatesBulk(webviewView.webview);
          }
          catch (err) {
            console.error('[MsSanitizerPanelViewProvider] Failed to load report:', err);
            webviewView.webview.postMessage({
              command: 'iframeRemoteMsSanitizerPanelViewSetRenderList',
              data: {},
            });
          }
        }
        else {
          this.handleWebviewMessage(message);
        }
      },
      undefined,
      this._context.subscriptions,
    );
    console.log('[MsSanitizerPanelViewProvider.resolveWebviewView] Message handler registered');

    // Set HTML content
    const distPath = path.join(this._extensionUri.fsPath, 'out', 'web');

    console.log(`[MsSanitizerPanelViewProvider.resolveWebviewView] Start loading HTML, distPath: ${distPath}`);
    console.log(`[MsSanitizerPanelViewProvider.resolveWebviewView] router: ${VIEW_MS_SANITIZER}`);

    try {
      webviewView.webview.html = await HtmlTransformer.transformDistHtml(
        distPath,
        webviewView.webview,
        `sidebars/${VIEW_MS_SANITIZER}`,
        { lang: vscode.env.language.toLowerCase() },
      );
      console.log('[MsSanitizerPanelViewProvider.resolveWebviewView] HTML loaded');
    }
    catch (error) {
      console.error('[MsSanitizerPanelViewProvider.resolveWebviewView] HTML load failed:', error);
      throw error;
    }

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
  }

  /**
   * Handle messages from Webview
   */
  private handleWebviewMessage(message: any): void {
    // Handle gettopic command
    if (message.command === 'getTheme') {
      const currentTheme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark || vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrast ? 'dark' : 'light';

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

  /**
   * Clean up resources
   */
  public dispose() {
    this._pendingMsAgentFixRequests = 0;
    if (this._msAgentFixStatesPoll) {
      clearInterval(this._msAgentFixStatesPoll);
      this._msAgentFixStatesPoll = undefined;
    }
    if (this._themeChangeDisposable) {
      this._themeChangeDisposable.dispose();
      this._themeChangeDisposable = undefined;
    }
  }

  /**
   * Get the current webview for use by commands such as refreshing the report list
   */
  getWebview(): vscode.Webview | undefined {
    return this._view?.webview;
  }

  private postMsAgentFixState(webview: vscode.Webview, index: number, status: string): void {
    webview.postMessage({
      command: 'iframeMsAgentAiFixState',
      index,
      status,
    });
  }

  private async pushMsAgentFixStatesBulk(
    webview: vscode.Webview,
  ): Promise<MsAgentAiFixQueueSnapshot> {
    const snapshot = await msAgentBridgeService.getAiFixQueueSnapshot();
    const states = snapshot.states;
    console.log('[MsSanitizerPanelViewProvider] pushMsAgentFixStatesBulk snapshot', snapshot);
    // Empty snapshots are normal before ms-agent enqueues, or if getAiFixQueueStates is missing.
    // Broadcasting {} would wipe optimistic per-row state in the webview; skip until the request finishes.
    if (Object.keys(states).length === 0 && this._pendingMsAgentFixRequests > 0) {
      return snapshot;
    }
    webview.postMessage({
      command: 'iframeMsAgentAiFixStates',
      snapshot,
      states,
    });

    return snapshot;
  }

  private ensureMsAgentFixStatesPolling(webview: vscode.Webview): void {
    if (this._msAgentFixStatesPoll) {
      return;
    }
    this._msAgentFixStatesPoll = setInterval(() => {
      void (async () => {
        const states = await this.pushMsAgentFixStatesBulk(webview);
        const hasLiveQueueStates = Object.values(states.states)
          .some((state: MsAgentAiFixState) => state === 'queued' || state === 'running');
        if (
          this._pendingMsAgentFixRequests === 0
          && !states.hasPendingTasks
          && !hasLiveQueueStates
          && this._msAgentFixStatesPoll
        ) {
          clearInterval(this._msAgentFixStatesPoll);
          this._msAgentFixStatesPoll = undefined;
        }
      })();
    }, 400);
  }

  private async runMsAgentAiFixForIndex(webview: vscode.Webview, idx: number): Promise<void> {
    this._pendingMsAgentFixRequests++;
    console.log('[MsSanitizerPanelViewProvider] runMsAgentAiFixForIndex start', {
      idx,
      pending: this._pendingMsAgentFixRequests,
    });
    this.postMsAgentFixState(webview, idx, 'connecting');
    this.ensureMsAgentFixStatesPolling(webview);
    const fixPromise = msAgentBridgeService.fixMsAgentProblem(idx, {
      suppressProgressNotification: true,
    });
    setTimeout(() => {
      void this.pushMsAgentFixStatesBulk(webview);
    }, 0);
    try {
      const result = await fixPromise;
      console.log('[MsSanitizerPanelViewProvider] runMsAgentAiFixForIndex result', {
        idx,
        status: result.status,
      });
      if (result.status === 'already_running') {
        await this.pushMsAgentFixStatesBulk(webview);
        this.postMsAgentFixState(webview, idx, 'queued');
      }
      else if (result.status === 'completed') {
        this.postMsAgentFixState(webview, idx, 'fixed');
      }
      else {
        this.postMsAgentFixState(webview, idx, result.status);
      }
    }
    finally {
      this._pendingMsAgentFixRequests--;
      console.log('[MsSanitizerPanelViewProvider] runMsAgentAiFixForIndex done', {
        idx,
        pending: this._pendingMsAgentFixRequests,
      });
      await this.pushMsAgentFixStatesBulk(webview);
    }
  }
}

const getPanelData = (params: Record<string, any>) => {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders || workspaceFolders.length === 0) {
    console.log('getRunData1 no workspaceFolders');

    return [];
  }

  const workspacePath = workspaceFolders[0].uri.fsPath;

  const inputContent = fs.readFileSync(params.path, 'utf-8');
  const parser = new ExceptionParser({ matchPath: workspacePath });
  const data = parser.parseAll(inputContent)
    .map((r, msAgentIndex) => {
      const resolved = resolveSanitizerSourceFsPath(workspacePath, r.fileLink);

      return {
        ...r,
        fileLink: resolved ?? r.fileLink,
        msAgentIndex,
      };
    });

  sanitizerDiagnosticsService.publishFromLogFile(params.path, workspacePath);
  void msAgentBridgeService.tryLoadLogWithIntegration(params.path);

  console.log('Anomaly detection detail data:', data);

  return {
    ...params,
    data,
  };
};

export const getMsSanitizerPanelViewProvider = (
  context: vscode.ExtensionContext,
  apiServer: ApiServer,
) => {
  const msSanitizerPanelViewProvider = new MsSanitizerPanelViewProvider(
    context,
    apiServer,
  );
  const msSanitizerPanelView = vscode.window.registerWebviewViewProvider(
    MsSanitizerPanelViewProvider.viewType,
    msSanitizerPanelViewProvider,
    { webviewOptions: { retainContextWhenHidden: false } },
  );

  // Register commands to open terminal and Webview
  const openMsSanitizerDisposable = vscode.commands.registerCommand(
    COMMAND_OPEN_MS_SANITIZER_PANEL_VIEW,
    async (data: any) => {
      // Open the bottom area panel
      await vscode.commands.executeCommand('workbench.action.togglePanel');

      // Navigate to the anomaly detection panel
      await vscode.commands.executeCommand('msSanitizerPanelView.focus');

      MsSanitizerPanelViewProvider.getMsSanitizerPanelViewDataParams = data;
    },
  );

  /** Obtain the anomaly detection panel webview, which is used to issue messages such as refreshing the report list */
  const getMsSanitizerPanelWebview = (): vscode.Webview | undefined =>
    msSanitizerPanelViewProvider.getWebview();

  return {
    msSanitizerPanelView,
    openMsSanitizerDisposable,
    getMsSanitizerPanelWebview,
  };
};
