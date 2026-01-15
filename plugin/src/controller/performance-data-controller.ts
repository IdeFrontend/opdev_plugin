import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import compressing from 'compressing';
import {
  GetPerformanceRunDataParams,
  GetPerformanceRunDataResult,
  MarkRecordParams,
} from '@shared/api-types';
import { runDataService } from '@plugin/service/run-data-service';

/**
 * 递归读取目录下所有文件内容
 */
async function readDirectoryFiles(dirPath: string, basePath: string = dirPath): Promise<string> {
  const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dirPath));
  const contents: string[] = [];

  for (const [name, type] of entries) {
    const fullPath = path.join(dirPath, name);
    const relativePath = path.relative(basePath, fullPath);

    if (type === vscode.FileType.File) {
      try {
        const fileData = await vscode.workspace.fs.readFile(vscode.Uri.file(fullPath));
        const content = Buffer.from(fileData).toString('utf-8');
        contents.push(`\n========== ${relativePath} ==========\n${content}\n`);
      }
      catch (error) {
        contents.push(`\n========== ${relativePath} ==========\n[读取文件失败: ${error}]\n`);
      }
    }
    else if (type === vscode.FileType.Directory) {
      const subContent = await readDirectoryFiles(fullPath, basePath);
      contents.push(subContent);
    }
  }

  return contents.join('');
}

export const performanceMethods = {
  /**
   * 获取性能运行数据
   * @param params 查询参数
   * @returns 运行数据结果
   */
  async getRunData(params: GetPerformanceRunDataParams): Promise<GetPerformanceRunDataResult> {
    return await runDataService.getPerformanceRunData(params);
  },

  /**
   * 切换记录的标记状态
   * @param params 标记参数
   */
  toggleRecordMark(params: MarkRecordParams): void {
    runDataService.togglePerformanceRecordMark(params);
  },

  /**
   * 复制报告内容到剪贴板
   * @param params - 参数，包含目录路径
   */
  async copyReport(params: { dirPath: string }): Promise<void> {
    const { dirPath } = params;

    if (!dirPath) {
      throw new Error('目录路径不能为空');
    }

    try {
      // 创建目录 URI
      const dirUri = vscode.Uri.file(dirPath);

      // 检查目录是否存在
      try {
        const stat = await vscode.workspace.fs.stat(dirUri);
        if (stat.type !== vscode.FileType.Directory) {
          throw new Error('路径不是目录');
        }
      }
      catch {
        throw new Error(`目录不存在: ${dirPath}`);
      }

      // 读取目录下所有文件内容
      const content = await readDirectoryFiles(dirPath);

      if (!content.trim()) {
        vscode.window.showWarningMessage('目录为空，无内容可复制');
        return;
      }

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
   * 下载报告文件（目录）
   * @param params - 参数，包含目录路径
   */
  async downloadReport(params: { dirPath: string }): Promise<void> {
    const { dirPath } = params;

    if (!dirPath) {
      throw new Error('目录路径不能为空');
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
          message: '正在检查目录...',
        });

        // 创建目录 URI
        const dirUri = vscode.Uri.file(dirPath);

        // 检查目录是否存在
        try {
          const stat = await vscode.workspace.fs.stat(dirUri);
          if (stat.type !== vscode.FileType.Directory) {
            throw new Error('路径不是目录');
          }
        }
        catch {
          throw new Error(`目录不存在: ${dirPath}`);
        }

        // 获取目录名
        const dirName = path.basename(dirPath);
        const zipFileName = `${dirName}.zip`;

        progress.report({
          increment: 20,
          message: '正在压缩目录...',
        });

        // 创建临时 zip 文件路径
        const tempZipPath = path.join(path.dirname(dirPath), `${dirName}_${Date.now()}.zip`);

        try {
          // 压缩目录
          await compressing.zip.compressDir(dirPath, tempZipPath);

          progress.report({
            increment: 60,
            message: '请选择保存位置...',
          });

          // 让用户选择本地保存位置
          const localFileUri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(zipFileName),
            saveLabel: '保存',
            filters: { ZIP文件: ['zip'], 所有文件: ['*'] },
          });

          if (!localFileUri) {
            // 用户取消了保存对话框，删除临时文件
            if (fs.existsSync(tempZipPath)) {
              fs.unlinkSync(tempZipPath);
            }
            return;
          }

          // 将压缩文件复制到用户选择的位置
          progress.report({
            increment: 80,
            message: '正在保存文件...',
          });

          const tempZipUri = vscode.Uri.file(tempZipPath);
          await vscode.workspace.fs.copy(tempZipUri, localFileUri, { overwrite: true });

          // 删除临时文件
          if (fs.existsSync(tempZipPath)) {
            fs.unlinkSync(tempZipPath);
          }

          progress.report({
            increment: 100,
            message: '下载完成',
          });
          vscode.window.showInformationMessage(`文件已成功下载到: ${localFileUri.fsPath}`);
        }
        catch (error) {
          // 清理临时文件
          if (fs.existsSync(tempZipPath)) {
            fs.unlinkSync(tempZipPath);
          }
          throw error;
        }
      },
    );
  },
};
