import * as vscode from 'vscode';

export class BtProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    data = [];

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
        if (!element) {
            return this.data;
        }

        return [];
    }

    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    refresh(data): void {
        this.data = data.map(i => ({
            label: i.oneColumn || i.all,
            id: i.right || i.all,
            tooltip: i.all,
            description: i.right,
            name: i.name
        }));

        this._onDidChangeTreeData.fire();
    }
}

export default function initBtTreeView(context: vscode.ExtensionContext) {
    const btTree = new BtProvider();

    context.subscriptions.push(vscode.commands.registerCommand('bt.ReadBt', () => {
        vscode.debug.activeDebugSession?.customRequest?.('queryBt', {});
    }));

    context.subscriptions.push(vscode.commands.registerCommand('bt.Copy', async (node) => {
        await vscode.env.clipboard.writeText(node.tooltip);

        vscode.window.showInformationMessage(`已复制：${node.tooltip}`);
    }));

    let item = '';
    let name = '';
    vscode.debug.onDidReceiveDebugSessionCustomEvent(async (event) => {
        const res = event.body;

        if (event.event === 'btResult') {
            btTree.refresh(res.table);
        }

        if (event.event === 'fileNameResult') {
            const files = res.table;

            if (item) {
                if (!files.length) {
                    vscode.window.showWarningMessage(`未找到匹配文件，或读取目录无权限`);

                    return;
                }

                const picked: any = await vscode.window.showQuickPick(files.map(i => ({ label: i.path || i })), { placeHolder: '请选择要打开的文件', ignoreFocusOut: true });

                if (!picked) return;

                const doc = await vscode.workspace.openTextDocument(picked.label);
                const editor = await vscode.window.showTextDocument(doc);
                const rightSplit = item.split(':');

                const pos = new vscode.Position(parseInt(rightSplit[1]) - 1, parseInt(rightSplit[2]));

                editor.selection = new vscode.Selection(pos, pos);
                editor.revealRange(new vscode.Range(pos, pos));
            }
        }
    });

    const btTreeView = vscode.window.createTreeView('bt', { treeDataProvider: btTree });

    btTreeView.onDidChangeSelection(async (e: any) => {
        item = e?.selection?.[0]?.id;
        name = e?.selection?.[0]?.name;

        if (item) {
            try {
                const rightSplit = item.split(':');
                const doc = await vscode.workspace.openTextDocument(rightSplit[0]);
                const editor = await vscode.window.showTextDocument(doc);

                const pos = new vscode.Position(parseInt(rightSplit[1]) - 1, parseInt(rightSplit[2]));

                editor.selection = new vscode.Selection(pos, pos);
                editor.revealRange(new vscode.Range(pos, pos));
            } catch (e) {
                vscode.window.showWarningMessage(e.message || e.stack);
            }
        }
    });
}
