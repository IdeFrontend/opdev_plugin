/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
/**
 * Acceptance coverage for "hints follow the active profiling tab": the panel is
 * mocked, the diagnostics service runs for real against the gelu fixture, so the
 * assertions describe what the Problems view ends up holding.
 */
let mockWorkspaceFolders: Array<{ uri: { fsPath: string } }> | undefined = [{ uri: { fsPath: '/ws' } }];

const mockCollection = {
  clear: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
  get: jest.fn(),
  dispose: jest.fn(),
};

const mockCreateOrShow = jest.fn();
const mockAttachTo = jest.fn();
const mockIsOpen = jest.fn((): boolean => false);
const mockRetainedOperatorId = jest.fn((): string | undefined => undefined);
const mockSetPublished = jest.fn();
const mockShowErrorMessage = jest.fn();
const mockShowWarningMessage = jest.fn();
const mockFindFiles = jest.fn(async () => [] as Array<{ fsPath: string;
  toString: ()=> string }>);
const mockAppendLog = jest.fn();
const mockExecuteCommand = jest.fn(async () => undefined);

const mockParsePerformanceHints = jest.fn();

jest.mock('vscode', () => ({
  languages: { createDiagnosticCollection: jest.fn(() => mockCollection) },
  workspace: {
    get workspaceFolders() {
      return mockWorkspaceFolders;
    },
    onDidChangeWorkspaceFolders: jest.fn(() => ({ dispose: jest.fn() })),
    findFiles: mockFindFiles,
  },
  commands: { executeCommand: (...args: unknown[]) => mockExecuteCommand(...args) },
  window: {
    showErrorMessage: mockShowErrorMessage,
    showWarningMessage: mockShowWarningMessage,
  },
  DiagnosticSeverity: {
    Error: 0,
    Warning: 1,
    Information: 2,
    Hint: 3,
  },
  Range: jest.fn((startLine: number, startChar: number, endLine: number, endChar: number) => ({
    startLine,
    startChar,
    endLine,
    endChar,
  })),
  Diagnostic: jest.fn(function Diagnostic(this: Record<string, unknown>, range: unknown, message: string, severity: number) {
    this.range = range;
    this.message = message;
    this.severity = severity;
  }),
  Uri: {
    file: jest.fn((fsPath: string) => ({
      fsPath,
      toString: () => `file://${fsPath}`,
    })),
    parse: jest.fn((value: string) => ({
      value,
      toString: () => value,
    })),
  },
}));

jest.mock('i18next', () => ({
  t: jest.fn((key: string, options?: Record<string, string>) => (
    options ? `${key} ${JSON.stringify(options)}` : key
  )),
}));

jest.mock('@plugin/helpers/output-channel', () => ({ appendLog: mockAppendLog }));

jest.mock('@plugin/core/profiling', () => {
  const actual = jest.requireActual<typeof import('@plugin/core/profiling')>('@plugin/core/profiling');

  return {
    ...actual,
    parsePerformanceHints: (bytes: Uint8Array, options?: { operatorId?: string }) => mockParsePerformanceHints(bytes, options),
  };
});

