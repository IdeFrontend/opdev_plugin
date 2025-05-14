import * as vscode from 'vscode';

let panelId = 0;

class Panel {
    context: vscode.ExtensionContext;
    windowView: any;
    id: number;

    constructor(context) {
        this.context = context;
        this.id = ++panelId;

        this.createPanel();
    }

    createPanel = () => {
        const context = this.context;
        const currentViewColumn = vscode.window?.activeTextEditor?.viewColumn || 1;
        const shouldSetColumn = currentViewColumn - 1 ? currentViewColumn - 1 : 2;
        const panel = this.windowView = vscode.window.createWebviewPanel('registerView',
            'Read Register',
            shouldSetColumn,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            });

        const vueUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'resource', 'vue.global.prod.js'));
        const elementUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'resource', 'index.full.min.js'));
        const elementStyleUrl = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'resource', 'index.css'));
        const jsUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'resource', 'register_panel.js'));
        const cssUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'resource', 'register_panel.css'));

        panel.webview.html =
            `<!DOCTYPE html>
            <html lang="en" class="dark">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${elementStyleUrl}" rel="stylesheet">
                <link href="${cssUri}" rel="stylesheet">

                <title>memory</title>
            </head>
            <body>
                <div id="app"></div>
                <script src="${vueUri}"></script>
                <script src="${elementUri}"></script>
                <script src="${jsUri}"></script>
            </body>
            </html>`;
    }
}

class TableView {
    context: vscode.ExtensionContext;
    memoryBar: vscode.StatusBarItem;
    panel: any;

    init = context => {
        if (!this.memoryBar) {
            this.context = context;

            this.initBarView();
            this.initEvent();
        }
    }

    initEvent = () => {
        this.context.subscriptions.push(vscode.commands.registerCommand('msdebug.ReadRegister', () => this.createView()));

        vscode.debug.onDidReceiveDebugSessionCustomEvent((event) => {
            const res = event.body;
            const currentPanel = this.panel;

            if (event.event === 'registerResult') {
                currentPanel?.windowView?.webview?.postMessage?.({ ...res, type: 'result' });
            }

            if (event.event === 'registerResultError') {
                currentPanel.windowView.webview.postMessage({ ...res, type: 'error' });
            }
        });
    }

    createView = () => {
        if (this.panel) return;

        const panel = new Panel(this.context);

        this.panel = panel;

        panel.windowView.webview.onDidReceiveMessage(
            message => {
                if (message.type === 'init') {
                    vscode.debug.activeDebugSession?.customRequest?.('queryRegister', {});
                }
            },
            undefined,
            this.context.subscriptions
        );

        // 关闭窗口释放内存
        panel.windowView.onDidDispose(
            () => {
                this.panel = null;
            },
            null,
            this.context.subscriptions
        );
    }

    initBarView = () => {
        this.memoryBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 0);
        this.memoryBar.text = 'Read Register';
        this.memoryBar.command = 'msdebug.ReadRegister';
        this.memoryBar.tooltip = 'Click to Read Register';

        this.memoryBar.show();
    }
}

const tableView = new TableView();

export default tableView;
