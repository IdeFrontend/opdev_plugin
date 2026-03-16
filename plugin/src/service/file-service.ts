import { t } from 'i18next';
import fs from 'node:fs';
import path from 'node:path';

import AdmZip from 'adm-zip';
import compressing from 'compressing';
import * as vscode from 'vscode';

import {
  CheckPathExistsParams, SaveFileParams, SaveFileResult,
} from '@shared/api-types';

export class FileService {
  /**
   * 检查路径是否存在
   */
  pathExists(params: CheckPathExistsParams): Promise<boolean> {
    return new Promise((resolve) => {
      fs.stat(params.path, (err, stats) => {
        if (params.mustFile) {
          resolve(!err && stats.isFile());
        }
        else {
          resolve(!err);
        }
      });
    });
  }

  /**
   * 保存文件到本地
   * Web 版本返回文件数据，桌面版本返回 boolean
   */
  async saveFileToLocal(params: SaveFileParams): Promise<SaveFileResult> {
    // 检测是否是 Web 版本
    const isWeb = vscode.env.uiKind === vscode.UIKind.Web;

    if (isWeb) {
      // Web 版本：返回文件数据供前端下载
      return await this.saveFileToLocalWeb(params);
    }
    else {
      // 桌面版本：使用原有的文件系统 API
      return await this.saveFileToLocalDesktop(params);
    }
  }

  /**
   * Web 版本：返回文件数据（Base64 编码）供前端下载
   */
  private async saveFileToLocalWeb(params: SaveFileParams): Promise<SaveFileResult> {
    // 在 Web 版本中也显示保存对话框，让用户选择保存位置
    const savingUri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.from({
        scheme: 'vscode-local',
        path: params.filename,
      }),
      filters: params.allowedTypes
        ? { default: params.allowedTypes }
        : undefined,
      title: params.dialogTitle ?? t('file.saveTo'),
    });

    if (!savingUri) {
      // 用户取消了保存对话框
      return false;
    }

    // 从保存路径中提取文件名
    const selectedFilename = savingUri.path
      .split(/[/\\]/)
      .filter(Boolean)
      .pop() || params.filename;

    const sourceUri = vscode.Uri.file(params.sourcePath);
    let sourceStat: vscode.FileStat;

    try {
      sourceStat = await vscode.workspace.fs.stat(sourceUri);
    }
    catch {
      throw new Error(t('file.saveFailedSourceNotExist'));
    }

    // 尝试直接保存到用户选择的位置（如果 VSCode Web 支持）
    try {
      if (sourceStat.type === vscode.FileType.File) {
        // 尝试直接复制文件到用户选择的位置
        await vscode.workspace.fs.copy(sourceUri, savingUri, { overwrite: true });
        console.log('[FileService] 文件已直接保存到:', savingUri.fsPath);

        return true;
      }
      else if (sourceStat.type === vscode.FileType.Directory) {
        // 对于目录，先压缩，然后保存
        console.log('[FileService] 开始压缩目录:', sourceUri.fsPath);
        const zipBuffer = await this.compressDirectoryWeb(sourceUri);

        console.log('[FileService] 压缩完成，zip 大小:', zipBuffer.length, 'bytes');

        // 将压缩后的数据写入到用户选择的位置
        await vscode.workspace.fs.writeFile(savingUri, zipBuffer);
        console.log('[FileService] 文件已直接保存到:', savingUri.fsPath);

        return true;
      }
    }
    catch (directSaveError) {
      // 如果直接保存失败（可能因为 Web 环境限制），回退到浏览器下载
      console.log('[FileService] 直接保存失败，回退到浏览器下载:', directSaveError);

      if (sourceStat.type === vscode.FileType.File) {
        // 读取文件内容
        const fileData = await vscode.workspace.fs.readFile(sourceUri);

        // 将 Uint8Array 转换为 Base64
        const base64 = Buffer
          .from(fileData)
          .toString('base64');

        // 返回文件数据供前端下载，使用用户选择的文件名
        return {
          data: base64,
          filename: selectedFilename,
        };
      }
      else if (sourceStat.type === vscode.FileType.Directory) {
        // Web 版本：递归读取目录并压缩为 zip
        const zipBuffer = await this.compressDirectoryWeb(sourceUri);
        const base64 = Buffer
          .from(zipBuffer)
          .toString('base64');

        const result = {
          data: base64,
          filename: selectedFilename,
        };

        console.log('[FileService] 返回结果供浏览器下载，文件名:', result.filename);

        return result;
      }
    }

    return false;
  }

  /**
   * Web 版本：递归读取目录并压缩为 zip
   */
  private async compressDirectoryWeb(dirUri: vscode.Uri): Promise<Buffer> {
    const zip = new AdmZip();
    const basePath = dirUri.fsPath;

    // 递归读取目录中的所有文件
    await this.addDirectoryToZip(zip, dirUri, basePath);

    // 生成 zip 文件的 Buffer
    return zip.toBuffer();
  }

  /**
   * 递归将目录中的文件添加到 zip
   */
  private async addDirectoryToZip(
    zip: AdmZip,
    dirUri: vscode.Uri,
    basePath: string,
  ): Promise<void> {
    const entries = await vscode.workspace.fs.readDirectory(dirUri);

    for (const [
      name,
      type,
    ] of entries) {
      const entryUri = vscode.Uri.joinPath(dirUri, name);
      const relativePath = path.relative(basePath, entryUri.fsPath);

      if (type === vscode.FileType.File) {
        // 读取文件内容并添加到 zip
        const fileData = await vscode.workspace.fs.readFile(entryUri);

        zip.addFile(relativePath, Buffer.from(fileData));
      }
      else if (type === vscode.FileType.Directory) {
        // 递归处理子目录
        await this.addDirectoryToZip(zip, entryUri, basePath);
      }
    }
  }

  /**
   * 桌面版本：保存文件到本地（原有逻辑）
   */
  private async saveFileToLocalDesktop(params: SaveFileParams): Promise<boolean> {
    const savingUri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.from({
        scheme: 'vscode-local',
        path: params.filename,
      }),
      filters: params.allowedTypes
        ? { default: params.allowedTypes }
        : undefined,
      title: params.dialogTitle ?? t('file.saveTo'),
    });

    if (!savingUri) {
      return false;
    }

    const sourceUri = vscode.Uri.file(params.sourcePath);
    let sourceStat: vscode.FileStat;

    try {
      sourceStat = await vscode.workspace.fs.stat(sourceUri);
    }
    catch {
      throw new Error(t('file.saveFailedSourceNotExist'));
    }

    if (sourceStat.type === vscode.FileType.File) {
      await vscode.workspace.fs.copy(sourceUri, savingUri, { overwrite: true });
    }
    else if (sourceStat.type === vscode.FileType.Directory) {
      await compressing.zip.compressDir(
        sourceUri.fsPath,
        `${sourceUri.fsPath}.zip`,
      );
      const zipUri = vscode.Uri.file(`${sourceUri.fsPath}.zip`);

      await vscode.workspace.fs.copy(zipUri, savingUri, { overwrite: true });
      vscode.workspace.fs.delete(zipUri);
    }

    vscode.commands.executeCommand('revealFileInOS', savingUri);

    return true;
  }
}

export const fileService = new FileService();
