import * as vscode from 'vscode';

// Store the opened configuration page webview
const openedConfigPages = new Map<string, vscode.Webview>();

/**
 * Registration configuration page
 */
export function registerConfigPage(pageType: string, webview: vscode.Webview) {
  openedConfigPages.set(pageType, webview);
}

/**
 * Logout configuration page
 */
export function unregisterConfigPage(pageType: string) {
  openedConfigPages.delete(pageType);
}

/**
 * Page navigation controller
 */
export const navigationController = {
  /**
   * Navigate to the specified tab
   * @param params Parameters containing tab information
   */
  async navigateToTab(params: { tab: string }) {
    // Send navigation messages to all registered configuration pages
    for (const [pageType, webview] of openedConfigPages.entries()) {
      // Only send messages to the configuration page
      if (pageType === 'config') {
        webview.postMessage({
          command: 'navigateToTab',
          tab: params.tab
        });
      }
    }
  }
};