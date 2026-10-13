/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
jest.mock('i18next', () => ({ t: (key: string) => key }));

const mockCollection = {
  set: jest.fn(),
  delete: jest.fn(),
  clear: jest.fn(),
  dispose: jest.fn(),
};
// The controller captures the collection at module scope, so the mock must
// return it from the very first (import-time) call.
const mockCreateDiagnosticCollection = jest.fn(() => mockCollection);
const mockShowOpenDialog = jest.fn();
const mockOpenTextDocument = jest.fn();
const mockShowTextDocument = jest.fn();
const mockStat = jest.fn();
const mockOnDidChangeTextEditorSelection = jest.fn();
const mockShowErrorMessage = jest.fn();
const mockDecorationType = { dispose: jest.fn() };

jest.mock('vscode', () => {
  class Position {
    constructor(
      public line: number,
      public character: number,
    ) {}
  }

  class Range {
    constructor(
      public start: Position,
      public end: Position,
    ) {}
  }

  class Selection {
    constructor(
      public anchor: Position,
      public active: Position,
    ) {}
  }

  class Diagnostic {
    constructor(
      public range: unknown,
      public message: string,
      public severity: number,
    ) {}
  }

  return {
    FileType: {
      Unknown: 0,
      File: 1,
      Directory: 2,
      SymbolicLink: 64,
    },
    Uri: { file: (fsPath: string) => ({ fsPath }) },
    ViewColumn: {
      One: 1,
      Active: 2,
    },
    Position,
    Range,
    Selection,
    Diagnostic,
    DiagnosticSeverity: {
      Error: 0,
      Warning: 1,
      Information: 2,
      Hint: 3,
    },
    TextEditorRevealType: {
      Default: 0,
      InCenter: 1,
      InCenterIfOutsideViewport: 2,
      AtTop: 3,
    },
    languages: { createDiagnosticCollection: mockCreateDiagnosticCollection },
    workspace: {
      fs: { stat: mockStat },
      openTextDocument: mockOpenTextDocument,
    },
    window: {
      showOpenDialog: mockShowOpenDialog,
      showTextDocument: mockShowTextDocument,
      createTextEditorDecorationType: jest.fn(() => mockDecorationType),
      onDidChangeTextEditorSelection: mockOnDidChangeTextEditorSelection,
      showErrorMessage: mockShowErrorMessage,
    },
  };
});

import * as vscode from 'vscode';
import { performanceDataMethods } from '@plugin/controller/performance-controller';

describe('performanceDataMethods.selectFolder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateDiagnosticCollection.mockReturnValue(mockCollection);
    mockShowOpenDialog.mockResolvedValue(undefined);
  });

  it('returns the selected folder path', async () => {
    mockShowOpenDialog.mockResolvedValue([{ fsPath: '/picked' }]);

    const result = await performanceDataMethods.selectFolder();

    expect(result)
      .toBe('/picked');
    expect(mockShowOpenDialog)
      .toHaveBeenCalledWith(expect.objectContaining({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'common.selectFolder',
      }));
  });

  it('returns null when the dialog is cancelled', async () => {
    const result = await performanceDataMethods.selectFolder();

    expect(result)
      .toBeNull();
  });

  it('uses the default path directly when it is an existing directory', async () => {
    mockStat.mockResolvedValue({ type: vscode.FileType.Directory });

    await performanceDataMethods.selectFolder({ defaultPath: '/ws/sub' });

    expect(mockStat)
      .toHaveBeenCalledWith({ fsPath: '/ws/sub' });
    expect(mockShowOpenDialog)
      .toHaveBeenCalledWith(expect.objectContaining({ defaultUri: { fsPath: '/ws/sub' } }));
  });

  it('uses the parent directory when the default path is a file', async () => {
    mockStat.mockResolvedValue({ type: vscode.FileType.File });

    await performanceDataMethods.selectFolder({ defaultPath: '/ws/sub/file.txt' });

    expect(mockShowOpenDialog)
      .toHaveBeenCalledWith(expect.objectContaining({ defaultUri: { fsPath: '/ws/sub' } }));
  });

  it('falls back to the parent directory when the default path is invalid', async () => {
    mockStat.mockRejectedValue(new Error('ENOENT'));

    await performanceDataMethods.selectFolder({ defaultPath: '/ws/missing' });

    expect(mockShowOpenDialog)
      .toHaveBeenCalledWith(expect.objectContaining({ defaultUri: { fsPath: '/ws' } }));
  });

  it('ignores fallback errors when the parent equals the default path', async () => {
    mockStat.mockRejectedValue(new Error('ENOENT'));

    await performanceDataMethods.selectFolder({ defaultPath: '/' });

    expect(mockShowOpenDialog.mock.calls[0][0].defaultUri)
      .toBeUndefined();
  });
});

