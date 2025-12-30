import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * VSCode 资源管理器根目录工具类
 */
export class ExplorerRootUtils {
    /**
     * 获取资源管理器的根目录信息
     */
    public static getExplorerRoots(): Array<{ name: string, path: string, index: number }> {
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders) {
            return [];
        }

        return workspaceFolders.map(folder => ({
            name: folder.name,
            path: folder.uri.fsPath,
            index: folder.index,
            uri: folder.uri
        }));
    }

    /**
     * 获取主根目录（第一个工作区文件夹）
     */
    public static getPrimaryRoot(): { name: string, path: string } | undefined {
        const roots = this.getExplorerRoots();
        return roots.length > 0 ? roots[0] : undefined;
    }

    /**
     * 根据文件路径获取所属的工作区根目录
     */
    public static getWorkspaceRootForFile(filePath: string): { name: string, path: string } | undefined {
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders) {
            return undefined;
        }

        // 查找包含该文件的工作区文件夹
        for (const folder of workspaceFolders) {
            const folderPath = folder.uri.fsPath;
            if (filePath.startsWith(folderPath)) {
                return {
                    name: folder.name,
                    path: folderPath
                };
            }
        }

        return undefined;
    }

    /**
     * 检查路径是否在某个工作区根目录下
     */
    public static isPathInWorkspace(filePath: string): boolean {
        return this.getWorkspaceRootForFile(filePath) !== undefined;
    }

    /**
     * 获取相对于工作区根目录的路径
     */
    public static getRelativePathFromRoot(filePath: string): string | undefined {
        const rootInfo = this.getWorkspaceRootForFile(filePath);

        if (!rootInfo) {
            return undefined;
        }

        return path.relative(rootInfo.path, filePath);
    }

    /**
     * 显示工作区根目录信息
     */
    public static showWorkspaceInfo(): void {
        const roots = this.getExplorerRoots();

        if (roots.length === 0) {
            vscode.window.showInformationMessage('当前没有打开的工作区');
            return;
        }

        const rootInfo = roots.map((root, index) =>
            `${index + 1}. ${root.name} - ${root.path}`
        ).join('\n');

        vscode.window.showInformationMessage(
            `工作区根目录 (${roots.length}个):\n${rootInfo}`,
            { modal: false }
        );
    }
}