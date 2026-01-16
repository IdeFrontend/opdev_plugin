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
      title: params.dialogTitle ?? '保存至',
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
      throw new Error('保存失败，源文件不存在');
    }

    // Web 版本中，由于浏览器安全限制，无法直接保存到用户选择的本地路径
    // 所以总是使用浏览器下载方式
    if (sourceStat.type === vscode.FileType.File) {
      // 对于单个文件，先复制到临时文件夹，再压缩文件夹
      console.log('[FileService] ========== 开始处理单个文件 ==========');
      console.log('[FileService] 源文件路径:', sourceUri.fsPath);
      console.log('[FileService] 源文件大小:', sourceStat.size, 'bytes');

      // 先读取源文件内容验证
      const sourceFileData = await vscode.workspace.fs.readFile(sourceUri);
      console.log('[FileService] 源文件读取成功，数据长度:', sourceFileData.length, 'bytes');
      if (sourceFileData.length === 0) {
        throw new Error('源文件内容为空，无法下载');
      }
      console.log('[FileService] 源文件前100字节:', Array.from(sourceFileData.slice(0, Math.min(100, sourceFileData.length))));

      // 创建临时目录（使用文件名作为目录名，去掉扩展名）
      const fileName = path.basename(sourceUri.fsPath);
      const fileNameWithoutExt = path.parse(fileName).name;
      const tempDirPath = path.join(path.dirname(sourceUri.fsPath), `${fileNameWithoutExt}_temp_${Date.now()}`);
      const tempDirUri = vscode.Uri.file(tempDirPath);
      console.log('[FileService] 临时目录路径:', tempDirPath);

      try {
        // 创建临时目录
        await vscode.workspace.fs.createDirectory(tempDirUri);
        console.log('[FileService] ✓ 临时目录已创建');

        // 验证临时目录是否创建成功
        const tempDirStat = await vscode.workspace.fs.stat(tempDirUri);
        console.log('[FileService] 临时目录验证，类型:', tempDirStat.type === vscode.FileType.Directory ? '目录' : '其他');

        // 将文件复制到临时目录中
        const targetFileUri = vscode.Uri.joinPath(tempDirUri, fileName);
        console.log('[FileService] 目标文件路径:', targetFileUri.fsPath);
        console.log('[FileService] 开始复制文件...');

        await vscode.workspace.fs.copy(sourceUri, targetFileUri, { overwrite: true });
        console.log('[FileService] ✓ 文件复制完成');

        // 验证复制后的文件
        const targetFileStat = await vscode.workspace.fs.stat(targetFileUri);
        console.log('[FileService] 目标文件验证，类型:', targetFileStat.type === vscode.FileType.File ? '文件' : '其他');
        console.log('[FileService] 目标文件大小:', targetFileStat.size, 'bytes');

        // 读取目标文件内容验证
        const targetFileData = await vscode.workspace.fs.readFile(targetFileUri);
        console.log('[FileService] 目标文件读取成功，数据长度:', targetFileData.length, 'bytes');
        if (targetFileData.length === 0) {
          throw new Error('复制后的文件内容为空');
        }
        if (targetFileData.length !== sourceFileData.length) {
          console.warn('[FileService] 警告：源文件和目标文件大小不匹配！', sourceFileData.length, 'vs', targetFileData.length);
        }

        // 验证临时目录中的文件列表
        const tempDirEntries = await vscode.workspace.fs.readDirectory(tempDirUri);
        console.log('[FileService] 临时目录中的文件列表:', tempDirEntries.map(([name]) => name));

        // 压缩临时目录
        console.log('[FileService] 开始压缩临时目录:', tempDirPath);
        const zipBuffer = await this.compressDirectoryWeb(tempDirUri);
        console.log('[FileService] ✓ 压缩完成，zip Buffer 大小:', zipBuffer.length, 'bytes');

        // 验证 zip 文件内容
        if (zipBuffer.length === 0) {
          throw new Error('压缩后的 zip 文件为空');
        }
        console.log('[FileService] zip Buffer 前100字节:', Array.from(zipBuffer.slice(0, Math.min(100, zipBuffer.length))));

        // 清理临时目录
        try {
          await vscode.workspace.fs.delete(tempDirUri, { recursive: true });
          console.log('[FileService] ✓ 临时目录已清理');
        }
        catch (cleanupError) {
          console.warn('[FileService] 清理临时目录失败:', cleanupError);
        }

        // 确保文件名为 .zip 扩展名
        const zipFileName = selectedFilename.endsWith('.zip')
          ? selectedFilename
          : `${selectedFilename}.zip`;
        console.log('[FileService] 最终文件名:', zipFileName);

        // 将 zip Buffer 转换为 Base64
        console.log('[FileService] 开始 Base64 编码...');
        const base64 = Buffer.from(zipBuffer).toString('base64');
        console.log('[FileService] ✓ Base64 编码完成，长度:', base64.length);
        console.log('[FileService] Base64 前100字符:', base64.substring(0, Math.min(100, base64.length)));

        // 验证 Base64 解码
        const decodedBuffer = Buffer.from(base64, 'base64');
        const isMatch = decodedBuffer.length === zipBuffer.length && decodedBuffer.every((val, idx) => val === zipBuffer[idx]);
        console.log('[FileService] Base64 解码验证，长度:', decodedBuffer.length, '匹配:', isMatch);
        if (!isMatch) {
          console.error('[FileService] 错误：Base64 编码/解码验证失败！');
        }

        // 返回 zip 文件数据供前端下载
        console.log('[FileService] ========== 准备返回数据 ==========');
        console.log('[FileService] 返回数据对象，文件名:', zipFileName, 'Base64 长度:', base64.length);

        return {
          data: base64,
          filename: zipFileName,
        };
      }
      catch (error) {
        console.error('[FileService] ========== 处理过程中出错 ==========');
        console.error('[FileService] 错误详情:', error);
        // 确保清理临时目录
        try {
          await vscode.workspace.fs.delete(tempDirUri, { recursive: true });
          console.log('[FileService] 错误后清理临时目录完成');
        }
        catch {
          console.warn('[FileService] 错误后清理临时目录失败');
        }

        throw error;
      }
    }
    else if (sourceStat.type === vscode.FileType.Directory) {
      // Web 版本：递归读取目录并压缩为 zip
      console.log('[FileService] 开始压缩目录:', sourceUri.fsPath);
      const zipBuffer = await this.compressDirectoryWeb(sourceUri);

      console.log('[FileService] 压缩完成，zip 大小:', zipBuffer.length, 'bytes');

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

    return false;
  }

  /**
   * Web 版本：递归读取目录并压缩为 zip
   */
  private async compressDirectoryWeb(dirUri: vscode.Uri): Promise<Buffer> {
    console.log('[FileService.compressDirectoryWeb] 开始压缩目录:', dirUri.fsPath);
    const zip = new AdmZip();
    const basePath = dirUri.fsPath;
    console.log('[FileService.compressDirectoryWeb] 基础路径:', basePath);

    // 递归读取目录中的所有文件
    await this.addDirectoryToZip(zip, dirUri, basePath);

    // 生成 zip 文件的 Buffer
    const zipBuffer = zip.toBuffer();
    console.log('[FileService.compressDirectoryWeb] zip 文件生成完成，大小:', zipBuffer.length, 'bytes');
    console.log('[FileService.compressDirectoryWeb] zip 文件中的文件数量:', zip.getEntries().length);
    zip.getEntries().forEach((entry) => {
      console.log('[FileService.compressDirectoryWeb]   -', entry.entryName, '大小:', entry.header.size, 'bytes');
    });

    return zipBuffer;
  }

  /**
   * 递归将目录中的文件添加到 zip
   */
  private async addDirectoryToZip(
    zip: AdmZip,
    dirUri: vscode.Uri,
    basePath: string,
  ): Promise<void> {
    console.log('[FileService.addDirectoryToZip] 处理目录:', dirUri.fsPath);
    const entries = await vscode.workspace.fs.readDirectory(dirUri);
    console.log('[FileService.addDirectoryToZip] 目录中的条目数:', entries.length);

    for (const [
      name,
      type,
    ] of entries) {
      const entryUri = vscode.Uri.joinPath(dirUri, name);
      const relativePath = path.relative(basePath, entryUri.fsPath);
      console.log('[FileService.addDirectoryToZip] 处理条目:', name, '类型:', type === vscode.FileType.File ? '文件' : type === vscode.FileType.Directory ? '目录' : '其他', '相对路径:', relativePath);

      if (type === vscode.FileType.File) {
        // 读取文件内容并添加到 zip
        console.log('[FileService.addDirectoryToZip] 读取文件:', entryUri.fsPath);
        const fileData = await vscode.workspace.fs.readFile(entryUri);
        console.log('[FileService.addDirectoryToZip] 文件读取成功，大小:', fileData.length, 'bytes');

        if (fileData.length === 0) {
          console.warn('[FileService.addDirectoryToZip] 警告：文件内容为空:', entryUri.fsPath);
        }

        zip.addFile(relativePath, Buffer.from(fileData));
        console.log('[FileService.addDirectoryToZip] ✓ 文件已添加到 zip:', relativePath);
      }
      else if (type === vscode.FileType.Directory) {
        // 递归处理子目录
        console.log('[FileService.addDirectoryToZip] 递归处理子目录:', entryUri.fsPath);
        await this.addDirectoryToZip(zip, entryUri, basePath);
      }
    }

    console.log('[FileService.addDirectoryToZip] 目录处理完成:', dirUri.fsPath);
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
      title: params.dialogTitle ?? '保存至',
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
      throw new Error('保存失败，源文件不存在');
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
