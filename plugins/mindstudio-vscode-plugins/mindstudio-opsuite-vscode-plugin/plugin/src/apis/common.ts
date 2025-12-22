import fs from 'node:fs';

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
        title: params.title ?? '保存至',
      });
      if (!savingUri) {
        return false;
      }
      console.log('handle save', savingUri);
      // TODO 写入文件
      return true;
    },
  },
};
