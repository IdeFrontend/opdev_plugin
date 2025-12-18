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
    for (const route of routes) {
      this.registerRoute(route);
    }
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
    return Array.from(this.routeRawMap.values()).filter((route) => route.providerViewType);
  }

  /**
   * 注册路由
   * @param route 路由配置
   */
  private registerRoute(route: ViewRouteRaw): void {
    this.routeRawMap.set(route.path, route);
  }
}
