import { t } from 'i18next';
import * as vscode from 'vscode';
import * as path from 'path';
import { runDataService } from '@plugin/service/run-data-service';
import { viewService } from '@plugin/service/view-service';
import { fileService } from '@plugin/service/file-service';

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
      throw new Error(t('msSanitizer.filePathEmpty'));
    }

    try {
      // 创建文件 URI
      const fileUri = vscode.Uri.file(filePath);

      // 检查文件是否存在
      try {
        await vscode.workspace.fs.stat(fileUri);
      }
      catch {
        throw new Error(t('link.fileNotExist', { path: filePath }));
      }

      // 读取文件内容
      const fileData = await vscode.workspace.fs.readFile(fileUri);
      const content = Buffer.from(fileData).toString('utf-8');

      // 复制到剪贴板
      await vscode.env.clipboard.writeText(content);
      vscode.window.showInformationMessage(t('msSanitizer.reportCopied'));
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(t('msSanitizer.copyReportFailed', { error: errorMessage }));
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
      throw new Error(t('msSanitizer.filePathEmpty'));
    }

    // 显示下载进度
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: t('msSanitizer.downloadingReport'),
        cancellable: false,
      },
      async (progress) => {
        progress.report({
          increment: 0,
          message: t('msSanitizer.checkingFile'),
        });

        // 创建文件 URI
        const fileUri = vscode.Uri.file(filePath);

        // 检查文件是否存在
        try {
          const stat = await vscode.workspace.fs.stat(fileUri);
          if (stat.type !== vscode.FileType.File && stat.type !== vscode.FileType.Directory) {
            throw new Error(t('msSanitizer.pathNotFileOrDir'));
          }
        }
        catch {
          throw new Error(t('link.fileNotExist', { path: filePath }));
        }

        // 获取文件名（确保是 .zip 扩展名）
        const fileName = path.basename(filePath);
        const zipFileName = fileName.endsWith('.zip')
          ? fileName
          : `${fileName}.zip`;

        progress.report({
          increment: 20,
          message: t('msSanitizer.preparingDownload'),
        });

        try {
          // 使用 fileService.saveFileToLocal 方法，它会自动处理 Web 版本和桌面版本
          // 对于单个文件，会自动复制到临时文件夹并压缩为 zip
          const result = await fileService.saveFileToLocal({
            sourcePath: filePath,
            filename: zipFileName,
            dialogTitle: t('msSanitizer.saveFile'),
            allowedTypes: ['zip'],
          });

          if (result) {
            progress.report({
              increment: 100,
              message: t('msSanitizer.downloadComplete'),
            });

            // 如果是桌面版本（返回 boolean），显示成功消息
            if (typeof result === 'boolean' && result) {
              vscode.window.showInformationMessage(t('msSanitizer.fileDownloaded'));
            }
            // Web 版本会通过浏览器自动下载，不需要额外提示
          }
          else {
            // 用户取消了保存对话框
            vscode.window.showInformationMessage(t('msSanitizer.downloadCancelled'));
          }
        }
        catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(t('msSanitizer.downloadReportFailed', { error: errorMessage }));
          throw error;
        }
      },
    );
  },
};
