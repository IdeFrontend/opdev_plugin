/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
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

  /**
   * Open profiling report
   */
  async openProfilingReport(filePath: string) {
    const fileUri = vscode.Uri.file(filePath);

    await ViewOpener.openProfilingReport(fileUri);
  }

}

export const viewService = new ViewService();
