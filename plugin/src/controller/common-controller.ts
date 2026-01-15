import {
  CheckPathExistsParams, SaveFileParams,
} from '@shared/api-types';
import { fileService } from '@plugin/service/file-service';
import * as vscode from 'vscode';

export const commonMethods = {
  /**
   * 检查路径是否存在
   */
  pathExists(params: CheckPathExistsParams): Promise<boolean> {
    return fileService.pathExists(params);
  },

  /**
   * 保存文件到本地
   */
  async saveFileToLocal(params: SaveFileParams): Promise<boolean> {
    return await fileService.saveFileToLocal(params);
  },

  /**
   * 打开外部网站
   */
  openExternalLink(url: string) {
    vscode.env.openExternal(vscode.Uri.parse(url));
  },

  /**
   * 执行 VSCode 命令
   */
  async executeVscodeCommand(params: { command: string; args: any[] }) {
    const { command, args } = params;
    return await vscode.commands.executeCommand(command, ...args);
  },
};
