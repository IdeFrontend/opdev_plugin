import * as vscode from 'vscode';

import { WebviewConnector } from '@plugin/core/connector';

/**
 * Page parameters
 */
export type QueryParams = {
  /** routing address */
  _path: string;

  [key: string]: unknown;
};

/**
 * Page parameter communicator
 * @description Add pendingQuery when the page starts, and push the query after the page is loaded.
 */
export class ViewQuery extends vscode.Disposable {
  /** Page parameter communicator */
  private queryConnector: WebviewConnector<QueryParams, null>;

  constructor() {
    super(() => {});
    this.queryConnector = new WebviewConnector('viewQuery');
  }

  /**
   * Set page parameters
   */
  public setQuery(webview: vscode.Webview, query: QueryParams): void {
    this.queryConnector.addWebview(webview);
    this.queryConnector.send(webview, query);
  }
}
