/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
const mockTranslateOptions = jest.fn();

jest.mock('i18next', () => ({
  t: (key: string, opts?: unknown) => {
    mockTranslateOptions(opts);

    return key;
  },
}));

const mockGetPerformanceRunData = jest.fn();
const mockTogglePerformanceRecordMark = jest.fn();
const mockSaveFileToLocal = jest.fn();
const mockStat = jest.fn();
const mockReadDirectory = jest.fn();
const mockReadFile = jest.fn();
const mockClipboardWriteText = jest.fn();
const mockShowWarningMessage = jest.fn();
const mockShowInformationMessage = jest.fn();
const mockShowErrorMessage = jest.fn();
const mockWithProgress = jest.fn();
const mockExecuteCommand = jest.fn();
const mockProgress = { report: jest.fn() };

jest.mock('vscode', () => ({
  FileType: {
    Unknown: 0,
    File: 1,
    Directory: 2,
    SymbolicLink: 64,
  },
  Uri: {
    file: (fsPath: string) => ({ fsPath }),
    joinPath: (uri: { fsPath: string }, ...segments: string[]) => ({
      fsPath: [
        uri.fsPath,
        ...segments,
      ].join('/'),
    }),
  },
  ProgressLocation: { Notification: 15 },
  workspace: {
    fs: {
      stat: mockStat,
      readDirectory: mockReadDirectory,
      readFile: mockReadFile,
    },
  },
  env: { clipboard: { writeText: mockClipboardWriteText } },
  window: {
    showWarningMessage: mockShowWarningMessage,
    showInformationMessage: mockShowInformationMessage,
    showErrorMessage: mockShowErrorMessage,
    withProgress: mockWithProgress,
  },
  commands: { executeCommand: mockExecuteCommand },
}));

jest.mock('adm-zip', () => jest.fn());

jest.mock('@plugin/service/run-data-service', () => ({
  runDataService: {
    getPerformanceRunData: mockGetPerformanceRunData,
    togglePerformanceRecordMark: mockTogglePerformanceRecordMark,
  },
}));

jest.mock('@plugin/service/file-service', () => ({ fileService: { saveFileToLocal: mockSaveFileToLocal } }));

import * as path from 'path';
import * as vscode from 'vscode';
import { performanceMethods } from '@plugin/controller/performance-data-controller';

describe('performanceMethods.getRunData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPerformanceRunData.mockResolvedValue({ data: [] });
  });

  it('returns the run data provided by the run data service', async () => {
    const params = {
      sort: {
        by: 'time',
        order: 'desc',
      },
    };

    mockGetPerformanceRunData.mockResolvedValue({
      data: [
        {
          id: 'run-1',
          status: 'finished',
        },
      ],
    });

    const result = await performanceMethods.getRunData(params);

    expect(mockGetPerformanceRunData)
      .toHaveBeenCalledWith(params);
    expect(result)
      .toEqual({
        data: [
          {
            id: 'run-1',
            status: 'finished',
          },
        ],
      });
  });

  it('propagates failures from the run data service', async () => {
    mockGetPerformanceRunData.mockRejectedValue(new Error('cache corrupted'));

    await expect(performanceMethods.getRunData({} as never))
      .rejects
      .toThrow('cache corrupted');
  });
});

describe('performanceMethods.toggleRecordMark', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('forwards the mark parameters to the run data service', () => {
    const params = {
      recordId: 'run-1',
      marked: true,
    };

    performanceMethods.toggleRecordMark(params);

    expect(mockTogglePerformanceRecordMark)
      .toHaveBeenCalledWith(params);
  });
});

