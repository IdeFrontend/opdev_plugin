import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ServiceManager } from './serviceManager';

/**
 * Webview提供者 - 负责创建和管理Webview面板
 */
export class WebviewProvider {
    private panel: vscode.WebviewPanel | undefined;
    private serviceManager: ServiceManager;
    private isDisposed: boolean = false;

    constructor(private context: vscode.ExtensionContext, serviceManager: ServiceManager) {
        console.log('WebviewProvider 初始化');
        this.serviceManager = serviceManager;
    }

    /**
     * 显示Webview面板
     */
    public async show(): Promise<void> {
        console.log('显示 Webview 面板');
        try {
            // 启动服务
            const ports = await this.serviceManager.startServices();
            console.log(`服务启动完成 - 前端: ${ports.frontendPort}, 后端: ${ports.backendPort}`);
            
            // 创建或显示面板
            if (this.panel) {
                console.log('面板已存在，显示面板');
                this.panel.reveal();
                this.updateWebviewUrl();
            } else {
                console.log('创建新面板');
                await this.createPanel();
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
    private async createPanel(): Promise<void> {
        try {
            console.log('创建 Webview 面板实例');
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
            await this.updateWebviewContent();
            console.log('Webview 内容已设置');

            // 处理面板关闭事件
            this.panel.onDidDispose(() => {
                console.log('Webview 面板已关闭');
                this.dispose();
            }, null, this.context.subscriptions);

            // 处理Webview消息
            this.panel.webview.onDidReceiveMessage(
                (message) => {
                    console.log('收到 Webview 消息:', message);
                    this.handleWebviewMessage(message);
                },
                undefined,
                this.context.subscriptions
            );

        } catch (error) {
            const errorMsg = `创建Opsuite面板失败: ${error}`;
            console.error(errorMsg);
            vscode.window.showErrorMessage(errorMsg);
        }
    }

    /**
     * 更新Webview内容
     */
    private async updateWebviewContent(): Promise<void> {
        if (!this.panel) {
            return;
        }

        try {
            const htmlContent = await this.getWebviewContent();
            this.panel.webview.html = htmlContent;
            console.log('Webview HTML 内容已更新');
        } catch (error) {
            console.error('更新 Webview 内容失败:', error);
            // 如果读取文件失败，使用fallback内容
            this.panel.webview.html = this.getFallbackHtml();
            console.log('使用 Fallback HTML 内容');
        }
    }

    /**
     * 更新Webview中的URL
     */
    private updateWebviewUrl(): void {
        if (!this.panel) {
            return;
        }

        const frontendUrl = this.serviceManager.getFrontendUrl();
        console.log('更新 Webview URL:', frontendUrl);
        this.panel.webview.postMessage({
            command: 'setUrl',
            url: frontendUrl
        });
    }

    /**
     * 从模板文件读取并生成Webview HTML内容
     */
    private async getWebviewContent(): Promise<string> {
        const frontendUrl = this.serviceManager.getFrontendUrl();
        console.log('获取 Webview 内容，前端URL:', frontendUrl);
        
        try {
            // 读取模板文件
            const templatePath = path.join(
                this.context.extensionPath, 
                'plugin', 
                'templates', 
                'webview.html'
            );
            
            console.log('模板文件路径:', templatePath);
            
            let htmlContent = await fs.promises.readFile(templatePath, 'utf-8');
            
            // 替换模板变量
            htmlContent = htmlContent.replace(/{{FRONTEND_URL}}/g, frontendUrl);
            
            console.log('模板文件读取成功');
            return htmlContent;
        } catch (error) {
            console.error('读取模板文件失败:', error);
            throw new Error(`无法读取模板文件: ${error}`);
        }
    }

    /**
     * 获取fallback HTML内容（当模板文件读取失败时使用）
     */
    private getFallbackHtml(): string {
        const frontendUrl = this.serviceManager.getFrontendUrl();
        console.log('使用 Fallback HTML，URL:', frontendUrl);
        
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
        console.log('处理 Webview 消息:', message);
        
        switch (message.command) {
            case 'alert':
                vscode.window.showErrorMessage(message.text);
                break;
                
            case 'info':
                vscode.window.showInformationMessage(message.text);
                break;
                
            case 'loaded':
                if (message.status === 'success') {
                    console.log('Opsuite 在 Webview 中加载成功');
                } else if (message.status === 'error') {
                    console.error('Opsuite 在 Webview 中加载失败:', message.message);
                    vscode.window.showWarningMessage(`Opsuite加载异常: ${message.message}`);
                }
                break;
                
            default:
                console.warn('未知的 Webview 消息:', message);
        }
    }

    /**
     * 清理资源
     */
    public dispose(): void {
        console.log('WebviewProvider dispose');
        this.isDisposed = true;
        
        if (this.panel) {
            this.panel.dispose();
            this.panel = undefined;
        }
        
        // 停止服务
        this.serviceManager.stopServices();
    }
}