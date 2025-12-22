import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class HtmlTransformer {
    public static transformDistHtml(distPath: string, webview: vscode.Webview, router: string = 'index'): string {
        const indexPath = path.join(distPath, `src/views/${router}/${router}.html`);
        console.log('[HtmlTransformer] transformDistHtml: 开始转换, distPath:', distPath, 'router:', router);
        console.log('[HtmlTransformer] transformDistHtml: indexPath:', indexPath);

        try {
            if (!fs.existsSync(indexPath)) {
                console.error('[HtmlTransformer] transformDistHtml: HTML文件不存在:', indexPath);
                throw new Error(`${router}.html not found in dist directory: ${distPath}`);
            }

            let htmlContent = fs.readFileSync(indexPath, 'utf8');
            console.log('[HtmlTransformer] transformDistHtml: HTML文件读取成功, 长度:', htmlContent.length);

            const htmlUri = webview.asWebviewUri(vscode.Uri.file(path.dirname(indexPath)));
            console.log('[HtmlTransformer] transformDistHtml: htmlUri:', htmlUri.toString());
            htmlContent = this.processResourcePaths(htmlContent, htmlUri);
            console.log('[HtmlTransformer] transformDistHtml: 资源路径处理完成');

            return htmlContent;

        } catch (error) {
            console.error('[HtmlTransformer] transformDistHtml: 转换失败:', error);
            throw new Error(`Failed to transform HTML: ${error}`);
        }
    }

    public static processResourcePaths(
        htmlContent: string,
        htmlUri: vscode.Uri,
    ): string {
        console.log('[HtmlTransformer] processResourcePaths: 开始处理资源路径, htmlUri:', htmlUri.toString());
        let replaceCount = 0;
        const result = htmlContent.replace(/(<link.+?href="|<script.+?src="|<img.+?src=")(.+?)"/g, (match, prefix, src) => {
            if (this.isExternalResource(src)) {
                console.log('[HtmlTransformer] processResourcePaths: 跳过外部资源:', src);
                return match;
            }
            const vscodeUri = vscode.Uri.joinPath(htmlUri, src);
            replaceCount++;
            console.log('[HtmlTransformer] processResourcePaths: 替换资源路径:', src, '->', vscodeUri.toString());
            return prefix + vscodeUri.toString() + '"';
        });
        console.log('[HtmlTransformer] processResourcePaths: 处理完成, 替换了', replaceCount, '个资源路径');
        return result;
    }

    private static isExternalResource(url: string): boolean {
        return url.startsWith('data:') ||
            url.startsWith('http://') ||
            url.startsWith('https://') ||
            url.startsWith('//') ||
            url.startsWith('vscode-resource:');
    }
}