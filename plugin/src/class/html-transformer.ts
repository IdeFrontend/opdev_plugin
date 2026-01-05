import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';

export class HtmlTransformer {
  public static async transformDistHtml(
    distPath: string,
    webview: vscode.Webview,
    router: string = 'index',
  ): Promise<string> {
    console.log(`[HtmlTransformer.transformDistHtml] 开始加载模块: router=${router}, distPath=${distPath}`);
    const devServerUrl = process.env.MSTT_DEV_SERVER_URL;

    if (devServerUrl) {
      console.log(`[HtmlTransformer.transformDistHtml] 使用开发服务器模式: ${devServerUrl}`);
      try {
        const url = `${devServerUrl}/src/views/${router}/${router}.html`;
        console.log(`[HtmlTransformer.transformDistHtml] 从开发服务器获取: ${url}`);
        const htmlContent = await this.fetchHtml(url);
        console.log(`[HtmlTransformer.transformDistHtml] 成功从开发服务器获取HTML，长度: ${htmlContent.length}`);

        return this.processDevResourcePaths(htmlContent, devServerUrl, url);
      } catch (e) {
        console.error(`[HtmlTransformer.transformDistHtml] 从开发服务器获取失败: ${devServerUrl}`, e);
      }
    }

    const indexPath = path.join(distPath, `src/views/${router}/${router}.html`);
    console.log(`[HtmlTransformer.transformDistHtml] 使用生产模式，HTML文件路径: ${indexPath}`);

    try {
      if (!fs.existsSync(indexPath)) {
        const errorMsg = `${router}.html not found in dist directory: ${distPath}`;
        console.error(`[HtmlTransformer.transformDistHtml] 文件不存在: ${indexPath}`);
        throw new Error(errorMsg);
      }

      console.log(`[HtmlTransformer.transformDistHtml] 读取HTML文件: ${indexPath}`);
      let htmlContent = fs.readFileSync(indexPath, 'utf8');
      console.log(`[HtmlTransformer.transformDistHtml] HTML文件读取成功，长度: ${htmlContent.length}`);

      const htmlFileDir = path.dirname(indexPath);
      console.log(`[HtmlTransformer.transformDistHtml] HTML文件目录: ${htmlFileDir}`);
      const htmlUri = webview.asWebviewUri(
        vscode.Uri.file(htmlFileDir),
      );
      console.log(`[HtmlTransformer.transformDistHtml] HTML URI: ${htmlUri.toString()}`);

      console.log(`[HtmlTransformer.transformDistHtml] 开始处理资源路径...`);
      htmlContent = this.processResourcePaths(
        htmlContent,
        htmlUri,
        webview,
        htmlFileDir,
      );
      console.log(`[HtmlTransformer.transformDistHtml] 资源路径处理完成`);

      return htmlContent;
    } catch (error) {
      console.error(`[HtmlTransformer.transformDistHtml] 处理失败:`, error);
      throw new Error(`Failed to transform HTML: ${error}`);
    }
  }

