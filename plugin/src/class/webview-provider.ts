/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { PermanentStorage } from './permanent-storage';
import webviewMessageList from './webview-message-list';
import { HtmlTransformer } from './html-transformer';
import { ApiServer } from '@plugin/core/api-server';

/**
 * Webview提供者 - 负责创建和管理Webview面板
 */
export class WebviewProvider {
  private panel: vscode.WebviewPanel | undefined;
  private storage: PermanentStorage;
  private context: vscode.ExtensionContext;
  private readonly userInfo: os.UserInfo<string | number>;
  private pluginSidebarDisposable: vscode.Disposable | undefined;

  constructor(
    context: vscode.ExtensionContext,
    private apiServer?: ApiServer,
  ) {
    this.storage = new PermanentStorage(context);
    this.context = context;
    this.userInfo = os.userInfo();
    this.storage.set('userInfo', this.userInfo);
  }

  /**
   * 显示Webview面板
   */
  public async show(router: string): Promise<void> {
    try {
      // 创建或显示面板
      if (this.panel) {
        this.panel.reveal();
      }
      else {
        await this.createPanel(router);
      }
    }
    catch (error) {
      const errorMsg = `打开Huawei OP DevTools失败: ${error}`;

      console.error(errorMsg);
      vscode.window.showErrorMessage(errorMsg);
    }
  }

  /**
   * 向Webview发送消息
   */
  public postMessage(message: unknown): void {
    if (this.panel?.webview) {
      this.panel.webview.postMessage(message);
    }
  }

  /**
   * 创建Webview面板
   */
  public showLeftPage(router: string): vscode.Disposable {
    return this.createLeftNavWebview(router);
  }

  /**
   * 创建Webview面板
   */
  private createLeftNavWebview(router: string = ''): vscode.Disposable {
    try {
      // 如果已经注册过，先释放旧的
      if (this.pluginSidebarDisposable) {
        this.pluginSidebarDisposable.dispose();
      }

      const extensionUri = this.context.extensionUri;
      const viewRootUri = vscode.Uri.joinPath(extensionUri, 'out', 'web');

      this.pluginSidebarDisposable = vscode.window.registerWebviewViewProvider(
        'pluginSidebar',
        {
          resolveWebviewView: async (webviewView: vscode.WebviewView) => {
            webviewView.webview.options = {
              enableScripts: true,
              localResourceRoots: [viewRootUri],
            };
            const distPath = path.join(
              this.context.extensionUri.fsPath,
              'out',
              'web',
            );

            webviewView.webview.html = await HtmlTransformer.transformDistHtml(
              distPath,
              webviewView.webview,
              `sidebars/${router}`,
            );
            // 处理Webview消息
            webviewView.webview.onDidReceiveMessage(
              (message: unknown) => {
                this.handleWebviewMessage(message);
              },
              undefined,
              this.context.subscriptions,
            );
          },
        },
        { webviewOptions: { retainContextWhenHidden: true } },
      );

      return this.pluginSidebarDisposable;
    }
    catch (error) {
      console.error('注册 pluginSidebar webview provider 失败:', error);

      // 返回一个空的 disposable 以避免错误
      return { dispose: () => {} };
    }
  }

  /**
   * 创建Webview面板
   */
  private async createPanel(router: string = ''): Promise<void> {
    try {
      this.panel = vscode.window.createWebviewPanel(
        'mindstudioOpsuite',
        'Huawei OP DevTools',
        vscode.ViewColumn.Active,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        },
      );

      this.apiServer?.addWebview(router, this.panel.webview);

      // 设置Webview内容
      await this.updateWebviewContent(router);

      // 处理面板关闭事件
      this.panel.onDidDispose(
        () => {
          this.dispose();
        },
        null,
        this.context.subscriptions,
      );

      // 处理Webview消息
      this.panel.webview.onDidReceiveMessage(
        (message: unknown) => {
          this.handleWebviewMessage(message);
        },
        undefined,
        this.context.subscriptions,
      );
    }
    catch (error) {
      console.error(error);
    }
  }

  /**
   * 更新Webview内容
   */
  private async updateWebviewContent(router: string): Promise<void> {
    if (!this.panel) {
      return;
    }

    try {
      const distPath = path.join(this.context.extensionPath, 'out', 'web');

      // 判断是 panel 还是 sidebar 类型的视图
      const panelViews = [
        'config',
        'link',
        'welcome',
        'project-sh',
        'ops-config',
        'options-simulator',
        'options-on-board'
      ];
      const viewPath = panelViews.includes(router) ? `panels/${router}` : router;

      this.panel.webview.html = await HtmlTransformer.transformDistHtml(
        distPath,
        this.panel.webview,
        viewPath,
      );
    }
    catch (error) {
      // 如果读取文件失败，使用fallback内容
      console.log(error);
    }
  }

  /**
   * 处理来自Webview的消息
   */
  private handleWebviewMessage(message: unknown): void {
    const msg = message as { command: string;
      [key: string]: unknown };

    for (const messageItem of webviewMessageList) {
      if (msg.command === messageItem.command) {
        messageItem.callback(msg, this);
      }
    }
  }

  /**
   * 清理资源
   */
  public dispose(): void {
    if (this.panel) {
      this.panel.dispose();
      this.panel = undefined;
    }

    if (this.pluginSidebarDisposable) {
      this.pluginSidebarDisposable.dispose();
      this.pluginSidebarDisposable = undefined;
    }
  }
}
