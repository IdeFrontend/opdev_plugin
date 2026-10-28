/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
const mockTransformDistHtml = jest.fn(async () => '<html>profiling</html>');
const mockRegisterThemeBridge = jest.fn(() => ({ dispose: jest.fn() }));
const mockHandleThemeRequest = jest.fn(() => false);
const mockCreateWebviewPanel = jest.fn();
const mockShowErrorMessage = jest.fn();
const mockShowInformationMessage = jest.fn();
const mockExecuteCommand = jest.fn();
const mockGetExtension = jest.fn();

jest.mock('i18next', () => ({ t: (key: string, opts?: Record<string, string>) => (opts ? `${key}:${JSON.stringify(opts)}` : key) }));

jest.mock('@plugin/class/html-transformer', () => ({ HtmlTransformer: { transformDistHtml: mockTransformDistHtml } }));

jest.mock('@plugin/core/view/webview-theme', () => ({
  registerWebviewThemeBridge: mockRegisterThemeBridge,
  handleThemeRequest: mockHandleThemeRequest,
}));

jest.mock('@plugin/service/settings-loader', () => ({ SettingsLoader: { getCannbotPromptOverride: jest.fn() } }));

const mockResolveProfilingSourceFile = jest.fn(async () => null as string | null);

jest.mock('@plugin/helpers/resolve-profiling-source-file', () => ({ resolveProfilingSourceFile: (...args: unknown[]) => mockResolveProfilingSourceFile(...args) }));

jest.mock('vscode', () => {
  const pathModule = jest.requireActual<typeof import('path')>('path');

  return {
    env: { language: 'en' },
    ViewColumn: { Active: 1 },
    FileType: {
      File: 1,
      Directory: 2,
    },
    Uri: {
      file: (fsPath: string) => ({
        fsPath,
        toString: () => `file://${fsPath}`,
      }),
      joinPath: (base: { fsPath: string }, ...segments: string[]) => ({ fsPath: pathModule.join(base.fsPath, ...segments) }),
    },
    RelativePattern: jest.fn(function RelativePattern(
      this: { base: unknown;
        pattern: string },
      base: unknown,
      pattern: string,
    ) {
      this.base = base;
      this.pattern = pattern;
    }),
    window: {
      createWebviewPanel: mockCreateWebviewPanel,
      showErrorMessage: mockShowErrorMessage,
      showInformationMessage: mockShowInformationMessage,
    },
    commands: { executeCommand: mockExecuteCommand },
    extensions: { getExtension: mockGetExtension },
    workspace: {
      workspaceFolders: undefined,
      fs: {
        stat: jest.fn(),
        readFile: jest.fn(),
      },
      findFiles: jest.fn(async () => []),
    },
  };
}, { virtual: true });

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import { ProfilingReportPanel } from '@plugin/class/profiling-report-panel';
import { COMMAND_SHOW_PERFORMANCE_HINTS } from '@plugin/constants';
import { SettingsLoader } from '@plugin/service/settings-loader';

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
};

type FakePanel = {
  webview: FakeWebview;
  active: boolean;
  reveal: jest.Mock;
  dispose: jest.Mock;
  onDidDispose: jest.Mock;
  onDidChangeViewState: jest.Mock;
  disposeCallback?: ()=> void;
  viewStateCallback?: ()=> void;
};