  public static fetchHtml(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = http.get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Status code: ${res.statusCode}`));
          res.resume();

          return;
        }
        let data = '';

        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(data));
      });

      req.on('error', reject);
    });
  }

  public static processDevResourcePaths(
    html: string,
    baseUrl: string,
    currentFileUrl: string,
  ): string {
    // 1. 处理绝对路径 (以 / 开头)，指向 Dev Server Root
    let processedHtml = html.replace(
      /(src|href)="\/([^"]*)"/g,
      `$1="${baseUrl}/$2"`,
    );

    // 2. 注入 <base> 标签，解决相对路径问题
    // 计算当前文件的目录 URL，确保以 / 结尾
    // 例如: http://localhost:5173/src/views/home/home.html -> http://localhost:5173/src/views/home/
    const currentDirUrl = currentFileUrl.substring(
      0,
      currentFileUrl.lastIndexOf('/') + 1,
    );

    // 在 <head> 后面插入 <base>
    // 如果没有 <head> 标签（虽然不规范但可能存在），则尝试在 <html> 后面插入，或者直接在开头插入
    if (processedHtml.includes('<head>')) {
      processedHtml = processedHtml.replace(
        '<head>',
        `<head>\n    <base href="${currentDirUrl}">`,
      );
    } else if (processedHtml.includes('<html>')) {
      processedHtml = processedHtml.replace(
        '<html>',
        `<html>\n<head><base href="${currentDirUrl}"></head>`,
      );
    } else {
      processedHtml = `<base href="${currentDirUrl}">\n` + processedHtml;
    }

    return processedHtml;
  }

  public static processResourcePaths(
    htmlContent: string,
    htmlUri: vscode.Uri,
    webview?: vscode.Webview,
    htmlFileDir?: string,
  ): string {
    console.log(`[HtmlTransformer.processResourcePaths] 开始处理资源路径`);
    console.log(`[HtmlTransformer.processResourcePaths] htmlUri: ${htmlUri.toString()}`);
    console.log(`[HtmlTransformer.processResourcePaths] htmlFileDir: ${htmlFileDir || 'undefined'}`);
    console.log(`[HtmlTransformer.processResourcePaths] webview: ${webview ? 'provided' : 'not provided'}`);
    
    let resourceCount = 0;
    const result = htmlContent.replace(
      /(<link.+?href="|<script.+?src="|<img.+?src=")(.+?)"/g,
      (match, prefix, src) => {
        resourceCount++;
        console.log(`[HtmlTransformer.processResourcePaths] 处理资源 #${resourceCount}: ${src}`);
        
        if (this.isExternalResource(src)) {
          console.log(`[HtmlTransformer.processResourcePaths] 资源 #${resourceCount} 是外部资源，跳过处理`);
          return match;
        }
        
        let resolvedUri: vscode.Uri;
        
        // 处理相对路径（包含 .. 或 . 的路径，或者不以 / 开头的路径）
        if (
          src.startsWith('../') ||
          src.startsWith('./') ||
          (!src.startsWith('/') && htmlFileDir)
        ) {
          console.log(`[HtmlTransformer.processResourcePaths] 资源 #${resourceCount} 是相对路径`);
          // 如果有 htmlFileDir，使用它来解析相对路径
          if (htmlFileDir) {
            const resolvedPath = path.resolve(htmlFileDir, src);
            console.log(`[HtmlTransformer.processResourcePaths] 解析后的路径: ${resolvedPath}`);
            // 使用 webview 转换 URI（如果提供了 webview）
            if (webview) {
              resolvedUri = webview.asWebviewUri(
                vscode.Uri.file(resolvedPath),
              );
              console.log(`[HtmlTransformer.processResourcePaths] 转换后的URI: ${resolvedUri.toString()}`);
            } else {
              resolvedUri = vscode.Uri.file(resolvedPath);
              console.log(`[HtmlTransformer.processResourcePaths] 警告: 未提供webview，使用文件URI: ${resolvedUri.toString()}`);
            }
          } else {
            // 回退到原来的方法（可能不工作，但保持兼容性）
            console.log(`[HtmlTransformer.processResourcePaths] 警告: 未提供htmlFileDir，使用joinPath方法`);
            resolvedUri = vscode.Uri.joinPath(htmlUri, src);
            console.log(`[HtmlTransformer.processResourcePaths] joinPath结果: ${resolvedUri.toString()}`);
          }
        } else {
          // 绝对路径，直接使用 joinPath
          console.log(`[HtmlTransformer.processResourcePaths] 资源 #${resourceCount} 是绝对路径`);
          resolvedUri = vscode.Uri.joinPath(htmlUri, src);
          console.log(`[HtmlTransformer.processResourcePaths] joinPath结果: ${resolvedUri.toString()}`);
        }

        const finalMatch = prefix + resolvedUri.toString() + '"';
        console.log(`[HtmlTransformer.processResourcePaths] 资源 #${resourceCount} 处理完成: ${src} -> ${resolvedUri.toString()}`);
        return finalMatch;
      },
    );

    console.log(`[HtmlTransformer.processResourcePaths] 资源路径处理完成，共处理 ${resourceCount} 个资源`);
    return result;
  }

  private static isExternalResource(url: string): boolean {
    return (
      url.startsWith('data:') ||
      url.startsWith('http://') ||
      url.startsWith('https://') ||
      url.startsWith('//') ||
      url.startsWith('vscode-resource:')
    );
  }
}
