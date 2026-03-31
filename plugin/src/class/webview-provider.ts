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
 * Webview provider - Responsible for creating and managing Webview panels
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
   * Show Webview panel
   */
  public async show(router: string): Promise<void> {
    try {
      // Create or display a panel
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
   * Send message to webview
   */
  public postMessage(message: unknown): void {
    if (this.panel?.webview) {
      this.panel.webview.postMessage(message);
    }
  }

  /**
   * Create a Webview panel
   */
  public showLeftPage(router: string): vscode.Disposable {
    return this.createLeftNavWebview(router);
  }

  /**
   * Create a Webview panel
   */
  private createLeftNavWebview(router: string = ''): vscode.Disposable {
    try {
      // If it has already been registered, release the old one first
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

            // Listen to VSCode theme changes and notify Webview
            this.themeChangeDisposable = vscode.window.onDidChangeActiveColorTheme((theme) => {
              webviewView.webview.postMessage({
                command: 'updateTheme',
                themeName: theme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light',
              });
            });

            // Send the current topic on initialization
            webviewView.webview.postMessage({
              command: 'updateTheme',
              themeName: vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light',
            });

            // Handling Webview messages
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
      console.error('Failed to register pluginSidebar webview provider:', error);

      // Return an empty disposable to avoid errors
      return { dispose: () => {} };
    }
  }

  /**
   * Create a Webview panel
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

      // If it is a configuration page, register it to the navigation controller
      if (router === 'config') {
        registerConfigPage('config', this.panel.webview);
      }

      // Set Webview content
      await this.updateWebviewContent(router);

      // Listen to VSCode theme changes and notify Webview
      this.themeChangeDisposable = vscode.window.onDidChangeActiveColorTheme((theme) => {
        if (this.panel) {
          this.panel.webview.postMessage({
            command: 'updateTheme',
            themeName: theme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light',
          });
        }
      });

      // Send the current topic on initialization
      if (this.panel) {
        this.panel.webview.postMessage({
          command: 'updateTheme',
          themeName: vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light',
        });
      }

      // Handle panel close event
      this.panel.onDidDispose(
        () => {
          // Logout configuration page
          if (router === 'config') {
            unregisterConfigPage(router);
          }
          this.dispose();
        },
        null,
        this.context.subscriptions,
      );

      // Handling Webview messages
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
   * Update Webview content
   */
  private async updateWebviewContent(router: string): Promise<void> {
    if (!this.panel) {
      return;
    }

    try {
      const distPath = path.join(this.context.extensionPath, 'out', 'web');

      // Determine whether it is a panel or sidebar type view
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
      // If reading the file fails, use fallback content
      console.log(error);
    }
  }

  /**
   * Handle messages from Webview
   */
  private handleWebviewMessage(message: unknown): void {
    const msg = message as { command: string;
      [key: string]: unknown };

    // Handle gettopic command
    // if (msg.command === 'getTheme') {
    //   const currentTheme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';
    //   if (this.panel) {
    //     this.panel.webview.postMessage({
    //       command: 'updateTheme',
    //       themeName: currentTheme,
    //     });
    //   }
    // // For sidebar type webview, it needs to be sent in different ways
    // // Sidebar messages are processed in their respective providers

    //   return;
    // }

    for (const messageItem of webviewMessageList) {
      if (msg.command === messageItem.command) {
        messageItem.callback(msg, this);
      }
    }
  }

  /**
   * Clean up resources
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
