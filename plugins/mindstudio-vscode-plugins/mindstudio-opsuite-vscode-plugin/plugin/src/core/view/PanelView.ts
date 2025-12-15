import path from 'node:path';

import * as vscode from 'vscode';

import { ViewRouteRaw, ViewRouter } from './ViewRouter';
import { ViewRenderer } from './ViewRender';
import { ViewQuery } from './ViewQuery';

/** 开启视图hook */
type ViewOpenedCallback = (routePath: string, panel: vscode.WebviewPanel) => void;

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

export class PanelView extends vscode.Disposable {
  // 单例模式
  private static instance: PanelView;
  public static getInstance(): PanelView {
    return this.instance;
  }

  private router: ViewRouter;
  private renderer: ViewRenderer;
  private query: ViewQuery;

  private viewOpenedCallbacks: ViewOpenedCallback[] = [];
  private viewDisposedCallbacks: ViewDisposedCallback[] = [];

  /** 已开启的页面 */
  private openedViews = new Map<string, vscode.WebviewPanel>();

  constructor(routes: ViewRouteRaw[], private context: vscode.ExtensionContext) {
    super(() => this.onDispose());
    PanelView.instance = this;
    this.router = new ViewRouter(routes);
    this.renderer = new ViewRenderer(context);
    this.query = new ViewQuery();
  }

  public onViewActivated(callback: ViewOpenedCallback) {
    this.viewOpenedCallbacks.push(callback);
  }

  public onViewDisposed(callback: ViewDisposedCallback) {
    this.viewDisposedCallbacks.push(callback);
  }

  public open(routePath: string, options: PanelViewOptions = {}): vscode.WebviewPanel {
    const routeRaw = this.router.getRaw(routePath);
    if (!routeRaw) {
      throw new Error(`路由 ${routePath} 不存在`);
    }

    const { viewColumn = vscode.ViewColumn.Active, query = {}, title } = options;
    const viewTitle = title ?? routeRaw.title;

    // 避免重复开启
    if (this.openedViews.has(routePath)) {
      const panel = this.openedViews.get(routePath)!;
      panel.reveal(viewColumn);
      return panel;
    }

    // 限制webview资源加载目录
    const localResourceRoots = [vscode.Uri.file(path.join(this.context.extensionPath, 'out', 'web'))];

    // 生成webview
    const webviewPanel = vscode.window.createWebviewPanel(
      CUSTOM_EDITOR_VIEW_TYPE,
      viewTitle,
      { viewColumn },
      { retainContextWhenHidden: true, enableScripts: true, localResourceRoots }
    );
    this.activeViewPanel(webviewPanel, routePath, query);
    return webviewPanel;
  }

  /**
   * 激活页签
   */
  private activeViewPanel(viewPanel: vscode.WebviewPanel, routePath: string, query: Record<string, unknown>): void {
    this.openedViews.set(routePath, viewPanel);

    this.activeWebview(viewPanel.webview, routePath, query);

    // 【hook】页面激活
    this.viewOpenedCallbacks.forEach((callback) => {
      callback(routePath, viewPanel);
    });

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
  private activeWebview(webview: vscode.Webview, routePath: string, query: Record<string, unknown> = {}) {
    this.renderer.render(webview, { lang: vscode.env.language });
    this.query.setQuery(webview, { ...query, _path: routePath });
  }

  private onDispose() {
    this.router.dispose();
    this.renderer.dispose();
  }
}
