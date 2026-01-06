import * as vscode from 'vscode';

import { InsightDataViewerPanel } from '@plugin/class/insight-data-viewer-panel';

// 跟踪已打开的CSV文件目录
const openedCsvDirectories = new Map<string, vscode.Uri>();

export class ViewOpener {
  /**
   * 打开csv表格预览
   * @param uri csv文件uri
   */
  public static async openCsvPreview(uri: vscode.Uri): Promise<void> {
    const targetDir = vscode.Uri.joinPath(
      uri,
      '../',
    ).fsPath.toLocaleLowerCase(); // 使用小写进行比较，避免路径大小写问题

    // 检查是否有相同目录的文件已经打开
    const existingUri = openedCsvDirectories.get(targetDir);

    // 先打开新文件（使用自定义编辑器），这样新文件会立即显示
    // 使用 openWith 命令，VSCode 会自动处理，不会闪现源文件
    await vscode.commands.executeCommand('vscode.openWith', uri, 'csvViewer');

    // 如果相同目录的不同文件已打开，在新文件打开后关闭旧文件
    // 这样新文件已经显示，关闭旧文件时不会闪现源文件
    if (existingUri && existingUri.fsPath !== uri.fsPath) {
      // 等待新文件完全打开
      await new Promise((resolve) => setTimeout(resolve, 300));

      // 尝试关闭旧文件
      // 检查当前打开的文本编辑器，找到旧文件并关闭

      for (const editor of vscode.window.visibleTextEditors) {
        if (editor.document.uri.fsPath === existingUri.fsPath) {
          // 切换到旧文件并关闭（此时新文件已经打开并显示，所以不会闪现）
          await vscode.window.showTextDocument(editor.document, { preview: false });
          await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
          break;
        }
      }
    }

    // 记录已打开的目录
    openedCsvDirectories.set(targetDir, uri);
  }

  /**
   * 打开insight性能分析图
   * @param uri bin文件uri
   */
  public static async openInsight(uri: vscode.Uri): Promise<void> {
    // 从消息中获取BIN文件路径
    const binPath = uri.fsPath;
    const context = (
      globalThis as unknown as { extensionContext: vscode.ExtensionContext }
    ).extensionContext;

    if (!binPath) {
      vscode.window.showErrorMessage('BIN文件路径不能为空');

      return;
    }

    try {
      InsightDataViewerPanel.createOrShow(context, binPath);
    }
    catch (error) {
      vscode.window.showErrorMessage(`加载数据文件失败: ${error}`);
    }
  }
}