jest.mock('@plugin/class/profiling-report-panel', () => ({
  ProfilingReportPanel: {
    createOrShow: mockCreateOrShow,
    attachTo: mockAttachTo,
    retainedOperatorId: mockRetainedOperatorId,
    isOpen: mockIsOpen,
  },
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import * as vscode from 'vscode';

import type { ProfilingReportPanelHooks } from '@plugin/class/profiling-report-panel';
import { NPU_REP_EDITOR_VIEW_TYPE } from '@plugin/constants';
import type { NpuRepHintParseResult } from '@plugin/core/profiling';
import { ViewOpener } from '@plugin/core/view/view-opener';
import { performanceHintsDiagnosticsService } from '@plugin/service/performance-hints-diagnostics.service';

const actualProfiling = jest.requireActual<typeof import('@plugin/core/profiling')>('@plugin/core/profiling');

/** Producer pack from the profiling-report submodule (not vendored into the plugin tree). */
const GELU_NPU_REP = path.resolve(__dirname, '../../../../profiling-report/data/gelu.npu-rep');

/** Custom-editor host panel used so tests exercise attach + publish (not openWith). */
const hostPanel = { title: 'host' } as unknown as vscode.WebviewPanel;

describe('ViewOpener.openProfilingReport — performance hints triggers', () => {
  let tempDir: string;
  let context: vscode.ExtensionContext;
  let hooks: ProfilingReportPanelHooks | undefined;
  /** Every hooks set handed to the panel mock, in panel creation order. */
  let hooksList: ProfilingReportPanelHooks[];

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-view-opener-hints-'));
    mockWorkspaceFolders = [{ uri: { fsPath: tempDir } }];
    jest.clearAllMocks();
    mockFindFiles.mockResolvedValue([]);
    mockShowErrorMessage.mockResolvedValue(undefined);
    mockShowWarningMessage.mockResolvedValue(undefined);
    mockParsePerformanceHints.mockImplementation((bytes: Uint8Array, options?: { operatorId?: string }) => (
      actualProfiling.parsePerformanceHints(bytes, options)
    ));

    hooks = undefined;
    hooksList = [];
    mockIsOpen.mockReturnValue(false);
    mockRetainedOperatorId.mockReturnValue(undefined);
    mockCreateOrShow.mockImplementation(async (
      _context: unknown,
      _filePath: string,
      panelHooks?: ProfilingReportPanelHooks,
    ) => {
      hooks = panelHooks;

      if (panelHooks) {
        hooksList.push(panelHooks);
      }

      return { setPerformanceHintsPublished: mockSetPublished };
    });
    mockAttachTo.mockImplementation(async (
      _panel: unknown,
      _context: unknown,
      _filePath: string,
      panelHooks?: ProfilingReportPanelHooks,
    ) => {
      hooks = panelHooks;

      if (panelHooks) {
        hooksList.push(panelHooks);
      }

      return { setPerformanceHintsPublished: mockSetPublished };
    });
    (globalThis as unknown as { extensionContext: vscode.ExtensionContext }).extensionContext = { subscriptions: [] } as unknown as vscode.ExtensionContext;
    context = (globalThis as unknown as { extensionContext: vscode.ExtensionContext }).extensionContext;
    performanceHintsDiagnosticsService.activate(context);
  });

  afterEach(() => {
    delete (globalThis as unknown as { extensionContext?: unknown }).extensionContext;
    fs.rmSync(tempDir, {
      recursive: true,
      force: true,
    });
  });

  function publishedDiagnostics(): Array<{ message: string }> {
    return mockCollection.set.mock.calls.flatMap((call: unknown[]) => call[1]) as Array<{ message: string }>;
  }

  /** Hooks fire-and-forget their republish, and a publish yields once per hint. */
  async function flushRepublish(): Promise<void> {
    for (let i = 0; i < 200; i++) {
      await Promise.resolve();
    }
  }

  function openNpuRep(filePath: string = GELU_NPU_REP): Promise<void> {
    return ViewOpener.openProfilingReport(vscode.Uri.file(filePath), hostPanel);
  }

  it('opens .npu-rep via the custom editor when no host panel is mounted yet', async () => {
    await ViewOpener.openProfilingReport(vscode.Uri.file(GELU_NPU_REP));

    expect(mockExecuteCommand)
      .toHaveBeenCalledWith(
        'vscode.openWith',
        expect.objectContaining({ fsPath: GELU_NPU_REP }),
        NPU_REP_EDITOR_VIEW_TYPE,
      );
    expect(mockAttachTo)
      .not
      .toHaveBeenCalled();
    expect(mockCreateOrShow)
      .not
      .toHaveBeenCalled();
    expect(mockCollection.set)
      .not
      .toHaveBeenCalled();
  });

  it('publishes the hints of an opened .npu-rep report while the tab is active', async () => {
    await openNpuRep();

    expect(mockAttachTo)
      .toHaveBeenCalledTimes(1);
    expect(publishedDiagnostics())
      .toHaveLength(53);
    expect(mockCollection.set.mock.calls[0][0].toString())
      .toBe(`file://${GELU_NPU_REP}`);

    mockCollection.clear.mockClear();
    hooks?.onActiveChanged?.(true);
    await flushRepublish();

    expect(mockCollection.clear)
      .toHaveBeenCalledTimes(1);
    expect(mockCollection.set)
      .toHaveBeenCalledTimes(2);
    expect(publishedDiagnostics())
      .toHaveLength(106);
  });

  it('clears the hints when the .npu-rep tab is hidden or closed', async () => {
    await openNpuRep();
    mockCollection.clear.mockClear();

    hooks?.onActiveChanged?.(false);

    expect(mockCollection.clear)
      .toHaveBeenCalledTimes(1);
    expect(publishedDiagnostics())
      .toHaveLength(53);

    hooks?.onActiveChanged?.(true);
    await flushRepublish();
    mockCollection.clear.mockClear();

    hooks?.onDispose?.();

    expect(mockCollection.clear)
      .toHaveBeenCalledTimes(1);
  });

  it('re-publishes the hints for the operator selected inside a multi-op report', async () => {
    await openNpuRep();
    mockParsePerformanceHints.mockClear();

    hooks?.onOperatorChanged?.('op2.npu.rep');
    await flushRepublish();

    expect(mockParsePerformanceHints)
      .toHaveBeenCalledWith(expect.any(Uint8Array), { operatorId: 'op2.npu.rep' });
    expect(mockCollection.set)
      .toHaveBeenCalledTimes(2);
    expect(publishedDiagnostics())
      .toHaveLength(106);
  });

  it('reopens a retained panel with the same operator scope the webview still shows', async () => {
    await openNpuRep();
    hooks?.onOperatorChanged?.('op2.npu.rep');
    await flushRepublish();

    mockRetainedOperatorId.mockReturnValue('op2.npu.rep');
    mockIsOpen.mockReturnValue(true);
    mockParsePerformanceHints.mockClear();
    mockCollection.set.mockClear();

    await ViewOpener.openProfilingReport(vscode.Uri.file(GELU_NPU_REP));
    await flushRepublish();

    expect(mockCreateOrShow)
      .toHaveBeenCalledTimes(1);
    expect(mockParsePerformanceHints)
      .toHaveBeenCalledWith(expect.any(Uint8Array), { operatorId: 'op2.npu.rep' });
    expect(mockCollection.set)
      .toHaveBeenCalled();

    // Hooks rebuilt for the reopen must keep that scope on later reactivation.
    mockParsePerformanceHints.mockClear();
    hooks?.onActiveChanged?.(false);
    hooks?.onActiveChanged?.(true);
    await flushRepublish();

    expect(mockParsePerformanceHints)
      .toHaveBeenLastCalledWith(expect.any(Uint8Array), { operatorId: 'op2.npu.rep' });
  });

  it('re-publishes with the previously selected operator when the .npu-rep tab becomes active again', async () => {
    await openNpuRep();

    hooks?.onOperatorChanged?.('op2.npu.rep');
    await flushRepublish();
    mockParsePerformanceHints.mockClear();

    const setCallsBeforeReactivate = mockCollection.set.mock.calls.length;

    hooks?.onActiveChanged?.(false);
    hooks?.onActiveChanged?.(true);
    await flushRepublish();

    expect(mockParsePerformanceHints)
      .toHaveBeenLastCalledWith(expect.any(Uint8Array), { operatorId: 'op2.npu.rep' });
    expect(mockCollection.set.mock.calls.length)
      .toBe(setCallsBeforeReactivate + 1);
  });

  it('resets the operator scope when the webview reports none', async () => {
    await openNpuRep();

    hooks?.onOperatorChanged?.('op2.npu.rep');
    await flushRepublish();
    mockParsePerformanceHints.mockClear();

    hooks?.onOperatorChanged?.(null);
    await flushRepublish();

    hooks?.onActiveChanged?.(false);
    hooks?.onActiveChanged?.(true);
    await flushRepublish();

    expect(mockParsePerformanceHints)
      .toHaveBeenLastCalledWith(expect.any(Uint8Array), { operatorId: undefined });
  });

  it('clears the hints of the backend report when another report type becomes active', async () => {
    const repPath = path.join(tempDir, 'profile.rep');

    fs.writeFileSync(repPath, 'rep-bytes');

    await openNpuRep();
    expect(publishedDiagnostics())
      .toHaveLength(53);
    mockCollection.clear.mockClear();

    await ViewOpener.openProfilingReport(vscode.Uri.file(repPath));
    hooks?.onActiveChanged?.(false);

    expect(mockCollection.clear)
      .not.toHaveBeenCalled();

    hooks?.onActiveChanged?.(true);

    expect(mockCollection.clear)
      .toHaveBeenCalledTimes(1);
    expect(mockParsePerformanceHints.mock.calls.length)
      .toBe(1);
  });

  it('opens the panel and warns when the hints cannot be parsed', async () => {
    const brokenPath = path.join(tempDir, 'broken.npu-rep');

    fs.writeFileSync(brokenPath, 'not an npu-rep container');

    await openNpuRep(brokenPath);

    expect(mockAttachTo)
      .toHaveBeenCalledTimes(1);
    expect(mockCollection.set)
      .not.toHaveBeenCalled();
    expect(mockShowWarningMessage)
      .toHaveBeenCalledWith(expect.stringContaining('performanceHints.publishFailed'));
  });

  it('keeps working when a source-line hint maps onto a workspace file', async () => {
    const sourcePath = path.join(tempDir, 'kernel.cpp');
    const parseResult: NpuRepHintParseResult = {
      hints: [
        {
          message: 'Vectorize the load.',
          origin: 'sourceLine',
          sourceLineId: '4',
        },
      ],
      sourceLines: new Map([
        [
          '4',
          {
            line: 3,
            file: sourcePath,
          },
        ],
      ]),
    };

    fs.writeFileSync(sourcePath, 'int main() {}');

    const reportPath = path.join(tempDir, 'multi.npu-rep');

    fs.writeFileSync(reportPath, 'npu-rep-bytes');
    mockParsePerformanceHints.mockReturnValue(parseResult);

    await openNpuRep(reportPath);
    expect(mockCollection.set.mock.calls[0][0].toString())
      .toBe(`file://${sourcePath}`);
    mockCollection.clear.mockClear();

    hooks?.onActiveChanged?.(false);

    expect(mockCollection.clear)
      .toHaveBeenCalledTimes(1);
  });

  it('forwards the hint publish state to the panel webview', async () => {
    await openNpuRep();

    expect(mockSetPublished)
      .toHaveBeenCalledWith(true);

    mockSetPublished.mockClear();
    hooks?.onActiveChanged?.(false);

    expect(mockSetPublished)
      .toHaveBeenCalledWith(false);

    mockSetPublished.mockClear();
    hooks?.onActiveChanged?.(true);
    await flushRepublish();

    expect(mockSetPublished)
      .toHaveBeenCalledWith(true);
  });

  it('reports false when the report cannot be parsed', async () => {
    const brokenPath = path.join(tempDir, 'broken.npu-rep');

    fs.writeFileSync(brokenPath, 'not an npu-rep container');

    await openNpuRep(brokenPath);

    expect(mockSetPublished)
      .toHaveBeenCalledWith(false);
  });

  it('reports false when the panel is closed', async () => {
    await openNpuRep();
    mockSetPublished.mockClear();

    hooks?.onDispose?.();

    expect(mockSetPublished)
      .toHaveBeenCalledWith(false);
  });

  it('reports false when the report has no hints', async () => {
    const emptyPath = path.join(tempDir, 'empty.npu-rep');
    const parseResult: NpuRepHintParseResult = {
      hints: [],
      sourceLines: new Map(),
    };

    fs.writeFileSync(emptyPath, 'npu-rep-bytes');
    mockParsePerformanceHints.mockReturnValue(parseResult);

    await openNpuRep(emptyPath);

    expect(mockSetPublished)
      .toHaveBeenCalledWith(false);
  });

  it('turns the indicator off when another report clears the hints', async () => {
    await openNpuRep();

    expect(mockSetPublished)
      .toHaveBeenCalledWith(true);

    const repPath = path.join(tempDir, 'profile.rep');

    fs.writeFileSync(repPath, 'rep-bytes');
    await ViewOpener.openProfilingReport(vscode.Uri.file(repPath));
    mockSetPublished.mockClear();

    // The backend report taking over clears the collection: the npu-rep panel's
    // indicator goes off through the clear listener, not through a tab change.
    hooksList[1]?.onActiveChanged?.(true);

    expect(mockSetPublished)
      .toHaveBeenCalledWith(false);
  });
});
