import * as vscode from 'vscode';
import * as path from 'path';
import { runDataService } from '@plugin/service/run-data-service';
import { viewService } from '@plugin/service/view-service';

export const msSanitizerMethods = {
  /**
   * 获取异常检测运行数据列表
   * @returns {Promise<any[]>} 运行数据列表
   */
  async getRunData() {
    return await runDataService.getSanitizerRunData();
  },

  /**
   * 切换标记状态
   * @param params
   */
  async toggleMark(params: { id: string }) {
    return await runDataService.toggleSanitizerMark(params);
  },

  /**
   * 打开异常检测数据面板
   * @param params - 参数
   */
  openPanel(params: unknown) {
    viewService.openMsSanitizerPanelView(params);
  },

  /**
   * 复制报告内容到剪贴板
   * @param params - 参数，包含文件路径
   */
  async copyReport(params: { path: string }): Promise<void> {
    const { path: filePath } = params;

    if (!filePath) {
      throw new Error('文件路径不能为空');
    }

    try {
      // 创建文件 URI
      const fileUri = vscode.Uri.file(filePath);

      // 检查文件是否存在
      try {
        await vscode.workspace.fs.stat(fileUri);
      }
      catch {
        throw new Error(`文件不存在: ${filePath}`);
      }

      // 读取文件内容
      const fileData = await vscode.workspace.fs.readFile(fileUri);
      const content = Buffer.from(fileData).toString('utf-8');

      // 复制到剪贴板
      await vscode.env.clipboard.writeText(content);
      vscode.window.showInformationMessage('报告内容已复制到剪贴板');
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`复制报告失败: ${errorMessage}`);
      throw error;
    }
  },

  /**
   * 下载报告文件
   * @param params - 参数，包含文件路径
   */
  async downloadReport(params: { path: string }): Promise<void> {
    const { path: filePath } = params;

    if (!filePath) {
      throw new Error('文件路径不能为空');
    }

    // 显示下载进度
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: '正在下载报告',
        cancellable: false,
      },
      async (progress) => {
        progress.report({
          increment: 0,
          message: '正在读取文件...',
        });

        // 创建文件 URI
        const fileUri = vscode.Uri.file(filePath);

        // 检查文件是否存在
        try {
          const stat = await vscode.workspace.fs.stat(fileUri);

          progress.report({
            increment: 30,
            message: `文件大小: ${(stat.size / 1024).toFixed(2)} KB`,
          });
        }
        catch {
          throw new Error(`文件不存在: ${filePath}`);
        }

        // 读取文件内容
        progress.report({
          increment: 40,
          message: '正在读取文件内容...',
        });
        const fileData = await vscode.workspace.fs.readFile(fileUri);

        // 获取文件名
        const fileName = path.basename(filePath);

        progress.report({
          increment: 60,
          message: '请选择保存位置...',
        });

        // 让用户选择本地保存位置
        const localFileUri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(fileName),
          saveLabel: '保存',
          filters: { 所有文件: ['*'], 日志文件: ['log'] },
        });

        if (!localFileUri) {
          // 用户取消了保存对话框
          return;
        }

        // 将文件内容写入本地
        progress.report({
          increment: 80,
          message: '正在保存文件...',
        });
        await vscode.workspace.fs.writeFile(localFileUri, fileData);

        progress.report({
          increment: 100,
          message: '下载完成',
        });
        vscode.window.showInformationMessage(`文件已成功下载到: ${localFileUri.fsPath}`);
      },
    );
  },
};
