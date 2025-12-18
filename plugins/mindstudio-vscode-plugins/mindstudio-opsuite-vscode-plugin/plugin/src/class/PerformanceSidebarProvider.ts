/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */


import * as path from 'path';
import * as vscode from 'vscode';
import { HtmlTransformer } from './HtmlTransformer'
import webviewMessageList from './WebviewMessageList'

export class PerformanceSidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'performanceSidebarView'

    private _view?: vscode.WebviewView
    private _extensionUri: vscode.Uri
    private _context: vscode.ExtensionContext

    constructor(context: vscode.ExtensionContext) {
        this._extensionUri = context.extensionUri
        this._context = context
    }

    async resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        // 配置WebView
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };

        // 消息处理
        webviewView.webview.onDidReceiveMessage(
            (message: any) => {
                this.handleWebviewMessage(message);
            },
            undefined,
            this._context.subscriptions
        );

        // 设置HTML内容
        const distPath = path.join(this._extensionUri.fsPath, 'out', 'web')
        webviewView.webview.html = HtmlTransformer.transformDistHtml(distPath, webviewView.webview, 'Performance')
    }


    /**
     * 处理来自Webview的消息
     */
    private handleWebviewMessage(message: any): void {
        for (const messageItem of webviewMessageList) {
            if (message.command === messageItem.command) {
                messageItem.callback(message, this);
            }
        }
    }
}

