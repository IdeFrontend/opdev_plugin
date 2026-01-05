import * as vscode from 'vscode';

import { ViewRouteRaw, ViewRouter } from './view-router';
import { ViewRenderer } from './view-render';
import { ViewQuery } from './view-query';

/** 开启视图hook */
type ViewOpenedCallback = (routePath: string, webview: vscode.Webview) => void;

/** 关闭视图hook */
type ViewDisposedCallback = (routePath: string) => void;

export class ViewServer extends vscode.Disposable {
  // 单例模式
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

  /** 已开启的页面 */
  private openedViews = new Map<string, vscode.WebviewPanel>();

  // 缓存webview实例
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
    console.log(`[ViewServer.registerViewProviders] 开始注册视图提供者`);
    const providerRaws = this.router.getAllProviderRaws();
    console.log(`[ViewServer.registerViewProviders] 找到 ${providerRaws.length} 个提供者路由`);
    const viewRootUri = vscode.Uri.joinPath(
      this.context.extensionUri,
      'out',
      'web',
    );
    console.log(`[ViewServer.registerViewProviders] viewRootUri: ${viewRootUri.toString()}`);

    for (const routeRaw of providerRaws) {
      console.log(`[ViewServer.registerViewProviders] 注册提供者: ${routeRaw.providerViewType}, path: ${routeRaw.path}`);
      const disposable = vscode.window.registerWebviewViewProvider(
        routeRaw.providerViewType!,
        {
          resolveWebviewView: async (webviewView) => {
            console.log(`[ViewServer.registerViewProviders] 解析webview视图: ${routeRaw.providerViewType}, path: ${routeRaw.path}`);
            this.providerWebViewMap[routeRaw.providerViewType!] = webviewView;
            console.log(`[ViewServer.registerViewProviders] WebView已添加到providerWebViewMap`);
            webviewView.webview.options = {
              enableScripts: true,
              localResourceRoots: [viewRootUri],
            };
            console.log(`[ViewServer.registerViewProviders] WebView配置完成，开始激活webview`);
            await this.activeWebview(webviewView.webview, routeRaw.path);
            console.log(`[ViewServer.registerViewProviders] WebView激活完成: ${routeRaw.providerViewType}`);
          },
        },
        { webviewOptions: { retainContextWhenHidden: true } },
      );

      this.viewProviders.push(disposable);
      console.log(`[ViewServer.registerViewProviders] 提供者注册完成: ${routeRaw.providerViewType}`);
    }
    console.log(`[ViewServer.registerViewProviders] 所有视图提供者注册完成`);
  }

  /**
   * 激活页面
   */
  private async activeWebview(
    webview: vscode.Webview,
    routePath: string,
    query: Record<string, unknown> = {},
  ) {
    console.log(`[ViewServer.activeWebview] 开始激活webview: routePath=${routePath}`);
    console.log(`[ViewServer.activeWebview] query:`, query);
    
    await this.renderer.render(
      webview,
      { lang: vscode.env.language },
      routePath,
    );
    console.log(`[ViewServer.activeWebview] 渲染完成`);
    
    const queryParams = { ...query, _path: routePath };
    console.log(`[ViewServer.activeWebview] 设置查询参数:`, queryParams);
    this.query.setQuery(webview, queryParams);

    // 【hook】页面激活
    console.log(`[ViewServer.activeWebview] 调用页面激活回调，回调数量: ${this.viewOpenedCallbacks.length}`);
    this.viewOpenedCallbacks.forEach((callback) => {
      callback(routePath, webview);
    });
    console.log(`[ViewServer.activeWebview] webview激活完成: routePath=${routePath}`);
  }

  private onDispose() {
    this.viewProviders.forEach((disposable) => disposable.dispose());
    this.router.dispose();
    this.renderer.dispose();
    this.query.dispose();
  }
}
