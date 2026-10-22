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
 * Unit tests for InsightDataViewerPanel: panel lifecycle (createOrShow /
 * dispose), webview HTML injection and caching, loading overlay, profiler
 * server startup (Windows and non-Windows paths), zip extraction and webview
 * message routing. All vscode/net/os/spawn dependencies are mocked; filesystem
 * operations run against real temp directories.
 */

jest.mock('i18next', () => ({
  t: (key: string, options?: { error?: string }) =>
    options?.error ? `${key}: ${options.error}` : key,
}));

jest.mock('vscode', () => ({
  ColorThemeKind: {
    Light: 1,
    Dark: 2,
    HighContrast: 3,
    HighContrastLight: 4,
  },
  ViewColumn: {
    Active: 1,
    Beside: 2,
  },
  ConfigurationTarget: {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3,
  },
  EventEmitter: class {
    readonly event = jest.fn();
    readonly fire = jest.fn();
    readonly dispose = jest.fn();
  },
  Uri: { file: (fsPath: string) => ({ fsPath }) },
  env: { uriScheme: 'vscode' },
  window: {
    activeTextEditor: undefined,
    activeColorTheme: { kind: 2 },
    createWebviewPanel: jest.fn(),
    onDidChangeActiveColorTheme: jest.fn(() => ({ dispose: jest.fn() })),
    showErrorMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showInformationMessage: jest.fn(),
  },
  workspace: {
    workspaceFolders: [],
    getConfiguration: jest.fn(() => ({
      get: jest.fn(),
      update: jest.fn(),
    })),
  },
  commands: {
    executeCommand: jest.fn()
      .mockResolvedValue(undefined),
  },
}));

jest.mock('os', () => ({
  ...jest.requireActual('os'),
  platform: jest.fn(() => 'win32'),
  arch: jest.fn(() => 'x64'),
}));

jest.mock('child_process', () => ({
  spawn: jest.fn(),
  ChildProcess: class {},
}));

jest.mock('net', () => {
  const sockets: Array<{ cbs: Record<string, ()=> void> }> = [];
  const servers: Array<{ cbs: Record<string, ()=> void> }> = [];
  let defaultServerResult: 'available' | 'taken' = 'available';
  let defaultSocketResult: 'connect' | 'error' | 'both' | 'timeout' = 'connect';
  let socketResultQueue: Array<'connect' | 'error' | 'both' | 'timeout'> = [];

  const makeServer = (): any => {
    const server: any = {
      cbs: {},
      unref: jest.fn(),
      once: jest.fn((event: string, cb: ()=> void) => {
        server.cbs[event] = cb;
      }),
      listen: jest.fn((_port: number, _host: string, cb: ()=> void) => {
        if (defaultServerResult === 'taken') {
          setImmediate(() => server.cbs.error?.());
        }
        else {
          cb?.();
        }
      }),
      close: jest.fn((cb: ()=> void) => cb?.()),
    };

    servers.push(server);

    return server;
  };

  const makeSocket = (): any => {
    const socket: any = {
      cbs: {},
      setTimeout: jest.fn(),
      once: jest.fn((event: string, cb: ()=> void) => {
        socket.cbs[event] = cb;
      }),
      end: jest.fn(),
      destroy: jest.fn(),
    };

    sockets.push(socket);
    setImmediate(() => {
      const result = socketResultQueue.length > 0
        ? socketResultQueue.shift()!
        : defaultSocketResult;

      if (result === 'error') {
        socket.cbs.error?.();
      }
      else if (result === 'both') {
        socket.cbs.connect?.();
        socket.cbs.error?.();
      }
      else if (result === 'timeout') {
        socket.cbs.timeout?.();
      }
      else {
        socket.cbs.connect?.();
      }
    });

    return socket;
  };

  return {
    createServer: jest.fn(makeServer),
    connect: jest.fn(makeSocket),
    __test: {
      sockets,
      servers,
      setServerResult: (result: 'available' | 'taken') => {
        defaultServerResult = result;
      },
      setSocketResult: (result: 'connect' | 'error' | 'both' | 'timeout') => {
        defaultSocketResult = result;
      },
      setSocketResults: (results: Array<'connect' | 'error' | 'both' | 'timeout'>) => {
        socketResultQueue = results;
      },
    },
  };
});

jest.mock('adm-zip', () => {
  const RealAdmZip = jest.requireActual('adm-zip');
  const mockState: { extractAllToError: unknown } = { extractAllToError: undefined };

  class MockAdmZip extends RealAdmZip {
    constructor(...args: unknown[]) {
      super(...args);

      if (mockState.extractAllToError !== undefined) {
        this.extractAllTo = (): void => {
          throw mockState.extractAllToError;
        };
      }
    }
  }

  return Object.assign(MockAdmZip, { __mockState: mockState });
});

jest.mock('@plugin/service/insight-service', () => ({ insightService: { resolveInsightPath: jest.fn() } }));

jest.mock('@plugin/class/webview-message-list', () => ({
  __esModule: true,
  default: [
    {
      command: 'webview-test-command',
      callback: jest.fn(),
    },
  ],
  handleOperatorProjectDirectoryFile: jest.fn(),
}));

import * as vscode from 'vscode';
import * as os from 'os';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';
import { spawn } from 'child_process';
import { InsightDataViewerPanel } from '@plugin/class/insight-data-viewer-panel';
import { insightService } from '@plugin/service/insight-service';
import webviewMessageList from '@plugin/class/webview-message-list';

const tempDirs: string[] = [];
const createdPanels: InsightDataViewerPanel[] = [];

const makeTempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'insight-panel-'));

  tempDirs.push(dir);

  return dir;
};

const rmTempDirs = (): void => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;

    fs.rmSync(dir, {
      recursive: true,
      force: true,
    });
  }
};

let mockWebview: {
  html: string;
  postMessage: jest.Mock;
  onDidReceiveMessage: jest.Mock;
};

let mockPanel: {
  webview: typeof mockWebview;
  onDidDispose: jest.Mock;
  reveal: jest.Mock;
  dispose: jest.Mock;
};

const mockContext = {
  subscriptions: [],
  extensionPath: '/ext/path',
  extension: { packageJSON: { version: '1.0.0' } },
  globalState: {
    get: jest.fn(),
    update: jest.fn(),
  },
  workspaceState: {
    get: jest.fn(),
    update: jest.fn(),
  },
} as unknown as vscode.ExtensionContext;

const makeMockChild = (): {
  cbs: Record<string, (...args: any[])=> void>;
  stdout: { on: jest.Mock };
  stderr: { on: jest.Mock };
  on: jest.Mock;
  kill: jest.Mock;
} => {
  const child: any = {
    cbs: {},
    stdout: { on: jest.fn() },
    stderr: { on: jest.fn() },
    on: jest.fn((event: string, cb: (...args: any[])=> void) => {
      child.cbs[event] = cb;
    }),
    kill: jest.fn(),
  };

  return child;
};

