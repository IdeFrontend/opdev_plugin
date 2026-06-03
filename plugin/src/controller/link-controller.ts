import { t } from 'i18next';
import * as vscode from 'vscode';
import * as fs from 'fs';

import {
  OpenFileParams,
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
};
