import * as vscode from 'vscode';

// 存储已打开的配置页面webview
const openedConfigPages = new Map<string, vscode.Webview>();

/**
 * 注册配置页面
 */
export function registerConfigPage(pageType: string, webview: vscode.Webview) {
  openedConfigPages.set(pageType, webview);
}

/**
 * 注销配置页面
 */
export function unregisterConfigPage(pageType: string) {
  openedConfigPages.delete(pageType);
}

/**
 * 页面导航控制器
 */
export const navigationController = {
  /**
   * 导航到指定标签页
   * @param params 包含tab信息的参数
   */
  async navigateToTab(params: { tab: string }) {
    // 向所有已注册的配置页面发送导航消息
    for (const [pageType, webview] of openedConfigPages.entries()) {
      // 只向配置页面发送消息
      if (pageType === 'config') {
        webview.postMessage({
          command: 'navigateToTab',
          tab: params.tab
        });
      }
    }
  }
};