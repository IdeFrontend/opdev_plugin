import * as vscode from 'vscode';

import { ApiGroup } from 'plugin:/core/ApiServer';
import { ViewOpener } from 'plugin:/services/view/ViewOpener';

export const viewApis: ApiGroup = {
  view: {
    openCsvFile(filePath: string) {
      const fileUri = vscode.Uri.file(filePath);

      ViewOpener.openCsvPreview(fileUri);
    },
    openInsight(filePath: string) {
      const fileUri = vscode.Uri.file(filePath);

      ViewOpener.openInsight(fileUri);
    },
    // 打开检测面板
    openMsSanitizerPanelView() {
      // TODO
      // 1、根据id找到文件
      // 2、解析文件内容并生成数据
      // 3、打开面板
      // vscode.commands.executeCommand('setContext', 'msSanitizer.viewOpen', true);
    },
  },
};
