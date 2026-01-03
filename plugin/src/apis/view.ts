import * as vscode from 'vscode';

import { ViewOpener } from 'plugin:/services/view/ViewOpener';

export const viewMethods = {
  /**
   * 打开 CSV 文件预览
   * @param filePath CSV 文件路径
   */
  async openCsvFile(filePath: string) {
    const fileUri = vscode.Uri.file(filePath);

    await ViewOpener.openCsvPreview(fileUri);
  },

  /**
   * 打开 Insight 数据视图
   * @param filePath Insight 数据文件路径
   */
  async openInsight(filePath: string) {
    const fileUri = vscode.Uri.file(filePath);

    await ViewOpener.openInsight(fileUri);
  },

  /**
   * 打开异常检测面板 (TODO)
   */
  openMsSanitizerPanelView() {
    // TODO
    // 1、根据id找到文件
    // 2、解析文件内容并生成数据
    // 3、打开面板
    // vscode.commands.executeCommand('setContext', 'msSanitizer.viewOpen', true);
  },
};
