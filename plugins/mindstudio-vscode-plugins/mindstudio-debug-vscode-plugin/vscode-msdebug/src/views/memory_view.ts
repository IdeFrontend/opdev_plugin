import * as vscode from 'vscode';

let panelId = 0;

class Panel {
    context: vscode.ExtensionContext;
    windowView: any;
    id: number;
    tableQuery;

    constructor(context, tableQuery) {
        this.context = context;
        this.id = ++panelId;
        this.tableQuery = tableQuery;

        this.createPanel();
    }

    createPanel = () => {
        const context = this.context;
        const currentViewColumn = vscode.window?.activeTextEditor?.viewColumn || 1;
        const shouldSetColumn = currentViewColumn - 1 ? currentViewColumn - 1 : 2;
        const panel = this.windowView = vscode.window.createWebviewPanel('memoryView',
            this.tableQuery?.[0] ? `Read Memory[${this.tableQuery[0]}]` : 'Read Memory',
            shouldSetColumn,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            });

        const vueUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'resource', 'vue.global.prod.js'));
        const elementUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'resource', 'index.full.min.js'));
        const elementStyleUrl = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'resource', 'index.css'));
        const jsUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'resource', 'momory_panel.js'));
        const cssUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'resource', 'momory_panel.css'));

        panel.webview.html =
            `<!DOCTYPE html>
            <html lang="en" class="dark">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${elementStyleUrl}" rel="stylesheet">
                <link href="${cssUri}" rel="stylesheet">

                <title>memory</title>
                <script>
                    window.__tableQuery = ${JSON.stringify(this.tableQuery)};
                </script>
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

class MemoryView {
    context: vscode.ExtensionContext;
    memoryBar: vscode.StatusBarItem;
    panels: any = {};

    init = context => {
        if (!this.memoryBar) {
            this.context = context;

            this.initBarView();
            this.initEvent();
        }
    }

    initEvent = () => {
        this.context.subscriptions.push(vscode.commands.registerCommand('msdebug.ReadMemory', () => this.createView()));
        this.context.subscriptions.push(vscode.commands.registerCommand('msdebug.ReadMemoryCustom', () => this.createView(true)));

        let isCoredump = false;

        vscode.debug.onDidReceiveDebugSessionCustomEvent((event) => {
            if (event.event === 'readTableMemory') {
                isCoredump = true;

                this.createView(true, event?.body?.data);

                return;
            }

            const res = event.body;
            const currentPanel = this.panels?.[res?.id];
            const varName = event?.body?.variableName;

            if (!currentPanel) {
                return;
            }

            // 点击查询后会重置掉变量名，因为自定义查询使用的标识是变量名，点击查询按钮会将变量名置为空字符，所以这里只初始化一次窗口标题
            if (!currentPanel.windowView.__initTitle && !isCoredump) {
                currentPanel.windowView.__initTitle = true;
                currentPanel.windowView.title = varName ? `Read Memory[${varName}]` : 'Read Memory';
            }

            if (event.event === 'memoryResult') {
                currentPanel.windowView.webview.postMessage({ ...res, type: 'result' });
            }

            if (event.event === 'memoryResultError') {
                currentPanel.windowView.webview.postMessage({ ...res, type: 'error' });
            }
        });
    }

    createView = (isCustom = false, tableQuery = undefined) => {
        const editor = vscode.window.activeTextEditor;
        let variableName = '';

        if (editor && editor.selection) {
            const selectText = editor.document.getWordRangeAtPosition(editor.selection.start);

            if (selectText) {
                variableName = editor.document.getText(selectText);
            }
        }

        if (isCustom) variableName = '';

        const panel = new Panel(this.context, tableQuery);

        this.panels[panel.id] = panel;

        panel.windowView.webview.onDidReceiveMessage(
            message => {
                vscode.debug.activeDebugSession?.customRequest('queryMemory', message);
            },
            undefined,
            this.context.subscriptions
        );

        // 关闭窗口释放内存
        panel.windowView.onDidDispose(
            () => {
                delete this.panels[panel.id]
            },
            null,
            this.context.subscriptions
        );

        setTimeout(() => {
            panel.windowView.webview.postMessage({ variableName, id: panel.id, type: 'init' });
        }, 0);
    }

    initBarView = () => {
        this.memoryBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 0);
        this.memoryBar.text = 'Read Memory';
        this.memoryBar.command = 'msdebug.ReadMemoryCustom';
        this.memoryBar.tooltip = 'Click to read custom memory address';

        this.memoryBar.show();
    }
}

const memoryView = new MemoryView();

export default memoryView;
