import fs from 'node:fs';

import * as vscode from 'vscode';

import { HtmlTransformer } from 'plugin:/class/HtmlTransformer';

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

  public render(
    webview: vscode.Webview,
    templateValues: Record<string, string> = {},
  ): void {
    const htmlEntryFileUri = vscode.Uri.joinPath(
      this.viewRootUri,
      HTML_ENTRY_FILE_PATH,
    );

    try {
      if (!fs.existsSync(htmlEntryFileUri.fsPath)) {
        throw new Error(`HTML文件不存在: ${htmlEntryFileUri.fsPath}`);
      }

      const templateContent = fs.readFileSync(htmlEntryFileUri.fsPath, 'utf-8');

      const htmlContent = Object.entries(templateValues).reduce(
        (content, [key, value]) => {
          return content.replace(`{{${key}}}`, value);
        },
        templateContent,
      );

      const finalHtml = this.replaceSourceUrl(htmlContent, webview);

      webview.html = finalHtml;
    } catch (error) {
      throw error;
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
