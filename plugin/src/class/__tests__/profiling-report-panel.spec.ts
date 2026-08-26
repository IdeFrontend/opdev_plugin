const mockTransformDistHtml = jest.fn(async () => '<html>profiling</html>');
const mockRegisterThemeBridge = jest.fn(() => ({ dispose: jest.fn() }));
const mockHandleThemeRequest = jest.fn(() => false);
const mockCreateWebviewPanel = jest.fn();
const mockShowErrorMessage = jest.fn();

jest.mock('i18next', () => ({ t: (key: string, opts?: Record<string, string>) => (opts ? `${key}:${JSON.stringify(opts)}` : key) }));

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
      file: (fsPath: string) => ({
        fsPath,
        toString: () => `file://${fsPath}`,
      }),
      joinPath: (base: { fsPath: string }, ...segments: string[]) => ({ fsPath: pathModule.join(base.fsPath, ...segments) }),
    },
    window: {
      createWebviewPanel: mockCreateWebviewPanel,
      showErrorMessage: mockShowErrorMessage,
    },
  };
}, { virtual: true });

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import { ProfilingReportPanel } from '@plugin/class/profiling-report-panel';

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
      });
    expect(JSON.stringify(panel.webview.postMessage.mock.calls)).not.toContain('base64');
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
