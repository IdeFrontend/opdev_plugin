import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';

export class HtmlTransformer {
  public static async transformDistHtml(
    distPath: string,
    webview: vscode.Webview,
    router: string = 'index',
    templateValues: Record<string, string> = {},
  ): Promise<string> {
    const devServerUrl = process.env.MSTT_DEV_SERVER_URL;

    // 从 router 中提取视图名称（最后一段）
    // 例如: 'sidebars/home' -> 'home', 'panels/config' -> 'config'
    const viewName = router.includes('/')
      ? router.split('/')
        .pop()!
      : router;

    if (devServerUrl) {
      try {
        const url = `${devServerUrl}/src/views/${router}/${viewName}.html`;
        let htmlContent = await this.fetchHtml(url);
        htmlContent = this.applyTemplateValues(htmlContent, templateValues);

        return this.processDevResourcePaths(htmlContent, devServerUrl, url);
      }
      catch (e) {
        console.error(
          `[HtmlTransformer.transformDistHtml] 从开发服务器获取失败: ${devServerUrl}`,
          e,
        );
      }
    }

    const indexPath = path.join(distPath, `src/views/${router}/${viewName}.html`);

    try {
      if (!fs.existsSync(indexPath)) {
        throw new Error(`${viewName}.html not found in dist directory: ${distPath}, expected path: ${indexPath}`);
      }

      let htmlContent = fs.readFileSync(indexPath, 'utf8');
      htmlContent = this.applyTemplateValues(htmlContent, templateValues);

      const htmlFileDir = path.dirname(indexPath);
      const htmlUri = webview.asWebviewUri(vscode.Uri.file(htmlFileDir));

      htmlContent = this.processResourcePaths(
        htmlContent,
        htmlUri,
        webview,
        htmlFileDir,
      );

      return htmlContent;
    }
    catch (error) {
      throw new Error(`Failed to transform HTML: ${error}`);
    }
  }

  private static applyTemplateValues(
    content: string,
    templateValues: Record<string, string>,
  ): string {
    return Object.entries(templateValues).reduce(
      (acc, [key, value]) => acc.replace(`{{${key}}}`, value),
      content,
    );
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
    }
    else if (processedHtml.includes('<html>')) {
      processedHtml = processedHtml.replace(
        '<html>',
        `<html>\n<head><base href="${currentDirUrl}"></head>`,
      );
    }
    else {
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
    let resourceCount = 0;
    const result = htmlContent.replace(
      /(<link.+?href="|<script.+?src="|<img.+?src=")(.+?)"/g,
      (match, prefix, src) => {
        resourceCount++;

        if (this.isExternalResource(src)) {
          return match;
        }

        let resolvedUri: vscode.Uri;

        // 处理相对路径（包含 .. 或 . 的路径，或者不以 / 开头的路径）
        if (
          src.startsWith('../')
          || src.startsWith('./')
          || (!src.startsWith('/') && htmlFileDir)
        ) {
          // 如果有 htmlFileDir，使用它来解析相对路径
          if (htmlFileDir) {
            const resolvedPath = path.resolve(htmlFileDir, src);

            // 使用 webview 转换 URI（如果提供了 webview）
            if (webview) {
              resolvedUri = webview.asWebviewUri(vscode.Uri.file(resolvedPath));
            }
            else {
              resolvedUri = vscode.Uri.file(resolvedPath);
            }
          }
          else {
            // 回退到原来的方法（可能不工作，但保持兼容性）
            resolvedUri = vscode.Uri.joinPath(htmlUri, src);
          }
        }
        else {
          // 绝对路径，直接使用 joinPath
          resolvedUri = vscode.Uri.joinPath(htmlUri, src);
        }

        return prefix + resolvedUri.toString() + '"';
      },
    );

    return result;
  }

  private static isExternalResource(url: string): boolean {
    return (
      url.startsWith('data:')
      || url.startsWith('http://')
      || url.startsWith('https://')
      || url.startsWith('//')
      || url.startsWith('vscode-resource:')
    );
  }
}
