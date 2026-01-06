import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { projectService } from '@plugin/service/project-service';
import { configService } from '@plugin/service/config-service';
import {
  OpenFileParams, OpenLinkParams,
} from '@shared/api-types';

export const linkMethods = {
  /**
   * 打开文件
   * @param params 打开文件参数
   */
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
    }
    else {
      vscode.window.showErrorMessage(`文件不存在: ${filePath}`);
    }
  },

  /**
   * 打开链接
   * @param params 打开链接参数
   */
  async openLink(params: OpenLinkParams): Promise<void> {
    vscode.env.openExternal(vscode.Uri.parse(params.url));
  },

  /**
   * 检查 .vscode 文件夹权限
   * @returns 检查结果
   */
  async checkVscodeFolder(): Promise<boolean> {
    return await projectService.checkVscode();
  },

  /**
   * 检查 devtool_config.json
   * @returns 检查结果
   */
  async checkDevtoolConfig(): Promise<boolean> {
    return await configService.checkDevtoolConfig();
  },
};
