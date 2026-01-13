import fs from 'node:fs';
import path from 'node:path';

import * as vscode from 'vscode';

import { HtmlTransformer } from '@plugin/class/html-transformer';

const WEB_OUT_DIR_PATH = 'out/web';

export class ViewRenderer extends vscode.Disposable {
  private viewRootUri: vscode.Uri;

  constructor(context: vscode.ExtensionContext) {
    super(() => {});
    this.viewRootUri = vscode.Uri.joinPath(
      context.extensionUri,
      WEB_OUT_DIR_PATH,
    );
  }

  public async render(
    webview: vscode.Webview,
    templateValues: Record<string, string> = {},
    entryName?: string,
  ): Promise<void> {
    const devServerUrl = process.env.MSTT_DEV_SERVER_URL;
    let htmlContent = '';
    let isDev = false;
    let devUrl = '';

    // Determine target HTML path
    let targetHtmlPath = '';

    if (entryName) {
      // 判断是 panel 还是 sidebar 类型的视图
      const panelViews = [
        'config',
        'link',
        'welcome',
        'project-sh',
        'ops-config',
        'options-simulator'
      ];
      const sidebarViews = [
        'home',
        'operate',
        'ms-sanitizer-panel-view',
        'performance-run-data',
        'ms-sanitizer-run-data',
      ];

      if (panelViews.includes(entryName)) {
        targetHtmlPath = `src/views/panels/${entryName}/${entryName}.html`;
      }
      else if (sidebarViews.includes(entryName)) {
        targetHtmlPath = `src/views/sidebars/${entryName}/${entryName}.html`;
      }
      else {
        // 默认假定是 sidebar
        targetHtmlPath = `src/views/sidebars/${entryName}/${entryName}.html`;
      }
    }
    else {
      throw new Error('Entry name is required for rendering');
    }

    if (devServerUrl) {
      try {
        devUrl = `${devServerUrl}/${targetHtmlPath}`;

        htmlContent = await HtmlTransformer.fetchHtml(devUrl);
        isDev = true;
      }
      catch (e) {
        console.error(`Failed to fetch ${targetHtmlPath} from dev server: ${e}`);
      }
    }

    if (!htmlContent) {
      const htmlEntryFileUri = vscode.Uri.joinPath(
        this.viewRootUri,
        targetHtmlPath,
      );

      if (fs.existsSync(htmlEntryFileUri.fsPath)) {
        htmlContent = fs.readFileSync(htmlEntryFileUri.fsPath, 'utf-8');
      }
      else {
        throw new Error(`HTML file not found: ${htmlEntryFileUri.fsPath}`);
      }
    }

    const finalContent = Object.entries(templateValues)
      .reduce(
        (content, [
          key,
          value,
        ]) => {
          return content.replace(`{{${key}}}`, value);
        },
        htmlContent,
      );

    if (isDev && devServerUrl) {
      webview.html = HtmlTransformer.processDevResourcePaths(
        finalContent,
        devServerUrl,
        devUrl,
      );
    }
    else {
      const htmlEntryFileUri = vscode.Uri.joinPath(
        this.viewRootUri,
        targetHtmlPath,
      );
      const htmlFileDir = htmlEntryFileUri.fsPath
        ? path.dirname(htmlEntryFileUri.fsPath)
        : undefined;

      webview.html = this.replaceSourceUrl(
        finalContent,
        webview,
        htmlFileDir,
      );
    }
  }

  private replaceSourceUrl(
    htmlContent: string,
    webview: vscode.Webview,
    htmlFileDir?: string,
  ): string {
    const webviewRootUri = webview.asWebviewUri(this.viewRootUri);

    return HtmlTransformer.processResourcePaths(
      htmlContent,
      webviewRootUri,
      webview,
      htmlFileDir,
    );
  }
}
