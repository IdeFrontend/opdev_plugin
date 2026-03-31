import { t } from 'i18next';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { projectService } from '@plugin/service/project-service';
import { configService } from '@plugin/service/config-service';
import {
  OpenFileParams,
  OpenLinkParams,
} from '@shared/api-types';

export const linkMethods = {
  /**
   * open file
   * @param params open file parameters
   */
  async openFile(params: OpenFileParams): Promise<void> {
    // Compatible with previous logic
    const filePath = params.file;
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) {
      return;
    }

    if (fs.existsSync(filePath)) {
      vscode.commands.executeCommand(
        'vscode.open',
        vscode.Uri.file(filePath),
      );
    }
    else {
      vscode.window.showErrorMessage(t('link.fileNotExist', { path: filePath }));
    }
  },

  /**
   * open link
   * @param params open link parameters
   */
  async openLink(params: OpenLinkParams): Promise<void> {
    vscode.env.openExternal(vscode.Uri.parse(params.url));
  },

  /**
   * Check .vscode folder permissions
   * @returns check results
   */
  async checkVscodeFolder(): Promise<boolean> {
    return await projectService.checkVscode();
  },

  /**
   * Check devtool_config.json
   * @returns check results
   */
  async checkDevtoolConfig(): Promise<boolean> {
    return await configService.checkDevtoolConfig();
  },
};
