import * as vscode from 'vscode';

export interface ViewRouteRaw {
  path: string;
  title: string;
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
   * 注册路由
   * @param route 路由配置
   */
  private registerRoute(route: ViewRouteRaw): void {
    this.routeRawMap.set(route.path, route);
  }
}
