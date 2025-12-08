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
        const indexPath = path.join(distPath, `${router}.html`);

        try {
            if (!fs.existsSync(indexPath)) {
                throw new Error(`${router}.html not found in dist directory: ${distPath}`);
            }

            let htmlContent = fs.readFileSync(indexPath, 'utf8');

            console.log(`原始文件：${htmlContent}`)

            // 1. 首先处理资源路径
            htmlContent = this.processResourcePaths(htmlContent, distPath, webview);

            // 2. 然后更新 meta 标签
            //htmlContent = this.updateMetaTags(htmlContent, webview);

            console.log(`處理后的文件：${htmlContent}`)

            return htmlContent;

        } catch (error) {
            throw new Error(`Failed to transform HTML: ${error}`);
        }
    }

    /**
     * 处理 HTML 中的资源路径 - 使用正确的 vscode-resource 协议
     */
    private static processResourcePaths(
        htmlContent: string,
        distPath: string,
        webview: vscode.Webview
    ): string {
        return htmlContent.replace(/(<link.+?href="|<script.+?src="|<img.+?src=")(.+?)"/g, (match, prefix, src) => {
            if (src.startsWith('http://') || src.startsWith('https://')) {
                return match; // 跳过远程资源
            }
            const resourceAbsolutePath = this.getAbsoluteResourcePath(src, distPath);
            const absolutePath = path.resolve(resourceAbsolutePath, src);
            const vscodeUri = vscode.Uri.file(absolutePath).with({ scheme: 'vscode-resource' });
            return prefix + vscodeUri.toString() + '"';
        });
    }

    /**
     * 处理 CSS 中的 URL
     */
    private static processCssUrls(
        htmlContent: string,
        distPath: string,
        webview: vscode.Webview
    ): string {
        return htmlContent.replace(
            /url\(['"]?([^'")]*)['"]?\)/gi,
            (match, url) => {
                if (this.isExternalResource(url)) {
                    return match;
                }

                const resourceAbsolutePath = this.getAbsoluteResourcePath(url, distPath);

                if (fs.existsSync(resourceAbsolutePath)) {
                    const webviewUri = webview.asWebviewUri(vscode.Uri.file(resourceAbsolutePath));
                    return `url('${webviewUri}')`;
                } else {
                    console.warn(`CSS resource file not found: ${resourceAbsolutePath}`);
                    return match;
                }
            }
        );
    }

    /**
     * 获取资源的绝对路径
     */
    private static getAbsoluteResourcePath(resourceUrl: string, distPath: string): string {
        // 处理绝对路径（以 / 开头）
        if (resourceUrl.startsWith('/')) {
            return path.join(distPath, resourceUrl.substring(1));
        }
        // 处理相对路径
        else {
            return path.resolve(distPath, resourceUrl);
        }
    }

    /**
     * 更新 meta 标签
     */
    private static updateMetaTags(htmlContent: string, webview: vscode.Webview): string {
        let updatedHtml = htmlContent;

        // 移除现有的 CSP
        updatedHtml = updatedHtml.replace(/<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '');

        // 添加正确的 CSP - 允许 vscode-resource: 协议
        const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; script-src ${webview.cspSource} 'unsafe-eval'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; connect-src ${webview.cspSource};">`;

        // 在 head 中添加 CSP
        if (updatedHtml.includes('</head>')) {
            updatedHtml = updatedHtml.replace('</head>', `${csp}\n</head>`);
        }

        return updatedHtml;
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