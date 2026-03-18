/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as path from 'path';
import * as os from 'os';
import { t } from 'i18next';
import * as vscode from 'vscode';
import { PermanentStorage } from './permanent-storage';
import webviewMessageList from './webview-message-list';
import { HtmlTransformer } from './html-transformer';
import { ApiServer } from '@plugin/core/api-server';
import { registerConfigPage, unregisterConfigPage } from '@plugin/controller/navigation-controller';

/**
 * Webview 提供者 - 负责创建和管理 Webview 面板
 */
export class WebviewProvider {
  private panel: vscode.WebviewPanel | undefined;
  private storage: PermanentStorage;
  private context: vscode.ExtensionContext;
  private readonly userInfo: os.UserInfo<string | number>;
  private pluginSidebarDisposable: vscode.Disposable | undefined;
  private themeChangeDisposable: vscode.Disposable | undefined;

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
   * 显示 Webview 面板
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
      const errorMsg = t('extension.openDevToolsFailed', { error: String(error) });
      console.error(errorMsg);
      vscode.window.showErrorMessage(errorMsg);
    }
  }

  /**
   * 向 Webview 发送消息
   */
  public postMessage(message: unknown): void {
    if (this.panel?.webview) {
      this.panel.webview.postMessage(message);
    }
  }

  /**
   * 创建 Webview 面板
   */
  public showLeftPage(router: string): vscode.Disposable {
    return this.createLeftNavWebview(router);
  }

  /**
   * 创建 Webview 面板
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
              { lang: vscode.env.language.toLowerCase() },
            );

            // 监听 VSCode 主题变化并通知 Webview
            this.themeChangeDisposable = vscode.window.onDidChangeActiveColorTheme((theme) => {
              webviewView.webview.postMessage({
                command: 'updateTheme',
                themeName: theme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light',
              });
            });

            // 初始化时发送当前主题
            webviewView.webview.postMessage({
              command: 'updateTheme',
              themeName: vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light',
            });

            // 处理 Webview 消息
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
   * 创建 Webview 面板
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

      // 如果是配置页面，注册到导航控制器
      if (router === 'config') {
        registerConfigPage('config', this.panel.webview);
      }

      // 设置 Webview 内容
      await this.updateWebviewContent(router);

      // 监听 VSCode 主题变化并通知 Webview
      this.themeChangeDisposable = vscode.window.onDidChangeActiveColorTheme((theme) => {
        if (this.panel) {
          this.panel.webview.postMessage({
            command: 'updateTheme',
            themeName: theme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light',
          });
        }
      });

      // 初始化时发送当前主题
      if (this.panel) {
        this.panel.webview.postMessage({
          command: 'updateTheme',
          themeName: vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light',
        });
      }

      // 处理面板关闭事件
      this.panel.onDidDispose(
        () => {
          // 注销配置页面
          if (router === 'config') {
            unregisterConfigPage(router);
          }
          this.dispose();
        },
        null,
        this.context.subscriptions,
      );

      // 处理 Webview 消息
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
   * 更新 Webview 内容
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
        'options-on-board',
        'options-sanitizer',
        'open-project'
      ];
      const viewPath = panelViews.includes(router) ? `panels/${router}` : router;

      this.panel.webview.html = await HtmlTransformer.transformDistHtml(
        distPath,
        this.panel.webview,
        viewPath,
        { lang: vscode.env.language.toLowerCase() },
      );
    }
    catch (error) {
      // 如果读取文件失败，使用 fallback 内容
      console.log(error);
    }
  }

  /**
   * 处理来自 Webview 的消息
   */
  private handleWebviewMessage(message: unknown): void {
    const msg = message as { command: string;
      [key: string]: unknown };

    // 处理获取主题命令
    // if (msg.command === 'getTheme') {
    //   const currentTheme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';
    //   if (this.panel) {
    //     this.panel.webview.postMessage({
    //       command: 'updateTheme',
    //       themeName: currentTheme,
    //     });
    //   }
    //   // 对于 sidebar 类型的 webview，需要通过不同的方式发送
    //   // sidebar 的消息处理在各自的 provider 中

    //   return;
    // }

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

    if (this.themeChangeDisposable) {
      this.themeChangeDisposable.dispose();
      this.themeChangeDisposable = undefined;
    }
  }
}