describe('performanceDataMethods.selectFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateDiagnosticCollection.mockReturnValue(mockCollection);
    mockShowOpenDialog.mockResolvedValue(undefined);
  });

  it('applies the default filters and uses the default path for an existing file', async () => {
    mockStat.mockResolvedValue({ type: vscode.FileType.File });
    mockShowOpenDialog.mockResolvedValue([{ fsPath: '/ws/run.sh' }]);

    const result = await performanceDataMethods.selectFile({ defaultPath: '/ws/run.sh' });

    expect(result)
      .toBe('/ws/run.sh');
    const options = mockShowOpenDialog.mock.calls[0][0];

    expect(options.filters['common.shellScript'])
      .toEqual(['sh']);
    expect(options.filters['common.allFiles'])
      .toEqual(['*']);
    expect(options.defaultUri)
      .toEqual({ fsPath: '/ws/run.sh' });
  });

  it('replaces the filters when file types are provided', async () => {
    await performanceDataMethods.selectFile({
      fileTypes: [
        {
          label: 'JSON',
          extensions: ['json'],
        },
      ],
    });

    const options = mockShowOpenDialog.mock.calls[0][0];

    expect(options.filters)
      .toEqual({
        'common.shellScript': ['sh'],
        'common.allFiles': ['*'],
        JSON: ['json'],
      });
  });

  it('uses the default path as-is when it is an existing directory', async () => {
    mockStat.mockResolvedValue({ type: vscode.FileType.Directory });

    await performanceDataMethods.selectFile({ defaultPath: '/ws/sub' });

    expect(mockShowOpenDialog.mock.calls[0][0].defaultUri)
      .toEqual({ fsPath: '/ws/sub' });
  });

  it('falls back to the parent directory when the default path is missing', async () => {
    mockStat.mockRejectedValue(new Error('ENOENT'));

    await performanceDataMethods.selectFile({ defaultPath: '/ws/missing.csv' });

    expect(mockShowOpenDialog.mock.calls[0][0].defaultUri)
      .toEqual({ fsPath: '/ws' });
  });
});

