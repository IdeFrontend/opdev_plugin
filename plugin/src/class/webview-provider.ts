/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as path from 'path';
import * as fs from 'fs';
import { t } from 'i18next';
import * as vscode from 'vscode';
import { PermanentStorage } from './permanent-storage';
import webviewMessageList from './webview-message-list';
import { HtmlTransformer } from './html-transformer';
import { ApiServer } from '@plugin/core/api-server';
import {
  VIEW_NEW_PROJECT,
  VIEW_WELCOME,
  VIEW_OPTIONS_ST_TEST,
} from '@plugin/constants';
import {
  BRANDING,
  MINDSTUDIO_OPSUITE_PANEL_TYPE,
  PLUGIN_SIDEBAR_VIEW_TYPE,
} from '@shared/flavor';
import {
  handleThemeRequest,
  registerWebviewThemeBridge,
} from '@plugin/core/view/webview-theme';

/**
 * Webview provider - Responsible for creating and managing Webview panels
 */
export class WebviewProvider {
  private panel: vscode.WebviewPanel | undefined;
  private storage: PermanentStorage;
  private context: vscode.ExtensionContext;
  private pluginSidebarDisposable: vscode.Disposable | undefined;
  private pluginSidebarThemeDisposable: vscode.Disposable | undefined;
  private panelThemeDisposable: vscode.Disposable | undefined;

  constructor(
    context: vscode.ExtensionContext,
    private apiServer?: ApiServer,
  ) {
    this.storage = new PermanentStorage(context);
    this.context = context;
  }

  /**
   * Icon shown on the editor tab for this webview panel (must exist on disk).
   */
  private getWebviewPanelIconPath(): vscode.Uri | { readonly light: vscode.Uri;
    readonly dark: vscode.Uri } | undefined {
    const candidates = [
      path.join(this.context.extensionPath, 'out', 'web', 'branding', 'extension_icon.png'),
      path.join(this.context.extensionPath, 'web', 'src', 'assets', 'branding', 'extension_icon.png'),
    ];

    for (const fsPath of candidates) {
      if (fs.existsSync(fsPath)) {
        const uri = vscode.Uri.file(fsPath);

        return {
          light: uri,
          dark: uri,
        };
      }
    }

    return undefined;
  }

  private applyWebviewPanelIcon(panel: vscode.WebviewPanel): void {
    const icon = this.getWebviewPanelIconPath();

    if (icon) {
      panel.iconPath = icon;
    }
  }

  private getPanelTitle(router: string): string {
    if (router === VIEW_NEW_PROJECT) {
      return t('web.home.newOperatorProject');
    }

    if (router === VIEW_WELCOME) {
      return BRANDING.productName;
    }

    if (router === VIEW_OPTIONS_ST_TEST) {
      return t('stTest.options.title');
    }

    return BRANDING.productName;
  }

  /**
   * Show Webview panel
   */
  public async show(router: string): Promise<void> {
    try {
      // Create or display a panel
      if (this.panel) {
        if (router === VIEW_OPTIONS_ST_TEST) {
          await this.updateWebviewContent(router);
        }

        this.applyWebviewPanelIcon(this.panel);
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

      if (this.pluginSidebarThemeDisposable) {
        this.pluginSidebarThemeDisposable.dispose();
        this.pluginSidebarThemeDisposable = undefined;
      }

      const extensionUri = this.context.extensionUri;
      const viewRootUri = vscode.Uri.joinPath(extensionUri, 'out', 'web');

      this.pluginSidebarDisposable = vscode.window.registerWebviewViewProvider(
        PLUGIN_SIDEBAR_VIEW_TYPE,
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

            this.pluginSidebarThemeDisposable = registerWebviewThemeBridge(webviewView.webview);

            // Handling Webview messages
            webviewView.webview.onDidReceiveMessage(
              (message: unknown) => {
                this.handleWebviewMessage(message, webviewView.webview);
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
      return { dispose: () => { } };
    }
  }

  /**
   * Create a Webview panel
   */
  private async createPanel(router: string = ''): Promise<void> {
    try {
      const iconPath = this.getWebviewPanelIconPath();

      this.panel = vscode.window.createWebviewPanel(
        MINDSTUDIO_OPSUITE_PANEL_TYPE,
        this.getPanelTitle(router),
        vscode.ViewColumn.Active,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          ...(iconPath ? { iconPath } : {}),
        },
      );

      this.applyWebviewPanelIcon(this.panel);

      this.apiServer?.addWebview(router, this.panel.webview);

      // Set Webview content
      await this.updateWebviewContent(router);
      this.applyWebviewPanelIcon(this.panel);

      if (this.panel) {
        this.panelThemeDisposable = registerWebviewThemeBridge(this.panel.webview);
      }

      // Handle panel close event
      this.panel.onDidDispose(
        () => {
          this.dispose();
        },
        null,
        this.context.subscriptions,
      );

      // Handling Webview messages
      this.panel.webview.onDidReceiveMessage(
        (message: unknown) => {
          this.handleWebviewMessage(message, this.panel?.webview);
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
        'new-project',
        'welcome',
        'options-simulator',
        'options-on-board',
        'options-sanitizer',
        'options-st-test',
        'data-collection-config',
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
  private handleWebviewMessage(
    message: unknown,
    sourceWebview?: vscode.Webview,
  ): void {
    if (sourceWebview && handleThemeRequest(sourceWebview, message)) {
      return;
    }

    const msg = message as {
      command: string;
      [key: string]: unknown
    };

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
      const panel = this.panel;

      this.panel = undefined;
      panel.dispose();
    }

    if (this.pluginSidebarDisposable) {
      this.pluginSidebarDisposable.dispose();
      this.pluginSidebarDisposable = undefined;
    }

    if (this.pluginSidebarThemeDisposable) {
      this.pluginSidebarThemeDisposable.dispose();
      this.pluginSidebarThemeDisposable = undefined;
    }

    if (this.panelThemeDisposable) {
      this.panelThemeDisposable.dispose();
      this.panelThemeDisposable = undefined;
    }
  }
}
