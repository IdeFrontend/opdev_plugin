/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
let mockWorkspaceFolders: Array<{ uri: { fsPath: string } }> | undefined = [{ uri: { fsPath: '/ws/root' } }];

const mockCollection = {
  clear: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
  get: jest.fn(),
  dispose: jest.fn(),
};

const mockFindFiles = jest.fn(async () => [] as Array<{ fsPath: string;
  toString: ()=> string }>);
const mockExecuteCommand = jest.fn(async () => undefined);
const mockShowWarningMessage = jest.fn(async () => undefined);
const mockShowInformationMessage = jest.fn(async () => undefined);
const mockAppendLog = jest.fn();

/** Real parser by default; individual tests swap in synthetic parse results. */
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
  commands: { executeCommand: mockExecuteCommand },
  window: {
    showInformationMessage: mockShowInformationMessage,
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

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import * as vscode from 'vscode';

import type { NpuRepHintParseResult } from '@plugin/core/profiling';
import {
  PerformanceHintsDiagnosticsService,
  escapeGlobPattern,
  isNpuRepFile,
  resolvePerformanceHintsFilePath,
} from '@plugin/service/performance-hints-diagnostics.service';

import { performanceHintsDiagnosticCollectionId } from '@shared/flavor';

const actualProfiling = jest.requireActual<typeof import('@plugin/core/profiling')>('@plugin/core/profiling');
const createDiagnosticCollection = vscode.languages.createDiagnosticCollection as jest.Mock;
const onDidChangeWorkspaceFolders = vscode.workspace.onDidChangeWorkspaceFolders as jest.Mock;

/** Producer pack from the profiling-report submodule (not vendored into the plugin tree). */
const GELU_NPU_REP = path.resolve(__dirname, '../../../../profiling-report/data/gelu.npu-rep');
const DATA_DIR = path.resolve(__dirname, '../fixtures');

type MockDiagnostic = {
  range: {
    startLine: number;
    startChar: number;
    endLine: number;
    endChar: number;
  };
  message: string;
  severity: number;
  source?: string;
  code?: unknown;
};

type MockUri = {
  toString: ()=> string;
};

type MockSourceFile = {
  fsPath: string;
  toString: ()=> string;
};

function hint(overrides: Partial<NpuRepHintParseResult['hints'][number]> = {}): NpuRepHintParseResult['hints'][number] {
  return {
    message: 'Use vectorized loads.',
    origin: 'instruction',
    ...overrides,
  };
}

function parseResult(
  hints: NpuRepHintParseResult['hints'],
  sourceLines: NpuRepHintParseResult['sourceLines'] = new Map(),
): NpuRepHintParseResult {
  return {
    hints,
    sourceLines,
  };
}

describe('PerformanceHintsDiagnosticsService', () => {
  let tempDir: string;
  let npuRepPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-hints-diag-'));
    npuRepPath = path.join(tempDir, 'gelu.npu-rep');
    fs.writeFileSync(npuRepPath, 'npu-rep-bytes');
    mockWorkspaceFolders = [{ uri: { fsPath: tempDir } }];

    jest.clearAllMocks();
    mockFindFiles.mockResolvedValue([]);
    mockExecuteCommand.mockResolvedValue(undefined);
    mockShowWarningMessage.mockResolvedValue(undefined);
    mockShowInformationMessage.mockResolvedValue(undefined);
    mockParsePerformanceHints.mockImplementation((bytes: Uint8Array, options?: { operatorId?: string }) => (
      actualProfiling.parsePerformanceHints(bytes, options)
    ));
  });

  afterEach(() => {
    fs.rmSync(tempDir, {
      recursive: true,
      force: true,
    });
  });

  function activateService(service: PerformanceHintsDiagnosticsService) {
    const subscriptions: Array<{ dispose: jest.Mock }> = [];
    const context = { subscriptions } as unknown as vscode.ExtensionContext;

    service.activate(context);

    return { subscriptions };
  }

  function setCalls(): Array<[MockUri, MockDiagnostic[]]> {
    return mockCollection.set.mock.calls as Array<[MockUri, MockDiagnostic[]]>;
  }

  function diagnosticsFor(filePath: string): MockDiagnostic[] {
    const key = `file://${filePath}`;

    return setCalls()
      .filter((call) => call[0].toString() === key)
      .flatMap((call) => call[1]);
  }

  /** Operator scope the parser was last called with (`undefined` = unscoped). */
  function scopeOfLastParse(): string | undefined {
    const calls = mockParsePerformanceHints.mock.calls as Array<[Uint8Array, { operatorId?: string } | undefined]>;
    const lastCall = calls[calls.length - 1];

    return lastCall?.[1]?.operatorId;
  }

  describe('activate', () => {
    it('creates the diagnostic collection and registers subscriptions', () => {
      const service = new PerformanceHintsDiagnosticsService();
      const { subscriptions } = activateService(service);

      expect(createDiagnosticCollection)
        .toHaveBeenCalledWith(performanceHintsDiagnosticCollectionId());
      expect(performanceHintsDiagnosticCollectionId())
        .toBe('opdevtools.performanceHints');
      expect(subscriptions)
        .toHaveLength(2);
      expect(subscriptions[0])
        .toBe(mockCollection);
    });

    it('clears the collection when workspace folders change', () => {
      const service = new PerformanceHintsDiagnosticsService();

      activateService(service);
      expect(mockCollection.clear).not.toHaveBeenCalled();

      const listener = onDidChangeWorkspaceFolders.mock.calls[0][0] as ()=> void;

      listener();
      expect(mockCollection.clear)
        .toHaveBeenCalledTimes(1);
    });
  });

  describe('publishFromFile', () => {
    it('is a no-op before activate', async () => {
      const service = new PerformanceHintsDiagnosticsService();
      const result = await service.publishFromFile(GELU_NPU_REP);

      expect(result)
        .toEqual({
          published: 0,
          failed: false,
        });
      expect(mockCollection.set)
        .not.toHaveBeenCalled();
      expect(mockParsePerformanceHints)
        .not.toHaveBeenCalled();
    });

    it('publishes the 53 hints of the gelu fixture against the report itself', async () => {
      const service = new PerformanceHintsDiagnosticsService();

      activateService(service);
      const result = await service.publishFromFile(GELU_NPU_REP);

      expect(result)
        .toEqual({
          published: 53,
          failed: false,
        });
      expect(mockCollection.clear)
        .toHaveBeenCalledTimes(1);
      expect(setCalls())
        .toHaveLength(1);
      expect(setCalls()[0][0].toString())
        .toBe(`file://${GELU_NPU_REP}`);

      const diagnostics = diagnosticsFor(GELU_NPU_REP);

      expect(diagnostics)
        .toHaveLength(53);
      expect(diagnostics.every((d) => d.severity === vscode.DiagnosticSeverity.Information))
        .toBe(true);
      expect(diagnostics.every((d) => d.source === 'performanceHints.source'))
        .toBe(true);
      expect(diagnostics[0])
        .toMatchObject({
          message: 'Low warp occupancy detected (32.5%). Consider to use more warps and '
            + 'eliminate job imbalance for better performance. (PC: 624191680372)',
          source: 'performanceHints.source',
          code: 'warp_occupancy_hint',
          range: {
            startLine: 0,
            startChar: 0,
            endLine: 0,
            endChar: 0,
          },
        });
      expect(JSON.stringify(diagnostics))
        .not.toMatch(/Not specified/u);
    });

    it('labels the origin in code when the hint has no type name', async () => {
      const service = new PerformanceHintsDiagnosticsService();

      activateService(service);
      mockParsePerformanceHints.mockReturnValue(parseResult([hint({ origin: 'kernel' })]));
      await service.publishFromFile(npuRepPath);

      const diagnostics = diagnosticsFor(npuRepPath);

      expect(diagnostics[0].message)
        .toBe('Use vectorized loads.');
      expect(diagnostics[0].source)
        .toBe('performanceHints.source');
      expect(diagnostics[0].code)
        .toBe('performanceHints.origin.kernel');
    });

    it('keeps messages tag-free and shows the tag in code — no file path', async () => {
      const service = new PerformanceHintsDiagnosticsService();

      activateService(service);
      await service.publishFromFile(GELU_NPU_REP);

      const diagnostics = diagnosticsFor(GELU_NPU_REP);
      const serialized = JSON.stringify(diagnostics);

      expect(serialized).not.toMatch(/File:/i);
      expect(diagnostics.every((d) => typeof d.code === 'string' && d.code.length > 0))
        .toBe(true);
      expect(diagnostics.every((d) => !d.message.startsWith(`${String(d.code)}: `)))
        .toBe(true);
    });

    it('falls back to the localized origin tag when the hint has no type name', async () => {
      const service = new PerformanceHintsDiagnosticsService();

      activateService(service);
      mockParsePerformanceHints.mockReturnValue(parseResult([hint({ origin: 'instruction' })]));
      await service.publishFromFile(npuRepPath);

      expect(diagnosticsFor(npuRepPath)[0].code)
        .toBe('performanceHints.origin.instruction');
    });

    it('maps source-line hints onto the workspace file and keeps the 1-based line', async () => {
      const sourcePath = path.join(tempDir, 'src', 'kernel.cpp');

      fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
      fs.writeFileSync(sourcePath, 'int main() {}');

      const service = new PerformanceHintsDiagnosticsService();

      activateService(service);
      mockParsePerformanceHints.mockReturnValue(parseResult(
        [
          hint({
            origin: 'sourceLine',
            sourceLineId: '7',
          }),
        ],
        new Map([
          [
            '7',
            {
              line: 12,
              file: path.join('src', 'kernel.cpp'),
            },
          ],
        ]),
      ));
      await service.publishFromFile(npuRepPath);

      const diagnostics = diagnosticsFor(sourcePath);

      expect(diagnostics)
        .toHaveLength(1);
      expect(diagnostics[0].range)
        .toEqual({
          startLine: 11,
          startChar: 0,
          endLine: 11,
          endChar: 2000,
        });
      expect(setCalls())
        .toHaveLength(1);
      expect(mockFindFiles)
        .not.toHaveBeenCalled();
    });

    it('falls back to the first workspace match for an unresolvable packed path', async () => {
      const foundPath = path.join(tempDir, 'other', 'kernel.cpp');

      mockFindFiles.mockResolvedValue([
        {
          fsPath: foundPath,
          toString: () => `file://${foundPath}`,
        },
      ]);

      const service = new PerformanceHintsDiagnosticsService();

      activateService(service);
      mockParsePerformanceHints.mockReturnValue(parseResult(
        [
          hint({
            origin: 'sourceLine',
            sourceLineId: '3',
          }),
        ],
        new Map([
          [
            '3',
            {
              line: 4,
              file: path.join(tempDir, 'missing', 'kernel.cpp'),
            },
          ],
        ]),
      ));
      await service.publishFromFile(npuRepPath);

      expect(mockFindFiles)
        .toHaveBeenCalledWith('**/kernel.cpp');
      expect(diagnosticsFor(foundPath))
        .toHaveLength(1);
      expect(diagnosticsFor(npuRepPath))
        .toHaveLength(0);
    });

    it('escapes glob specials in the basename and caches by the escaped pattern', async () => {
      const foundPath = path.join(tempDir, 'other', 'kernel[0]*.cpp');

      mockFindFiles.mockResolvedValue([
        {
          fsPath: foundPath,
          toString: () => `file://${foundPath}`,
        },
      ]);

      const service = new PerformanceHintsDiagnosticsService();

      activateService(service);
      mockParsePerformanceHints.mockReturnValue(parseResult(
        [
          hint({
            origin: 'sourceLine',
            sourceLineId: '3',
          }),
          hint({
            origin: 'sourceLine',
            sourceLineId: '4',
          }),
        ],
        new Map([
          [
            '3',
            {
              line: 4,
              file: path.join(tempDir, 'first', 'kernel[0]*.cpp'),
            },
          ],
          [
            '4',
            {
              line: 5,
              file: path.join(tempDir, 'second', 'kernel[0]*.cpp'),
            },
          ],
        ]),
      ));
      await service.publishFromFile(npuRepPath);

      // Both hints share the escaped pattern, so the lookup runs once.
      expect(mockFindFiles)
        .toHaveBeenCalledTimes(1);
      expect(mockFindFiles)
        .toHaveBeenCalledWith('**/kernel\\[0\\]\\*.cpp');
      expect(diagnosticsFor(foundPath))
        .toHaveLength(2);
      expect(diagnosticsFor(npuRepPath))
        .toHaveLength(0);
    });

    it('keeps hints whose source file cannot be found on the report', async () => {
      const service = new PerformanceHintsDiagnosticsService();

      activateService(service);
      mockParsePerformanceHints.mockReturnValue(parseResult(
        [
          hint({
            origin: 'sourceLine',
            sourceLineId: '3',
          }),
        ],
        new Map([
          [
            '3',
            {
              line: 4,
              file: path.join(tempDir, 'missing', 'kernel.cpp'),
            },
          ],
        ]),
      ));
      await service.publishFromFile(npuRepPath);

      expect(diagnosticsFor(npuRepPath))
        .toHaveLength(1);
    });

    it('ignores source-line ids without a packed file and clears when no hints exist', async () => {
      const service = new PerformanceHintsDiagnosticsService();

      activateService(service);
      mockParsePerformanceHints.mockReturnValue(parseResult(
        [
          hint({
            origin: 'sourceLine',
            sourceLineId: 'unmapped',
          }),
        ],
        new Map(),
      ));
      await service.publishFromFile(npuRepPath);

      expect(diagnosticsFor(npuRepPath)[0].range)
        .toEqual({
          startLine: 0,
          startChar: 0,
          endLine: 0,
          endChar: 0,
        });

      mockCollection.clear.mockClear();
      mockCollection.set.mockClear();
      mockParsePerformanceHints.mockReturnValue(parseResult([]));

      const empty = await service.publishFromFile(npuRepPath);

      expect(empty)
        .toEqual({
          published: 0,
          failed: false,
        });
      expect(mockCollection.clear)
        .toHaveBeenCalledTimes(1);
      expect(mockCollection.set)
        .not.toHaveBeenCalled();
    });

    it('forwards the selected operator id to the parser', async () => {
      const service = new PerformanceHintsDiagnosticsService();

      activateService(service);
      mockParsePerformanceHints.mockReturnValue(parseResult([]));
      await service.publishFromFile(npuRepPath, { operatorId: 'op2.npu.rep' });

      expect(mockParsePerformanceHints)
        .toHaveBeenCalledWith(expect.any(Uint8Array), { operatorId: 'op2.npu.rep' });
    });

    it('clears without publishing when the report is missing', async () => {
      const service = new PerformanceHintsDiagnosticsService();

      activateService(service);
      const result = await service.publishFromFile(path.join(tempDir, 'gone.npu-rep'));

      expect(result)
        .toEqual({
          published: 0,
          failed: false,
        });
      expect(mockCollection.clear)
        .toHaveBeenCalledTimes(1);
      expect(mockParsePerformanceHints)
        .not.toHaveBeenCalled();
    });

    it('warns instead of throwing when the report cannot be parsed', async () => {
      const brokenPath = path.join(tempDir, 'broken.npu-rep');

      fs.writeFileSync(brokenPath, 'not an npu-rep container');

      const service = new PerformanceHintsDiagnosticsService();

      activateService(service);
      const result = await service.publishFromFile(brokenPath);

      expect(result)
        .toEqual({
          published: 0,
          failed: true,
        });
      expect(mockCollection.set)
        .not.toHaveBeenCalled();
      expect(mockCollection.clear)
        .toHaveBeenCalled();
      expect(mockShowWarningMessage)
        .toHaveBeenCalledWith(expect.stringContaining('performanceHints.publishFailed'));
      expect(mockAppendLog)
        .toHaveBeenCalledWith('performanceHints', expect.stringContaining('performanceHints.publishFailed'));
    });

    it('clears previously published hints when a later parse fails', async () => {
      const brokenPath = path.join(tempDir, 'broken.npu-rep');

      fs.writeFileSync(brokenPath, 'not an npu-rep container');

      const service = new PerformanceHintsDiagnosticsService();

      activateService(service);
      mockParsePerformanceHints.mockReturnValue(parseResult([hint()]));
      await service.publishFromFile(npuRepPath);

      expect(mockCollection.set)
        .toHaveBeenCalled();

      mockCollection.clear.mockClear();
      mockParsePerformanceHints.mockImplementation(() => {
        throw new Error('corrupt pack');
      });

      const result = await service.publishFromFile(brokenPath);

      expect(result)
        .toEqual({
          published: 0,
          failed: true,
        });
      expect(mockCollection.clear)
        .toHaveBeenCalled();
      expect(mockCollection.set.mock.calls.length)
        .toBe(1);
    });

    it('drops a publish superseded while source files are being resolved', async () => {
      type MockFile = {
        fsPath: string;
        toString: ()=> string;
      };

      const service = new PerformanceHintsDiagnosticsService();

      activateService(service);
      mockParsePerformanceHints.mockReturnValue(parseResult(
        [
          hint({
            origin: 'sourceLine',
            sourceLineId: '3',
          }),
        ],
        new Map([
          [
            '3',
            {
              line: 4,
              file: path.join(tempDir, 'missing', 'kernel.cpp'),
            },
          ],
        ]),
      ));

      let resolveFindFiles: (matches: MockFile[])=> void = () => undefined;
      const pendingFindFiles = new Promise<MockFile[]>((resolve) => {
        resolveFindFiles = resolve;
      });

      mockFindFiles.mockImplementation(() => pendingFindFiles);

      const publish = service.publishFromFile(npuRepPath);

      expect(mockFindFiles)
        .toHaveBeenCalledWith('**/kernel.cpp');

      // The report was hidden (or another report took over) while the source
      // files were still resolving: the superseded publish must publish nothing.
      service.clear();
      resolveFindFiles([]);

      const result = await publish;

      expect(result)
        .toEqual({
          published: 0,
          failed: false,
          stale: true,
        });
      expect(mockCollection.set)
        .not.toHaveBeenCalled();

      mockCollection.clear.mockClear();
      service.clearIfOwns(npuRepPath);

      expect(mockCollection.clear)
        .not.toHaveBeenCalled();
    });
  });

  describe('clearIfOwns', () => {
    it('clears when the published report matches the path', async () => {
      const service = new PerformanceHintsDiagnosticsService();

      activateService(service);
      mockParsePerformanceHints.mockReturnValue(parseResult([hint()]));
      await service.publishFromFile(npuRepPath);
      mockCollection.clear.mockClear();

      service.clearIfOwns(npuRepPath);

      expect(mockCollection.clear)
        .toHaveBeenCalledTimes(1);
    });

    it('keeps another report of the same workspace untouched', async () => {
      const otherReport = path.join(tempDir, 'other.npu-rep');

      const service = new PerformanceHintsDiagnosticsService();

      activateService(service);
      mockParsePerformanceHints.mockReturnValue(parseResult([hint()]));
      await service.publishFromFile(npuRepPath);
      expect(mockCollection.set)
        .toHaveBeenCalledTimes(1);
      mockCollection.clear.mockClear();

      service.clearIfOwns(otherReport);

      expect(mockCollection.clear)
        .not.toHaveBeenCalled();
    });

    it('lets the newly active report publish while another report is hidden mid-flight', async () => {
      const previousReport = path.join(tempDir, 'previous.npu-rep');

      fs.writeFileSync(previousReport, 'npu-rep-bytes');

      const service = new PerformanceHintsDiagnosticsService();

      activateService(service);
      mockParsePerformanceHints.mockReturnValue(parseResult([hint()]));
      await service.publishFromFile(previousReport);
      mockParsePerformanceHints.mockReturnValue(parseResult(
        [
          hint({
            origin: 'sourceLine',
            sourceLineId: '3',
          }),
        ],
        new Map([
          [
            '3',
            {
              line: 4,
              file: path.join(tempDir, 'missing', 'kernel.cpp'),
            },
          ],
        ]),
      ));

      let resolveFindFiles: (matches: MockSourceFile[])=> void = () => undefined;
      const pendingFindFiles = new Promise<MockSourceFile[]>((resolve) => {
        resolveFindFiles = resolve;
      });

      mockFindFiles.mockImplementation(() => pendingFindFiles);
      mockCollection.set.mockClear();

      // The newly active report parks on `workspace.findFiles`...
      const publish = service.publishFromFile(npuRepPath);

      expect(mockFindFiles)
        .toHaveBeenCalledWith('**/kernel.cpp');

      // ...while the previously active report is hidden: its own hints are
      // dropped, but its clear must not invalidate the newer publish.
      mockCollection.clear.mockClear();
      service.clearIfOwns(previousReport);

      expect(mockCollection.clear)
        .toHaveBeenCalledTimes(1);

      resolveFindFiles([]);

      const result = await publish;

      expect(result)
        .toEqual({
          published: 1,
          failed: false,
        });
      expect(setCalls())
        .toHaveLength(1);
      expect(setCalls()[0][0].toString())
        .toBe(`file://${npuRepPath}`);

      // Ownership moved to the newly active report.
      mockCollection.clear.mockClear();
      service.clearIfOwns(npuRepPath);

      expect(mockCollection.clear)
        .toHaveBeenCalledTimes(1);
    });

    it('drops the publish of the report that was hidden while its source files resolved', async () => {
      const activeReport = path.join(tempDir, 'active.npu-rep');

      fs.writeFileSync(activeReport, 'npu-rep-bytes');

      const service = new PerformanceHintsDiagnosticsService();

      activateService(service);
      mockParsePerformanceHints.mockReturnValue(parseResult([hint()]));
      await service.publishFromFile(activeReport);
      mockParsePerformanceHints.mockReturnValue(parseResult(
        [
          hint({
            origin: 'sourceLine',
            sourceLineId: '3',
          }),
        ],
        new Map([
          [
            '3',
            {
              line: 4,
              file: path.join(tempDir, 'missing', 'kernel.cpp'),
            },
          ],
        ]),
      ));

      let resolveFindFiles: (matches: MockSourceFile[])=> void = () => undefined;
      const pendingFindFiles = new Promise<MockSourceFile[]>((resolve) => {
        resolveFindFiles = resolve;
      });

      mockFindFiles.mockImplementation(() => pendingFindFiles);
      mockCollection.set.mockClear();
      mockCollection.clear.mockClear();

      const publish = service.publishFromFile(npuRepPath);

      expect(mockFindFiles)
        .toHaveBeenCalledWith('**/kernel.cpp');

      // The report is hidden again before its own source files resolved.
      service.clearIfOwns(npuRepPath);
      resolveFindFiles([]);

      const result = await publish;

      expect(result)
        .toEqual({
          published: 0,
          failed: false,
          stale: true,
        });
      expect(mockCollection.set)
        .not.toHaveBeenCalled();
      expect(mockCollection.clear)
        .not.toHaveBeenCalled();

      // The report published before the hidden one still owns the hints.
      service.clearIfOwns(activeReport);

      expect(mockCollection.clear)
        .toHaveBeenCalledTimes(1);
    });

    it('clears the source-file diagnostics published on behalf of the owning report', async () => {
      const sourcePath = path.join(tempDir, 'kernel.cpp');

      fs.writeFileSync(sourcePath, 'int main() {}');

      const service = new PerformanceHintsDiagnosticsService();

      activateService(service);
      mockParsePerformanceHints.mockReturnValue(parseResult(
        [
          hint({
            origin: 'sourceLine',
            sourceLineId: '1',
          }),
        ],
        new Map([
          [
            '1',
            {
              line: 2,
              file: sourcePath,
            },
          ],
        ]),
      ));
      await service.publishFromFile(npuRepPath);
      mockCollection.clear.mockClear();

      // Nothing is published against the .npu-rep itself here: ownership — not
      // `collection.get(reportUri)` — keeps the Problems list in sync.
      service.clearIfOwns(npuRepPath);

      expect(mockCollection.clear)
        .toHaveBeenCalledTimes(1);
    });

    it('does nothing before anything was published', () => {
      const service = new PerformanceHintsDiagnosticsService();

      activateService(service);
      service.clearIfOwns(npuRepPath);

      expect(mockCollection.clear)
        .not.toHaveBeenCalled();
    });
  });

  describe('onDidClear', () => {
    it('notifies listeners when the collection is cleared and stops after disposal', () => {
      const service = new PerformanceHintsDiagnosticsService();

      activateService(service);
      const listener = jest.fn();
      const subscription = service.onDidClear(listener);

      service.clear();

      expect(listener)
        .toHaveBeenCalledTimes(1);

      subscription.dispose();
      service.clear();

      expect(listener)
        .toHaveBeenCalledTimes(1);
    });
  });

  describe('showPerformanceHintsForFile', () => {
    it('publishes the report and reveals the Problems view', async () => {
      const service = new PerformanceHintsDiagnosticsService();

      activateService(service);
      await service.showPerformanceHintsForFile(GELU_NPU_REP);

      expect(diagnosticsFor(GELU_NPU_REP))
        .toHaveLength(53);
      expect(mockExecuteCommand)
        .toHaveBeenCalledWith('workbench.actions.view.problems');
      expect(mockShowInformationMessage)
        .not.toHaveBeenCalled();
    });

    it('reports an empty result without publishing placeholder diagnostics', async () => {
      const service = new PerformanceHintsDiagnosticsService();

      activateService(service);
      mockParsePerformanceHints.mockReturnValue(parseResult([]));
      await service.showPerformanceHintsForFile(npuRepPath);

      expect(mockCollection.set)
        .not.toHaveBeenCalled();
      expect(mockExecuteCommand)
        .toHaveBeenCalledWith('workbench.actions.view.problems');
      expect(mockShowInformationMessage)
        .toHaveBeenCalledWith(expect.stringContaining('performanceHints.empty'));
    });

    it('reuses the operator scope the report was published with', async () => {
      const service = new PerformanceHintsDiagnosticsService();

      activateService(service);
      mockParsePerformanceHints.mockReturnValue(parseResult([hint()]));
      await service.publishFromFile(npuRepPath, { operatorId: 'op2.npu.rep' });
      mockParsePerformanceHints.mockClear();

      await service.showPerformanceHintsForFile(npuRepPath);

      expect(mockParsePerformanceHints)
        .toHaveBeenLastCalledWith(expect.any(Uint8Array), { operatorId: 'op2.npu.rep' });
    });

    it('forgets the operator scope once the report stopped owning its hints', async () => {
      const service = new PerformanceHintsDiagnosticsService();

      activateService(service);
      mockParsePerformanceHints.mockReturnValue(parseResult([hint()]));
      await service.publishFromFile(npuRepPath, { operatorId: 'op2.npu.rep' });
      service.clearIfOwns(npuRepPath);
      mockParsePerformanceHints.mockClear();

      await service.showPerformanceHintsForFile(npuRepPath);

      expect(scopeOfLastParse())
        .toBeUndefined();
    });

    it('shows hints without an operator scope when the report was published unscoped', async () => {
      const service = new PerformanceHintsDiagnosticsService();

      activateService(service);
      mockParsePerformanceHints.mockReturnValue(parseResult([hint()]));
      await service.publishFromFile(npuRepPath);
      mockParsePerformanceHints.mockClear();

      await service.showPerformanceHintsForFile(npuRepPath);

      // The remembered scope is explicitly `undefined`, which the parser reads
      // exactly like an absent operator id (the report's default operator).
      expect(scopeOfLastParse())
        .toBeUndefined();
      expect(mockParsePerformanceHints)
        .toHaveBeenLastCalledWith(expect.any(Uint8Array), { operatorId: undefined });
    });
  });
});

