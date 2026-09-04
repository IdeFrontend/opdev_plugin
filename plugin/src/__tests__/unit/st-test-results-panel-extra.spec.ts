/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const mockTransformDistHtml = jest.fn(async () => '<html>extra</html>');
const mockRegisterThemeBridge = jest.fn(() => ({ dispose: jest.fn() }));
const mockHandleThemeRequest = jest.fn(() => false);
const mockCreateWebviewPanel = jest.fn();
const mockOpenTextDocument = jest.fn();
const mockShowTextDocument = jest.fn();
const mockShowWarningMessage = jest.fn();
const mockShowErrorMessage = jest.fn();
const mockSetCurrentRun = jest.fn();
const connectors: Array<{
  receive: jest.Mock;
  addWebview: jest.Mock;
  removeWebview: jest.Mock;
  sendLatest: jest.Mock;
}> = [];

jest.mock('i18next', () => ({ t: (key: string) => key }));

jest.mock('@plugin/class/html-transformer', () => ({ HtmlTransformer: { transformDistHtml: mockTransformDistHtml } }));

jest.mock('@plugin/core/view/webview-theme', () => ({
  registerWebviewThemeBridge: mockRegisterThemeBridge,
  handleThemeRequest: mockHandleThemeRequest,
}));

// The real connector always delivers the receiver's own webview as the source,
// which makes the foreign-webview guard unreachable. Mock the connector so the
// receive callback can be driven with an arbitrary source webview.
jest.mock('@plugin/core/connector', () => ({
  WebviewConnector: jest.fn()
    .mockImplementation(() => {
      const connector = {
        receive: jest.fn(),
        addWebview: jest.fn(),
        removeWebview: jest.fn(),
        sendLatest: jest.fn(),
      };

      connectors.push(connector);

      return connector;
    }),
}));

jest.mock('vscode', () => {
  const pathModule = jest.requireActual<typeof import('path')>('path');

  return {
    env: { language: 'en' },
    ViewColumn: { Active: 1 },
    Uri: {
      file: (fsPath: string) => ({ fsPath }),
      joinPath: (base: { fsPath: string }, ...segments: string[]) => ({ fsPath: pathModule.join(base.fsPath, ...segments) }),
    },
    workspace: { openTextDocument: mockOpenTextDocument },
    window: {
      createWebviewPanel: mockCreateWebviewPanel,
      showTextDocument: mockShowTextDocument,
      showWarningMessage: mockShowWarningMessage,
      showErrorMessage: mockShowErrorMessage,
    },
  };
}, { virtual: true });

import * as vscode from 'vscode';

import { StTestResultsPanel } from '@plugin/class/st-test-results-panel';
import type { CompletedStTestArtifact } from '@plugin/domain/services/st-test-result-parser';
import { loadStTestRunHistory } from '@plugin/domain/services/st-test-run-history';
import type { StTestResultReportDto } from '@shared/st-test-results';

type FakeDisposable = {
  dispose: jest.Mock;
};

type FakeWebview = {
  cspSource: string;
  html: string;
  postMessage: jest.Mock;
  asWebviewUri: jest.Mock;
  onDidReceiveMessage: jest.Mock;
  receivers: Set<(message: unknown)=> void>;
  receiverDisposables: FakeDisposable[];
};

type FakePanel = {
  webview: FakeWebview;
  reveal: jest.Mock;
  dispose: jest.Mock;
  onDidDispose: jest.Mock;
  disposeCallback?: ()=> void;
  disposeRegistration: FakeDisposable;
};

