import * as vscode from 'vscode';

import { WebviewConnector } from 'plugin:/core/Connector';

/**
 * 页面参数
 */
export type QueryParams = {
  /** 路由地址 */
  _path: string;

  [key: string]: unknown;
};

/**
 * 页面参数通信器
 * @description 页面启动时增加pendingQuery，页面加载后推送query
 */
export class ViewQuery extends vscode.Disposable {
  /** 页面参数通信器 */
  private queryConnector: WebviewConnector<QueryParams, null>;

  constructor() {
    super(() => {});
    this.queryConnector = new WebviewConnector('viewQuery');
  }

  /**
   * 设置页面参数
   */
  public setQuery(webview: vscode.Webview, query: QueryParams): void {
    this.queryConnector.addWebview(webview);
    this.queryConnector.send(webview, query);
  }
}