describe('performanceMethods.copyReport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStat.mockResolvedValue({ type: vscode.FileType.Directory });
    mockReadDirectory.mockResolvedValue([
      [
        'a.txt',
        vscode.FileType.File,
      ],
    ]);
    mockReadFile.mockResolvedValue(Buffer.from('hello'));
    mockClipboardWriteText.mockResolvedValue(undefined);
  });

  it('rejects with a path-empty error before touching the file system', async () => {
    await expect(performanceMethods.copyReport({ dirPath: '' }))
      .rejects
      .toThrow('performanceData.dirPathEmpty');
    expect(mockStat)
      .not.toHaveBeenCalled();
    expect(mockShowErrorMessage)
      .not.toHaveBeenCalled();
  });

  it('rejects when the directory does not exist', async () => {
    mockStat.mockRejectedValue(new Error('ENOENT'));

    await expect(performanceMethods.copyReport({ dirPath: '/ws/missing' }))
      .rejects
      .toThrow('performanceData.dirNotExist');
    expect(mockShowErrorMessage)
      .toHaveBeenCalledWith(expect.stringContaining('performanceData.copyReportFailed'));
  });

  it('rejects when the path is not a directory', async () => {
    mockStat.mockResolvedValue({ type: vscode.FileType.File });

    // The pathNotDir error raised inside the stat try-block is swallowed by
    // its adjacent catch, so callers observe the dirNotExist error instead.
    await expect(performanceMethods.copyReport({ dirPath: '/ws/run.txt' }))
      .rejects
      .toThrow('performanceData.dirNotExist');
    expect(mockShowErrorMessage)
      .toHaveBeenCalledWith(expect.stringContaining('performanceData.copyReportFailed'));
  });

  it('warns and skips the copy when the directory contains no files', async () => {
    mockReadDirectory.mockResolvedValue([]);

    await performanceMethods.copyReport({ dirPath: '/ws/empty' });

    expect(mockShowWarningMessage)
      .toHaveBeenCalledWith('performanceData.dirEmptyNoCopy');
    expect(mockClipboardWriteText)
      .not.toHaveBeenCalled();
    expect(mockShowInformationMessage)
      .not.toHaveBeenCalled();
  });

  it('copies the combined file contents to the clipboard and confirms', async () => {
    await performanceMethods.copyReport({ dirPath: '/ws/report' });

    expect(mockClipboardWriteText)
      .toHaveBeenCalledWith('\n========== a.txt ==========\nhello\n');
    expect(mockShowInformationMessage)
      .toHaveBeenCalledWith('performanceData.reportCopied');
    expect(mockShowWarningMessage)
      .not.toHaveBeenCalled();
  });

  it('recurses into subdirectories with paths relative to the report root', async () => {
    mockReadDirectory
      .mockResolvedValueOnce([
        [
          'sub',
          vscode.FileType.Directory,
        ],
      ])
      .mockResolvedValue([
        [
          'a.txt',
          vscode.FileType.File,
        ],
      ]);
    mockReadFile.mockResolvedValue(Buffer.from('nested content'));

    await performanceMethods.copyReport({ dirPath: '/ws/report' });

    expect(mockReadDirectory)
      .toHaveBeenCalledTimes(2);
    expect(mockClipboardWriteText)
      .toHaveBeenCalledWith(`\n========== ${path.join('sub', 'a.txt')} ==========\nnested content\n`);
  });

  it('keeps going when one file cannot be read and marks the failed line', async () => {
    mockReadFile.mockRejectedValue(new Error('EACCES'));

    await performanceMethods.copyReport({ dirPath: '/ws/report' });

    expect(mockClipboardWriteText)
      .toHaveBeenCalledWith('\n========== a.txt ==========\nperformanceData.fileReadFailedLine\n');
    expect(mockShowInformationMessage)
      .toHaveBeenCalledWith('performanceData.reportCopied');
  });

  it('skips entries that are neither files nor directories', async () => {
    mockReadDirectory.mockResolvedValue([
      [
        'link.txt',
        vscode.FileType.SymbolicLink,
      ],
    ]);

    await performanceMethods.copyReport({ dirPath: '/ws/report' });

    expect(mockClipboardWriteText)
      .not.toHaveBeenCalled();
    expect(mockShowWarningMessage)
      .toHaveBeenCalledWith('performanceData.dirEmptyNoCopy');
  });

  it('renders non-Error read failures as their string form', async () => {
    mockReadFile.mockRejectedValue('EACCES raw');

    await performanceMethods.copyReport({ dirPath: '/ws/report' });

    expect(mockClipboardWriteText)
      .toHaveBeenCalledWith('\n========== a.txt ==========\nperformanceData.fileReadFailedLine\n');
    expect(mockTranslateOptions)
      .toHaveBeenCalledWith({ error: 'EACCES raw' });
    expect(mockShowInformationMessage)
      .toHaveBeenCalledWith('performanceData.reportCopied');
  });

  it('shows the copy failure and rethrows when writing the clipboard fails', async () => {
    mockClipboardWriteText.mockRejectedValue(new Error('clipboard denied'));

    await expect(performanceMethods.copyReport({ dirPath: '/ws/report' }))
      .rejects
      .toThrow('clipboard denied');
    expect(mockShowErrorMessage)
      .toHaveBeenCalledWith(expect.stringContaining('performanceData.copyReportFailed'));
  });

  it('renders non-Error clipboard failures as their string form and rethrows', async () => {
    mockClipboardWriteText.mockRejectedValue('clipboard denied raw');

    await expect(performanceMethods.copyReport({ dirPath: '/ws/report' }))
      .rejects
      .toBe('clipboard denied raw');
    expect(mockShowErrorMessage)
      .toHaveBeenCalledWith(expect.stringContaining('performanceData.copyReportFailed'));
    expect(mockTranslateOptions)
      .toHaveBeenCalledWith({ error: 'clipboard denied raw' });
  });
});