describe('ProfilingReportPanel', () => {
  let root: string;
  let filePath: string;
  let context: vscode.ExtensionContext;
  let panels: FakePanel[];

  beforeEach(() => {
    jest.clearAllMocks();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-pr-panel-'));
    filePath = path.join(root, 'sample.rep');
    fs.writeFileSync(filePath, 'rep-bytes');
    context = {
      extensionPath: root,
      extensionUri: { fsPath: root },
    } as vscode.ExtensionContext;
    panels = [];
    mockShowErrorMessage.mockResolvedValue(undefined);
    mockShowInformationMessage.mockResolvedValue(undefined);
    mockExecuteCommand.mockResolvedValue(undefined);
    mockGetExtension.mockReturnValue(undefined);
    mockTransformDistHtml.mockResolvedValue('<html>profiling</html>');
    mockCreateWebviewPanel.mockImplementation((_type, _title, _column, options) => {
      const webview = createWebview();
      const panel = {
        webview,
        active: true,
        reveal: jest.fn(),
        dispose: jest.fn(() => {
          panel.disposeCallback?.();
        }),
        onDidDispose: jest.fn((callback: ()=> void) => {
          panel.disposeCallback = callback;

          return { dispose: jest.fn() } as FakeDisposable;
        }),
        onDidChangeViewState: jest.fn((callback: ()=> void) => {
          panel.viewStateCallback = callback;

          return { dispose: jest.fn() } as FakeDisposable;
        }),
        options,
      } as FakePanel & { options: unknown };

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

    return {
      cspSource: 'vscode-webview://test',
      html: '',
      postMessage: jest.fn(async () => true),
      asWebviewUri: jest.fn((uri: { fsPath: string }) => ({
        fsPath: uri.fsPath,
        toString: () => `webview://${uri.fsPath}`,
      })),
      receivers,
      onDidReceiveMessage: jest.fn((callback: (message: unknown)=> void) => {
        receivers.add(callback);

        return { dispose: jest.fn(() => receivers.delete(callback)) };
      }),
    };
  }

  function emitReady(panel: FakePanel): void {
    emitMessage(panel, { command: 'profilingReportReady' });
  }

  function emitMessage(panel: FakePanel, message: unknown): void {
    for (const receiver of panel.webview.receivers) {
      receiver(message);
    }
  }

  async function flushAsyncActions(): Promise<void> {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  function formatLocalDateTime(iso: string): string {
    const date = new Date(iso);
    const pad = (n: number) => String(n)
      .padStart(2, '0');

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
      + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  it('posts asWebviewUri after ready handshake instead of base64 payload', async () => {
    await ProfilingReportPanel.createOrShow(context, filePath);

    const panel = panels[0]!;

    expect(panel.webview.postMessage).not.toHaveBeenCalled();

    emitReady(panel);
    await Promise.resolve();

    expect(panel.webview.asWebviewUri)
      .toHaveBeenCalled();
    expect(panel.webview.postMessage)
      .toHaveBeenCalledWith({
        command: 'loadProfilingReport',
        uri: `webview://${filePath}`,
        fileName: 'sample.rep',
        filePath,
        collectedAt: expect.any(String),
        suduWorkerUrl: `webview://${path.join(root, 'out', 'web', 'sudu', 'worker.js')}`,
      });
    expect(JSON.stringify(panel.webview.postMessage.mock.calls)).not.toContain('base64');
  });

  it('injects worker-src (with blob:) into the profiling-report CSP for the Sudu worker', async () => {
    await ProfilingReportPanel.createOrShow(context, filePath);

    expect(mockTransformDistHtml)
      .toHaveBeenCalledWith(
        expect.any(String),
        expect.anything(),
        expect.stringContaining('profiling-report'),
        expect.objectContaining({
          workerSource: 'vscode-webview://test blob:',
          scriptSource: 'vscode-webview://test',
        }),
      );
  });

  it('includes the report absolute path and mtime as collectedAt in the load message', async () => {
    await ProfilingReportPanel.createOrShow(context, filePath);
    emitReady(panels[0]!);
    await Promise.resolve();

    const message = panels[0]!.webview.postMessage.mock.calls[0]![0] as {
      filePath: string;
      collectedAt: string;
    };

    expect(message.filePath)
      .toBe(filePath);
    expect(message.collectedAt)
      .toBe(fs.statSync(filePath).mtime.toISOString());
  });

  it('forwards cannbotRequest payload to the cann-assist input command', async () => {
    await ProfilingReportPanel.createOrShow(context, filePath);

    const panel = panels[0]!;
    const payload = {
      version: '1.0',
      scope: 'compute',
      report_name: 'sample.rep',
      report_id: 'sample.rep',
      report_path: filePath,
      op_name: 'Add',
      collected_at: '2026-08-13T09:41:00Z',
      data: { pipeOccupancy: [] },
      prompt: 'prompt-text',
    };

    for (const receiver of panel.webview.receivers) {
      receiver({
        command: 'cannbotRequest',
        payload,
      });
    }

    await flushAsyncActions();

    expect(mockExecuteCommand)
      .toHaveBeenCalledTimes(1);
    expect(mockExecuteCommand)
      .toHaveBeenCalledWith(
        'cannwork.setInputText',
        '调用技能 tool-perf-analysis 分析下方报告，按其流程与固定框架输出。\n'
        + `报告路径：${filePath}\n`
        + '报告名称：sample.rep\n'
        + '报告章节：compute\n'
        + '算子名称：Add\n'
        + `采集时间：${formatLocalDateTime('2026-08-13T09:41:00Z')}\n`
        + 'isSim：false\n',
        { autoSend: true },
      );
    expect(mockShowInformationMessage)
      .toHaveBeenCalledWith('profilingReport.cannbotSent');
    expect(mockShowErrorMessage).not.toHaveBeenCalled();
  });

  it('activates an installed but inactive CANNWork before forwarding the cannbot request', async () => {
    const mockActivate = jest.fn()
      .mockResolvedValue(undefined);

    mockGetExtension.mockReturnValue({
      isActive: false,
      activate: mockActivate,
    });

    await ProfilingReportPanel.createOrShow(context, filePath);

    const panel = panels[0]!;
    const payload = {
      version: '1.0',
      scope: 'summary',
      report_name: 'sample.rep',
      report_id: 'sample.rep',
      report_path: filePath,
      op_name: 'Add',
      collected_at: '2026-08-13T09:41:00Z',
      data: {},
      prompt: 'prompt-text',
    };

    for (const receiver of panel.webview.receivers) {
      receiver({
        command: 'cannbotRequest',
        payload,
      });
    }

    await flushAsyncActions();

    expect(mockGetExtension)
      .toHaveBeenCalledWith('cann-pub.cannbot-toolkit');
    expect(mockActivate)
      .toHaveBeenCalledTimes(1);
    expect(mockExecuteCommand)
      .toHaveBeenCalledWith('cannwork.setInputText', expect.any(String), { autoSend: true });
    expect(mockShowInformationMessage)
      .toHaveBeenCalledWith('profilingReport.cannbotSent');
    expect(mockShowErrorMessage).not.toHaveBeenCalled();
  });

  it('marks isSim true when the report path contains an npu-emulate run directory', async () => {
    const simDir = path.join(root, 'opprof', `npu-emulate_${Date.now()}`);
    const simFilePath = path.join(simDir, 'result.npu-rep');

    fs.mkdirSync(simDir, { recursive: true });
    fs.writeFileSync(simFilePath, 'rep-bytes');

    await ProfilingReportPanel.createOrShow(context, simFilePath);

    const panel = panels[0]!;
    const payload = {
      version: '1.0',
      scope: 'compute',
      report_name: 'result.npu-rep',
      report_id: 'result.npu-rep',
      report_path: simFilePath,
      op_name: 'Add',
      collected_at: '2026-08-13T09:41:00Z',
      data: { pipeOccupancy: [] },
      prompt: 'prompt-text',
    };

    for (const receiver of panel.webview.receivers) {
      receiver({
        command: 'cannbotRequest',
        payload,
      });
    }

    await flushAsyncActions();

    expect(mockExecuteCommand)
      .toHaveBeenCalledWith(
        'cannwork.setInputText',
        expect.stringContaining('isSim：true\n'),
        { autoSend: true },
      );
  });

  it('replaces the built-in prompt line when the hidden cannbot prompt override setting is set', async () => {
    (SettingsLoader.getCannbotPromptOverride as jest.Mock).mockReturnValueOnce('override-prompt');

    await ProfilingReportPanel.createOrShow(context, filePath);

    const panel = panels[0]!;
    const payload = {
      version: '1.0',
      scope: 'summary',
      report_name: 'sample.rep',
      report_id: 'sample.rep',
      report_path: filePath,
      op_name: 'Add',
      collected_at: '2026-08-13T09:41:00Z',
      data: { summary: {} },
      prompt: 'prompt-text',
    };

    for (const receiver of panel.webview.receivers) {
      receiver({
        command: 'cannbotRequest',
        payload,
      });
    }

    await flushAsyncActions();

    expect(mockExecuteCommand)
      .toHaveBeenCalledWith(
        'cannwork.setInputText',
        'override-prompt\n'
        + `报告路径：${filePath}\n`
        + '报告名称：sample.rep\n'
        + '报告章节：summary\n'
        + '算子名称：Add\n'
        + `采集时间：${formatLocalDateTime('2026-08-13T09:41:00Z')}\n`
        + 'isSim：false\n',
        { autoSend: true },
      );
    expect(mockShowInformationMessage)
      .toHaveBeenCalledWith('profilingReport.cannbotSent');
  });

  it('keeps empty template lines when the payload has no meta fields', async () => {
    (SettingsLoader.getCannbotPromptOverride as jest.Mock).mockReturnValueOnce('override-prompt');

    await ProfilingReportPanel.createOrShow(context, filePath);

    const panel = panels[0]!;

    for (const receiver of panel.webview.receivers) {
      receiver({
        command: 'cannbotRequest',
        payload: { scope: 'summary' },
      });
    }

    await flushAsyncActions();

    expect(mockExecuteCommand)
      .toHaveBeenCalledWith(
        'cannwork.setInputText',
        'override-prompt\n'
        + '报告路径：\n'
        + '报告名称：\n'
        + '报告章节：summary\n'
        + '算子名称：\n'
        + '采集时间：\n'
        + 'isSim：false\n',
        { autoSend: true },
      );
  });

  it('shows an install prompt when the cann-assist command is not found (plugin missing)', async () => {
    mockExecuteCommand.mockRejectedValueOnce(new Error("command 'cannwork.setInputText' not found"));

    await ProfilingReportPanel.createOrShow(context, filePath);

    const panel = panels[0]!;

    for (const receiver of panel.webview.receivers) {
      receiver({
        command: 'cannbotRequest',
        payload: { scope: 'summary' },
      });
    }

    await flushAsyncActions();

    expect(mockExecuteCommand)
      .toHaveBeenCalledWith(
        'cannwork.setInputText',
        expect.any(String),
        { autoSend: true },
      );
    expect(mockShowErrorMessage)
      .toHaveBeenCalledWith('profilingReport.cannbotNotInstalled');
    expect(mockShowInformationMessage).not.toHaveBeenCalled();
  });

  it('shows the raw error message when the cann-assist command fails for another reason', async () => {
    mockExecuteCommand.mockRejectedValueOnce(new Error('network down'));

    await ProfilingReportPanel.createOrShow(context, filePath);

    const panel = panels[0]!;

    for (const receiver of panel.webview.receivers) {
      receiver({
        command: 'cannbotRequest',
        payload: { scope: 'summary' },
      });
    }

    await flushAsyncActions();

    expect(mockShowErrorMessage)
      .toHaveBeenCalledWith(`profilingReport.cannbotFailed:${JSON.stringify({ error: 'network down' })}`);
    expect(mockShowInformationMessage).not.toHaveBeenCalled();
  });

  it('disposes and does not retain broken panels when initializeHtml fails', async () => {
    mockTransformDistHtml.mockRejectedValueOnce(new Error('dist missing'));

    await ProfilingReportPanel.createOrShow(context, filePath);

    expect(panels[0]!.dispose)
      .toHaveBeenCalled();
    expect(mockShowErrorMessage)
      .toHaveBeenCalled();

    mockTransformDistHtml.mockResolvedValueOnce('<html>ok</html>');
    await ProfilingReportPanel.createOrShow(context, filePath);

    expect(mockCreateWebviewPanel)
      .toHaveBeenCalledTimes(2);
    expect(panels)
      .toHaveLength(2);
  });

  it('registers the file directory in localResourceRoots for webview fetch', async () => {
    await ProfilingReportPanel.createOrShow(context, filePath);

    const options = (panels[0] as FakePanel & { options: { localResourceRoots: Array<{ fsPath: string }> } }).options;

    expect(options.localResourceRoots.map((uri) => uri.fsPath))
      .toEqual(expect.arrayContaining([path.dirname(filePath)]));
  });

  it('forwards view state changes so hints can follow the active tab', async () => {
    const onActiveChanged = jest.fn();

    await ProfilingReportPanel.createOrShow(context, filePath, { onActiveChanged });

    const panel = panels[0]!;

    panel.active = false;
    panel.viewStateCallback?.();
    panel.active = true;
    panel.viewStateCallback?.();

    expect(onActiveChanged)
      .toHaveBeenNthCalledWith(1, false);
    expect(onActiveChanged)
      .toHaveBeenNthCalledWith(2, true);
  });

  it('reports the operator selected inside the report, normalizing empty payloads', async () => {
    const onOperatorChanged = jest.fn();

    await ProfilingReportPanel.createOrShow(context, filePath, { onOperatorChanged });

    const panel = panels[0]!;

    emitMessage(panel, {
      command: 'profilingReportOperatorChanged',
      operatorId: 'op2.npu.rep',
    });
    emitMessage(panel, {
      command: 'profilingReportOperatorChanged',
      operatorId: '',
    });
    emitMessage(panel, { command: 'profilingReportOperatorChanged' });

    expect(onOperatorChanged)
      .toHaveBeenNthCalledWith(1, 'op2.npu.rep');
    expect(onOperatorChanged)
      .toHaveBeenNthCalledWith(2, null);
    expect(onOperatorChanged)
      .toHaveBeenNthCalledWith(3, null);
  });

  it('calls onDispose exactly once when the panel closes', async () => {
    const onDispose = jest.fn();

    await ProfilingReportPanel.createOrShow(context, filePath, { onDispose });

    const panel = panels[0]!;

    expect(onDispose)
      .not.toHaveBeenCalled();

    panel.dispose();
    panel.dispose();

    expect(onDispose)
      .toHaveBeenCalledTimes(1);
  });

  it('refreshes the hooks when an already open report is opened again', async () => {
    await ProfilingReportPanel.createOrShow(context, filePath);

    const onOperatorChanged = jest.fn();

    await ProfilingReportPanel.createOrShow(context, filePath, { onOperatorChanged });

    expect(mockCreateWebviewPanel)
      .toHaveBeenCalledTimes(1);

    emitMessage(panels[0]!, {
      command: 'profilingReportOperatorChanged',
      operatorId: 'op1.npu.rep',
    });

    expect(onOperatorChanged)
      .toHaveBeenCalledWith('op1.npu.rep');
  });

  it('does not reload the webview when reopening the same already-hosted report', async () => {
    await ProfilingReportPanel.createOrShow(context, filePath);
    const panel = panels[0]!;

    emitReady(panel);
    await Promise.resolve();
    panel.webview.postMessage.mockClear();
    panel.reveal.mockClear();

    emitMessage(panel, {
      command: 'profilingReportOperatorChanged',
      operatorId: 'op2.npu.rep',
    });

    expect(ProfilingReportPanel.retainedOperatorId(filePath))
      .toBe('op2.npu.rep');

    await ProfilingReportPanel.createOrShow(context, filePath);

    expect(mockCreateWebviewPanel)
      .toHaveBeenCalledTimes(1);
    expect(panel.reveal)
      .toHaveBeenCalledWith(vscode.ViewColumn.Active);
    expect(panel.webview.postMessage)
      .not
      .toHaveBeenCalledWith(expect.objectContaining({ command: 'loadProfilingReport' }));
    expect(ProfilingReportPanel.retainedOperatorId(filePath))
      .toBe('op2.npu.rep');
  });

  it('keeps working without hooks', async () => {
    await ProfilingReportPanel.createOrShow(context, filePath);

    const panel = panels[0]!;

    panel.active = false;
    panel.viewStateCallback?.();
    emitMessage(panel, {
      command: 'profilingReportOperatorChanged',
      operatorId: 'op1.npu.rep',
    });
    emitReady(panel);
    await Promise.resolve();

    expect(panel.webview.postMessage)
      .toHaveBeenCalledWith(expect.objectContaining({ command: 'loadProfilingReport' }));
  });

  it('queues the hints publish state until the webview is ready and posts it after the ready handshake', async () => {
    const instance = await ProfilingReportPanel.createOrShow(context, filePath);
    const panel = panels[0]!;

    instance.setPerformanceHintsPublished(true);

    expect(panel.webview.postMessage)
      .not.toHaveBeenCalled();

    emitReady(panel);
    await Promise.resolve();

    expect(panel.webview.postMessage)
      .toHaveBeenCalledWith({
        command: 'performanceHintsPublishedChanged',
        published: true,
      });
  });

  it('posts the hints publish state immediately once the webview is ready', async () => {
    const instance = await ProfilingReportPanel.createOrShow(context, filePath);
    const panel = panels[0]!;

    emitReady(panel);
    await Promise.resolve();
    instance.setPerformanceHintsPublished(false);

    const calls = panel.webview.postMessage.mock.calls;

    expect(calls[calls.length - 1]![0])
      .toEqual({
        command: 'performanceHintsPublishedChanged',
        published: false,
      });
  });

  it('opens Problems with the current report when the webview asks for the hints', async () => {
    await ProfilingReportPanel.createOrShow(context, filePath);

    const panel = panels[0]!;

    emitReady(panel);
    await Promise.resolve();
    emitMessage(panel, { command: 'showPerformanceHintsInProblems' });
    await flushAsyncActions();

    expect(mockExecuteCommand)
      .toHaveBeenCalledWith(COMMAND_SHOW_PERFORMANCE_HINTS, filePath);
  });

  it('drops the publish state after dispose without throwing', async () => {
    const instance = await ProfilingReportPanel.createOrShow(context, filePath);
    const panel = panels[0]!;

    instance.dispose();
    panel.webview.postMessage.mockClear();

    expect(() => instance.setPerformanceHintsPublished(true)).not.toThrow();
    expect(panel.webview.postMessage)
      .not.toHaveBeenCalledWith({
        command: 'performanceHintsPublishedChanged',
        published: true,
      });
  });

  it('resolves missing Ascend C source via the host FS helper and replies to the webview', async () => {
    mockResolveProfilingSourceFile.mockResolvedValueOnce('kernel void gather_2d() {}');

    await ProfilingReportPanel.createOrShow(context, filePath);

    const panel = panels[0]!;

    emitReady(panel);
    await Promise.resolve();
    panel.webview.postMessage.mockClear();

    emitMessage(panel, {
      command: 'resolveSourceFile',
      requestId: 'req-1',
      fileName: '/build/gather_2d.asc',
      basename: 'gather_2d.asc',
    });
    await flushAsyncActions();

    expect(mockResolveProfilingSourceFile)
      .toHaveBeenCalledWith(
        {
          fileName: '/build/gather_2d.asc',
          basename: 'gather_2d.asc',
        },
        { reportPath: filePath },
      );
    expect(panel.webview.postMessage)
      .toHaveBeenCalledWith({
        command: 'resolveSourceFileResult',
        requestId: 'req-1',
        text: 'kernel void gather_2d() {}',
      });
    expect(mockShowErrorMessage).not.toHaveBeenCalled();
  });

  it('replies with null when the source resolve misses, without toasting', async () => {
    mockResolveProfilingSourceFile.mockResolvedValueOnce(null);

    await ProfilingReportPanel.createOrShow(context, filePath);

    const panel = panels[0]!;

    emitReady(panel);
    await Promise.resolve();
    panel.webview.postMessage.mockClear();

    emitMessage(panel, {
      command: 'resolveSourceFile',
      requestId: 'req-miss',
      fileName: '/build/missing.asc',
      basename: 'missing.asc',
    });
    await flushAsyncActions();

    expect(panel.webview.postMessage)
      .toHaveBeenCalledWith({
        command: 'resolveSourceFileResult',
        requestId: 'req-miss',
        text: null,
      });
    expect(mockShowErrorMessage).not.toHaveBeenCalled();
  });
});
