import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { ApiGroup } from 'plugin:/core/ApiServer';
import { opsApis, OpsApi } from './ops';
import { OpenFileParams, OpenLinkParams } from 'shared:/api-types';

// 获取正确类型的 ops API
const ops = opsApis.ops as unknown as OpsApi;

export const linkApis: ApiGroup = {
  webview: {
    // 打开文件
    async openFile(params: OpenFileParams): Promise<void> {
      // 兼容以前的逻辑
      const filePath = params.file;
      const workspaceFolders = vscode.workspace.workspaceFolders;

      if (!workspaceFolders) {
        return;
      }
      const workspacePath = workspaceFolders[0].uri.fsPath;
      const absolutePath = path.join(workspacePath, filePath);

      if (fs.existsSync(absolutePath)) {
        vscode.commands.executeCommand(
          'vscode.open',
          vscode.Uri.file(absolutePath),
        );
      } else {
        vscode.window.showErrorMessage(`文件不存在: ${filePath}`);
      }
    },

    // 打开链接
    async openLink(params: OpenLinkParams): Promise<void> {
      vscode.env.openExternal(vscode.Uri.parse(params.url));
    },

    // 检查 .vscode 文件夹权限
    async checkVscodeFolder(): Promise<boolean> {
      return await ops.checkVscode();
    },

    // 检查 devtool_config.json
    async checkDevtoolConfig(): Promise<boolean> {
      return await ops.checkDevtoolConfig();
    },
  },
};
