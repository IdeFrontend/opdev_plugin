import * as vscode from 'vscode';

import { ViewOpener } from '@plugin/core/view/view-opener';
import { COMMAND_OPEN_MS_SANITIZER_PANEL_VIEW } from '@plugin/constants';

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

  /**
   * Open anomaly detection (sanitizer) panel
   */
  openMsSanitizerPanelView(params: unknown) {
    // Open anomaly detection data panel
    vscode.commands.executeCommand(
      COMMAND_OPEN_MS_SANITIZER_PANEL_VIEW,
      params,
    );
  }
}

export const viewService = new ViewService();
