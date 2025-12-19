import fs from 'node:fs';

import * as vscode from 'vscode';

import { HtmlTransformer } from 'plugin:/class/HtmlTransformer';

const WEB_OUT_DIR_PATH = 'out/web';

const HTML_ENTRY_FILE_PATH = 'index.html';

export class ViewRenderer extends vscode.Disposable {
  private viewRootUri: vscode.Uri;

  constructor(context: vscode.ExtensionContext) {
    super(() => {});
    this.viewRootUri = vscode.Uri.joinPath(context.extensionUri, WEB_OUT_DIR_PATH);
  }

  public render(webview: vscode.Webview, templateValues: Record<string, string> = {}): void {
    console.log('[ViewRenderer] render: 开始渲染, templateValues:', JSON.stringify(templateValues));
    const htmlEntryFileUri = vscode.Uri.joinPath(this.viewRootUri, HTML_ENTRY_FILE_PATH);
    console.log('[ViewRenderer] render: htmlEntryFileUri:', htmlEntryFileUri.fsPath);
    console.log('[ViewRenderer] render: viewRootUri:', this.viewRootUri.fsPath);
    
    try {
      if (!fs.existsSync(htmlEntryFileUri.fsPath)) {
        console.error('[ViewRenderer] render: HTML文件不存在:', htmlEntryFileUri.fsPath);
        throw new Error(`HTML文件不存在: ${htmlEntryFileUri.fsPath}`);
      }
      
      const templateContent = fs.readFileSync(htmlEntryFileUri.fsPath, 'utf-8');
      console.log('[ViewRenderer] render: 读取HTML文件成功, 长度:', templateContent.length);
      
      const htmlContent = Object.entries(templateValues).reduce((content, [key, value]) => {
        return content.replace(`{{${key}}}`, value);
      }, templateContent);
      console.log('[ViewRenderer] render: 模板替换完成');
      
      const finalHtml = this.replaceSourceUrl(htmlContent, webview);
      console.log('[ViewRenderer] render: 资源路径替换完成, HTML长度:', finalHtml.length);
      
      webview.html = finalHtml;
      console.log('[ViewRenderer] render: webview.html已设置');
    } catch (error) {
      console.error('[ViewRenderer] render: 渲染过程中出错:', error);
      throw error;
    }
  }

  private replaceSourceUrl(htmlContent: string, webview: vscode.Webview): string {
    const webviewRootUri = webview.asWebviewUri(this.viewRootUri);
    console.log('[ViewRenderer] replaceSourceUrl: webviewRootUri:', webviewRootUri.toString());
    const result = HtmlTransformer.processResourcePaths(htmlContent, webviewRootUri);
    console.log('[ViewRenderer] replaceSourceUrl: 资源路径处理完成');
    return result;
  }
}
