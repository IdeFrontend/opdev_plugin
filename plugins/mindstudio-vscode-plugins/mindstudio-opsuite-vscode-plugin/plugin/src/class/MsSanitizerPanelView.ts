import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs'
import { ExceptionParser } from "./ExceptionParser";

import { HtmlTransformer } from './HtmlTransformer'
import webviewMessageList from './WebviewMessageList'

export class MsSanitizerPanelViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'msSanitizerPanelView';

    _view?: vscode.WebviewView
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
        webviewView.webview.html = HtmlTransformer.transformDistHtml(distPath, webviewView.webview, 'MsSanitizerPanelView')
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

const getPanelData = (params: Record<string, any>) => {
    const inputContent = fs.readFileSync(params.path, 'utf-8');
    const parser = new ExceptionParser();
    // 直接传入整个文件内容进行解析
    const data = parser.parseAll(inputContent);
    console.log('异常检测详情数据：', data)
    return {
        ...params,
        data
    };
}


export const getMsSanitizerPanelViewProvider = (context: vscode.ExtensionContext) => {
    const msSanitizerPanelViewProvider = new MsSanitizerPanelViewProvider(context);
    const msSanitizerPanelView = vscode.window.registerWebviewViewProvider(MsSanitizerPanelViewProvider.viewType, msSanitizerPanelViewProvider, {
        webviewOptions: {
            retainContextWhenHidden: false,
        },
    });

    // 注册打开终端和 Webview 的命令
    const openMsSanitizerDisposable = vscode.commands.registerCommand('huawei-op-devtools.open-ms-sanitizer-panel-view', async (data: any) => {
        // 打开底部区域面板
        await vscode.commands.executeCommand('workbench.action.togglePanel');

        // 定位到异常检测面板
        await vscode.commands.executeCommand(`msSanitizerPanelView.focus`);
        // 发送数据 后续优化 先通过_view.webview方式下发内容
        const panelData = await getPanelData(data);
        (msSanitizerPanelViewProvider as any)._view.webview.postMessage({
            command: 'iframeRemoteMsSanitizerPanelViewSetRenderList',
            data: panelData,
        });

    });


    return {
        msSanitizerPanelView,
        openMsSanitizerDisposable
    }
}

