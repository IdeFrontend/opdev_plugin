/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
jest.mock('vscode', () => ({
  Uri: {
    file: (fsPath: string) => ({
      fsPath,
      toString: () => `file://${fsPath}`,
    }),
  },
}));

jest.mock('@plugin/core/view/view-opener', () => ({ ViewOpener: { openProfilingReport: jest.fn(async () => undefined) } }));

import * as vscode from 'vscode';

import { NpuRepEditorProvider } from '@plugin/class/npu-rep-editor-provider';
import { NPU_REP_EDITOR_VIEW_TYPE } from '@plugin/constants';
import { ViewOpener } from '@plugin/core/view/view-opener';

describe('NpuRepEditorProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exposes the package.json custom editor view type', () => {
    expect(NpuRepEditorProvider.viewType)
      .toBe(NPU_REP_EDITOR_VIEW_TYPE);
  });

  it('hosts the profiling report in the custom-editor webview panel', async () => {
    const provider = new NpuRepEditorProvider();
    const uri = vscode.Uri.file('/tmp/gelu.npu-rep');
    const document = await provider.openCustomDocument(
      uri,
      {} as vscode.CustomDocumentOpenContext,
      {} as vscode.CancellationToken,
    );
    const dispose = jest.fn();
    const webviewPanel = { dispose } as unknown as vscode.WebviewPanel;

    await provider.resolveCustomEditor(
      document,
      webviewPanel,
      {} as vscode.CancellationToken,
    );

    expect(ViewOpener.openProfilingReport)
      .toHaveBeenCalledWith(uri, webviewPanel);
    expect(dispose)
      .not
      .toHaveBeenCalled();
  });

  it('does not dispose the custom-editor tab when opening the report fails', async () => {
    const provider = new NpuRepEditorProvider();
    const uri = vscode.Uri.file('/tmp/broken.npu-rep');
    const document = await provider.openCustomDocument(
      uri,
      {} as vscode.CustomDocumentOpenContext,
      {} as vscode.CancellationToken,
    );
    const dispose = jest.fn();
    const webviewPanel = { dispose } as unknown as vscode.WebviewPanel;
    const openProfilingReport = ViewOpener.openProfilingReport as jest.Mock;

    openProfilingReport.mockRejectedValueOnce(new Error('panel failed'));

    await expect(provider.resolveCustomEditor(
      document,
      webviewPanel,
      {} as vscode.CancellationToken,
    ))
      .rejects
      .toThrow('panel failed');

    expect(dispose)
      .not
      .toHaveBeenCalled();
  });
});
