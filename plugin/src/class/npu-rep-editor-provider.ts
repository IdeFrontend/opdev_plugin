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

import { NPU_REP_EDITOR_VIEW_TYPE } from '@plugin/constants';
import { ViewOpener } from '@plugin/core/view/view-opener';

/**
 * Default editor for binary `.npu-rep` / `.npu.rep` reports. Problems and
 * Explorer open this URI as the active editor; the provided webview hosts the
 * profiling-report UI (no dispose-and-reopen router tab).
 */
export class NpuRepEditorProvider implements vscode.CustomReadonlyEditorProvider {
  public static readonly viewType = NPU_REP_EDITOR_VIEW_TYPE;

  public async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken,
  ): Promise<vscode.CustomDocument> {
    return {
      uri,
      dispose: () => undefined,
    };
  }

  public async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    await ViewOpener.openProfilingReport(document.uri, webviewPanel);
  }
}