describe('performanceMethods.downloadReport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStat.mockResolvedValue({ type: vscode.FileType.Directory });
    mockWithProgress.mockImplementation(async (_options: unknown, callback: (progress: typeof mockProgress)=> Promise<void>) => {
      await callback(mockProgress);
    });
  });

  it('rejects with a path-empty error before showing progress', async () => {
    await expect(performanceMethods.downloadReport({ dirPath: '' }))
      .rejects
      .toThrow('performanceData.dirPathEmpty');
    expect(mockWithProgress)
      .not.toHaveBeenCalled();
  });

  it('runs the download under a notification progress with an initial report', async () => {
    mockSaveFileToLocal.mockResolvedValue(true);

    await performanceMethods.downloadReport({ dirPath: '/ws/report' });

    expect(mockWithProgress)
      .toHaveBeenCalledWith(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'performanceData.downloadingReport',
          cancellable: false,
        },
        expect.any(Function),
      );
    expect(mockProgress.report)
      .toHaveBeenCalledWith({
        increment: 0,
        message: 'performanceData.checkingDir',
      });
  });

  it('rejects when the directory does not exist', async () => {
    mockStat.mockRejectedValue(new Error('ENOENT'));

    await expect(performanceMethods.downloadReport({ dirPath: '/ws/missing' }))
      .rejects
      .toThrow('performanceData.dirNotExist');
    expect(mockSaveFileToLocal)
      .not.toHaveBeenCalled();
  });

  it('rejects when the path is not a directory', async () => {
    mockStat.mockResolvedValue({ type: vscode.FileType.File });

    // The pathNotDir error raised inside the stat try-block is swallowed by
    // its adjacent catch, so callers observe the dirNotExist error instead.
    await expect(performanceMethods.downloadReport({ dirPath: '/ws/run.txt' }))
      .rejects
      .toThrow('performanceData.dirNotExist');
    expect(mockSaveFileToLocal)
      .not.toHaveBeenCalled();
  });

  it('completes the progress and confirms when the file is saved', async () => {
    mockSaveFileToLocal.mockResolvedValue(true);

    await performanceMethods.downloadReport({ dirPath: '/ws/report' });

    expect(mockSaveFileToLocal)
      .toHaveBeenCalledWith(expect.objectContaining({
        sourcePath: '/ws/report',
        filename: 'report.zip',
        dialogTitle: 'performanceData.saveReportFile',
        allowedTypes: ['zip'],
      }));
    expect(mockProgress.report)
      .toHaveBeenCalledWith({
        increment: 20,
        message: 'performanceData.preparingDownload',
      });
    expect(mockProgress.report)
      .toHaveBeenCalledWith({
        increment: 100,
        message: 'performanceData.downloadComplete',
      });
    expect(mockShowInformationMessage)
      .toHaveBeenCalledWith('performanceData.fileDownloaded');
  });

  it('reports completion without a prompt for web-version downloads', async () => {
    mockSaveFileToLocal.mockResolvedValue({
      data: 'base64zip',
      filename: 'report.zip',
    });

    await performanceMethods.downloadReport({ dirPath: '/ws/report' });

    expect(mockProgress.report)
      .toHaveBeenCalledWith({
        increment: 100,
        message: 'performanceData.downloadComplete',
      });
    expect(mockShowInformationMessage)
      .not.toHaveBeenCalled();
  });

  it('informs the user when the save dialog is cancelled', async () => {
    mockSaveFileToLocal.mockResolvedValue(false);

    await performanceMethods.downloadReport({ dirPath: '/ws/report' });

    expect(mockShowInformationMessage)
      .toHaveBeenCalledWith('performanceData.downloadCancelled');
    expect(mockProgress.report)
      .not.toHaveBeenCalledWith(expect.objectContaining({ increment: 100 }));
  });

  it('shows the download failure and rethrows when saving fails', async () => {
    mockSaveFileToLocal.mockRejectedValue(new Error('disk full'));

    await expect(performanceMethods.downloadReport({ dirPath: '/ws/report' }))
      .rejects
      .toThrow('disk full');
    expect(mockShowErrorMessage)
      .toHaveBeenCalledWith(expect.stringContaining('performanceData.downloadReportFailed'));
  });

  it('renders non-Error save failures as their string form and rethrows', async () => {
    mockSaveFileToLocal.mockRejectedValue('disk full raw');

    await expect(performanceMethods.downloadReport({ dirPath: '/ws/report' }))
      .rejects
      .toBe('disk full raw');
    expect(mockShowErrorMessage)
      .toHaveBeenCalledWith(expect.stringContaining('performanceData.downloadReportFailed'));
    expect(mockTranslateOptions)
      .toHaveBeenCalledWith({ error: 'disk full raw' });
  });
});

