/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import path from 'node:path';

import { CSV_VIEWER_VIEW_TYPE } from '@shared/flavor';
import { ViewOpener } from '@plugin/core/view/view-opener';

jest.mock('i18next', () => ({
  t: jest.fn((key: string, options?: { error?: string }) => (
    options?.error !== undefined ? `${key}: ${options.error}` : key
  )),
}));

jest.mock('vscode', () => {
  const pathModule = jest.requireActual<typeof import('node:path')>('node:path');
  const visibleTextEditors: Array<{ document: { uri: { fsPath: string } } }> = [];

  return {
    Uri: {
      file: (fsPath: string) => ({ fsPath }),
      joinPath: (uri: { fsPath: string }, ...segments: string[]) => (
        { fsPath: pathModule.join(uri.fsPath, ...segments) }
      ),
    },
    commands: {
      executeCommand: jest.fn()
        .mockResolvedValue(undefined),
    },
    window: {
      visibleTextEditors,
      showTextDocument: jest.fn()
        .mockResolvedValue(undefined),
      showErrorMessage: jest.fn(),
    },
  };
});

jest.mock('@plugin/class/insight-data-viewer-panel', () => ({ InsightDataViewerPanel: { createOrShow: jest.fn() } }));

import * as vscode from 'vscode';
import { InsightDataViewerPanel } from '@plugin/class/insight-data-viewer-panel';

const executeCommandMock = vscode.commands.executeCommand as jest.MockedFunction<typeof vscode.commands.executeCommand>;
const showTextDocumentMock = vscode.window.showTextDocument as jest.MockedFunction<typeof vscode.window.showTextDocument>;
const showErrorMessageMock = vscode.window.showErrorMessage as jest.MockedFunction<typeof vscode.window.showErrorMessage>;
const createOrShowMock = InsightDataViewerPanel.createOrShow as jest.Mock;
const visibleTextEditors = (jest.requireMock('vscode') as {
  window: { visibleTextEditors: Array<{ document: { uri: { fsPath: string } } }> };
}).window.visibleTextEditors;

describe('ViewOpener.openCsvPreview', () => {
  beforeEach(() => {
    visibleTextEditors.length = 0;
    executeCommandMock.mockClear();
    showTextDocumentMock.mockClear();
  });

  it('opens the CSV with the custom viewer and records the directory', async () => {
    const dir = path.join(fakeTestRoot(), 'csv-open-a');
    const uri = vscode.Uri.file(path.join(dir, 'report.csv'));

    await ViewOpener.openCsvPreview(uri);

    expect(executeCommandMock)
      .toHaveBeenCalledWith('vscode.openWith', uri, CSV_VIEWER_VIEW_TYPE);
    expect(showTextDocumentMock)
      .not.toHaveBeenCalled();
  });

  it('does not close anything when the same file is opened again', async () => {
    const dir = path.join(fakeTestRoot(), 'csv-open-b');
    const uri = vscode.Uri.file(path.join(dir, 'report.csv'));

    await ViewOpener.openCsvPreview(uri);
    await ViewOpener.openCsvPreview(uri);

    expect(executeCommandMock)
      .toHaveBeenCalledTimes(2);
    expect(showTextDocumentMock)
      .not.toHaveBeenCalled();
  });

  it('closes the previously opened file in the same directory once the new file is open', async () => {
    const dir = path.join(fakeTestRoot(), 'csv-open-c');
    const firstUri = vscode.Uri.file(path.join(dir, 'first.csv'));
    const secondUri = vscode.Uri.file(path.join(dir, 'second.csv'));

    await ViewOpener.openCsvPreview(firstUri);

    visibleTextEditors.push({ document: { uri: firstUri } });

    await ViewOpener.openCsvPreview(secondUri);

    expect(showTextDocumentMock)
      .toHaveBeenCalledWith({ uri: firstUri }, { preview: false });
    expect(executeCommandMock)
      .toHaveBeenLastCalledWith('workbench.action.closeActiveEditor');
  });

  it('skips the close loop when the old file is no longer visible', async () => {
    const dir = path.join(fakeTestRoot(), 'csv-open-d');
    const firstUri = vscode.Uri.file(path.join(dir, 'first.csv'));
    const secondUri = vscode.Uri.file(path.join(dir, 'second.csv'));

    await ViewOpener.openCsvPreview(firstUri);
    await ViewOpener.openCsvPreview(secondUri);

    expect(showTextDocumentMock)
      .not.toHaveBeenCalled();
    expect(executeCommandMock)
      .not.toHaveBeenCalledWith('workbench.action.closeActiveEditor');
  });

  it('ignores path case when deciding whether a directory is already open', async () => {
    const upperUri = vscode.Uri.file('C:/Repo/Mixed Case/first.csv');
    const lowerUri = vscode.Uri.file('c:/repo/mixed case/second.csv');

    await ViewOpener.openCsvPreview(upperUri);

    visibleTextEditors.push({ document: { uri: upperUri } });

    await ViewOpener.openCsvPreview(lowerUri);

    expect(showTextDocumentMock)
      .toHaveBeenCalledWith({ uri: upperUri }, { preview: false });
  });
});

describe('ViewOpener.openInsight', () => {
  afterEach(() => {
    delete (globalThis as unknown as { extensionContext?: unknown }).extensionContext;
    createOrShowMock.mockReset();
    showErrorMessageMock.mockClear();
  });

  it('reports an empty bin path and does not open a panel', async () => {
    (globalThis as unknown as { extensionContext: unknown }).extensionContext = { extensionId: 'stub' };

    await ViewOpener.openInsight(vscode.Uri.file(''));

    expect(showErrorMessageMock)
      .toHaveBeenCalledWith('view.binPathEmpty');
    expect(createOrShowMock)
      .not.toHaveBeenCalled();
  });

  it('opens the insight panel with the bin path and extension context', async () => {
    const context = { extensionId: 'stub' };

    (globalThis as unknown as { extensionContext: unknown }).extensionContext = context;

    const binPath = path.join(fakeTestRoot(), 'insight', 'profiler.bin');

    await ViewOpener.openInsight(vscode.Uri.file(binPath));

    expect(createOrShowMock)
      .toHaveBeenCalledWith(context, binPath);
  });

  it('surfaces panel creation failures as an error message', async () => {
    (globalThis as unknown as { extensionContext: unknown }).extensionContext = { extensionId: 'stub' };
    createOrShowMock.mockImplementation(() => {
      throw new Error('boom');
    });

    await ViewOpener.openInsight(vscode.Uri.file(path.join(fakeTestRoot(), 'insight', 'profiler.bin')));

    expect(showErrorMessageMock)
      .toHaveBeenCalledWith('view.loadDataFileFailed: Error: boom');
  });
});

/** Stable fake root so the in-memory CSV directory keys do not collide across tests. */
function fakeTestRoot(): string {
  return 'C:/__vscode_view_opener_test__';
}
