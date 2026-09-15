const mockTransformDistHtml = jest.fn(async () => '<html>profiling</html>');
const mockRegisterThemeBridge = jest.fn(() => ({ dispose: jest.fn() }));
const mockHandleThemeRequest = jest.fn(() => false);
const mockCreateWebviewPanel = jest.fn();
const mockShowErrorMessage = jest.fn();
const mockShowInformationMessage = jest.fn();
const mockExecuteCommand = jest.fn();

jest.mock('i18next', () => ({ t: (key: string, opts?: Record<string, string>) => (opts ? `${key}:${JSON.stringify(opts)}` : key) }));

jest.mock('@plugin/class/html-transformer', () => ({ HtmlTransformer: { transformDistHtml: mockTransformDistHtml } }));

jest.mock('@plugin/core/view/webview-theme', () => ({
  registerWebviewThemeBridge: mockRegisterThemeBridge,
  handleThemeRequest: mockHandleThemeRequest,
}));

jest.mock('@plugin/service/settings-loader', () => ({ SettingsLoader: { getCannbotPromptOverride: jest.fn() } }));

jest.mock('vscode', () => {
  const pathModule = jest.requireActual<typeof import('path')>('path');

  return {
    env: { language: 'en' },
    ViewColumn: { Active: 1 },
    Uri: {
      file: (fsPath: string) => ({
        fsPath,
        toString: () => `file://${fsPath}`,
      }),
      joinPath: (base: { fsPath: string }, ...segments: string[]) => ({ fsPath: pathModule.join(base.fsPath, ...segments) }),
    },
    window: {
      createWebviewPanel: mockCreateWebviewPanel,
      showErrorMessage: mockShowErrorMessage,
      showInformationMessage: mockShowInformationMessage,
    },
    commands: { executeCommand: mockExecuteCommand },
  };
}, { virtual: true });

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import { ProfilingReportPanel } from '@plugin/class/profiling-report-panel';
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
  reveal: jest.Mock;
  dispose: jest.Mock;
  onDidDispose: jest.Mock;
  disposeCallback?: ()=> void;
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
    mockTransformDistHtml.mockResolvedValue('<html>profiling</html>');
    mockCreateWebviewPanel.mockImplementation((_type, _title, _column, options) => {
      const webview = createWebview();
      const panel = {
        webview,
        reveal: jest.fn(),
        dispose: jest.fn(() => {
          panel.disposeCallback?.();
        }),
        onDidDispose: jest.fn((callback: ()=> void) => {
          panel.disposeCallback = callback;

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
    for (const receiver of panel.webview.receivers) {
      receiver({ command: 'profilingReportReady' });
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
      });
    expect(JSON.stringify(panel.webview.postMessage.mock.calls)).not.toContain('base64');
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
        '调用技能 tool-report-analysis 分析下方报告，按其流程与固定框架输出。\n'
        + `报告路径：${filePath}\n`
        + '报告名称：sample.rep\n'
        + '报告章节：compute\n'
        + '算子名称：Add\n'
        + `采集时间：${formatLocalDateTime('2026-08-13T09:41:00Z')}\n`,
        { autoSend: true },
      );
    expect(mockShowInformationMessage)
      .toHaveBeenCalledWith('profilingReport.cannbotSent');
    expect(mockShowErrorMessage).not.toHaveBeenCalled();
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
        + `采集时间：${formatLocalDateTime('2026-08-13T09:41:00Z')}\n`,
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
        + '采集时间：\n',
        { autoSend: true },
      );
  });

  it('shows an error message when the cann-assist command fails', async () => {
    mockExecuteCommand.mockRejectedValueOnce(new Error('command not found'));

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
      .toHaveBeenCalledWith(`profilingReport.cannbotFailed:${JSON.stringify({ error: 'command not found' })}`);
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
});