describe('performanceMethods.diffFiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExecuteCommand.mockResolvedValue(undefined);
  });

  it('informs the user when the first file path is missing', async () => {
    await performanceMethods.diffFiles({
      filePath1: '',
      filePath2: '/ws/b.txt',
    });

    expect(mockShowErrorMessage)
      .toHaveBeenCalledWith('performanceData.missingFilePath');
    expect(mockExecuteCommand)
      .not.toHaveBeenCalled();
  });

  it('informs the user when the second file path is missing', async () => {
    await performanceMethods.diffFiles({
      filePath1: '/ws/a.txt',
      filePath2: '',
    });

    expect(mockShowErrorMessage)
      .toHaveBeenCalledWith('performanceData.missingFilePath');
    expect(mockExecuteCommand)
      .not.toHaveBeenCalled();
  });

  it('opens the built-in diff view with both files and their names', async () => {
    await performanceMethods.diffFiles({
      filePath1: '/ws/report/a.txt',
      filePath2: '/ws/report/b.txt',
    });

    expect(mockExecuteCommand)
      .toHaveBeenCalledWith(
        'vscode.diff',
        { fsPath: '/ws/report/a.txt' },
        { fsPath: '/ws/report/b.txt' },
        '对比: a.txt ↔ b.txt',
      );
    expect(mockShowErrorMessage)
      .not.toHaveBeenCalled();
  });

  it('shows the compare failure without rethrowing when the command fails', async () => {
    const errorSpy = jest.spyOn(console, 'error')
      .mockImplementation();

    mockExecuteCommand.mockRejectedValue(new Error('no diff provider'));

    await expect(performanceMethods.diffFiles({
      filePath1: '/ws/a.txt',
      filePath2: '/ws/b.txt',
    }))
      .resolves
      .toBeUndefined();
    expect(mockShowErrorMessage)
      .toHaveBeenCalledWith(expect.stringContaining('performanceData.fileCompareFailed'));
    errorSpy.mockRestore();
  });
});
