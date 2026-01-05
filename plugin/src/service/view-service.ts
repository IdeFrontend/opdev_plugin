import * as vscode from 'vscode';

import { ViewOpener } from '../core/view/view-opener';
import { COMMAND_OPEN_MS_SANITIZER_PANEL_VIEW } from '../constants';

export class ViewService {
  /**
   * 打开 CSV 文件预览
   */
  async openCsvFile(filePath: string) {
    const fileUri = vscode.Uri.file(filePath);

    await ViewOpener.openCsvPreview(fileUri);
  }

  /**
   * 打开 Insight 数据视图
   */
  async openInsight(filePath: string) {
    const fileUri = vscode.Uri.file(filePath);

    await ViewOpener.openInsight(fileUri);
  }

  /**
   * 打开异常检测面板
   */
  openMsSanitizerPanelView(params: any) {
    // 打开异常检测数据面板
    vscode.commands.executeCommand(
      COMMAND_OPEN_MS_SANITIZER_PANEL_VIEW,
      params,
    );
  }
}

export const viewService = new ViewService();
