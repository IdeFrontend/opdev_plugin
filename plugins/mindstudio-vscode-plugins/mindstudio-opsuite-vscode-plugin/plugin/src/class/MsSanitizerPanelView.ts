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
    console.log('data', data)
    return {
        ...params,
        data
    };


    // return new Promise(res => {
    //     setTimeout(() => {
    //         const mockData = [];
    //         for (let i = 0; i < 100; i++) {
    //             mockData.push({
    //                 title: i + ': illegal read of size',
    //                 type: i % 2 === 0 ? 'error' : 'warning',
    //                 questionType: ['memory', 'memoryContention', 'uninitialized', 'synchronize'][i % 4] as any,
    //                 question: 'illegal read of size',
    //                 row: 41,
    //                 col: 53,
    //                 fileLink: i % 2 === 0 ? './extension.js' : undefined,
    //                 originData: 'xxxxxxxxxxxxxxxxxxxxxxxx'
    //             })
    //         }
    //         res({
    //             title: 'msSantinizer-20251023',
    //             timestamp: 1766544770805,
    //             data: mockData
    //         })
    //     }, 500);
    // })
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
        vscode.commands.executeCommand('workbench.action.togglePanel');

        // 定位到异常检测面板
        vscode.commands.executeCommand(`msSanitizerPanelView.focus`);

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

