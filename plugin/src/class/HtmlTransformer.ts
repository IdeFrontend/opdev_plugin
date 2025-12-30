import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class HtmlTransformer {
    public static transformDistHtml(distPath: string, webview: vscode.Webview, router: string = 'index'): string {
        const indexPath = path.join(distPath, `src/views/${router}/${router}.html`);

        try {
            if (!fs.existsSync(indexPath)) {
                throw new Error(`${router}.html not found in dist directory: ${distPath}`);
            }

            let htmlContent = fs.readFileSync(indexPath, 'utf8');

            const htmlUri = webview.asWebviewUri(vscode.Uri.file(path.dirname(indexPath)));
            htmlContent = this.processResourcePaths(htmlContent, htmlUri);

            return htmlContent;

        } catch (error) {
            throw new Error(`Failed to transform HTML: ${error}`);
        }
    }

    public static processResourcePaths(
        htmlContent: string,
        htmlUri: vscode.Uri,
    ): string {
        const result = htmlContent.replace(/(<link.+?href="|<script.+?src="|<img.+?src=")(.+?)"/g, (match, prefix, src) => {
            if (this.isExternalResource(src)) {
                return match;
            }
            const vscodeUri = vscode.Uri.joinPath(htmlUri, src);
            return prefix + vscodeUri.toString() + '"';
        });
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