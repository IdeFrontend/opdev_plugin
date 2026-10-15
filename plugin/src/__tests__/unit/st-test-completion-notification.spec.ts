/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
const mockShowInformationMessage = jest.fn();
const mockShowErrorMessage = jest.fn();
const mockShowQuickPick = jest.fn();
const mockShowTextDocument = jest.fn();
const mockOpenTextDocument = jest.fn();
const mockUriFile = jest.fn((fsPath: string) => ({ fsPath }));
const mockT = jest.fn((key: string, options?: Record<string, unknown>) => {
  switch (key) {
    case 'stTest.completed':
      return `completed:${String(options?.count)}:${String(options?.path)}`;
    case 'stTest.openFile':
      return 'Open File';
    case 'stTest.pickResultFile':
      return 'Select result file';
    case 'stTest.openResultFailed':
      return `open-failed:${String(options?.error)}`;
    default:
      return key;
  }
});

jest.mock('i18next', () => ({ t: mockT }));

jest.mock('vscode', () => ({
  Uri: { file: mockUriFile },
  window: {
    showErrorMessage: mockShowErrorMessage,
    showInformationMessage: mockShowInformationMessage,
    showQuickPick: mockShowQuickPick,
    showTextDocument: mockShowTextDocument,
  },
  workspace: { openTextDocument: mockOpenTextDocument },
}), { virtual: true });

import * as path from 'path';

import {
  resolveStTestDisplayPath,
  showStTestCompletionNotification,
} from '@plugin/helpers/st-test-completion-notification';
import enMessages from '@shared/i18n/en';
import zhCnMessages from '@shared/i18n/zh-cn';

