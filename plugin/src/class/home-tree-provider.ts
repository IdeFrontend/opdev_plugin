import * as vscode from 'vscode';

export class HomeTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<void>();

  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.ProviderResult<vscode.TreeItem[]> {
    // Intentionally empty so viewsWelcome content renders as the home empty state.
    return [];
  }
}

