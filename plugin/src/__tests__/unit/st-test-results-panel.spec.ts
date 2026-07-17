const mockTransformDistHtml = jest.fn(async () => '<html>results</html>');
const mockRegisterThemeBridge = jest.fn(() => ({ dispose: jest.fn() }));
const mockHandleThemeRequest = jest.fn(() => false);
const mockCreateWebviewPanel = jest.fn();
const mockOpenTextDocument = jest.fn();
const mockShowTextDocument = jest.fn();
const mockShowWarningMessage = jest.fn();
const mockShowErrorMessage = jest.fn();

jest.mock('i18next', () => ({ t: (key: string) => key }));

jest.mock('@plugin/class/html-transformer', () => ({ HtmlTransformer: { transformDistHtml: mockTransformDistHtml } }));

jest.mock('@plugin/core/view/webview-theme', () => ({
  registerWebviewThemeBridge: mockRegisterThemeBridge,
  handleThemeRequest: mockHandleThemeRequest,
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

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import { StTestResultsPanel } from '@plugin/class/st-test-results-panel';
import type { CompletedStTestArtifact } from '@plugin/domain/services/st-test-result-parser';
import { CONNECTOR_READY_CHANNEL } from '@shared/connector';
import {
  ST_TEST_RESULTS_CONNECT_CHANNEL,
  type StTestResultReportDto,
} from '@shared/st-test-results';

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

describe('StTestResultsPanel', () => {
  let root: string;
  let runDirectory: string;
  let context: vscode.ExtensionContext;
  let panels: FakePanel[];

  beforeEach(() => {
    jest.clearAllMocks();
    (vscode.env as { language: string }).language = 'en';
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-st-panel-'));
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
    mockCreateWebviewPanel.mockImplementation(() => {
      const webview = createWebview();
      const disposeRegistration = { dispose: jest.fn() };
      const panel = {
        webview,
        reveal: jest.fn(),
        dispose: jest.fn(() => panel.disposeCallback?.()),
        onDidDispose: jest.fn((callback: ()=> void) => {
          panel.disposeCallback = callback;

          return disposeRegistration;
        }),
        disposeRegistration,
      } as FakePanel;

      panels.push(panel);

      return panel;
    });
  });

  afterEach(() => {
    panels.forEach((panel) => panel.dispose());
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

  function fireMessage(webview: FakeWebview, message: unknown): void {
    [...webview.receivers].forEach((receiver) => receiver(message));
  }

  async function flushAsyncActions(): Promise<void> {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  function createDeferred<T>(): {
    promise: Promise<T>;
    resolve: (value: T)=> void;
    reject: (error: Error)=> void;
  } {
    let resolve!: (value: T)=> void;
    let reject!: (error: Error)=> void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });

    return {
      promise,
      resolve,
      reject,
    };
  }

  it('queues the initial report until connector readiness and applies packaged-only CSP inputs', async () => {
    const artifact = createArtifact('first', 1);
    const report = createReport('run-id', [artifact]);

    await StTestResultsPanel.createOrShow(context, report, [artifact], runDirectory);

    const panel = panels[0];

    expect(panel.webview.postMessage).not.toHaveBeenCalled();
    expect(mockCreateWebviewPanel.mock.calls[0][3])
      .toMatchObject({
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [{ fsPath: path.join(root, 'out', 'web') }],
      });
    expect(mockTransformDistHtml)
      .toHaveBeenCalledWith(
        path.join(root, 'out', 'web'),
        panel.webview,
        'panels/st-test-results',
        {
          lang: 'en',
          scriptSource: 'vscode-webview://test',
          styleSource: 'vscode-webview://test',
          fontSource: 'vscode-webview://test',
          imageSource: 'vscode-webview://test',
        },
      );

    fireMessage(panel.webview, {
      channel: CONNECTOR_READY_CHANNEL,
      data: ST_TEST_RESULTS_CONNECT_CHANNEL,
    });

    expect(panel.webview.postMessage)
      .toHaveBeenCalledWith({
        channel: ST_TEST_RESULTS_CONNECT_CHANNEL,
        data: report,
      });

    const html = fs.readFileSync(
      path.join(__dirname, '../../../../web/src/views/panels/st-test-results/st-test-results.html'),
      'utf8',
    );

    expect(html)
      .toContain("default-src 'none'");
    expect(html)
      .toContain("connect-src 'none'");
    expect(html)
      .toContain('<html lang="{{lang}}">');
    expect(html).not.toContain('data-vscode-lang');
    expect(html).not.toContain('unsafe-eval');
    expect(html).not.toMatch(/https?:\/\//);
  });

  it('delivers only the latest report when repeated runs finish before webview readiness', async () => {
    const first = createArtifact('first', 1);
    const second = createArtifact('second', 1, 'aclnn');
    const firstReport = createReport('first-run', [first]);
    const secondReport = createReport('second-run', [second]);

    await StTestResultsPanel.createOrShow(context, firstReport, [first], runDirectory);
    const panel = panels[0];

    await StTestResultsPanel.createOrShow(context, secondReport, [second], runDirectory);
    expect(panel.webview.postMessage)
      .not.toHaveBeenCalled();

    fireMessage(panel.webview, {
      channel: CONNECTOR_READY_CHANNEL,
      data: ST_TEST_RESULTS_CONNECT_CHANNEL,
    });

    expect(panel.webview.postMessage)
      .toHaveBeenCalledTimes(1);
    expect(panel.webview.postMessage)
      .toHaveBeenCalledWith({
        channel: ST_TEST_RESULTS_CONNECT_CHANNEL,
        data: secondReport,
      });
  });

  it('keeps the newest concurrent report and allow-list while one HTML initialization is pending', async () => {
    const deferredHtml = createDeferred<string>();
    const first = createArtifact('first', 1);
    const second = createArtifact('second', 1, 'aclnn');
    const firstReport = createReport('first-run', [first]);
    const secondReport = createReport('second-run', [second]);

    mockTransformDistHtml.mockImplementationOnce(() => deferredHtml.promise);

    const firstCreation = StTestResultsPanel.createOrShow(
      context,
      firstReport,
      [first],
      runDirectory,
    );
    const secondCreation = StTestResultsPanel.createOrShow(
      context,
      secondReport,
      [second],
      runDirectory,
    );

    expect(mockTransformDistHtml)
      .toHaveBeenCalledTimes(1);
    expect(mockCreateWebviewPanel)
      .toHaveBeenCalledTimes(1);
    expect(panels[0].reveal)
      .toHaveBeenCalledWith(1);

    deferredHtml.resolve('<html>ready</html>');
    await Promise.all([
      firstCreation,
      secondCreation,
    ]);

    fireMessage(panels[0].webview, {
      channel: CONNECTOR_READY_CHANNEL,
      data: ST_TEST_RESULTS_CONNECT_CHANNEL,
    });

    expect(panels[0].webview.postMessage)
      .toHaveBeenCalledTimes(1);
    expect(panels[0].webview.postMessage)
      .toHaveBeenCalledWith({
        channel: ST_TEST_RESULTS_CONNECT_CHANNEL,
        data: secondReport,
      });

    fireMessage(panels[0].webview, {
      channel: ST_TEST_RESULTS_CONNECT_CHANNEL,
      data: {
        type: 'openResultFile',
        artifactId: first.artifactId,
      },
    });
    fireMessage(panels[0].webview, {
      channel: ST_TEST_RESULTS_CONNECT_CHANNEL,
      data: {
        type: 'openResultFile',
        artifactId: second.artifactId,
      },
    });
    await flushAsyncActions();

    expect(mockShowWarningMessage)
      .toHaveBeenCalledWith('stTest.results.openRejected');
    expect(mockOpenTextDocument)
      .toHaveBeenCalledWith({ fsPath: second.outputCsvPath });
  });

  it('shares an initialization failure with every concurrent caller', async () => {
    const deferredHtml = createDeferred<string>();
    const first = createArtifact('first', 1);
    const second = createArtifact('second', 1, 'aclnn');

    mockTransformDistHtml.mockImplementationOnce(() => deferredHtml.promise);

    const firstCreation = StTestResultsPanel.createOrShow(
      context,
      createReport('first-run', [first]),
      [first],
      runDirectory,
    );
    const secondCreation = StTestResultsPanel.createOrShow(
      context,
      createReport('second-run', [second]),
      [second],
      runDirectory,
    );
    const firstFailure = expect(firstCreation)
      .rejects.toThrow('HTML initialization failed');
    const secondFailure = expect(secondCreation)
      .rejects.toThrow('HTML initialization failed');

    deferredHtml.reject(new Error('HTML initialization failed'));

    await Promise.all([
      firstFailure,
      secondFailure,
    ]);

    expect(mockTransformDistHtml)
      .toHaveBeenCalledTimes(1);
    expect(panels[0].dispose)
      .toHaveBeenCalledTimes(1);
  });

  it('normalizes every Chinese VS Code locale to the supported zh-cn content locale', async () => {
    (vscode.env as { language: string }).language = 'ZH-tw';
    const artifact = createArtifact('first', 1);

    await StTestResultsPanel.createOrShow(
      context,
      createReport('run-id', [artifact]),
      [artifact],
      runDirectory,
    );

    expect(mockTransformDistHtml.mock.calls[0][3])
      .toMatchObject({ lang: 'zh-cn' });
  });

  it('replaces the report and allow-list, rejecting stale and unknown artifact IDs', async () => {
    const first = createArtifact('first', 1);
    const second = createArtifact('second', 1, 'aclnn');
    const firstReport = createReport('first-run', [first]);
    const secondReport = createReport('second-run', [second]);

    await StTestResultsPanel.createOrShow(context, firstReport, [first], runDirectory);
    const panel = panels[0];

    fireMessage(panel.webview, {
      channel: CONNECTOR_READY_CHANNEL,
      data: ST_TEST_RESULTS_CONNECT_CHANNEL,
    });
    panel.webview.postMessage.mockClear();

    await StTestResultsPanel.createOrShow(context, secondReport, [second], runDirectory);

    expect(mockCreateWebviewPanel)
      .toHaveBeenCalledTimes(1);
    expect(panel.reveal)
      .toHaveBeenCalledWith(1);
    expect(panel.webview.postMessage)
      .toHaveBeenCalledWith({
        channel: ST_TEST_RESULTS_CONNECT_CHANNEL,
        data: secondReport,
      });

    fireMessage(panel.webview, {
      channel: ST_TEST_RESULTS_CONNECT_CHANNEL,
      data: {
        type: 'openResultFile',
        artifactId: 'first',
      },
    });
    await flushAsyncActions();

    expect(mockShowWarningMessage)
      .toHaveBeenCalledWith('stTest.results.openRejected');
    expect(mockOpenTextDocument).not.toHaveBeenCalled();

    fireMessage(panel.webview, {
      channel: ST_TEST_RESULTS_CONNECT_CHANNEL,
      data: {
        type: 'openResultFile',
        artifactId: 'second',
      },
    });
    await flushAsyncActions();

    expect(mockOpenTextDocument)
      .toHaveBeenCalledWith({ fsPath: second.outputCsvPath });
    expect(mockShowTextDocument)
      .toHaveBeenCalledWith(
        { uri: { fsPath: second.outputCsvPath } },
        { preview: true },
      );
  });

  it('does not let an outside artifact authorize itself as an openable result', async () => {
    const outsideDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-st-panel-outside-'));

    try {
      const outsidePath = path.join(outsideDirectory, 'outside.csv');
      const artifact = {
        ...createArtifact('outside', 1),
        outputCsvPath: outsidePath,
      };

      fs.writeFileSync(outsidePath, 'outside result');

      await StTestResultsPanel.createOrShow(
        context,
        createReport('run-id', [artifact]),
        [artifact],
        runDirectory,
      );
      fireMessage(panels[0].webview, {
        channel: ST_TEST_RESULTS_CONNECT_CHANNEL,
        data: {
          type: 'openResultFile',
          artifactId: artifact.artifactId,
        },
      });
      await flushAsyncActions();

      expect(mockShowWarningMessage)
        .toHaveBeenCalledWith('stTest.results.openRejected');
      expect(mockOpenTextDocument).not.toHaveBeenCalled();
    }
    finally {
      fs.rmSync(outsideDirectory, {
        recursive: true,
        force: true,
      });
    }
  });

  it('rejects an artifact that escapes the authoritative run root through a linked directory', async () => {
    const outsideDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-st-panel-linked-'));

    try {
      const outsidePath = path.join(outsideDirectory, 'linked.csv');
      const linkedDirectory = path.join(runDirectory, 'linked-outside');
      const artifact = {
        ...createArtifact('linked', 1),
        outputCsvPath: path.join(linkedDirectory, 'linked.csv'),
      };

      fs.writeFileSync(outsidePath, 'linked result');
      fs.symlinkSync(
        outsideDirectory,
        linkedDirectory,
        process.platform === 'win32' ? 'junction' : 'dir',
      );

      await StTestResultsPanel.createOrShow(
        context,
        createReport('run-id', [artifact]),
        [artifact],
        runDirectory,
      );
      fireMessage(panels[0].webview, {
        channel: ST_TEST_RESULTS_CONNECT_CHANNEL,
        data: {
          type: 'openResultFile',
          artifactId: artifact.artifactId,
        },
      });
      await flushAsyncActions();

      expect(mockShowWarningMessage)
        .toHaveBeenCalledWith('stTest.results.openRejected');
      expect(mockOpenTextDocument).not.toHaveBeenCalled();
    }
    finally {
      fs.rmSync(outsideDirectory, {
        recursive: true,
        force: true,
      });
    }
  });

  it('ignores malformed open-result actions', async () => {
    const artifact = createArtifact('first', 1);

    await StTestResultsPanel.createOrShow(
      context,
      createReport('run-id', [artifact]),
      [artifact],
      runDirectory,
    );
    fireMessage(panels[0].webview, {
      channel: ST_TEST_RESULTS_CONNECT_CHANNEL,
      data: {
        type: 'openResultFile',
        artifactId: 42,
      },
    });
    fireMessage(panels[0].webview, {
      channel: ST_TEST_RESULTS_CONNECT_CHANNEL,
      data: { artifactId: artifact.artifactId },
    });
    await flushAsyncActions();

    expect(mockShowWarningMessage).not.toHaveBeenCalled();
    expect(mockOpenTextDocument).not.toHaveBeenCalled();
  });

  it('revalidates an allow-listed path and releases panel-owned listeners on disposal', async () => {
    const artifact = createArtifact('removed', 1);
    const report = createReport('run-id', [artifact]);

    await StTestResultsPanel.createOrShow(context, report, [artifact], runDirectory);
    const firstPanel = panels[0];

    fireMessage(firstPanel.webview, {
      channel: CONNECTOR_READY_CHANNEL,
      data: ST_TEST_RESULTS_CONNECT_CHANNEL,
    });
    fs.rmSync(artifact.outputCsvPath);
    fireMessage(firstPanel.webview, {
      channel: ST_TEST_RESULTS_CONNECT_CHANNEL,
      data: {
        type: 'openResultFile',
        artifactId: artifact.artifactId,
      },
    });
    await flushAsyncActions();

    expect(mockShowWarningMessage)
      .toHaveBeenCalledWith('stTest.results.openRejected');

    const themeDisposable = mockRegisterThemeBridge.mock.results[0].value as FakeDisposable;

    firstPanel.dispose();

    expect(firstPanel.webview.receiverDisposables.every((item) => item.dispose.mock.calls.length > 0))
      .toBe(true);
    expect(themeDisposable.dispose)
      .toHaveBeenCalled();
    expect(firstPanel.disposeRegistration.dispose)
      .toHaveBeenCalled();

    const nextArtifact = createArtifact('next', 1);

    await StTestResultsPanel.createOrShow(
      context,
      createReport('next-run', [nextArtifact]),
      [nextArtifact],
      runDirectory,
    );

    expect(mockCreateWebviewPanel)
      .toHaveBeenCalledTimes(2);
  });
});