describe('ST test completion notification', () => {
  const workspaceRoot = path.resolve('workspace with spaces');
  const runDirectory = path.join(workspaceRoot, '.vscode', 'st-results', 'add', 'run-id');

  beforeEach(() => {
    jest.clearAllMocks();
    mockShowInformationMessage.mockResolvedValue(undefined);
    mockShowErrorMessage.mockResolvedValue(undefined);
    mockShowQuickPick.mockResolvedValue(undefined);
    mockShowTextDocument.mockResolvedValue(undefined);
    mockOpenTextDocument.mockImplementation(async (uri) => ({ uri }));
    mockUriFile.mockImplementation((fsPath: string) => ({ fsPath }));
  });

  it('shows one in-workspace result as a relative CSV path and opens its exact URI', async () => {
    const outputPath = path.join(runDirectory, 'kernel', '001-add-result.csv');
    const relativeOutputPath = path.relative(workspaceRoot, outputPath);

    mockShowInformationMessage.mockResolvedValue('Open File');

    await showStTestCompletionNotification({
      workspaceRoot,
      outputPaths: [outputPath],
      runDirectory,
    });

    expect(mockShowInformationMessage)
      .toHaveBeenCalledWith(`completed:1:${relativeOutputPath}`, 'Open File');
    expect(mockShowInformationMessage.mock.calls[0][0])
      .not.toContain(workspaceRoot);
    expect(mockShowQuickPick).not.toHaveBeenCalled();
    expect(mockUriFile)
      .toHaveBeenCalledWith(outputPath);
    expect(mockOpenTextDocument)
      .toHaveBeenCalledWith({ fsPath: outputPath });
    expect(mockShowTextDocument)
      .toHaveBeenCalledWith({ uri: { fsPath: outputPath } }, { preview: true });
  });

  it('shows a relative run directory and preserves result order in the multi-file picker', async () => {
    const outputPaths = [
      path.join(runDirectory, 'kernel', '001-add-result.csv'),
      path.join(runDirectory, 'aclnn', '002-add-result.csv'),
    ];

    mockShowInformationMessage.mockResolvedValue('Open File');
    mockShowQuickPick.mockImplementation(async (items) => items[1]);

    await showStTestCompletionNotification({
      workspaceRoot,
      outputPaths,
      runDirectory,
    });

    expect(mockShowInformationMessage)
      .toHaveBeenCalledWith(`completed:2:${path.relative(workspaceRoot, runDirectory)}`, 'Open File');
    expect(mockShowInformationMessage.mock.calls[0][0])
      .not.toContain(workspaceRoot);
    expect(mockShowQuickPick)
      .toHaveBeenCalledWith([
        {
          label: path.relative(workspaceRoot, outputPaths[0]),
          outputPath: outputPaths[0],
        },
        {
          label: path.relative(workspaceRoot, outputPaths[1]),
          outputPath: outputPaths[1],
        },
      ], { placeHolder: 'Select result file' });
    expect(mockUriFile)
      .toHaveBeenCalledWith(outputPaths[1]);
  });

  it('does nothing when the completion notification is dismissed', async () => {
    await showStTestCompletionNotification({
      workspaceRoot,
      outputPaths: [path.join(runDirectory, 'kernel', '001-add-result.csv')],
      runDirectory,
    });

    expect(mockShowQuickPick).not.toHaveBeenCalled();
    expect(mockOpenTextDocument).not.toHaveBeenCalled();
  });

  it('does nothing when the multi-file picker is cancelled', async () => {
    mockShowInformationMessage.mockResolvedValue('Open File');

    await showStTestCompletionNotification({
      workspaceRoot,
      outputPaths: [
        path.join(runDirectory, 'kernel', '001-add-result.csv'),
        path.join(runDirectory, 'kernel', '002-add-result.csv'),
      ],
      runDirectory,
    });

    expect(mockShowQuickPick)
      .toHaveBeenCalledTimes(1);
    expect(mockOpenTextDocument).not.toHaveBeenCalled();
  });

  it('uses an absolute display path instead of traversal for an outside result', async () => {
    const outsidePath = path.resolve(path.dirname(workspaceRoot), 'outside', 'result.csv');

    await showStTestCompletionNotification({
      workspaceRoot,
      outputPaths: [outsidePath],
      runDirectory,
    });

    expect(resolveStTestDisplayPath(workspaceRoot, outsidePath))
      .toBe(outsidePath);
    expect(mockShowInformationMessage)
      .toHaveBeenCalledWith(`completed:1:${outsidePath}`, 'Open File');
  });

  it('displays a dot when the target path IS the workspace root', () => {
    expect(resolveStTestDisplayPath(workspaceRoot, workspaceRoot))
      .toBe('.');
  });

  it('treats a target exactly one level above the workspace root as outside', () => {
    const parentDir = path.resolve(workspaceRoot, '..');

    expect(resolveStTestDisplayPath(workspaceRoot, parentDir))
      .toBe(parentDir);
  });

  it('survives a failure while reporting the open failure', async () => {
    const outputPath = path.join(runDirectory, 'kernel', '001-add-result.csv');
    const consoleErrorSpy = jest.spyOn(console, 'error')
      .mockImplementation(() => {});

    mockShowInformationMessage.mockResolvedValue('Open File');
    mockOpenTextDocument.mockRejectedValue(new Error('result was removed'));
    mockShowErrorMessage.mockRejectedValue(new Error('report failed'));

    await expect(showStTestCompletionNotification({
      workspaceRoot,
      outputPaths: [outputPath],
      runDirectory,
    }))
      .resolves.toBeUndefined();

    expect(consoleErrorSpy)
      .toHaveBeenCalledWith('[ST test] Could not report result-file open failure:', expect.any(Error));

    consoleErrorSpy.mockRestore();
  });

  it('stringifies a non-Error open failure and a non-Error report failure', async () => {
    const outputPath = path.join(runDirectory, 'kernel', '001-add-result.csv');
    const consoleErrorSpy = jest.spyOn(console, 'error')
      .mockImplementation(() => {});

    mockShowInformationMessage.mockResolvedValue('Open File');
    mockOpenTextDocument.mockRejectedValue('open failed');
    mockShowErrorMessage.mockRejectedValue('report failed');

    await expect(showStTestCompletionNotification({
      workspaceRoot,
      outputPaths: [outputPath],
      runDirectory,
    }))
      .resolves.toBeUndefined();

    expect(mockShowErrorMessage)
      .toHaveBeenCalledWith('open-failed:open failed');
    expect(consoleErrorSpy)
      .toHaveBeenCalledWith('[ST test] Could not report result-file open failure:', 'report failed');

    consoleErrorSpy.mockRestore();
  });

  it('reports an open failure separately without converting the completed ST run to failure', async () => {
    const outputPath = path.join(runDirectory, 'kernel', '001-add-result.csv');

    mockShowInformationMessage.mockResolvedValue('Open File');
    mockOpenTextDocument.mockRejectedValue(new Error('result was removed'));

    await expect(showStTestCompletionNotification({
      workspaceRoot,
      outputPaths: [outputPath],
      runDirectory,
    }))
      .resolves.toBeUndefined();

    expect(mockShowErrorMessage)
      .toHaveBeenCalledWith('open-failed:result was removed');
    expect(mockShowTextDocument).not.toHaveBeenCalled();
    expect(mockT.mock.calls.some(([key]) => key === 'stTest.failed'))
      .toBe(false);
  });

  it('defines matching English and Chinese strings for every completion interaction', () => {
    const keys = [
      'stTest.openFile',
      'stTest.pickResultFile',
      'stTest.openResultFailed',
      'stTest.results.invalidStatusWithCsv',
      'stTest.results.errorDetail.record',
      'stTest.results.errorDetail.bytes',
      'stTest.results.errorDetail.header',
      'stTest.results.errorDetail.rows',
    ] as const;

    keys.forEach((key) => {
      expect(enMessages[key])
        .toBeTruthy();
      expect(zhCnMessages[key])
        .toBeTruthy();
    });
    expect(enMessages['stTest.completed'])
      .toContain('{{count}}');
    expect(enMessages['stTest.completed'])
      .toContain('{{path}}');
    expect(enMessages['stTest.completed'])
      .toContain(enMessages['stTest.openFile']);
    expect(enMessages['stTest.completed'].toLowerCase())
      .not.toContain('panel');
    expect(zhCnMessages['stTest.completed'])
      .toContain('{{count}}');
    expect(zhCnMessages['stTest.completed'])
      .toContain('{{path}}');
    expect(zhCnMessages['stTest.completed'])
      .toContain(zhCnMessages['stTest.openFile']);
    expect(zhCnMessages['stTest.completed'])
      .not.toContain('面板');
    expect(zhCnMessages['stTest.results.errorDetail.record'])
      .not.toMatch(/record|rows|bytes/i);
    expect(zhCnMessages['stTest.results.errorDetail.bytes'])
      .not.toMatch(/record|rows|bytes/i);
    expect(zhCnMessages['stTest.results.errorDetail.rows'])
      .not.toMatch(/record|rows|bytes/i);
  });
});
