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
  },
};
