import fs from 'node:fs';

import * as vscode from 'vscode';

import { HtmlTransformer } from 'plugin:/class/html-transformer';

const WEB_OUT_DIR_PATH = 'out/web';

const HTML_ENTRY_FILE_PATH = 'index.html';

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
  ): Promise<void> {
    const devServerUrl = process.env.MSTT_DEV_SERVER_URL;
    let htmlContent = '';
    let isDev = false;
    let devUrl = '';

    if (devServerUrl) {
      try {
        devUrl = `${devServerUrl}/${HTML_ENTRY_FILE_PATH}`;

        htmlContent = await HtmlTransformer.fetchHtml(devUrl);
        isDev = true;
      } catch (e) {
        console.error(`Failed to fetch from dev server: ${e}`);
      }
    }

    if (!htmlContent) {
      const htmlEntryFileUri = vscode.Uri.joinPath(
        this.viewRootUri,
        HTML_ENTRY_FILE_PATH,
      );

      try {
        if (!fs.existsSync(htmlEntryFileUri.fsPath)) {
          throw new Error(`HTML文件不存在: ${htmlEntryFileUri.fsPath}`);
        }

        htmlContent = fs.readFileSync(htmlEntryFileUri.fsPath, 'utf-8');
      } catch (error) {
        throw error;
      }
    }

    const finalContent = Object.entries(templateValues).reduce(
      (content, [key, value]) => {
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
    } else {
      webview.html = this.replaceSourceUrl(finalContent, webview);
    }
  }

  private replaceSourceUrl(
    htmlContent: string,
    webview: vscode.Webview,
  ): string {
    const webviewRootUri = webview.asWebviewUri(this.viewRootUri);
    const result = HtmlTransformer.processResourcePaths(
      htmlContent,
      webviewRootUri,
    );

    return result;
  }
}
