import * as vscode from 'vscode';

import { ViewRouteRaw, ViewRouter } from './ViewRouter';
import { ViewRenderer } from './ViewRender';
import { ViewQuery } from './ViewQuery';

/** 开启视图hook */
type ViewOpenedCallback = (routePath: string, webview: vscode.Webview) => void;

/** 关闭视图hook */
type ViewDisposedCallback = (routePath: string) => void;

interface PanelViewOptions {
  /** 路由参数，页面使用getQuery获取 */
  query?: Record<string, unknown>;

  /** 打开的窗口区域，默认ViewColumn.ACTIVE */
  viewColumn?: vscode.ViewColumn;

  /** 自定义标题 */
  title?: string;
}

const CUSTOM_EDITOR_VIEW_TYPE = 'mindstudioOpsuite';

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
  public providerWebViewMap: Record<string, any> = {};

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

  /**
   * 开启视图页签
   * @param routePath 路由
   * @param options 开启视图选项
   * @returns 页签实例
   */
  public openPanel(
    routePath: string,
    options: PanelViewOptions = {},
  ): vscode.WebviewPanel {
    const routeRaw = this.router.getRaw(routePath);

    if (!routeRaw) {
      throw new Error(`路由 ${routePath} 不存在`);
    }

    const {
      viewColumn = vscode.ViewColumn.Active,
      query = {},
      title,
    } = options;

    // 避免重复开启
    if (this.openedViews.has(routePath)) {
      const panel = this.openedViews.get(routePath)!;

      panel.reveal(viewColumn);

      return panel;
    }

    const webviewPanel = this.createViewPanel(routeRaw, viewColumn, title);

    this.activeViewPanel(webviewPanel, routePath, query);

    return webviewPanel;
  }

  private registerViewProviders() {
    const providerRaws = this.router.getAllProviderRaws();
    const viewRootUri = vscode.Uri.joinPath(
      this.context.extensionUri,
      'out',
      'web',
    );

    for (const routeRaw of providerRaws) {
      const disposable = vscode.window.registerWebviewViewProvider(
        routeRaw.providerViewType!,
        {
          resolveWebviewView: async (webviewView) => {
            this.providerWebViewMap[routeRaw.providerViewType!] = webviewView;
            webviewView.webview.options = {
              enableScripts: true,
              localResourceRoots: [viewRootUri],
            };
            this.activeWebview(webviewView.webview, routeRaw.path);
          },
        },
        { webviewOptions: { retainContextWhenHidden: true } },
      );

      this.viewProviders.push(disposable);
    }
  }

  /**
   * 创建页签
   */
  private createViewPanel(
    routeRaw: ViewRouteRaw,
    viewColumn: vscode.ViewColumn,
    customTitle?: string,
  ): vscode.WebviewPanel {
    const viewTitle = customTitle ?? routeRaw.title ?? routeRaw.path;

    return vscode.window.createWebviewPanel(
      CUSTOM_EDITOR_VIEW_TYPE,
      viewTitle,
      { viewColumn },
      { retainContextWhenHidden: true, enableScripts: true },
    );
  }

  /**
   * 激活页签
   */
  private activeViewPanel(
    viewPanel: vscode.WebviewPanel,
    routePath: string,
    query: Record<string, unknown>,
  ): void {
    this.openedViews.set(routePath, viewPanel);

    // 设置webview的资源根目录
    const viewRootUri = vscode.Uri.joinPath(
      this.context.extensionUri,
      'out',
      'web',
    );

    viewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [viewRootUri],
    };

    this.activeWebview(viewPanel.webview, routePath, query);

    // 监听销毁
    viewPanel.onDidDispose(() => {
      this.openedViews.delete(routePath);
      // 【hook】页面销毁
      this.viewDisposedCallbacks.forEach((callback) => {
        callback(routePath);
      });
    });
  }

  /**
   * 激活页面
   */
  private activeWebview(
    webview: vscode.Webview,
    routePath: string,
    query: Record<string, unknown> = {},
  ) {
    this.renderer.render(webview, { lang: vscode.env.language });
    const queryParams = { ...query, _path: routePath };

    this.query.setQuery(webview, queryParams);

    // 【hook】页面激活
    this.viewOpenedCallbacks.forEach((callback) => {
      callback(routePath, webview);
    });
  }

  private onDispose() {
    this.viewProviders.forEach((disposable) => disposable.dispose());
    this.router.dispose();
    this.renderer.dispose();
    this.query.dispose();
  }
}
