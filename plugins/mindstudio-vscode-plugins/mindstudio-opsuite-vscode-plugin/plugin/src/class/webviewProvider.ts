/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */


import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { PermanentStorage } from './PermanentStorage'
import webviewMessageList from './WebviewMessageList'
import { HtmlTransformer } from './HtmlTransformer'


/**
 * Webview提供者 - 负责创建和管理Webview面板
 */
export class WebviewProvider {
    private panel: vscode.WebviewPanel | undefined;
    private leftNav: any | undefined;
    private storage: PermanentStorage;
    private isDisposed: boolean = false;
    private isRemote: boolean = false;
    private sshData: Object | undefined;
    private context: vscode.ExtensionContext;
    private userInfo: os.UserInfo<string | Number>;

    constructor(context: vscode.ExtensionContext) {
        this.storage = new PermanentStorage(context);
        this.context = context;
        this.isRemote = vscode.env.remoteName !== undefined;
        this.sshData = this.storage.get('sshData', []);
        this.userInfo = os.userInfo();
        this.storage.set('userInfo', this.userInfo);
    }

    public async setSSHData(data: Object) {
        this.storage.set('sshdata', data)
    }

    /**
     * 显示Webview面板
     */
    public async show(router: string): Promise<void> {
        try {

            // 创建或显示面板
            if (this.panel) {
                this.panel.reveal();
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
    public async showLeftPage(router: string): Promise<void> {
        await this.createLeftNavWebview(router);
    }

    /**
     * 创建Webview面板
     */
    private async createLeftNavWebview(router: string = ''): Promise<void> {
        const localResourceRoots = [
            vscode.Uri.file(path.join(this.context.extensionPath, 'web', 'dist')),
        ]
        try {
            vscode.window.registerWebviewViewProvider('pluginSidebar', {
                resolveWebviewView: (webviewView: vscode.WebviewView) => {
                    webviewView.webview.options = {
                        enableScripts: true,
                    };
                    const distPath = path.join(this.context.extensionPath, 'out', 'web')
                    webviewView.webview.html = HtmlTransformer.transformDistHtml(distPath, webviewView.webview, router)
                    // 处理Webview消息
                    webviewView.webview.onDidReceiveMessage(
                        (message: any) => {
                            this.handleWebviewMessage(message);
                        },
                        undefined,
                        this.context.subscriptions
                    );
                }
            });
        } catch (error) {
            console.error(error);
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
                vscode.ViewColumn.Active,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
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
            const distPath = path.join(this.context.extensionPath, 'out', 'web')
            this.panel.webview.html = HtmlTransformer.transformDistHtml(distPath, this.panel.webview, router)
        } catch (error) {
            // 如果读取文件失败，使用fallback内容
            console.log(error)
        }
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
    }
}