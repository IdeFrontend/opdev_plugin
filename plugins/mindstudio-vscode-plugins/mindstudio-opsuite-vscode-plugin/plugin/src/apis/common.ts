import fs from 'node:fs';

import compressing from 'compressing';
import * as vscode from 'vscode';

import { ApiGroup } from 'plugin:/core/ApiServer';
import { CheckPathExistsParams, SaveFileParams } from 'shared:/api-types';

export const commonApis: ApiGroup = {
  common: {
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
    async saveFileToLocal(params: SaveFileParams): Promise<boolean> {
      const savingUri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.from({ scheme: 'vscode-local', path: params.filename }),
        filters: params.allowedTypes ? { default: params.allowedTypes } : undefined,
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
        vscode.workspace.fs.copy(sourceUri, savingUri);
      } else if (sourceStat.type === vscode.FileType.Directory) {
        await compressing.zip.compressDir(sourceUri.fsPath, `${sourceUri.fsPath}.zip`);
        const zipUri = vscode.Uri.file(`${sourceUri.fsPath}.zip`);
        vscode.workspace.fs.copy(zipUri, savingUri);
        vscode.workspace.fs.delete(zipUri);
        vscode.commands.executeCommand('revealFileInOS', savingUri);
      }
      return true;
    },
  },
};
