import * as vscode from 'vscode';

export interface ViewRouteRaw {
  /** routing path */
  path: string;

  /** Page title */
  title?: string;

  /** vscode fixed view type, automatically registered when extension starts */
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
   * Read route
   * @param path routing address
   */
  public getRaw(path: string): ViewRouteRaw | undefined {
    return this.routeRawMap.get(path);
  }

  /**
   * Get all routes registered with Provider
   */
  public getAllProviderRaws(): ViewRouteRaw[] {
    const allRoutes = Array.from(this.routeRawMap.values());

    return allRoutes.filter((route) => route.providerViewType);
  }

  /**
   * Register route
   * @param route routing configuration
   */
  private registerRoute(route: ViewRouteRaw): void {
    this.routeRawMap.set(route.path, route);
  }
}
