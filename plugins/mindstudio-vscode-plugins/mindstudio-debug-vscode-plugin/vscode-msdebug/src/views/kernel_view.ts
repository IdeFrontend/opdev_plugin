import * as vscode from 'vscode';

class MemoryView {
    context: vscode.ExtensionContext;
    kernelView: KernelViewProvider;
    cacheData: any;

    init = async (context) => {
        if (!this.kernelView) {
            vscode.commands.executeCommand('setContext', 'msdebug.kernel.view', 'cpu');

            this.context = context;

            this.createView();
            this.initEvent();
        }
    }

    initEvent = () => {
        vscode.debug.onDidReceiveDebugSessionCustomEvent(async (event) => {
            if (event.event === 'changeKernel') {
                this.cacheData = event.body;
                this.kernelView._view?.webview.postMessage(this.cacheData);
            }
    
            if (event.event === 'changeKernelError') {
                vscode.window.showErrorMessage(event.body.message);
            }
    
            if (event.event === 'kernelFocus') {
                await vscode.commands.executeCommand('setContext', 'msdebug.kernel.view', event.body.focus ? 'npu' : 'cpu');
                this.kernelView._view?.webview.postMessage(this.cacheData);
            }
        });
    }

    createView = () => {
        const provider = new KernelViewProvider(this.context.extensionUri, webviewView => {
            webviewView.webview.onDidReceiveMessage(
                message => {
                    if (message.type === 'init') {
                        webviewView.webview.postMessage(this.cacheData);
                    }

                    if (message.type === 'value') {
                        vscode.debug.activeDebugSession?.customRequest('changeKernel', message.value);
                    }
                },
                undefined,
                this.context.subscriptions
            );
        });
        this.kernelView = provider;
	    this.context.subscriptions.push(vscode.window.registerWebviewViewProvider('msdebug.Kernel', provider, { webviewOptions: { retainContextWhenHidden: true } }));
    }
}

class KernelViewProvider implements vscode.WebviewViewProvider {

	public static readonly viewType = 'msdebug.Kernel';

	public _view?: vscode.WebviewView;

	constructor(
		private readonly _extensionUri: vscode.Uri,
        private initCb: any
	) { }

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri]
		};

		webviewView.webview.html = this.createPanel(webviewView.webview);

        // 解决第一次初始化的时候webview容器出现异常
        setTimeout(() => this.initCb(webviewView), 0);
	}

    createPanel = (webview: vscode.Webview) => {
        const vueUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resource', 'vue.global.prod.js'));
        const elementUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resource', 'index.full.min.js'));
        const elementStyleUrl = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resource', 'index.css'));
        const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resource', 'kernel_panel.js'));
        const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resource', 'kernel_panel.css'));

        return `<!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <link href="${elementStyleUrl}" rel="stylesheet">
                    <link href="${cssUri}" rel="stylesheet">

                    <title>memory</title>
                </head>
                <body>
                    <div id="app">


                    <el-radio-group @change="changeKernel" v-model="currentId">
                        <table>
                        <tbody>
                            <tr v-if="!mode">
                                <td></td>
                                <td>CoreId</td>
                                <td>Type</td>
                                <td>Device</td>
                                <td>Stream</td>
                                <td>Task</td>
                                <td>Block</td>
                                <td>PC</td>
                                <td>stop reason</td>
                            </tr>
                            <tr v-else>
                                <td></td>
                                <td>CoreId</td>
                                <td>CoreType</td>
                                <td>DeviceId</td>
                                <td>ChipType</td>
                            </tr>
                            <tr v-for="i in tableData" :class="{active: currentId === (i[1].toLocaleLowerCase() + ' ' + i[0])}">
                                <td style="text-align: center">
                                    <el-radio :value="i[1].toLocaleLowerCase() + ' ' + i[0]" size="small"></el-radio>
                                </td>
                                <td @click="changeKernel(i[1].toLocaleLowerCase() + ' ' + i[0])" v-for="j in i ">{{ j }}</td>
                            </tr>
                        </tobody>
                        </table>
                    </el-radio-group>
                        

                    </div>
                    <script src="${vueUri}"></script>
                    <script src="${elementUri}"></script>
                    <script src="${jsUri}"></script>
                </body>
                </html>`;
    }
}

const memoryView = new MemoryView();

export default memoryView;
