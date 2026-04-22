import * as vscode from 'vscode';

import {
  ViewRouteRaw, ViewRouter,
} from './view-router';
import { ViewRenderer } from './view-render';
import { ViewQuery } from './view-query';

/** Enable view hooks */
type ViewOpenedCallback = (routePath: string, webview: vscode.Webview)=> void;

/** Close view hook */
type ViewDisposedCallback = (routePath: string)=> void;

export class ViewServer extends vscode.Disposable {
  // Singleton pattern
  private static instance: ViewServer;
  public static getInstance(): ViewServer {
    return this.instance;
  }

  private viewProviders: vscode.Disposable[] = [];

  private router: ViewRouter;
  private renderer: ViewRenderer;
  private query: ViewQuery;

  private viewOpenedCallbacks: ViewOpenedCallback[] = [];
  private viewDisposedCallbacks: ViewDisposedCallback[] = [];

  /** Opened pages */
  private openedViews = new Map<string, vscode.WebviewPanel>();

  // Caching webview instances
  public providerWebViewMap: Record<string, vscode.WebviewView> = {};

  constructor(
    routes: ViewRouteRaw[],
    private context: vscode.ExtensionContext,
  ) {
    super(() => this.onDispose());
    ViewServer.instance = this;
    this.router = new ViewRouter(routes);
    this.renderer = new ViewRenderer(context);
    this.query = new ViewQuery();
    this.registerViewProviders();
  }

  public onViewActivated(callback: ViewOpenedCallback) {
    this.viewOpenedCallbacks.push(callback);
  }

  public onViewDisposed(callback: ViewDisposedCallback) {
    this.viewDisposedCallbacks.push(callback);
  }

  private registerViewProviders() {
    console.log('[ViewServer.registerViewProviders] Start registering view providers');
    const providerRaws = this.router.getAllProviderRaws();

    console.log(`[ViewServer.registerViewProviders] Found ${providerRaws.length} provider routes`);
    const viewRootUri = vscode.Uri.joinPath(
      this.context.extensionUri,
      'out',
      'web',
    );

    console.log(`[ViewServer.registerViewProviders] viewRootUri: ${viewRootUri.toString()}`);

    for (const routeRaw of providerRaws) {
      console.log(`[ViewServer.registerViewProviders] Register provider: ${routeRaw.providerViewType}, path: ${routeRaw.path}`);
      const disposable = vscode.window.registerWebviewViewProvider(
        routeRaw.providerViewType!,
        {
          resolveWebviewView: async (webviewView) => {
            console.log(`[ViewServer.registerViewProviders] Resolve webview view: ${routeRaw.providerViewType}, path: ${routeRaw.path}`);
            this.providerWebViewMap[routeRaw.providerViewType!] = webviewView;
            console.log('[ViewServer.registerViewProviders] WebView added to providerWebViewMap');
            webviewView.webview.options = {
              enableScripts: true,
              localResourceRoots: [viewRootUri],
            };
            console.log('[ViewServer.registerViewProviders] WebView configured, starting webview activation');
            await this.activeWebview(webviewView.webview, routeRaw.path);
            console.log(`[ViewServer.registerViewProviders] WebView activation completed: ${routeRaw.providerViewType}`);

            const getThemeName = (kind: vscode.ColorThemeKind) =>
              kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';

            webviewView.webview.postMessage({
              command: 'updateTheme',
              themeName: getThemeName(vscode.window.activeColorTheme.kind),
            });

            const themeDisposable = vscode.window.onDidChangeActiveColorTheme((theme) => {
              webviewView.webview.postMessage({
                command: 'updateTheme',
                themeName: getThemeName(theme.kind),
              });
            });

            const messageDisposable = webviewView.webview.onDidReceiveMessage(
              (message: { command: string }) => {
                if (message.command === 'getTheme') {
                  webviewView.webview.postMessage({
                    command: 'updateTheme',
                    themeName: getThemeName(vscode.window.activeColorTheme.kind),
                  });
                }
              },
            );

            this.viewProviders.push(themeDisposable, messageDisposable);
          },
        },
        { webviewOptions: { retainContextWhenHidden: true } },
      );

      this.viewProviders.push(disposable);
      console.log(`[ViewServer.registerViewProviders] Provider registration completed: ${routeRaw.providerViewType}`);
    }

    console.log('[ViewServer.registerViewProviders] All view providers registered');
  }

  /**
   * activation page
   */
  private async activeWebview(
    webview: vscode.Webview,
    routePath: string,
    query: Record<string, unknown> = {},
  ) {
    console.log(`[ViewServer.activeWebview] Start activating webview: routePath=${routePath}`);
    console.log('[ViewServer.activeWebview] query:', query);

    await this.renderer.render(
      webview,
      { lang: vscode.env.language.toLowerCase() },
      routePath,
    );
    console.log('[ViewServer.activeWebview] Render completed');

    const queryParams = {
      ...query,
      _path: routePath,
    };

    console.log('[ViewServer.activeWebview] Set query params:', queryParams);
    this.query.setQuery(webview, queryParams);

    // 【hook】Page activation
    console.log(`[ViewServer.activeWebview] Calling page activation callbacks, count: ${this.viewOpenedCallbacks.length}`);
    this.viewOpenedCallbacks.forEach((callback) => {
      callback(routePath, webview);
    });
    console.log(`[ViewServer.activeWebview] Webview activation completed: routePath=${routePath}`);
  }

  private onDispose() {
    this.viewProviders.forEach((disposable) => disposable.dispose());
    this.router.dispose();
    this.renderer.dispose();
    this.query.dispose();
  }
}
