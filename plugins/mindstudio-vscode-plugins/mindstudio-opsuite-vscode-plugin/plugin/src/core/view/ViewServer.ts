import path from 'node:path';

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

  constructor(routes: ViewRouteRaw[], private context: vscode.ExtensionContext) {
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
  public openPanel(routePath: string, options: PanelViewOptions = {}): vscode.WebviewPanel {
    const routeRaw = this.router.getRaw(routePath);
    if (!routeRaw) {
      throw new Error(`路由 ${routePath} 不存在`);
    }

    const { viewColumn = vscode.ViewColumn.Active, query = {}, title } = options;

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
    const viewRootUri = vscode.Uri.joinPath(this.context.extensionUri, 'out', 'web');
    console.log('[ViewServer] registerViewProviders: 开始注册webview providers, 数量:', providerRaws.length);
    console.log('[ViewServer] registerViewProviders: viewRootUri:', viewRootUri.fsPath);
    console.log('[ViewServer] registerViewProviders: extensionUri:', this.context.extensionUri.fsPath);
    
    if (providerRaws.length === 0) {
      console.warn('[ViewServer] registerViewProviders: 警告！没有找到任何provider路由');
    }
    
    for (const routeRaw of providerRaws) {
      console.log('[ViewServer] registerViewProviders: 注册provider, viewType:', routeRaw.providerViewType, 'path:', routeRaw.path);
      
      try {
        const disposable = vscode.window.registerWebviewViewProvider(routeRaw.providerViewType!, {
          resolveWebviewView: async (webviewView, context, token) => {
            console.log('[ViewServer] resolveWebviewView: ========== 开始解析webview ==========');
            console.log('[ViewServer] resolveWebviewView: viewType:', routeRaw.providerViewType);
            console.log('[ViewServer] resolveWebviewView: path:', routeRaw.path);
            console.log('[ViewServer] resolveWebviewView: viewRootUri:', viewRootUri.toString());
            console.log('[ViewServer] resolveWebviewView: webviewView.visible:', webviewView.visible);
            console.log('[ViewServer] resolveWebviewView: context:', JSON.stringify(context));
            console.log('[ViewServer] resolveWebviewView: token.isCancellationRequested:', token.isCancellationRequested);
            
            try {
              webviewView.webview.options = { 
                enableScripts: true,
                localResourceRoots: [viewRootUri]
              };
              console.log('[ViewServer] resolveWebviewView: webview.options已设置:', JSON.stringify(webviewView.webview.options));
              
              // 监听webview可见性变化
              webviewView.onDidChangeVisibility(() => {
                console.log('[ViewServer] resolveWebviewView: webview可见性变化, visible:', webviewView.visible);
              });
              
              this.activeWebview(webviewView.webview, routeRaw.path);
              console.log('[ViewServer] resolveWebviewView: ========== 解析完成 ==========');
            } catch (error) {
              console.error('[ViewServer] resolveWebviewView: 解析过程中出错:', error);
              console.error('[ViewServer] resolveWebviewView: 错误堆栈:', error instanceof Error ? error.stack : String(error));
              throw error;
            }
          },
        });
        this.viewProviders.push(disposable);
        console.log('[ViewServer] registerViewProviders: provider注册成功, viewType:', routeRaw.providerViewType);
      } catch (error) {
        console.error('[ViewServer] registerViewProviders: 注册provider失败, viewType:', routeRaw.providerViewType, 'error:', error);
        console.error('[ViewServer] registerViewProviders: 错误堆栈:', error instanceof Error ? error.stack : String(error));
      }
    }
    console.log('[ViewServer] registerViewProviders: 完成注册, 共注册', this.viewProviders.length, '个providers');
    
    // 添加延迟检查，看看是否有webview被创建
    setTimeout(() => {
      console.log('[ViewServer] registerViewProviders: 延迟检查 - 已注册的providers数量:', this.viewProviders.length);
    }, 2000);
  }

  /**
   * 创建页签
   */
  private createViewPanel(routeRaw: ViewRouteRaw, viewColumn: vscode.ViewColumn, customTitle?: string): vscode.WebviewPanel {
    const viewTitle = customTitle ?? routeRaw.title ?? routeRaw.path;
    return vscode.window.createWebviewPanel(CUSTOM_EDITOR_VIEW_TYPE, viewTitle, { viewColumn }, { retainContextWhenHidden: true, enableScripts: true });
  }

  /**
   * 激活页签
   */
  private activeViewPanel(viewPanel: vscode.WebviewPanel, routePath: string, query: Record<string, unknown>): void {
    console.log('[ViewServer] activeViewPanel: 开始激活页签, routePath:', routePath);
    this.openedViews.set(routePath, viewPanel);

    // 设置webview的资源根目录
    const viewRootUri = vscode.Uri.joinPath(this.context.extensionUri, 'out', 'web');
    console.log('[ViewServer] activeViewPanel: 设置webview.options, viewRootUri:', viewRootUri.toString());
    viewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [viewRootUri]
    };
    console.log('[ViewServer] activeViewPanel: webview.options已设置:', JSON.stringify(viewPanel.webview.options));

    this.activeWebview(viewPanel.webview, routePath, query);

    // 监听销毁
    viewPanel.onDidDispose(() => {
      console.log('[ViewServer] activeViewPanel: 页签已销毁, routePath:', routePath);
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
    console.log('[ViewServer] activeWebview: 开始激活webview, routePath:', routePath, 'query:', JSON.stringify(query));
    
    try {
      console.log('[ViewServer] activeWebview: 调用renderer.render');
      this.renderer.render(webview, { lang: vscode.env.language });
      console.log('[ViewServer] activeWebview: renderer.render完成');
      
      const queryParams = { ...query, _path: routePath };
      console.log('[ViewServer] activeWebview: 设置query参数:', JSON.stringify(queryParams));
      this.query.setQuery(webview, queryParams);
      console.log('[ViewServer] activeWebview: query.setQuery完成');

      // 【hook】页面激活
      console.log('[ViewServer] activeWebview: 触发viewOpenedCallbacks, 数量:', this.viewOpenedCallbacks.length);
      this.viewOpenedCallbacks.forEach((callback) => {
        callback(routePath, webview);
      });
      console.log('[ViewServer] activeWebview: 激活完成');
    } catch (error) {
      console.error('[ViewServer] activeWebview: 激活过程中出错:', error);
      throw error;
    }
  }

  private onDispose() {
    this.viewProviders.forEach((disposable) => disposable.dispose());
    this.router.dispose();
    this.renderer.dispose();
    this.query.dispose();
  }
}