const postedCommands = (): Array<string | undefined> =>
  mockWebview.postMessage.mock.calls
    .map((call) => (call[0] as { command?: string })?.command);

const postedMessage = (command: string): any =>
  mockWebview.postMessage.mock.calls
    .map((call) => call[0])
    .find((message: any) => message?.command === command);

const createPanel = async (
  basePath: string,
  binPath = '/bin/insight',
): Promise<InsightDataViewerPanel> => {
  const panel = new InsightDataViewerPanel(mockPanel, mockContext, binPath, basePath);

  createdPanels.push(panel);
  await (panel as any).initializationPromise;

  return panel;
};

const makeServerReadyBase = (): string => {
  const base = makeTempDir();

  fs.mkdirSync(path.join(base, 'server'), { recursive: true });
  fs.writeFileSync(path.join(base, 'server', 'profiler_server'), '#!/bin/sh\n');

  return base;
};

const createZipFile = (zipPath: string, files: Record<string, string>): void => {
  const zip = new AdmZip();

  Object.entries(files)
    .forEach(([
      name,
      content,
    ]) => {
      zip.addFile(name, Buffer.from(content, 'utf8'));
    });

  fs.mkdirSync(path.dirname(zipPath), { recursive: true });
  zip.writeZip(zipPath);
};

