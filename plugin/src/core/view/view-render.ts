import fs from 'node:fs';
import path from 'node:path';

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
    console.log(`[ViewRenderer.render] 开始渲染视图: entryName=${entryName}`);
    console.log(`[ViewRenderer.render] viewRootUri: ${this.viewRootUri.toString()}`);
    console.log(`[ViewRenderer.render] templateValues:`, templateValues);
    
    const devServerUrl = process.env.MSTT_DEV_SERVER_URL;
    let htmlContent = '';
    let isDev = false;
    let devUrl = '';

    // Determine target HTML path
    let targetHtmlPath = '';

    if (entryName) {
      targetHtmlPath = `src/views/${entryName}/${entryName}.html`;
      console.log(`[ViewRenderer.render] 目标HTML路径: ${targetHtmlPath}`);
    } else {
      const error = 'Entry name is required for rendering';
      console.error(`[ViewRenderer.render] 错误: ${error}`);
      throw new Error(error);
    }

    if (devServerUrl) {
      console.log(`[ViewRenderer.render] 检测到开发服务器: ${devServerUrl}`);
      try {
        devUrl = `${devServerUrl}/${targetHtmlPath}`;
        console.log(`[ViewRenderer.render] 从开发服务器获取: ${devUrl}`);

        htmlContent = await HtmlTransformer.fetchHtml(devUrl);
        isDev = true;
        console.log(`[ViewRenderer.render] 成功从开发服务器获取HTML，长度: ${htmlContent.length}`);
      } catch (e) {
        console.error(`[ViewRenderer.render] 从开发服务器获取失败: ${targetHtmlPath}`, e);
      }
    } else {
      console.log(`[ViewRenderer.render] 未检测到开发服务器，使用生产模式`);
    }

    if (!htmlContent) {
      const htmlEntryFileUri = vscode.Uri.joinPath(
        this.viewRootUri,
        targetHtmlPath,
      );
      console.log(`[ViewRenderer.render] HTML文件URI: ${htmlEntryFileUri.toString()}`);
      console.log(`[ViewRenderer.render] HTML文件路径: ${htmlEntryFileUri.fsPath}`);

      try {
        if (fs.existsSync(htmlEntryFileUri.fsPath)) {
          console.log(`[ViewRenderer.render] HTML文件存在，开始读取`);
          htmlContent = fs.readFileSync(htmlEntryFileUri.fsPath, 'utf-8');
          console.log(`[ViewRenderer.render] HTML文件读取成功，长度: ${htmlContent.length}`);
        } else {
          const error = `HTML file not found: ${htmlEntryFileUri.fsPath}`;
          console.error(`[ViewRenderer.render] 错误: ${error}`);
          throw new Error(error);
        }
      } catch (error) {
        console.error(`[ViewRenderer.render] 读取HTML文件失败:`, error);
        throw error;
      }
    }

    console.log(`[ViewRenderer.render] 开始处理模板变量...`);
    const finalContent = Object.entries(templateValues).reduce(
      (content, [key, value]) => {
        return content.replace(`{{${key}}}`, value);
      },
      htmlContent,
    );
    console.log(`[ViewRenderer.render] 模板变量处理完成`);

    if (isDev && devServerUrl) {
      console.log(`[ViewRenderer.render] 使用开发模式处理资源路径`);
      webview.html = HtmlTransformer.processDevResourcePaths(
        finalContent,
        devServerUrl,
        devUrl,
      );
      console.log(`[ViewRenderer.render] 开发模式HTML设置完成`);
    } else {
      const htmlEntryFileUri = vscode.Uri.joinPath(
        this.viewRootUri,
        targetHtmlPath,
      );
      const htmlFileDir = htmlEntryFileUri.fsPath
        ? path.dirname(htmlEntryFileUri.fsPath)
        : undefined;
      console.log(`[ViewRenderer.render] 使用生产模式处理资源路径`);
      console.log(`[ViewRenderer.render] htmlFileDir: ${htmlFileDir || 'undefined'}`);
      webview.html = this.replaceSourceUrl(
        finalContent,
        webview,
        htmlFileDir,
      );
      console.log(`[ViewRenderer.render] 生产模式HTML设置完成`);
    }
    
    console.log(`[ViewRenderer.render] 视图渲染完成: entryName=${entryName}`);
  }

  private replaceSourceUrl(
    htmlContent: string,
    webview: vscode.Webview,
    htmlFileDir?: string,
  ): string {
    console.log(`[ViewRenderer.replaceSourceUrl] 开始替换资源URL`);
    const webviewRootUri = webview.asWebviewUri(this.viewRootUri);
    console.log(`[ViewRenderer.replaceSourceUrl] webviewRootUri: ${webviewRootUri.toString()}`);
    console.log(`[ViewRenderer.replaceSourceUrl] htmlFileDir: ${htmlFileDir || 'undefined'}`);
    
    const result = HtmlTransformer.processResourcePaths(
      htmlContent,
      webviewRootUri,
      webview,
      htmlFileDir,
    );

    console.log(`[ViewRenderer.replaceSourceUrl] 资源URL替换完成`);
    return result;
  }
}
