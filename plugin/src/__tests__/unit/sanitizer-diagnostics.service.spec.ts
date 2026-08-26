let mockWorkspaceFolders: Array<{ uri: { fsPath: string } }> | undefined = [{ uri: { fsPath: '/ws/root' } }];

const mockCollection = {
  clear: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
  dispose: jest.fn(),
};

const mockParseAll = jest.fn();
const mockResolveSourceFsPath = jest.fn();
const mockTryLoadLogWithIntegration = jest.fn(async () => undefined);

jest.mock('vscode', () => ({
  languages: { createDiagnosticCollection: jest.fn(() => mockCollection) },
  workspace: {
    get workspaceFolders() {
      return mockWorkspaceFolders;
    },
    onDidChangeWorkspaceFolders: jest.fn(() => ({ dispose: jest.fn() })),
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

jest.mock('@plugin/class/exception-parser', () => ({ ExceptionParser: jest.fn(() => ({ parseAll: mockParseAll })) }));

jest.mock('@plugin/helpers/sanitizer-source-path', () => ({ resolveSanitizerSourceFsPath: mockResolveSourceFsPath }));

jest.mock('@plugin/service/ms-agent-bridge.service', () => ({ msAgentBridgeService: { tryLoadLogWithIntegration: mockTryLoadLogWithIntegration } }));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import * as vscode from 'vscode';

import { sanitizerDiagnosticCollectionId } from '@shared/flavor';

import { ExceptionParser } from '@plugin/class/exception-parser';
import { SanitizerDiagnosticsService } from '@plugin/service/sanitizer-diagnostics.service';

const createDiagnosticCollection = vscode.languages.createDiagnosticCollection as jest.Mock;
const onDidChangeWorkspaceFolders = vscode.workspace.onDidChangeWorkspaceFolders as jest.Mock;
const exceptionParserCtor = ExceptionParser as unknown as jest.Mock;

describe('SanitizerDiagnosticsService', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-sanitizer-diag-'));
    mockWorkspaceFolders = [{ uri: { fsPath: tempDir } }];
    mockCollection.clear.mockClear();
    mockCollection.set.mockClear();
    createDiagnosticCollection.mockClear();
    onDidChangeWorkspaceFolders.mockClear();
    exceptionParserCtor.mockClear();
    mockParseAll.mockReset();
    mockParseAll.mockReturnValue([]);
    mockResolveSourceFsPath.mockReset();
    mockResolveSourceFsPath.mockImplementation((_root: string, fileLink?: string) => (fileLink ? `/abs/${fileLink}` : undefined));
    mockTryLoadLogWithIntegration.mockClear();
  });

  afterEach(() => {
    fs.rmSync(tempDir, {
      recursive: true,
      force: true,
    });
  });

  function activateService(service: SanitizerDiagnosticsService) {
    const subscriptions: Array<{ dispose: jest.Mock }> = [];
    const context = { subscriptions } as unknown as vscode.ExtensionContext;

    service.activate(context);

    return {
      context,
      subscriptions,
    };
  }

  describe('activate', () => {
    it('creates the diagnostic collection and registers subscriptions', () => {
      const service = new SanitizerDiagnosticsService();
      const { subscriptions } = activateService(service);

      expect(createDiagnosticCollection)
        .toHaveBeenCalledWith(sanitizerDiagnosticCollectionId());
      expect(subscriptions)
        .toHaveLength(2);
      expect(subscriptions[0])
        .toBe(mockCollection);
      expect(subscriptions[1])
        .toEqual({ dispose: expect.any(Function) });
    });

    it('clears diagnostics when workspace folders change', () => {
      const service = new SanitizerDiagnosticsService();

      activateService(service);
      expect(mockCollection.clear).not.toHaveBeenCalled();

      const listener = onDidChangeWorkspaceFolders.mock.calls[0][0] as ()=> void;

      listener();
      expect(mockCollection.clear)
        .toHaveBeenCalledTimes(1);
    });
  });

  describe('publishFromLogFile', () => {
    it('is a no-op before activate', () => {
      const service = new SanitizerDiagnosticsService();

      service.publishFromLogFile(path.join(tempDir, 'missing.log'), tempDir);

      expect(mockParseAll).not.toHaveBeenCalled();
      expect(mockCollection.clear).not.toHaveBeenCalled();
    });

    it('is a no-op when the log file does not exist', () => {
      const service = new SanitizerDiagnosticsService();

      activateService(service);
      service.publishFromLogFile(path.join(tempDir, 'missing.log'), tempDir);

      expect(mockParseAll).not.toHaveBeenCalled();
      expect(mockCollection.clear).not.toHaveBeenCalled();
    });

    it('returns silently when the log file cannot be read', () => {
      const service = new SanitizerDiagnosticsService();

      activateService(service);
      service.publishFromLogFile(tempDir, tempDir);

      expect(mockParseAll).not.toHaveBeenCalled();
    });

    it('parses results, groups them by file and sets diagnostics', () => {
      const logFile = path.join(tempDir, 'asan.log');

      fs.writeFileSync(logFile, '===== summary =====');
      mockParseAll.mockReturnValue([
        {
          title: 'T1',
          exceptionName: 'E1',
          type: 'warning',
          question: 'heap overflow',
          fileLink: 'a.cpp',
          row: 3,
          col: 5,
        },
        {
          title: 'T2',
          exceptionName: 'E2',
          type: 'error',
          question: '',
          fileLink: 'a.cpp',
          row: 1,
        },
        {
          title: '',
          exceptionName: '',
          type: 'error',
          question: '',
          fileLink: 'b.cpp',
          row: 2,
        },
        {
          title: 'SkippedRowZero',
          exceptionName: '',
          type: 'error',
          question: '',
          fileLink: 'c.cpp',
          row: 0,
        },
        {
          title: 'SkippedNoRow',
          exceptionName: '',
          type: 'error',
          question: '',
          fileLink: 'c.cpp',
        },
        {
          title: 'SkippedNoLink',
          exceptionName: '',
          type: 'error',
          question: '',
          fileLink: '',
          row: 4,
        },
      ]);

      const service = new SanitizerDiagnosticsService();

      activateService(service);
      service.publishFromLogFile(logFile, tempDir);

      expect(exceptionParserCtor)
        .toHaveBeenCalledWith({ matchPath: tempDir });
      expect(mockParseAll)
        .toHaveBeenCalledWith('===== summary =====');
      expect(mockCollection.clear)
        .toHaveBeenCalledTimes(1);
      expect(mockCollection.set)
        .toHaveBeenCalledTimes(2);

      const aCalls = mockCollection.set.mock.calls
        .filter((call: Array<{ toString: ()=> string }>) => call[0].toString() === 'file:///abs/a.cpp');
      const bCalls = mockCollection.set.mock.calls
        .filter((call: Array<{ toString: ()=> string }>) => call[0].toString() === 'file:///abs/b.cpp');

      expect(aCalls)
        .toHaveLength(1);

      const aDiags = aCalls[0][1] as Array<{
        message: string;
        severity: number;
        source?: string;
        range: { startLine: number;
          startChar: number;
          endChar: number };
      }>;

      expect(aDiags)
        .toHaveLength(2);
      expect(aDiags[0])
        .toMatchObject({
          message: 'heap overflow',
          severity: vscode.DiagnosticSeverity.Warning,
          source: 'sanitizer',
          range: {
            startLine: 2,
            startChar: 4,
            endChar: 2000,
          },
        });
      expect(aDiags[1])
        .toMatchObject({
          message: 'T2',
          severity: vscode.DiagnosticSeverity.Error,
          range: {
            startLine: 0,
            startChar: 0,
          },
        });

      const bDiags = bCalls[0][1] as Array<{ message: string }>;

      expect(bDiags)
        .toHaveLength(1);
      expect(bDiags[0].message)
        .toBe('Sanitizer');
    });

    it('uses exceptionName when question and title are empty', () => {
      const logFile = path.join(tempDir, 'asan.log');

      fs.writeFileSync(logFile, 'x');
      mockParseAll.mockReturnValue([
        {
          title: '',
          exceptionName: 'illegal read',
          type: 'error',
          question: '',
          fileLink: 'a.cpp',
          row: 1,
        },
      ]);

      const service = new SanitizerDiagnosticsService();

      activateService(service);
      service.publishFromLogFile(logFile, tempDir);

      const diags = mockCollection.set.mock.calls[0][1] as Array<{ message: string }>;

      expect(diags[0].message)
        .toBe('illegal read');
    });
  });

  describe('loadSanitizerPanelData', () => {
    it('returns empty data when there are no workspace folders', () => {
      mockWorkspaceFolders = undefined;

      const service = new SanitizerDiagnosticsService();
      const result = service.loadSanitizerPanelData({ path: '/any/log' });

      expect(result)
        .toEqual({ data: [] });
    });

    it('reads the log, maps results with indices and resolved links, and publishes', () => {
      const logFile = path.join(tempDir, 'sanitizer.log');

      fs.writeFileSync(logFile, 'log content');
      mockParseAll.mockReturnValue([
        {
          title: 'A',
          exceptionName: '',
          type: 'error',
          question: '',
          fileLink: 'x.cpp',
          row: 1,
        },
        {
          title: 'B',
          exceptionName: '',
          type: 'error',
          question: '',
          fileLink: '',
          row: 2,
        },
      ]);

      const service = new SanitizerDiagnosticsService();

      activateService(service);
      const result = service.loadSanitizerPanelData({
        path: logFile,
        title: 'custom',
      });

      expect(result)
        .toEqual({
          path: logFile,
          title: 'custom',
          data: [
            {
              title: 'A',
              exceptionName: '',
              type: 'error',
              question: '',
              fileLink: '/abs/x.cpp',
              row: 1,
              msAgentIndex: 0,
            },
            {
              title: 'B',
              exceptionName: '',
              type: 'error',
              question: '',
              fileLink: '',
              row: 2,
              msAgentIndex: 1,
            },
          ],
        });
      expect(mockTryLoadLogWithIntegration)
        .toHaveBeenCalledWith(logFile);
      expect(mockCollection.set)
        .toHaveBeenCalled();
    });
  });
});
