import {
  CheckPathExistsParams, SaveFileParams, SaveFileResult,
} from '@shared/api-types';
import { fileService } from '@plugin/service/file-service';
import * as vscode from 'vscode';

export const commonMethods = {
  /**
   * Check if the path exists
   */
  pathExists(params: CheckPathExistsParams): Promise<boolean> {
    return fileService.pathExists(params);
  },

  /**
   * Save file locally
   * The web version returns file data, the desktop version returns boolean
   */
  async saveFileToLocal(params: SaveFileParams): Promise<SaveFileResult> {
    return await fileService.saveFileToLocal(params);
  },

  /**
   * Open external website
   */
  openExternalLink(url: string) {
    vscode.env.openExternal(vscode.Uri.parse(url));
  },

  /**
   * Execute VSCode command
   */
  async executeVscodeCommand(params: { command: string; args: any[] }) {
    const { command, args } = params;
    return await vscode.commands.executeCommand(command, ...args);
  },
};
