import * as vscode from 'vscode';
import * as path from 'path';

/**
 * VSCode resource manager root directory tool class
 */
export class ExplorerRootUtils {
  /**
   * Get the root directory information of the resource manager
   */
  public static getExplorerRoots(): Array<{
    name: string;
    path: string;
    index: number;
  }> {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) {
      return [];
    }

    return workspaceFolders.map((folder) => ({
      name: folder.name,
      path: folder.uri.fsPath,
      index: folder.index,
      uri: folder.uri,
    }));
  }

  /**
   * Get the main root directory (first workspace folder)
   */
  public static getPrimaryRoot(): { name: string;
    path: string } | undefined {
    const roots = this.getExplorerRoots();

    return roots.length > 0 ? roots[0] : undefined;
  }
}
