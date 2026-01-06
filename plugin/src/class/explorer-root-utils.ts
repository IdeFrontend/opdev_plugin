import * as vscode from 'vscode';
import * as path from 'path';

/**
 * VSCode 资源管理器根目录工具类
 */
export class ExplorerRootUtils {
  /**
   * 获取资源管理器的根目录信息
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
   * 获取主根目录（第一个工作区文件夹）
   */
  public static getPrimaryRoot(): { name: string;
    path: string } | undefined {
    const roots = this.getExplorerRoots();

    return roots.length > 0 ? roots[0] : undefined;
  }
}
