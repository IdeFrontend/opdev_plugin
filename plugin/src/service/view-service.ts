import * as vscode from 'vscode';

import { ViewOpener } from '@plugin/core/view/view-opener';

export class ViewService {
  /**
   * Open CSV file preview
   */
  async openCsvFile(filePath: string) {
    const fileUri = vscode.Uri.file(filePath);

    await ViewOpener.openCsvPreview(fileUri);
  }

  /**
   * Open Insight data view
   */
  async openInsight(filePath: string) {
    const fileUri = vscode.Uri.file(filePath);

    await ViewOpener.openInsight(fileUri);
  }

}

export const viewService = new ViewService();
