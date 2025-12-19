import { get } from 'axios';
import * as vscode from 'vscode';

export interface ViewRouteRaw {
  /** 路由路径 */
  path: string;

  /** 页面标题 */
  title?: string;

  /** vscode固定视图类型，extension启动时自动注册 */
  providerViewType?: string;
}

export class ViewRouter extends vscode.Disposable {
  private routeRawMap = new Map<string, ViewRouteRaw>();

  constructor(routes: ViewRouteRaw[]) {
    super(() => {});
    console.log('[ViewRouter] constructor: 初始化ViewRouter, routes数量:', routes.length);
    for (const route of routes) {
      console.log('[ViewRouter] constructor: 注册路由, path:', route.path, 'title:', route.title, 'providerViewType:', route.providerViewType);
      this.registerRoute(route);
    }
    console.log('[ViewRouter] constructor: ViewRouter初始化完成');
  }

  /**
   * 读取路由
   * @param path 路由地址
   */
  public getRaw(path: string): ViewRouteRaw | undefined {
    return this.routeRawMap.get(path);
  }

  /**
   *  获取所有注册了Provider的路由
   */
  public getAllProviderRaws(): ViewRouteRaw[] {
    const allRoutes = Array.from(this.routeRawMap.values());
    console.log('[ViewRouter] getAllProviderRaws: 所有路由数量:', allRoutes.length);
    const providerRaws = allRoutes.filter((route) => route.providerViewType);
    console.log('[ViewRouter] getAllProviderRaws: 有providerViewType的路由数量:', providerRaws.length);
    providerRaws.forEach(route => {
      console.log('[ViewRouter] getAllProviderRaws: provider路由, path:', route.path, 'providerViewType:', route.providerViewType);
    });
    return providerRaws;
  }

  /**
   * 注册路由
   * @param route 路由配置
   */
  private registerRoute(route: ViewRouteRaw): void {
    this.routeRawMap.set(route.path, route);
  }
}