describe('resolvePerformanceHintsFilePath', () => {
  it('decodes the performance-results tree item id', () => {
    const filePath = path.join('C:', 'reports', 'with space', 'gelu.npu-rep');

    expect(resolvePerformanceHintsFilePath({ id: `performance-file:${encodeURIComponent(filePath)}` }))
      .toBe(filePath);
    expect(resolvePerformanceHintsFilePath(`performance-file:${encodeURIComponent(filePath)}`))
      .toBe(filePath);
  });

  it('accepts paths, uris and command arguments', () => {
    expect(resolvePerformanceHintsFilePath('/tmp/gelu.npu-rep'))
      .toBe('/tmp/gelu.npu-rep');
    expect(resolvePerformanceHintsFilePath({ fsPath: '/tmp/gelu.npu-rep' }))
      .toBe('/tmp/gelu.npu-rep');
    expect(resolvePerformanceHintsFilePath({ command: { arguments: ['/tmp/gelu.npu-rep'] } }))
      .toBe('/tmp/gelu.npu-rep');
  });

  it('rejects empty and malformed arguments', () => {
    expect(resolvePerformanceHintsFilePath(undefined))
      .toBeUndefined();
    expect(resolvePerformanceHintsFilePath(''))
      .toBeUndefined();
    expect(resolvePerformanceHintsFilePath({}))
      .toBeUndefined();
    expect(resolvePerformanceHintsFilePath('performance-file:%'))
      .toBeUndefined();
  });
});

