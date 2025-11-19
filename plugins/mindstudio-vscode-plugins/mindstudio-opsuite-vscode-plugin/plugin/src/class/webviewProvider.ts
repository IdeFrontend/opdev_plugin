/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */


import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ServiceManager } from './serviceManager';
import { PermanentStorage } from './PermanentStorage'
import webviewMessageList from './WebviewMessageList'

/**
 * Webview提供者 - 负责创建和管理Webview面板
 */
export class WebviewProvider {
    private panel: vscode.WebviewPanel | undefined;
    private serviceManager: ServiceManager;
    private storage: PermanentStorage;
    private isDisposed: boolean = false;
    private isRemote: boolean = false;
    private sshData: Object | undefined;

    constructor(private context: vscode.ExtensionContext, serviceManager: ServiceManager) {
        this.serviceManager = serviceManager;
        this.storage = new PermanentStorage(context);
        this.isRemote = vscode.env.remoteName !== undefined;
        this.sshData = this.storage.get('sshData', {});
    }

    public async setSSHData(data: Object) {
        this.storage.set('sshdata', data)
    }

    /**
     * 显示Webview面板
     */
    public async show(router: string): Promise<void> {
        try {
            if (this.serviceManager.static === 'end') {
                const ports = await this.serviceManager.startServices();
            }

            // 创建或显示面板
            if (this.panel) {
                this.panel.reveal();
                this.updateWebviewUrl(router);
            } else {
                await this.createPanel(router);
            }

        } catch (error) {
            const errorMsg = `打开MindStudio Opsuite失败: ${error}`;
            console.error(errorMsg);
            vscode.window.showErrorMessage(errorMsg);
        }
    }

    /**
     * 创建Webview面板
     */
    private async createPanel(router: string = ''): Promise<void> {
        try {
            this.panel = vscode.window.createWebviewPanel(
                'mindstudioOpsuite',
                'MindStudio Opsuite',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: []
                }
            );

            // 设置Webview内容
            await this.updateWebviewContent(router);

            // 处理面板关闭事件
            this.panel.onDidDispose(() => {
                this.dispose();
            }, null, this.context.subscriptions);

            // 处理Webview消息
            this.panel.webview.onDidReceiveMessage(
                (message: any) => {
                    this.handleWebviewMessage(message);
                },
                undefined,
                this.context.subscriptions
            );

        } catch (error) {
            console.error(error);
        }
    }

    /**
     * 更新Webview内容
     */
    private async updateWebviewContent(router: string): Promise<void> {
        if (!this.panel) {
            return;
        }

        try {
            const htmlContent = await this.getWebviewContent(router);
            this.panel.webview.html = htmlContent;
        } catch (error) {
            // 如果读取文件失败，使用fallback内容
            this.panel.webview.html = this.getFallbackHtml(router);
        }
    }

    /**
     * 更新Webview中的URL
     */
    private updateWebviewUrl(router: string = ''): void {
        if (!this.panel) {
            return;
        }

        const frontendUrl = this.serviceManager.getFrontendUrl(router);
        this.panel.webview.postMessage({
            command: 'setUrl',
            url: frontendUrl
        });
    }

    /**
     * 从模板文件读取并生成Webview HTML内容
     */
    private async getWebviewContent(router: string = ''): Promise<string> {
        const frontendUrl = this.serviceManager.getFrontendUrl(router);

        try {
            // 读取模板文件
            const templatePath = path.join(
                this.context.extensionPath,
                'plugin',
                'templates',
                'webview.html'
            );


            let htmlContent = await fs.promises.readFile(templatePath, 'utf-8');

            // 替换模板变量
            htmlContent = htmlContent.replace(/{{FRONTEND_URL}}/g, frontendUrl);

            return htmlContent;
        } catch (error) {
            throw new Error(`无法读取模板文件: ${error}`);
        }
    }

    /**
     * 获取fallback HTML内容（当模板文件读取失败时使用）
     */
    private getFallbackHtml(router: string = ''): string {
        const frontendUrl = this.serviceManager.getFrontendUrl(router);

        return `
            <!DOCTYPE html>
            <html lang="zh-CN">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>MindStudio Opsuite</title>
                <style>
                    body, html {
                        margin: 0;
                        padding: 0;
                        height: 100%;
                        overflow: hidden;
                        background-color: var(--vscode-editor-background);
                        color: var(--vscode-foreground);
                        font-family: var(--vscode-font-family);
                    }
                    .container {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        height: 100vh;
                        text-align: center;
                        padding: 20px;
                    }
                    .error {
                        color: var(--vscode-errorForeground);
                        margin-bottom: 20px;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>MindStudio Opsuite</h1>
                    <p>正在加载...</p>
                    <iframe 
                        src="${frontendUrl}"
                        style="width: 100%; height: 100%; border: none;"
                    ></iframe>
                </div>
            </body>
            </html>
        `;
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

    /**
     * 清理资源
     */
    public dispose(): void {
        this.isDisposed = true;
        if (this.panel) {
            this.panel.dispose();
            this.panel = undefined;
        }
        // 停止服务
        this.serviceManager.stopServices();
    }
}