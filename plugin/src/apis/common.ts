import fs from 'node:fs';

import compressing from 'compressing';
import * as vscode from 'vscode';

import { CheckPathExistsParams, SaveFileParams } from 'shared:/api-types';

export const commonMethods = {
  /**
   * 检查路径是否存在
   * @param params 检查参数
   * @returns 存在返回 true，否则返回 false
   */
  pathExists(params: CheckPathExistsParams): Promise<boolean> {
    return new Promise((resolve) => {
      fs.stat(params.path, (err, stats) => {
        if (params.mustFile) {
          resolve(!err && stats.isFile());
        } else {
          resolve(!err);
        }
      });
    });
  },

  /**
   * 保存文件到本地
   * @param params 保存参数
   * @returns 保存成功返回 true，否则返回 false
   */
  async saveFileToLocal(params: SaveFileParams): Promise<boolean> {
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
    } catch {
      throw new Error('保存失败，源文件不存在');
    }
    if (sourceStat.type === vscode.FileType.File) {
      await vscode.workspace.fs.copy(sourceUri, savingUri, {
        overwrite: true,
      });
    } else if (sourceStat.type === vscode.FileType.Directory) {
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
  },
};