describe('isNpuRepFile', () => {
  it('recognizes npu-rep reports case-insensitively', () => {
    expect(isNpuRepFile('/tmp/gelu.npu-rep'))
      .toBe(true);
    expect(isNpuRepFile('/tmp/gelu.NPU-REP'))
      .toBe(true);
    expect(isNpuRepFile('/tmp/gelu.rep'))
      .toBe(false);
    expect(isNpuRepFile('/tmp/gelu.ncrep'))
      .toBe(false);
  });

  it('recognizes the interim 164-byte .npu.rep extension too', () => {
    expect(isNpuRepFile('/tmp/example.npu.rep'))
      .toBe(true);
    expect(isNpuRepFile('/tmp/example.NPU.REP'))
      .toBe(true);
    expect(isNpuRepFile('/tmp/example.npu.rep.gz'))
      .toBe(false);
    expect(isNpuRepFile('/tmp/example.npurep'))
      .toBe(false);
  });
});

describe('escapeGlobPattern', () => {
  it('escapes the glob specials of a file name', () => {
    expect(escapeGlobPattern('kernel.cpp'))
      .toBe('kernel.cpp');
    expect(escapeGlobPattern('kernel[0]*.cpp'))
      .toBe('kernel\\[0\\]\\*.cpp');
    expect(escapeGlobPattern('what?.cpp'))
      .toBe('what\\?.cpp');
    expect(escapeGlobPattern('a{b}c(d).cpp'))
      .toBe('a\\{b\\}c\\(d\\).cpp');
  });
});
