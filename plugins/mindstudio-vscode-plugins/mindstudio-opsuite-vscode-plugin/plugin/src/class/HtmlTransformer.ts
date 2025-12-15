import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * HTML 转换器 - 专门处理 Vue 应用打包后的 HTML 转换
 */
export class HtmlTransformer {
    /**
     * 将 dist 目录中的 index.html 转换为 VSCode WebView 兼容格式
     */
    public static transformDistHtml(distPath: string, webview: vscode.Webview, router: string = 'index'): string {
        const indexPath = path.join(distPath, `src/views/${router}/${router}.html`);

        try {
            if (!fs.existsSync(indexPath)) {
                throw new Error(`${router}.html not found in dist directory: ${distPath}`);
            }

            let htmlContent = fs.readFileSync(indexPath, 'utf8');

            // 处理资源路径
            const htmlUri = webview.asWebviewUri(vscode.Uri.file(path.dirname(indexPath)));
            htmlContent = this.processResourcePaths(htmlContent, htmlUri);

            return htmlContent;

        } catch (error) {
            throw new Error(`Failed to transform HTML: ${error}`);
        }
    }

    /**
     * 处理 HTML 中的资源路径 - 使用正确的 vscode-resource 协议
     */
    public static processResourcePaths(
        htmlContent: string,
        htmlUri: vscode.Uri,
    ): string {
        return htmlContent.replace(/(<link.+?href="|<script.+?src="|<img.+?src=")(.+?)"/g, (match, prefix, src) => {
            if (this.isExternalResource(src)) {
                return match; // 跳过远程资源
            }
            const vscodeUri = vscode.Uri.joinPath(htmlUri, src);
            return prefix + vscodeUri.toString() + '"';
        });
    }

    /**
     * 检查是否为外部资源
     */
    private static isExternalResource(url: string): boolean {
        return url.startsWith('data:') ||
            url.startsWith('http://') ||
            url.startsWith('https://') ||
            url.startsWith('//') ||
            url.startsWith('vscode-resource:');
    }
}