describe('InsightDataViewerPanel', () => {
  const createWebviewPanelMock = vscode.window.createWebviewPanel as jest.Mock;
  const showErrorMessageMock = vscode.window.showErrorMessage as jest.Mock;
  const showWarningMessageMock = vscode.window.showWarningMessage as jest.Mock;
  const resolveInsightPathMock = insightService.resolveInsightPath as jest.Mock;
  const spawnMock = spawn as jest.Mock;
  const netTest = (net as any).__test;

  beforeEach(() => {
    mockWebview = {
      html: '',
      postMessage: jest.fn()
        .mockResolvedValue(true),
      onDidReceiveMessage: jest.fn(() => ({ dispose: jest.fn() })),
    };
    mockPanel = {
      webview: mockWebview,
      onDidDispose: jest.fn(),
      reveal: jest.fn(),
      dispose: jest.fn(),
    };

    jest.clearAllMocks();
    createWebviewPanelMock.mockReturnValue(mockPanel);
    resolveInsightPathMock.mockReturnValue('/mock/insight/base');
    (os.platform as jest.Mock)
      .mockReturnValue('win32');
    (os.arch as jest.Mock)
      .mockReturnValue('x64');
    netTest.setServerResult('available');
    netTest.setSocketResult('connect');
    netTest.setSocketResults([]);
    netTest.sockets.length = 0;
    netTest.servers.length = 0;
    spawnMock.mockReset();
    (vscode.window as any).activeTextEditor = undefined;
    mockWebview.postMessage.mockReset();
    mockWebview.postMessage.mockResolvedValue(true);

    const panelStatics = InsightDataViewerPanel as unknown as {
      htmlCache: Map<string, { html: string;
        sizeBytes: number }>;
      htmlCacheSizeBytes: number;
      htmlCacheBudgetBytes: number;
      openedFiles: Map<string, InsightDataViewerPanel>;
    };

    panelStatics.htmlCache.clear();
    panelStatics.htmlCacheSizeBytes = 0;
    panelStatics.htmlCacheBudgetBytes = 128 * 1024 * 1024;
    panelStatics.openedFiles.clear();
  });

  afterEach(async () => {
    // Dispose any panels left over so no timers or subscriptions leak.
    const opened = (InsightDataViewerPanel as unknown as {
      openedFiles: Map<string, InsightDataViewerPanel>;
    }).openedFiles;

    for (const panel of opened.values()) {
      panel.dispose();
    }

    for (const panel of createdPanels.splice(0)) {
      panel.dispose();
    }

    delete process.env.INSIGHT_THEME_DEBUG;
    jest.restoreAllMocks();
    rmTempDirs();
  });

  describe('createOrShow', () => {
    it('creates a panel with the insight type, translated title and default column', async () => {
      InsightDataViewerPanel.createOrShow(mockContext, '/bin/fresh');

      expect(createWebviewPanelMock)
        .toHaveBeenCalledWith(
          'opdevtoolsInsightDataViewer',
          'insight.performanceAnalysis',
          vscode.ViewColumn.Active,
          {
            enableScripts: true,
            retainContextWhenHidden: true,
          },
        );

      const panel = (InsightDataViewerPanel as unknown as {
        openedFiles: Map<string, InsightDataViewerPanel>;
      }).openedFiles.get('/bin/fresh');

      expect(panel)
        .toBeDefined();
      await (panel as any).initializationPromise;
    });

    it('reveals the existing panel instead of creating a second one', async () => {
      (vscode.window as any).activeTextEditor = { viewColumn: 3 };

      InsightDataViewerPanel.createOrShow(mockContext, '/bin/reuse');
      InsightDataViewerPanel.createOrShow(mockContext, '/bin/reuse');

      expect(createWebviewPanelMock)
        .toHaveBeenCalledTimes(1);
      expect(mockPanel.reveal)
        .toHaveBeenCalledWith(3);
    });

    it('uses the active editor column when creating a new panel', async () => {
      (vscode.window as any).activeTextEditor = { viewColumn: 2 };

      InsightDataViewerPanel.createOrShow(mockContext, '/bin/column');

      expect(createWebviewPanelMock)
        .toHaveBeenCalledWith(
          'opdevtoolsInsightDataViewer',
          'insight.performanceAnalysis',
          2,
          expect.any(Object),
        );

      const panel = (InsightDataViewerPanel as unknown as {
        openedFiles: Map<string, InsightDataViewerPanel>;
      }).openedFiles.get('/bin/column');

      await (panel as any).initializationPromise;
    });
  });

  describe('constructor', () => {
    it('resolves the insight base path from the service when none is passed', async () => {
      const panel = await createPanel(undefined as unknown as string, '/bin/fallback');

      expect(resolveInsightPathMock)
        .toHaveBeenCalledWith(mockContext);
      expect((panel as any).insightPluginBasePath)
        .toBe('/mock/insight/base');
      expect((panel as any).serverDir)
        .toBe(path.join('/mock/insight/base', 'server'));
    });
  });

  describe('initialization on Windows', () => {
    it('skips webview setup when the insight base path is empty', async () => {
      resolveInsightPathMock.mockReturnValue('');

      const panel = await createPanel('');

      expect(mockWebview.html)
        .toBe('');
      expect(postedCommands())
        .not
        .toContain('renderAllIframes');
      expect((panel as any).socketBridge)
        .toBeUndefined();
    });

    it('serves the default html when no index.html exists', async () => {
      const panel = await createPanel(path.join(makeTempDir(), 'nonexistent'));

      expect(mockWebview.html)
        .toContain('vscode-theme-overrides');
      expect(mockWebview.html)
        .toContain('insight.dataViewerTitle');
      expect((panel as any).socketBridge)
        .toBeDefined();
    });

    it('injects the theme bridge and loading overlay and sends empty iframes', async () => {
      const warnSpy = jest.spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      const panel = await createPanel(makeTempDir(), '/bin/win');

      expect(mockWebview.html)
        .toContain('vscode-theme-overrides');
      expect(mockWebview.html)
        .toContain('hw-insight-loader');

      const renderMessage = postedMessage('renderAllIframes');

      expect(renderMessage)
        .toBeDefined();
      expect(renderMessage.iframes)
        .toEqual([]);
      expect(renderMessage.wsPort)
        .toBeNull();
      expect(renderMessage.binPath)
        .toBe('/bin/win');

      expect(postedCommands())
        .toContain('updateTheme');
      warnSpy.mockRestore();
    });

    it('preserves real index.html content and strips previous override markup', async () => {
      const base = makeTempDir();

      fs.writeFileSync(
        path.join(base, 'index.html'),
        `<html><head><style id="vscode-theme-overrides">OLD-STYLE</style></head>
<body><script id="vscode-theme-overrides-script">OLD-SCRIPT</script>
<!-- hw-insight-loader:start -->OLD-LOADER<!-- hw-insight-loader:end -->
<p>hello-insight-content</p></body></html>`,
      );

      await createPanel(base);

      expect(mockWebview.html)
        .toContain('hello-insight-content');
      expect(mockWebview.html)
        .not
        .toContain('OLD-STYLE');
      expect(mockWebview.html)
        .not
        .toContain('OLD-SCRIPT');
      expect(mockWebview.html)
        .not
        .toContain('OLD-LOADER');
      expect((mockWebview.html.match(/<style id="vscode-theme-overrides">/g) || []))
        .toHaveLength(1);
      expect(mockWebview.html)
        .toContain('hw-insight-loader');
    });

    it('notifies the webview when reading the index.html fails', async () => {
      const base = makeTempDir();

      fs.writeFileSync(path.join(base, 'index.html'), '<html>x</html>');

      const error = Object.assign(new Error('EACCES'), { code: 'EACCES' });

      jest.spyOn(fs.promises, 'readFile')
        .mockRejectedValueOnce(error);
      jest.spyOn(console, 'error')
        .mockImplementation(() => undefined);

      const panel = await createPanel(base);

      expect(postedCommands())
        .toContain('insightLoadFailed');
      expect((panel as any).initializationPromise)
        .toBeDefined();
    });
  });

  describe('profiler server startup on non-Windows', () => {
    beforeEach(() => {
      (os.platform as jest.Mock)
        .mockReturnValue('linux');
    });

    it('starts profiler_server and reports the allocated port', async () => {
      const base = makeServerReadyBase();
      const child = makeMockChild();

      spawnMock.mockReturnValue(child);

      await createPanel(base, '/bin/server');

      expect(spawnMock)
        .toHaveBeenCalledWith(
          path.join(base, 'server', 'profiler_server'),
          [
            '--wsPort=9000',
            '--wsHost=0.0.0.0',
            `--logPath=${path.join(base, '.msinsight')}`,
          ],
          expect.objectContaining({
            cwd: path.join(base, 'server'),
            shell: false,
            env: expect.objectContaining({ LD_LIBRARY_PATH: path.join(base, 'server') }),
          }),
        );

      const renderMessage = postedMessage('renderAllIframes');

      expect(renderMessage.wsPort)
        .toBe(9000);
      expect(renderMessage.binPath)
        .toBe('/bin/server');
      expect(fs.existsSync(path.join(base, '.msinsight')))
        .toBe(true);
      expect(postedCommands())
        .not
        .toContain('insightLoadFailed');
    });

    it('fails startup and dismisses the overlay when the server never listens', async () => {
      const base = makeServerReadyBase();

      // The child reports a spawn error before the readiness probe succeeds,
      // and the probe itself keeps failing, so both failure branches run.
      netTest.setSocketResult('error');
      spawnMock.mockImplementation(() => {
        const child = makeMockChild();

        setImmediate(() => child.cbs.error?.(new Error('spawn EACCES')));

        return child;
      });

      await createPanel(base, '/bin/dead');

      expect(showErrorMessageMock)
        .toHaveBeenCalledWith('insight.profilerServerStartFailed: spawn EACCES');
      expect(showErrorMessageMock)
        .toHaveBeenCalledWith('insight.profilerServerStartFailed: profiler_server is not listening on port 9000');
      expect(postedCommands())
        .toContain('insightLoadFailed');
      expect(postedCommands())
        .not
        .toContain('renderAllIframes');
    });

    it('shows an error when no port in the range is available', async () => {
      const base = makeServerReadyBase();

      netTest.setServerResult('taken');

      await createPanel(base, '/bin/noport');

      expect(showErrorMessageMock)
        .toHaveBeenCalledWith('insight.cannotGetPort');
      expect(postedCommands())
        .toContain('insightLoadFailed');
    });

    it('reports a spawn error and nulls the process', async () => {
      const base = makeServerReadyBase();
      const child = makeMockChild();

      spawnMock.mockReturnValue(child);

      const panel = await createPanel(base, '/bin/spawnerr');

      child.cbs.error(new Error('spawn EACCES'));

      expect(showErrorMessageMock)
        .toHaveBeenCalledWith('insight.profilerServerStartFailed: spawn EACCES');
      expect((panel as any).profilerServerProcess)
        .toBeNull();
    });

    it('warns when the server process exits with a non-zero code', async () => {
      const base = makeServerReadyBase();
      const child = makeMockChild();

      spawnMock.mockReturnValue(child);

      await createPanel(base, '/bin/exit');

      child.cbs.close(3);

      expect(showWarningMessageMock)
        .toHaveBeenCalledWith('insight.profilerServerExitCode');

      showWarningMessageMock.mockClear();
      child.cbs.close(0);
      expect(showWarningMessageMock)
        .not
        .toHaveBeenCalled();
    });

    it('does not warn when the server exits with a null code', async () => {
      const base = makeServerReadyBase();
      const child = makeMockChild();

      spawnMock.mockReturnValue(child);

      await createPanel(base, '/bin/nullcode');

      child.cbs.close(null);

      expect(showWarningMessageMock)
        .not
        .toHaveBeenCalled();
    });

    it('retries the readiness probe while the server process stays alive', async () => {
      const base = makeServerReadyBase();
      const child = makeMockChild();

      spawnMock.mockReturnValue(child);
      // First probe fails, the retry after the backoff succeeds.
      netTest.setSocketResults(['error']);

      await createPanel(base, '/bin/retry');

      expect(netTest.sockets.length)
        .toBeGreaterThanOrEqual(2);
      expect(postedMessage('renderAllIframes').wsPort)
        .toBe(9000);
      expect(postedCommands())
        .not
        .toContain('insightLoadFailed');
    });

    it('reuses an existing log directory instead of recreating it', async () => {
      const base = makeServerReadyBase();
      const child = makeMockChild();

      spawnMock.mockReturnValue(child);
      fs.mkdirSync(path.join(base, '.msinsight'), { recursive: true });

      await createPanel(base, '/bin/logdir');

      expect(postedMessage('renderAllIframes').wsPort)
        .toBe(9000);
    });

    it('reports failure when the server directory is not ready', async () => {
      const base = makeTempDir();

      await createPanel(base, '/bin/noserver');

      expect(showErrorMessageMock)
        .toHaveBeenCalledWith('insight.serverZipMissing');
      expect(postedCommands())
        .toContain('insightLoadFailed');
      expect(postedCommands())
        .not
        .toContain('renderAllIframes');
    });

    it('handles a synchronous spawn failure', async () => {
      const base = makeServerReadyBase();

      spawnMock.mockImplementation(() => {
        throw new Error('spawn boom');
      });

      await createPanel(base, '/bin/syncthrow');

      expect(showErrorMessageMock)
        .toHaveBeenCalledWith('insight.profilerServerStartFailed: spawn boom');
      expect(postedCommands())
        .toContain('insightLoadFailed');
    });

    it('forwards server stdout and stderr output to the logs', async () => {
      const base = makeServerReadyBase();
      const child = makeMockChild();

      spawnMock.mockReturnValue(child);

      await createPanel(base, '/bin/stdio');

      const outCallback = child.stdout.on.mock.calls
        .find((call) => call[0] === 'data')?.[1];
      const errCallback = child.stderr.on.mock.calls
        .find((call) => call[0] === 'data')?.[1];
      const errorSpy = jest.spyOn(console, 'error')
        .mockImplementation(() => undefined);

      outCallback?.(Buffer.from('hello out'));
      errCallback?.(Buffer.from('hello err'));

      expect(errorSpy)
        .toHaveBeenCalledWith('[profiler_server] hello err');
      errorSpy.mockRestore();
    });

    it('ignores duplicate socket events for the same readiness probe', async () => {
      const base = makeServerReadyBase();
      const child = makeMockChild();

      spawnMock.mockReturnValue(child);
      // The connect event settles the probe; the error that follows on the
      // same socket must be ignored.
      netTest.setSocketResults(['both']);

      await createPanel(base, '/bin/both');

      expect(postedMessage('renderAllIframes').wsPort)
        .toBe(9000);
      expect(postedCommands())
        .not
        .toContain('insightLoadFailed');
    });

    it('treats a timed-out readiness probe as unreachable and retries', async () => {
      const base = makeServerReadyBase();
      const child = makeMockChild();

      spawnMock.mockReturnValue(child);
      netTest.setSocketResults(['timeout']);

      await createPanel(base, '/bin/timeout');

      expect(netTest.sockets.length)
        .toBeGreaterThanOrEqual(2);
      expect(postedMessage('renderAllIframes').wsPort)
        .toBe(9000);
    });

    it('gives up waiting once the readiness deadline passes', async () => {
      const panel = await createPanel('');
      const child = makeMockChild();

      (panel as any).profilerServerProcess = child;
      netTest.setSocketResult('error');

      await expect((panel as any).waitForServerReady(9000, 100))
        .resolves
        .toBe(false);
    });

    it('reports a failure when resolving the server port throws', async () => {
      const panel = new InsightDataViewerPanel(mockPanel, mockContext, '/bin/throwport');

      createdPanels.push(panel);
      let resolveCalls = 0;

      (panel as any).resolveServerPortReady = (): void => {
        resolveCalls += 1;

        if (resolveCalls <= 2) {
          throw new Error('port ready boom');
        }
      };

      const warnSpy = jest.spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      const errorSpy = jest.spyOn(console, 'error')
        .mockImplementation(() => undefined);

      await (panel as any).initializationPromise;

      expect(errorSpy)
        .toHaveBeenCalledWith(
          expect.stringContaining('Failed to start profiler_server:'),
          expect.any(Error),
        );
      expect(showErrorMessageMock)
        .toHaveBeenCalledWith('insight.profilerServerStartFailed: port ready boom');
      expect(postedCommands())
        .toContain('insightLoadFailed');
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('reports non-Error failures from the profiler server startup', async () => {
      const base = makeServerReadyBase();
      const panel = new InsightDataViewerPanel(mockPanel, mockContext, '/bin/strthrow', base);

      createdPanels.push(panel);
      const errorSpy = jest.spyOn(console, 'error')
        .mockImplementation(() => undefined);

      (panel as any).allocateAvailablePort = async (): Promise<number | null> => {
        throw 'no ports';
      };

      await (panel as any).initializationPromise;

      expect(showErrorMessageMock)
        .toHaveBeenCalledWith('insight.profilerServerStartFailed: no ports');
      expect(postedCommands())
        .toContain('insightLoadFailed');
      errorSpy.mockRestore();
    });

    it('uses the default port range when none is provided', async () => {
      const panel = await createPanel('');

      await expect((panel as any).allocateAvailablePort())
        .resolves
        .toBe(9000);
    });
  });

  describe('ensureServerDirectoryExists', () => {
    it('accepts an existing server directory and file', async () => {
      (os.platform as jest.Mock)
        .mockReturnValue('linux');
      const base = makeServerReadyBase();
      const chmodSpy = jest.spyOn(fs.promises, 'chmod');

      const panel = await createPanel(base);

      expect(await (panel as any).ensureServerDirectoryExists())
        .toBe(true);
      expect(chmodSpy)
        .toHaveBeenCalledWith(path.join(base, 'server', 'profiler_server'), 0o755);
      chmodSpy.mockRestore();
    });

    it('warns when the zip is missing and reports failure', async () => {
      const base = makeTempDir();
      const warnSpy = jest.spyOn(console, 'warn')
        .mockImplementation(() => undefined);

      const panel = await createPanel(base);

      expect(await (panel as any).ensureServerDirectoryExists())
        .toBe(false);
      expect(showErrorMessageMock)
        .toHaveBeenCalledWith('insight.serverZipMissing');
      warnSpy.mockRestore();
    });

    it('warns when the server directory exists but profiler_server is missing', async () => {
      const base = makeTempDir();

      fs.mkdirSync(path.join(base, 'server'), { recursive: true });
      const warnSpy = jest.spyOn(console, 'warn')
        .mockImplementation(() => undefined);

      const panel = await createPanel(base);

      expect(await (panel as any).ensureServerDirectoryExists())
        .toBe(false);
      expect(warnSpy)
        .toHaveBeenCalledWith(expect.stringContaining('profiler_server file does not'));
      expect(showErrorMessageMock)
        .toHaveBeenCalledWith('insight.serverZipMissing');
      warnSpy.mockRestore();
    });

    it('warns when setting the server executable permission fails', async () => {
      (os.platform as jest.Mock)
        .mockReturnValue('linux');
      const base = makeServerReadyBase();
      const chmodSpy = jest.spyOn(fs.promises, 'chmod')
        .mockRejectedValue(new Error('EPERM'));
      const warnSpy = jest.spyOn(console, 'warn')
        .mockImplementation(() => undefined);

      const panel = await createPanel(base);

      expect(await (panel as any).ensureServerDirectoryExists())
        .toBe(true);
      expect(warnSpy)
        .toHaveBeenCalledWith(
          expect.stringContaining('Failed to set execute permission'),
          expect.any(Error),
        );
      chmodSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('extracts the platform zip and reports success', async () => {
      const base = makeTempDir();

      createZipFile(path.join(base, 'zip', 'server_x86.zip'), { 'server/profiler_server': '#!/bin/sh\n' });

      const panel = await createPanel(base);

      expect(await (panel as any).ensureServerDirectoryExists())
        .toBe(true);
      expect(fs.existsSync(path.join(base, 'server', 'profiler_server')))
        .toBe(true);
    });

    it('reports when the extracted zip lacks the server directory', async () => {
      const base = makeTempDir();

      createZipFile(path.join(base, 'zip', 'server_x86.zip'), { 'other/tool': 'x' });

      const panel = await createPanel(base);

      expect(await (panel as any).ensureServerDirectoryExists())
        .toBe(false);
      expect(showErrorMessageMock)
        .toHaveBeenCalledWith('insight.serverDirStillMissing');
    });

    it('reports when the extracted zip lacks profiler_server', async () => {
      const base = makeTempDir();

      createZipFile(path.join(base, 'zip', 'server_x86.zip'), { 'server/only.txt': 'x' });

      const panel = await createPanel(base);

      expect(await (panel as any).ensureServerDirectoryExists())
        .toBe(false);
      expect(showErrorMessageMock)
        .toHaveBeenCalledWith('insight.profilerServerFileStillMissing');
    });

    it('reports a failed unzip', async () => {
      const base = makeTempDir();

      fs.mkdirSync(path.join(base, 'zip'), { recursive: true });
      fs.writeFileSync(path.join(base, 'zip', 'server_x86.zip'), 'corrupt content', 'utf8');

      const panel = await createPanel(base);

      expect(await (panel as any).ensureServerDirectoryExists())
        .toBe(false);
      expect(showErrorMessageMock)
        .toHaveBeenCalledWith(expect.stringContaining('insight.unzipArchiveFailed'));
    });

    it('extracts the arm zip when the platform architecture is arm', async () => {
      (os.arch as jest.Mock)
        .mockReturnValue('arm64');
      const base = makeTempDir();

      createZipFile(path.join(base, 'zip', 'server_arm.zip'), { 'server/profiler_server': '#!/bin/sh\n' });

      const panel = await createPanel(base);

      expect(await (panel as any).ensureServerDirectoryExists())
        .toBe(true);
      expect(fs.existsSync(path.join(base, 'server', 'profiler_server')))
        .toBe(true);
    });

    it('reports unzip failures that are not Error instances', async () => {
      const base = makeTempDir();

      createZipFile(path.join(base, 'zip', 'server_x86.zip'), { 'server/profiler_server': '#!/bin/sh\n' });
      const errorSpy = jest.spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const panel = await createPanel(base);

      (panel as any).extractZip = async (): Promise<void> => {
        throw 'unzip boom';
      };

      expect(await (panel as any).ensureServerDirectoryExists())
        .toBe(false);
      expect(showErrorMessageMock)
        .toHaveBeenCalledWith('insight.unzipArchiveFailed: unzip boom');
      errorSpy.mockRestore();
    });
  });

  describe('detectArchitecture', () => {
    it('returns x86 for x86-like architectures', async () => {
      (os.arch as jest.Mock)
        .mockReturnValue('x64');

      const panel = await createPanel('');

      expect((panel as any).detectArchitecture())
        .toBe('x86');

      (os.arch as jest.Mock)
        .mockReturnValue('ia32');
      expect((panel as any).detectArchitecture())
        .toBe('x86');
    });

    it('returns arm for arm-like architectures', async () => {
      (os.arch as jest.Mock)
        .mockReturnValue('arm64');

      const panel = await createPanel('');

      expect((panel as any).detectArchitecture())
        .toBe('arm');
    });

    it('defaults to x86 with a warning for unknown architectures', async () => {
      (os.arch as jest.Mock)
        .mockReturnValue('mips');
      const warnSpy = jest.spyOn(console, 'warn')
        .mockImplementation(() => undefined);

      const panel = await createPanel('');

      expect((panel as any).detectArchitecture())
        .toBe('x86');
      expect(warnSpy)
        .toHaveBeenCalledWith(expect.stringContaining('Unknown architecture'));
      warnSpy.mockRestore();
    });
  });

  describe('extractZip', () => {
    it('translates non-Error unzip failures', async () => {
      const base = makeTempDir();
      const zipPath = path.join(base, 'ok.zip');
      const panel = await createPanel('');

      createZipFile(zipPath, { 'server/profiler_server': '#!/bin/sh\n' });
      (AdmZip as any).__mockState.extractAllToError = 'unzip boom';

      try {
        await expect((panel as any).extractZip(zipPath, path.join(base, 'out')))
          .rejects
          .toThrow('insight.unzipFailed: unzip boom');
      }
      finally {
        (AdmZip as any).__mockState.extractAllToError = undefined;
      }
    });

    it('rejects with a translated error when the zip is corrupt', async () => {
      const base = makeTempDir();
      const zipPath = path.join(base, 'bad.zip');
      const panel = await createPanel('');

      fs.writeFileSync(zipPath, 'not a zip', 'utf8');

      await expect((panel as any).extractZip(zipPath, path.join(base, 'out')))
        .rejects
        .toThrow('insight.unzipFailed');
    });

    it('extracts a valid zip into the target directory', async () => {
      const base = makeTempDir();
      const zipPath = path.join(base, 'good.zip');
      const outDir = path.join(base, 'out');

      createZipFile(zipPath, { 'server/profiler_server': '#!/bin/sh\n' });

      const panel = await createPanel('');

      await (panel as any).extractZip(zipPath, outDir);

      expect(fs.existsSync(path.join(outDir, 'server', 'profiler_server')))
        .toBe(true);
    });
  });

  describe('html caching', () => {
    it('caches injected html per file stat and re-reads when the file changes', async () => {
      const base = makeTempDir();
      const htmlPath = path.join(base, 'index.html');

      fs.writeFileSync(htmlPath, '<html>v1</html>');

      const readSpy = jest.spyOn(fs.promises, 'readFile');
      const panel = await createPanel('');

      const first = await (panel as any).readInjectedHtmlFile(htmlPath);
      const second = await (panel as any).readInjectedHtmlFile(htmlPath);

      expect(second)
        .toBe(first);
      expect(readSpy)
        .toHaveBeenCalledTimes(1);

      fs.writeFileSync(htmlPath, '<html>version two longer</html>');

      const third = await (panel as any).readInjectedHtmlFile(htmlPath);

      expect(third)
        .not
        .toBe(first);
      expect(readSpy)
        .toHaveBeenCalledTimes(2);
      readSpy.mockRestore();
    });

    it('returns null for missing files when allowed and rethrows otherwise', async () => {
      const base = makeTempDir();
      const panel = await createPanel('');

      expect(await (panel as any).readInjectedHtmlFile(path.join(base, 'missing.html'), true))
        .toBeNull();

      await expect((panel as any).readInjectedHtmlFile(path.join(base, 'missing.html')))
        .rejects
        .toThrow();

      const error = Object.assign(new Error('EACCES'), { code: 'EACCES' });

      jest.spyOn(fs.promises, 'readFile')
        .mockRejectedValue(error);
      fs.writeFileSync(path.join(base, 'index.html'), '<html>x</html>');

      await expect((panel as any).readInjectedHtmlFile(path.join(base, 'index.html'), true))
        .rejects
        .toThrow('EACCES');
    });

    it('skips html larger than the cache budget', async () => {
      const panel = await createPanel('');
      const panelClass = InsightDataViewerPanel as unknown as {
        htmlCacheBudgetBytes: number;
        htmlCache: Map<string, { html: string;
          sizeBytes: number }>;
      };

      panelClass.htmlCacheBudgetBytes = 100;

      await (InsightDataViewerPanel as any).setCachedHtml('oversized', 'x'.repeat(200));

      expect(panelClass.htmlCache.has('oversized'))
        .toBe(false);
    });

    it('evicts the oldest entry when the cache exceeds the budget', async () => {
      const panel = await createPanel('');
      const panelClass = InsightDataViewerPanel as unknown as {
        htmlCacheBudgetBytes: number;
        htmlCache: Map<string, { html: string;
          sizeBytes: number }>;
        htmlCacheSizeBytes: number;
      };

      panelClass.htmlCacheBudgetBytes = 100;

      await (InsightDataViewerPanel as any).setCachedHtml('first', 'x'.repeat(60));
      await (InsightDataViewerPanel as any).setCachedHtml('second', 'x'.repeat(60));

      expect(panelClass.htmlCache.has('first'))
        .toBe(false);
      expect(panelClass.htmlCache.has('second'))
        .toBe(true);
      expect(panelClass.htmlCacheSizeBytes)
        .toBe(60);
    });

    it('replaces an existing entry when the same key is cached again', async () => {
      const panel = await createPanel('');
      const panelClass = InsightDataViewerPanel as unknown as {
        htmlCacheBudgetBytes: number;
        htmlCache: Map<string, { html: string;
          sizeBytes: number }>;
        htmlCacheSizeBytes: number;
      };

      await (InsightDataViewerPanel as any).setCachedHtml('same-key', 'x'.repeat(50));
      await (InsightDataViewerPanel as any).setCachedHtml('same-key', 'y'.repeat(70));

      expect(panelClass.htmlCache.get('same-key')?.html)
        .toBe('y'.repeat(70));
      expect(panelClass.htmlCacheSizeBytes)
        .toBe(70);
    });

    it('stops evicting once the cache has no entries left to remove', async () => {
      const panel = await createPanel('');
      const panelClass = InsightDataViewerPanel as unknown as {
        htmlCacheBudgetBytes: number;
        htmlCache: Map<string, { html: string;
          sizeBytes: number }>;
        htmlCacheSizeBytes: number;
      };

      // Inflate the byte counter while the map stays empty so the eviction
      // loop is entered with nothing left to evict.
      panelClass.htmlCacheBudgetBytes = 100;
      panelClass.htmlCacheSizeBytes = 200;

      await (InsightDataViewerPanel as any).setCachedHtml('only', 'x'.repeat(10));

      expect(panelClass.htmlCache.has('only'))
        .toBe(false);
    });
  });

  describe('injectThemeOverrides', () => {
    it('injects the theme bridge before </head> and the loader before the last </body>', async () => {
      const panel = await createPanel('');

      const html = '<html><head><title>t</title></head><body><p>x</p></body></html>';
      const result = (panel as any).injectThemeOverrides(html, true);

      expect(result.indexOf('vscode-theme-overrides'))
        .toBeLessThan(result.indexOf('</head>'));
      expect(result.indexOf('hw-insight-loader'))
        .toBeLessThan(result.lastIndexOf('</body>'));
    });

    it('falls back to </body> when </head> is absent and appends when neither exists', async () => {
      const panel = await createPanel('');

      const noHead = '<html><body><p>x</p></body></html>';
      const withBodyFallback = (panel as any).injectThemeOverrides(noHead, false);

      expect(withBodyFallback.indexOf('vscode-theme-overrides'))
        .toBeLessThan(withBodyFallback.indexOf('</body>'));

      const bare = '<html><p>bare</p></html>';
      const appended = (panel as any).injectThemeOverrides(bare, false);

      expect(appended.indexOf('vscode-theme-overrides'))
        .toBeGreaterThan(appended.indexOf('bare'));
    });

    it('does not add the loading overlay when not requested', async () => {
      const panel = await createPanel('');

      const result = (panel as any).injectThemeOverrides('<html><head></head><body></body></html>', false);

      expect(result)
        .not
        .toContain('hw-insight-loader');
    });

    it('defaults to no loading overlay when the flag is omitted', async () => {
      const panel = await createPanel('');

      const result = (panel as any).injectThemeOverrides('<html><head></head><body></body></html>');

      expect(result)
        .toContain('vscode-theme-overrides');
      expect(result)
        .not
        .toContain('hw-insight-loader');
    });

    it('inserts before the primary tag using default fallback tags', async () => {
      const panel = await createPanel('');

      const result = (panel as any).injectBeforeTag(
        '<html><head></head><body></body></html>',
        '</head>',
        '<style>i{}</style>',
      );

      expect(result)
        .toContain('<style>i{}</style>\n</head>');
    });

    it('targets the last </body> when the document embeds one inside a script', async () => {
      const panel = await createPanel('');

      const html = '<html><head></head><body><p>x</p></body><script>var s = "</body>";</script></body></html>';
      const result = (panel as any).injectThemeOverrides(html, true);

      const loaderIndex = result.indexOf('hw-insight-loader');
      const firstBodyIndex = result.indexOf('</body>');
      const lastBodyIndex = result.lastIndexOf('</body>');

      expect(loaderIndex)
        .toBeGreaterThan(firstBodyIndex);
      expect(loaderIndex)
        .toBeLessThan(lastBodyIndex);
    });
  });

  describe('addInsightTranslationAliases', () => {
    it('adds the CacheFrameTooltip alias before CacheTooltip', async () => {
      const panel = await createPanel('');

      const result = (panel as any).addInsightTranslationAliases('{"CacheTooltip": "缓存提示"}');

      expect(result)
        .toContain('"CacheFrameTooltip"');
      expect(result)
        .toContain('"CacheTooltip"');
    });

    it('leaves an existing CacheFrameTooltip alias untouched', async () => {
      const panel = await createPanel('');
      const html = '{"CacheFrameTooltip":"existing","CacheTooltip":"other"}';

      expect((panel as any).addInsightTranslationAliases(html))
        .toBe(html);
    });
  });

  describe('handleWebviewMessage', () => {
    it('answers getTheme requests through the theme bridge', async () => {
      const panel = await createPanel('');

      (panel as any).handleWebviewMessage({ command: 'getTheme' });

      expect(postedCommands())
        .toContain('updateTheme');
    });

    it('posts the current theme when the webview signals ready', async () => {
      const panel = await createPanel('');

      (panel as any).handleWebviewMessage({ command: 'ready' });

      expect(postedCommands())
        .toContain('updateTheme');
    });

    it('routes webview messages through the registered message listener', async () => {
      await createPanel('');

      const listener = mockWebview.onDidReceiveMessage.mock.calls[0][0];

      listener({ command: 'ready' });

      expect(postedCommands())
        .toContain('updateTheme');
    });

    it('logs an error for ws messages when the socket bridge is missing', async () => {
      resolveInsightPathMock.mockReturnValue('');

      const panel = await createPanel('');
      const errorSpy = jest.spyOn(console, 'error')
        .mockImplementation(() => undefined);

      (panel as any).handleWebviewMessage({
        type: 'ws:open',
        id: '1',
        url: 'ws://x',
      });

      expect(errorSpy)
        .toHaveBeenCalledWith('[InsightDataViewerPanel] NodeWebviewSocketBridge is not initialized!');
      errorSpy.mockRestore();
    });

    it('leaves ws messages to the socket bridge when it exists', async () => {
      const base = makeTempDir();

      fs.writeFileSync(path.join(base, 'index.html'), '<html>x</html>');

      const panel = await createPanel(base);
      const errorSpy = jest.spyOn(console, 'error')
        .mockImplementation(() => undefined);

      (panel as any).handleWebviewMessage({
        type: 'ws:send',
        id: '1',
        payload: '{}',
      });

      expect(errorSpy)
        .not
        .toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('handles ws:close messages like the other ws message types', async () => {
      resolveInsightPathMock.mockReturnValue('');
      const panel = await createPanel('');
      const errorSpy = jest.spyOn(console, 'error')
        .mockImplementation(() => undefined);

      (panel as any).handleWebviewMessage({
        type: 'ws:close',
        id: '1',
        url: 'ws://x',
      });

      expect(errorSpy)
        .toHaveBeenCalledWith('[InsightDataViewerPanel] NodeWebviewSocketBridge is not initialized!');
      errorSpy.mockRestore();
    });

    it('dispatches known commands to the webview message list', async () => {
      const panel = await createPanel('');
      const callback = (webviewMessageList as unknown as Array<{
        command: string;
        callback: jest.Mock;
      }>)[0].callback;

      (panel as any).handleWebviewMessage({
        command: 'webview-test-command',
        text: 'hi',
      });

      expect(callback)
        .toHaveBeenCalledTimes(1);
      const [
        message,
        that,
      ] = callback.mock.calls[0];

      expect(message)
        .toMatchObject({
          command: 'webview-test-command',
          text: 'hi',
        });
      expect(that.panel)
        .toBe(mockPanel);
      expect(that.context)
        .toBe(mockContext);
    });

    it('ignores unknown or empty messages', async () => {
      const panel = await createPanel('');

      expect(() => (panel as any).handleWebviewMessage({ command: 'no-such-command' }))
        .not
        .toThrow();
      expect(() => (panel as any).handleWebviewMessage({}))
        .not
        .toThrow();
    });
  });

  describe('loadAndSendAllIframes', () => {
    it('loads existing plugin html files and sends them to the webview', async () => {
      const base = makeTempDir();

      fs.mkdirSync(path.join(base, 'plugins', 'Cluster'), { recursive: true });
      fs.mkdirSync(path.join(base, 'plugins', 'Leaks'), { recursive: true });
      fs.writeFileSync(path.join(base, 'plugins', 'Cluster', 'communication.html'), '<html>comm</html>');
      fs.writeFileSync(path.join(base, 'plugins', 'Leaks', 'index.html'), '<html>leaks</html>');

      const warnSpy = jest.spyOn(console, 'warn')
        .mockImplementation(() => undefined);

      await createPanel(base, '/bin/iframes');

      const renderMessage = postedMessage('renderAllIframes');
      const iframes = renderMessage.iframes as Array<{ pluginName: string;
        filePath: string }>;

      expect(iframes)
        .toHaveLength(2);
      expect(iframes.map((item) => item.pluginName))
        .toEqual([
          'Communication',
          'leaks',
        ]);
      expect(iframes[0].filePath)
        .toBe(path.join(base, 'plugins', 'Cluster', 'communication.html'));
      warnSpy.mockRestore();
    });

    it('posts an empty iframe list when no plugin files exist', async () => {
      const warnSpy = jest.spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      const base = makeTempDir();

      await createPanel(base, '/bin/nofiles');

      expect(postedMessage('renderAllIframes').iframes)
        .toEqual([]);
      expect(warnSpy)
        .toHaveBeenCalledWith(expect.stringContaining('does not exist'));
      warnSpy.mockRestore();
    });

    it('does not post iframes after the panel was disposed', async () => {
      const panel = await createPanel('');

      mockWebview.postMessage.mockClear();
      (panel as any).isDisposed = true;

      await (panel as any).loadAndSendAllIframes();

      expect(mockWebview.postMessage)
        .not
        .toHaveBeenCalled();
    });

    it('notifies the webview when sending iframe content fails', async () => {
      const base = makeTempDir();
      const warnSpy = jest.spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      const panel = await createPanel(base, '/bin/postfail');
      const errorSpy = jest.spyOn(console, 'error')
        .mockImplementation(() => undefined);

      mockWebview.postMessage.mockClear();
      mockWebview.postMessage.mockImplementationOnce(() => {
        throw new Error('post boom');
      });

      await (panel as any).loadAndSendAllIframes();

      expect(errorSpy)
        .toHaveBeenCalledWith(
          expect.stringContaining('Failed to load and send iframe content'),
          expect.any(Error),
        );
      expect(postedCommands())
        .toContain('insightLoadFailed');
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    });
  });

  describe('loadIframeHtmlContent', () => {
    it('warns and returns null when reading a plugin file fails', async () => {
      const base = makeTempDir();

      fs.mkdirSync(path.join(base, 'plugins', 'Cluster'), { recursive: true });
      fs.writeFileSync(path.join(base, 'plugins', 'Cluster', 'communication.html'), '<html>comm</html>');

      const panel = await createPanel('');
      const warnSpy = jest.spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      const error = Object.assign(new Error('EACCES'), { code: 'EACCES' });

      jest.spyOn(fs.promises, 'readFile')
        .mockRejectedValueOnce(error);

      const result = await (panel as any).loadIframeHtmlContent(
        {
          model: 'Cluster',
          path: 'communication.html',
          iframeName: 'Communication',
        },
        path.join(base, 'plugins'),
      );

      expect(result)
        .toBeNull();
      expect(warnSpy)
        .toHaveBeenCalledWith(
          expect.stringContaining('Failed to read plugin file'),
          expect.any(Error),
        );
      warnSpy.mockRestore();
    });
  });

  describe('notifyWebviewLoadFailed', () => {
    it('posts the load failure command', async () => {
      const panel = await createPanel('');

      (panel as any).notifyWebviewLoadFailed();

      expect(postedCommands())
        .toContain('insightLoadFailed');
    });

    it('does nothing after disposal', async () => {
      const panel = await createPanel('');

      mockWebview.postMessage.mockClear();
      (panel as any).isDisposed = true;

      (panel as any).notifyWebviewLoadFailed();

      expect(mockWebview.postMessage)
        .not
        .toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('stops the profiler server, disposes bridges and the panel', async () => {
      (os.platform as jest.Mock)
        .mockReturnValue('linux');
      const base = makeServerReadyBase();
      const child = makeMockChild();

      spawnMock.mockReturnValue(child);

      const panel = await createPanel(base, '/bin/dispose');
      const opened = (InsightDataViewerPanel as unknown as {
        openedFiles: Map<string, InsightDataViewerPanel>;
      }).openedFiles;

      opened.set('/bin/dispose', panel);

      const themeBridgeDisposable = (
        vscode.window.onDidChangeActiveColorTheme as jest.Mock
      ).mock.results[0].value;

      panel.dispose();

      expect(child.kill)
        .toHaveBeenCalledWith('SIGTERM');
      expect(mockPanel.dispose)
        .toHaveBeenCalled();
      expect((panel as any).socketBridge)
        .toBeUndefined();
      expect(themeBridgeDisposable.dispose)
        .toHaveBeenCalled();
      expect(opened.has('/bin/dispose'))
        .toBe(false);
    });

    it('dispose is safe to call twice', async () => {
      const panel = await createPanel('');

      panel.dispose();
      panel.dispose();

      // The underlying vscode panel is re-disposed on every call (vscode
      // WebviewPanel.dispose itself is idempotent).
      expect(mockPanel.dispose)
        .toHaveBeenCalledTimes(2);
    });

    it('disposes when the vscode panel is closed', async () => {
      const panel = await createPanel('');

      const onDidDisposeMock = mockPanel.onDidDispose as jest.Mock;
      const disposeCallback = onDidDisposeMock.mock.calls[0][0];

      disposeCallback();

      expect(mockPanel.dispose)
        .toHaveBeenCalled();
      expect((panel as any).isDisposed)
        .toBe(true);
    });

    it('creates a fresh panel after the previous one was disposed', async () => {
      InsightDataViewerPanel.createOrShow(mockContext, '/bin/reopen');

      const opened = (InsightDataViewerPanel as unknown as {
        openedFiles: Map<string, InsightDataViewerPanel>;
      }).openedFiles;
      const first = opened.get('/bin/reopen')!;

      await (first as any).initializationPromise;
      first.dispose();

      InsightDataViewerPanel.createOrShow(mockContext, '/bin/reopen');

      const second = opened.get('/bin/reopen')!;

      expect(createWebviewPanelMock)
        .toHaveBeenCalledTimes(2);
      expect(second)
        .not
        .toBe(first);
      await (second as any).initializationPromise;
    });

    it('logs when killing the profiler server throws', async () => {
      (os.platform as jest.Mock)
        .mockReturnValue('linux');
      const base = makeServerReadyBase();
      const child = makeMockChild();

      child.kill.mockImplementation(() => {
        throw new Error('kill failed');
      });
      spawnMock.mockReturnValue(child);

      const panel = await createPanel(base, '/bin/killthrow');
      const errorSpy = jest.spyOn(console, 'error')
        .mockImplementation(() => undefined);

      panel.dispose();

      expect(errorSpy)
        .toHaveBeenCalledWith(
          expect.stringContaining('Failed to stop profiler_server'),
          expect.any(Error),
        );
      errorSpy.mockRestore();
    });
  });

  describe('debug logging', () => {
    it('enables debug logging when INSIGHT_THEME_DEBUG is set', () => {
      process.env.INSIGHT_THEME_DEBUG = '1';

      let loadedDebugFlag: boolean | undefined;

      jest.isolateModules(() => {
        const isolatedModule = jest.requireActual('../../class/insight-data-viewer-panel');

        loadedDebugFlag = (isolatedModule.InsightDataViewerPanel as unknown as {
          debugLoggingEnabled: boolean;
        }).debugLoggingEnabled;
      });

      expect(loadedDebugFlag)
        .toBe(true);
    });

    it('writes debug messages through logDebug when enabled', async () => {
      process.env.INSIGHT_THEME_DEBUG = '1';

      let IsolatedPanelClass: unknown;

      jest.isolateModules(() => {
        IsolatedPanelClass = (jest.requireActual('../../class/insight-data-viewer-panel') as {
          InsightDataViewerPanel: unknown;
        }).InsightDataViewerPanel;
      });

      const logSpy = jest.spyOn(console, 'log')
        .mockImplementation(() => undefined);
      const panel = new (IsolatedPanelClass as new (
        panel: unknown,
        context: unknown,
        binPath: string,
      )=> InsightDataViewerPanel)(mockPanel, mockContext, '/bin/debug');

      createdPanels.push(panel);
      await (panel as any).initializationPromise;

      (panel as any).logDebug('hello', 1);

      expect(logSpy)
        .toHaveBeenCalledWith('[InsightDataViewerPanel]', 'hello', 1);
      logSpy.mockRestore();
    });
  });
});