describe('StTestResultsPanel (extra)', () => {
  let root: string;
  let runDirectory: string;
  let context: vscode.ExtensionContext;
  let panels: FakePanel[];
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    connectors.length = 0;
    consoleErrorSpy = jest.spyOn(console, 'error')
      .mockImplementation(() => undefined);
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-st-panel-extra-'));
    runDirectory = path.join(root, '.vscode', 'st-results', 'add', 'run-id');
    fs.mkdirSync(runDirectory, { recursive: true });
    context = {
      extensionPath: root,
      extensionUri: { fsPath: root },
    } as vscode.ExtensionContext;
    panels = [];
    mockOpenTextDocument.mockImplementation(async (uri) => ({ uri }));
    mockShowTextDocument.mockResolvedValue(undefined);
    mockShowWarningMessage.mockResolvedValue(undefined);
    mockShowErrorMessage.mockResolvedValue(undefined);
    StTestResultsPanel.setHistoryTreeProvider({ setCurrentRun: mockSetCurrentRun });
    mockCreateWebviewPanel.mockImplementation(() => {
      const webview = createWebview();
      const disposeRegistration = { dispose: jest.fn() };
      let disposed = false;
      const panel = {
        reveal: jest.fn(),
        dispose: jest.fn(() => {
          disposed = true;
          panel.disposeCallback?.();
        }),
        onDidDispose: jest.fn((callback: ()=> void) => {
          panel.disposeCallback = callback;

          return disposeRegistration;
        }),
        disposeRegistration,
      } as FakePanel;

      Object.defineProperty(panel, 'webview', {
        configurable: true,
        enumerable: true,
        get: () => {
          if (disposed) {
            throw new Error('Webview is disposed');
          }

          return webview;
        },
      });
      panels.push(panel);

      return panel;
    });
  });

  afterEach(() => {
    panels.forEach((panel) => panel.dispose());
    StTestResultsPanel.setHistoryTreeProvider(undefined);
    consoleErrorSpy.mockRestore();
    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
  });

  function createWebview(): FakeWebview {
    const receivers = new Set<(message: unknown)=> void>();
    const receiverDisposables: FakeDisposable[] = [];

    return {
      cspSource: 'vscode-webview://test',
      html: '',
      postMessage: jest.fn(async () => true),
      asWebviewUri: jest.fn((uri) => uri),
      receivers,
      receiverDisposables,
      onDidReceiveMessage: jest.fn((callback: (message: unknown)=> void) => {
        receivers.add(callback);
        const disposable = { dispose: jest.fn(() => receivers.delete(callback)) };

        receiverDisposables.push(disposable);

        return disposable;
      }),
    };
  }

  function createArtifact(
    artifactId: string,
    sequence: number,
    mode: 'kernel' | 'aclnn' = 'kernel',
  ): CompletedStTestArtifact {
    const outputCsvPath = path.join(runDirectory, mode, `${artifactId}.csv`);

    fs.mkdirSync(path.dirname(outputCsvPath), { recursive: true });
    fs.writeFileSync(outputCsvPath, 'result');

    return {
      artifactId,
      sequence,
      mode,
      inputCsvPath: path.join(root, 'operator', `${artifactId}-input.csv`),
      outputCsvPath,
    };
  }

  function createReport(
    runId: string,
    artifacts: readonly CompletedStTestArtifact[],
  ): StTestResultReportDto {
    return {
      runId,
      operatorName: 'add',
      runDirectory: `.vscode/st-results/add/${runId}`,
      outcome: 'passed',
      summary: {
        total: artifacts.length,
        passed: artifacts.length,
        failed: 0,
        invalid: 0,
        files: artifacts.length,
        invalidFiles: 0,
      },
      files: artifacts.map((artifact) => ({
        artifactId: artifact.artifactId,
        sequence: artifact.sequence,
        mode: artifact.mode,
        testFile: `${artifact.artifactId}-input.csv`,
        resultFile: `${artifact.artifactId}.csv`,
        rowCount: 1,
      })),
      rows: artifacts.map((artifact) => ({
        id: `${artifact.artifactId}:2`,
        artifactId: artifact.artifactId,
        mode: artifact.mode,
        testFile: `${artifact.artifactId}-input.csv`,
        testcaseName: artifact.artifactId,
        dynPrecision: '1',
        cstPrecision: '1',
        binPrecision: '1',
        precisionStatus: 'PASS',
        outcome: 'pass',
      })),
    };
  }

  async function flushAsyncActions(): Promise<void> {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  function panelReceiver(): (message: unknown, sourceWebview: unknown)=> void {
    const receive = connectors[0]?.receive;

    if (!receive) {
      throw new Error('Expected the panel connector to subscribe');
    }

    return receive.mock.calls[0][0] as (message: unknown, sourceWebview: unknown)=> void;
  }

  it('ignores actions arriving from a foreign webview', async () => {
    const artifact = createArtifact('first', 1);

    await StTestResultsPanel.createOrShow(
      context,
      createReport('run-id', [artifact]),
      [artifact],
      runDirectory,
    );
    const receiver = panelReceiver();

    receiver({
      type: 'openResultFile',
      artifactId: artifact.artifactId,
    }, { foreign: true });
    await flushAsyncActions();

    expect(mockShowWarningMessage).not.toHaveBeenCalled();
    expect(mockOpenTextDocument).not.toHaveBeenCalled();

    receiver({
      type: 'openResultFile',
      artifactId: artifact.artifactId,
    }, panels[0].webview);
    await flushAsyncActions();

    expect(mockOpenTextDocument)
      .toHaveBeenCalledWith({ fsPath: artifact.outputCsvPath });
    expect(mockShowTextDocument)
      .toHaveBeenCalledWith(
        { uri: { fsPath: artifact.outputCsvPath } },
        { preview: true },
      );
  });

  it('replaces a disposed current panel with a fresh one', async () => {
    const artifact = createArtifact('first', 1);

    (StTestResultsPanel as unknown as { currentPanel: unknown }).currentPanel = { disposed: true };

    await StTestResultsPanel.createOrShow(
      context,
      createReport('run-id', [artifact]),
      [artifact],
      runDirectory,
    );

    expect(mockCreateWebviewPanel)
      .toHaveBeenCalledTimes(1);
  });

  it('logs and swallows run history creation failures', () => {
    const artifact = createArtifact('orphan', 1);

    StTestResultsPanel.recordCompletedRun(
      createReport('run-id', []),
      [artifact],
      runDirectory,
      root,
    );

    expect(consoleErrorSpy)
      .toHaveBeenCalledWith('[ST test] Could not create run history metadata:', expect.any(Error));
    expect(mockSetCurrentRun).not.toHaveBeenCalled();
  });

  it('logs and swallows run history persistence failures', () => {
    const artifact = createArtifact('persist-fail', 1);
    const report = createReport('run-id', [artifact]);

    StTestResultsPanel.recordCompletedRun(
      report,
      [artifact],
      path.join(runDirectory, '..', 'other-run'),
      root,
    );

    expect(consoleErrorSpy)
      .toHaveBeenCalledWith('[ST test] Could not persist run history:', expect.any(Error));
    // The un-persisted record is still handed to the history tree provider.
    expect(mockSetCurrentRun)
      .toHaveBeenCalledWith(root, expect.objectContaining({ runId: 'run-id' }));
  });

  it('logs and swallows history tree refresh failures', () => {
    StTestResultsPanel.setHistoryTreeProvider({
      setCurrentRun: () => {
        throw new Error('tree boom');
      },
    });
    const artifact = createArtifact('refresh', 1);

    StTestResultsPanel.recordCompletedRun(
      createReport('run-id', [artifact]),
      [artifact],
      runDirectory,
      root,
    );

    expect(consoleErrorSpy)
      .toHaveBeenCalledWith('[ST test] Could not refresh the native run history:', expect.any(Error));
  });

  it('diagnoses changed historical artifacts as files with sizes', async () => {
    runDirectory = path.join(root, '.vscode', 'st-results', 'add', 'changed-run');
    fs.mkdirSync(runDirectory, { recursive: true });
    const historical = createArtifact('changed', 1);
    const historicalReport = createReport('changed-run', [historical]);

    StTestResultsPanel.recordCompletedRun(
      historicalReport,
      [historical],
      runDirectory,
      root,
    );
    const record = loadStTestRunHistory(path.dirname(runDirectory), 'add')[0];

    if (!record) {
      throw new Error('Expected the historical run to persist');
    }

    fs.writeFileSync(
      historical.outputCsvPath,
      'testcase_name,dyn_precision,cst_precision,bin_precision,precision_status\nchanged,1,1,1,FAIL\n',
    );

    const historyLog = jest.fn<void, [string]>();

    await expect(StTestResultsPanel.createOrShowHistorical(
      context,
      {
        workspaceRoot: root,
        record,
      },
      historyLog,
    ))
      .rejects
      .toThrow('Historical ST evidence no longer matches its manifest');
    expect(historyLog)
      .toHaveBeenCalledWith(expect.stringContaining('state=file'));
    expect(historyLog)
      .toHaveBeenCalledWith(expect.stringContaining('size='));
  });

  it('shows an error message when opening a result document fails', async () => {
    const artifact = createArtifact('open-fail', 1);

    await StTestResultsPanel.createOrShow(
      context,
      createReport('run-id', [artifact]),
      [artifact],
      runDirectory,
    );
    const receiver = panelReceiver();

    mockOpenTextDocument.mockRejectedValueOnce(new Error('disk error'));
    receiver({
      type: 'openResultFile',
      artifactId: artifact.artifactId,
    }, panels[0].webview);
    await flushAsyncActions();

    expect(mockShowErrorMessage)
      .toHaveBeenCalledWith('stTest.openResultFailed');
    expect(mockShowErrorMessage)
      .toHaveBeenCalledTimes(1);

    mockOpenTextDocument.mockRejectedValueOnce('unexpected-string-failure');
    receiver({
      type: 'openResultFile',
      artifactId: artifact.artifactId,
    }, panels[0].webview);
    await flushAsyncActions();

    expect(mockShowErrorMessage)
      .toHaveBeenCalledWith('stTest.openResultFailed');
    expect(mockShowErrorMessage)
      .toHaveBeenCalledTimes(2);
  });

  it('uses the default no-op logger when none is provided', async () => {
    runDirectory = path.join(root, '.vscode', 'st-results', 'add', 'default-log-run');
    fs.mkdirSync(runDirectory, { recursive: true });
    const historical = createArtifact('default-log', 1);
    const historicalReport = createReport('default-log-run', [historical]);

    StTestResultsPanel.recordCompletedRun(
      historicalReport,
      [historical],
      runDirectory,
      root,
    );
    const record = loadStTestRunHistory(path.dirname(runDirectory), 'add')[0];

    if (!record) {
      throw new Error('Expected the historical run to persist');
    }

    fs.writeFileSync(
      historical.outputCsvPath,
      'testcase_name,dyn_precision,cst_precision,bin_precision,precision_status\ndefault-log,1,1,1,FAIL\n',
    );

    await expect(StTestResultsPanel.createOrShowHistorical(context, {
      workspaceRoot: root,
      record,
    }))
      .rejects
      .toThrow('Historical ST evidence no longer matches its manifest');
  });

  it('diagnoses symlinked historical artifacts as symlinks', async () => {
    runDirectory = path.join(root, '.vscode', 'st-results', 'add', 'linked-run');
    fs.mkdirSync(runDirectory, { recursive: true });
    const linked = createArtifact('linked', 1);
    const linkedReport = createReport('linked-run', [linked]);

    fs.rmSync(linked.outputCsvPath);
    const targetDir = path.join(root, 'junction-target');

    fs.mkdirSync(targetDir, { recursive: true });
    fs.symlinkSync(targetDir, linked.outputCsvPath, 'junction');

    StTestResultsPanel.recordCompletedRun(
      linkedReport,
      [linked],
      runDirectory,
      root,
    );
    const record = loadStTestRunHistory(path.dirname(runDirectory), 'add')[0];

    if (!record) {
      throw new Error('Expected the historical run to persist');
    }

    const historyLog = jest.fn<void, [string]>();

    await expect(StTestResultsPanel.createOrShowHistorical(
      context,
      {
        workspaceRoot: root,
        record,
      },
      historyLog,
    ))
      .rejects
      .toThrow();
    expect(historyLog)
      .toHaveBeenCalledWith(expect.stringContaining('state=symlink'));
  });

  it('diagnoses directory historical artifacts as other', async () => {
    runDirectory = path.join(root, '.vscode', 'st-results', 'add', 'diry-run');
    fs.mkdirSync(runDirectory, { recursive: true });
    const diry = createArtifact('diry', 1);
    const diryReport = createReport('diry-run', [diry]);

    fs.rmSync(diry.outputCsvPath);
    fs.mkdirSync(diry.outputCsvPath, { recursive: true });

    StTestResultsPanel.recordCompletedRun(
      diryReport,
      [diry],
      runDirectory,
      root,
    );
    const record = loadStTestRunHistory(path.dirname(runDirectory), 'add')[0];

    if (!record) {
      throw new Error('Expected the historical run to persist');
    }

    const historyLog = jest.fn<void, [string]>();

    await expect(StTestResultsPanel.createOrShowHistorical(
      context,
      {
        workspaceRoot: root,
        record,
      },
      historyLog,
    ))
      .rejects
      .toThrow();
    expect(historyLog)
      .toHaveBeenCalledWith(expect.stringContaining('state=other'));
  });

  it('diagnoses missing historical artifacts as unavailable', async () => {
    runDirectory = path.join(root, '.vscode', 'st-results', 'add', 'ghost-run');
    fs.mkdirSync(runDirectory, { recursive: true });
    const ghost = createArtifact('ghost', 1);
    const ghostReport = createReport('ghost-run', [ghost]);

    fs.rmSync(ghost.outputCsvPath);

    StTestResultsPanel.recordCompletedRun(
      ghostReport,
      [ghost],
      runDirectory,
      root,
    );
    const record = loadStTestRunHistory(path.dirname(runDirectory), 'add')[0];

    if (!record) {
      throw new Error('Expected the historical run to persist');
    }

    const historyLog = jest.fn<void, [string]>();

    await expect(StTestResultsPanel.createOrShowHistorical(
      context,
      {
        workspaceRoot: root,
        record,
      },
      historyLog,
    ))
      .rejects
      .toThrow();
    expect(historyLog)
      .toHaveBeenCalledWith(expect.stringContaining('state=unavailable('));
  });
});
