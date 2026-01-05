import fs from 'node:fs';

import * as vscode from 'vscode';

import { HtmlTransformer } from 'plugin:/class/html-transformer';

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
      targetHtmlPath = `src/views/${entryName}/${entryName}.html`;
    } else {
      throw new Error('Entry name is required for rendering');
    }

    if (devServerUrl) {
      try {
        devUrl = `${devServerUrl}/${targetHtmlPath}`;

        htmlContent = await HtmlTransformer.fetchHtml(devUrl);
        isDev = true;
      } catch (e) {
        console.error(`Failed to fetch ${targetHtmlPath} from dev server: ${e}`);
      }
    }

    if (!htmlContent) {
      const htmlEntryFileUri = vscode.Uri.joinPath(
        this.viewRootUri,
        targetHtmlPath,
      );

      try {
        if (fs.existsSync(htmlEntryFileUri.fsPath)) {
          htmlContent = fs.readFileSync(htmlEntryFileUri.fsPath, 'utf-8');
        } else {
          throw new Error(`HTML file not found: ${htmlEntryFileUri.fsPath}`);
        }
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
