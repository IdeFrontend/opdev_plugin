/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
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

    // Extract view name from router (last paragraph)
    // For example: 'sidebars/home' -> 'home', 'panels/config' -> 'config'
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
          `[HtmlTransformer.transformDistHtml] Failed to fetch from dev server: ${devServerUrl}`,
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
    return Object.entries(templateValues)
      .reduce(
        (acc, [
          key,
          value,
        ]) => acc.replace(`{{${key}}}`, value),
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
    // 1. Handle absolute paths (starting with /), pointing to Dev Server Root
    let processedHtml = html.replace(
      /(src|href)="\/([^"]*)"/g,
      `$1="${baseUrl}/$2"`,
    );

    // 2. Inject the <base> tag to solve the relative path problem
    // Calculate the directory URL of the current file, making sure it ends with /
    // For example: http://localhost:5173/src/views/home/home.html -> http://localhost:5173/src/views/home/
    const currentDirUrl = currentFileUrl.substring(
      0,
      currentFileUrl.lastIndexOf('/') + 1,
    );

    // Insert <base> after <head>
    // If there is no <head> tag (although it is not standardized but it may exist), try inserting it after <html>, or insert it directly at the beginning
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

        // Handle relative paths (paths containing .. or . , or paths not starting with / )
        if (
          src.startsWith('../')
          || src.startsWith('./')
          || (!src.startsWith('/') && htmlFileDir)
        ) {
          // If there is htmlFileDir, use it to resolve relative paths
          if (htmlFileDir) {
            const resolvedPath = path.resolve(htmlFileDir, src);

            // Convert URI using webview (if webview is provided)
            if (webview) {
              resolvedUri = webview.asWebviewUri(vscode.Uri.file(resolvedPath));
            }
            else {
              resolvedUri = vscode.Uri.file(resolvedPath);
            }
          }
          else {
            // Fallback to the original method (may not work, but maintains compatibility)
            resolvedUri = vscode.Uri.joinPath(htmlUri, src);
          }
        }
        else {
          // Absolute path, use joinPath directly
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