describe('performanceDataMethods.jumpToFile', () => {
  const targetUri = '/ws/out.txt';
  const document = {
    uri: { toString: () => targetUri },
    lineAt: (line: number) => ({ text: `line ${line}` }),
  };
  let editor: {
    selection: unknown;
    revealRange: jest.Mock;
    setDecorations: jest.Mock;
  };
  let selectionSubscription: { dispose: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateDiagnosticCollection.mockReturnValue(mockCollection);
    editor = {
      selection: null,
      revealRange: jest.fn(),
      setDecorations: jest.fn(),
    };
    selectionSubscription = { dispose: jest.fn() };
    mockOpenTextDocument.mockResolvedValue(document);
    mockShowTextDocument.mockResolvedValue(editor);
    mockOnDidChangeTextEditorSelection.mockReturnValue(selectionSubscription);
  });

  it('jumps to the target line, centers it and sets a highlight decoration', async () => {
    await performanceDataMethods.jumpToFile({
      fileLink: targetUri,
      row: 3,
      col: 5,
      errorMessage: 'boom happened',
    });

    expect(mockOpenTextDocument)
      .toHaveBeenCalledWith({ fsPath: targetUri });
    expect(mockShowTextDocument)
      .toHaveBeenCalledWith(document, { viewColumn: vscode.ViewColumn.One });
    expect(editor.revealRange)
      .toHaveBeenCalledWith(expect.any(vscode.Range), vscode.TextEditorRevealType.InCenter);
    expect(editor.setDecorations)
      .toHaveBeenCalledWith(mockDecorationType, [
        expect.objectContaining({
          start: {
            line: 2,
            character: 0,
          },
        }),
      ]);
  });

  it('registers a diagnostics entry sourced from Sanitizer when an error message is present', async () => {
    await performanceDataMethods.jumpToFile({
      fileLink: targetUri,
      row: 1,
      col: 1,
      errorMessage: 'metric mismatch',
    });

    expect(mockCollection.set)
      .toHaveBeenCalledWith(document.uri, [expect.any(vscode.Diagnostic)]);
    const diagnostic = mockCollection.set.mock.calls[0][1][0];

    expect(diagnostic.source)
      .toBe('Sanitizer');
    expect(diagnostic.severity)
      .toBe(vscode.DiagnosticSeverity.Warning);
    expect(diagnostic.message)
      .toBe('metric mismatch');
  });

  it('drops stack list items and links from the diagnostic message', async () => {
    // The stack-section header regex requires the colon AFTER the closing
    // asterisks (`**Stack**:`); the section ends when a plain `Field:` line
    // appears (markdown-bold fields do not terminate it).
    await performanceDataMethods.jumpToFile({
      fileLink: targetUri,
      row: 1,
      col: 1,
      errorMessage: '**Stack**:\n- frame one\n[link](https://x)\nError: boom',
    });

    const diagnostic = mockCollection.set.mock.calls[0][1][0];

    expect(diagnostic.message)
      .toBe('Error: boom');
  });

  it('uses the error title when no error message is provided', async () => {
    await performanceDataMethods.jumpToFile({
      fileLink: targetUri,
      row: 1,
      col: 1,
      errorTitle: 'Title only',
    });

    const diagnostic = mockCollection.set.mock.calls[0][1][0];

    expect(diagnostic.message)
      .toBe('Title only');
  });

  it('deletes prior diagnostics when no error context is provided', async () => {
    await performanceDataMethods.jumpToFile({
      fileLink: targetUri,
      row: 1,
      col: 1,
    });

    expect(mockCollection.delete)
      .toHaveBeenCalledWith(document.uri);
    expect(mockCollection.set)
      .not.toHaveBeenCalled();
  });

  it('clears the highlight when the cursor moves away from the error position', async () => {
    await performanceDataMethods.jumpToFile({
      fileLink: targetUri,
      row: 3,
      col: 5,
      errorMessage: 'boom',
    });

    const handler = mockOnDidChangeTextEditorSelection.mock.calls[0][0];

    handler({
      textEditor: { document: { uri: { toString: () => targetUri } } },
      selections: [
        {
          active: {
            line: 10,
            character: 1,
          },
        },
      ],
    });

    expect(mockDecorationType.dispose)
      .toHaveBeenCalledTimes(1);
    expect(mockCollection.delete)
      .toHaveBeenCalledWith(document.uri);
    expect(selectionSubscription.dispose)
      .toHaveBeenCalledTimes(1);
  });

  it('keeps the highlight while the cursor stays on the error position', async () => {
    await performanceDataMethods.jumpToFile({
      fileLink: targetUri,
      row: 3,
      col: 5,
      errorMessage: 'boom',
    });

    const handler = mockOnDidChangeTextEditorSelection.mock.calls[0][0];

    handler({
      textEditor: { document: { uri: { toString: () => targetUri } } },
      selections: [
        {
          active: {
            line: 2,
            character: 4,
          },
        },
      ],
    });

    expect(mockDecorationType.dispose)
      .not.toHaveBeenCalled();
    expect(mockCollection.delete)
      .not.toHaveBeenCalled();
  });

  it('ignores cursor changes in other documents', async () => {
    await performanceDataMethods.jumpToFile({
      fileLink: targetUri,
      row: 3,
      col: 5,
    });

    // Without error context the jump itself deletes prior diagnostics once.
    expect(mockCollection.delete)
      .toHaveBeenCalledTimes(1);

    const handler = mockOnDidChangeTextEditorSelection.mock.calls[0][0];

    handler({
      textEditor: { document: { uri: { toString: () => '/other.txt' } } },
      selections: [
        {
          active: {
            line: 0,
            character: 0,
          },
        },
      ],
    });

    expect(mockCollection.delete)
      .toHaveBeenCalledTimes(1);
    expect(selectionSubscription.dispose)
      .not.toHaveBeenCalled();
  });

  it('surfaces document open failures', async () => {
    const logSpy = jest.spyOn(console, 'log')
      .mockImplementation();

    mockOpenTextDocument.mockRejectedValue(new Error('ENOENT'));

    await expect(performanceDataMethods.jumpToFile({
      fileLink: '/ws/missing.txt',
      row: 1,
      col: 1,
    }))
      .rejects
      .toThrow('ENOENT');
    expect(mockShowErrorMessage)
      .toHaveBeenCalledWith('performance.openFileFailed');
    logSpy.mockRestore();
  });
});
