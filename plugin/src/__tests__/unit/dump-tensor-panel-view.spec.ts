/**
 * Unit tests for DumpTensorPanelViewProvider: webview resolution with dist HTML
 * transformation, ApiServer linkage, theme bridging, webview message routing,
 * .bin import flows, provider/command registration, and disposal.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

jest.mock('i18next', () => ({ t: (key: string) => key }));

jest.mock('vscode', () => {
  class Disposable {
    dispose(): void {}
  }

  return {
    ColorThemeKind: {
      Light: 1,
      Dark: 2,
      HighContrast: 3,
      HighContrastLight: 4,
    },
    Disposable,
    Uri: {
      file: (fsPath: string) => ({
        fsPath,
        toString: () => `file://${fsPath}`,
      }),
      joinPath: (uri: { fsPath: string }, ...segments: string[]) => ({
        fsPath: [
          uri.fsPath,
          ...segments,
        ].join('/'),
      }),
    },
    commands: {
      executeCommand: jest.fn()
        .mockResolvedValue(undefined),
      registerCommand: jest.fn(),
    },
    window: {
      activeColorTheme: { kind: 2 },
      onDidChangeActiveColorTheme: jest.fn(() => ({ dispose: jest.fn() })),
      registerWebviewViewProvider: jest.fn(),
      showErrorMessage: jest.fn(),
      showOpenDialog: jest.fn(),
    },
  };
});

jest.mock('@plugin/class/webview-message-list', () => ({
  __esModule: true,
  default: [
    {
      command: 'test-alert',
      callback: jest.fn(),
    },
  ],
}));

// The provider lazily imports '../service/build-service.js' via a native dynamic
// import, which the jest VM cannot execute (ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG),
// so the .bin import success path is not reachable in tests; the dialog and
// failure paths are covered below.
jest.mock('@plugin/service/build-service', () => ({
  buildService: {
    importDumpTensorBinFile: jest.fn()
      .mockResolvedValue(undefined),
  },
}));

import * as vscode from 'vscode';

import { ApiServer } from '@plugin/core/api-server';
import {
  DumpTensorPanelViewProvider,
  getDumpTensorPanelViewProvider,
} from '@plugin/class/dump-tensor-panel-view';
import webviewMessageList from '@plugin/class/webview-message-list';
import {
  COMMAND_OPEN_DUMP_TENSOR_PANEL_VIEW,
  VIEW_DUMP_TENSOR_DATA,
} from '@plugin/constants';
import { CONNECTOR_READY_CHANNEL } from '@shared/connector';
import { DUMP_TENSOR_PANEL_VIEW_ID } from '@shared/flavor';

const flushMacrotasks = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
};

describe('DumpTensorPanelViewProvider', () => {
  let tempRoot: string;
  let context: vscode.ExtensionContext;
  let apiServer: ApiServer;

  const showOpenDialogMock = vscode.window.showOpenDialog as jest.Mock;
  const showErrorMessageMock = vscode.window.showErrorMessage as jest.Mock;
  const registerProviderMock = vscode.window.registerWebviewViewProvider as jest.Mock;
  const registerCommandMock = vscode.commands.registerCommand as jest.Mock;
  const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
  const messageListCallback = webviewMessageList[0].callback as jest.Mock;

  const createWebview = () => {
    const receivers: Array<(message: unknown)=> void> = [];

    return {
      html: '',
      options: undefined,
      asWebviewUri: jest.fn((uri: { fsPath: string }) => ({ toString: () => `aswebview:${uri.fsPath}` })),
      postMessage: jest.fn()
        .mockResolvedValue(true),
      onDidReceiveMessage: jest.fn((callback: (message: unknown)=> void) => {
        receivers.push(callback);

        return { dispose: jest.fn() };
      }),
      fire: (message: unknown) => receivers.forEach((callback) => callback(message)),
    };
  };

  const writeDistHtml = (content: string): void => {
    const htmlPath = path.join(
      tempRoot,
      'out',
      'web',
      'src',
      'views',
      'sidebars',
      VIEW_DUMP_TENSOR_DATA,
      `${VIEW_DUMP_TENSOR_DATA}.html`,
    );

    fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
    fs.writeFileSync(htmlPath, content, 'utf-8');
  };

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dump-tensor-panel-'));
    context = {
      extensionUri: vscode.Uri.file(tempRoot),
      subscriptions: [],
    } as unknown as vscode.ExtensionContext;
    apiServer = new ApiServer({ webview: { ping: () => 'pong' } });
    showOpenDialogMock.mockReset();
    showErrorMessageMock.mockReset();
    registerProviderMock.mockReset();
    registerCommandMock.mockReset();
    executeCommandMock.mockReset();
    executeCommandMock.mockResolvedValue(undefined);
    (vscode.window.onDidChangeActiveColorTheme as jest.Mock).mockClear();
    messageListCallback.mockReset();
  });

  afterEach(() => {
    fs.rmSync(tempRoot, {
      recursive: true,
      force: true,
    });
  });

  it('exposes no webview before resolution', () => {
    const provider = new DumpTensorPanelViewProvider(context, apiServer);

    expect(provider.getWebview())
      .toBeUndefined();
  });

  it('resolves the webview: transforms dist HTML, links the ApiServer and bridges themes', async () => {
    writeDistHtml('<html><head><title>dump</title></head><body><script src="./main.js"></script></body></html>');
    const provider = new DumpTensorPanelViewProvider(context, apiServer);
    const webview = createWebview();

    await provider.resolveWebviewView({ webview } as never, {} as never, {} as never);

    expect(webview.options)
      .toMatchObject({
        enableScripts: true,
        localResourceRoots: [{ fsPath: tempRoot }],
      });
    expect(webview.html)
      .toContain('dump');
    expect(webview.html)
      .toContain(`aswebview:${path.join(tempRoot, 'out', 'web', 'src', 'views', 'sidebars', VIEW_DUMP_TENSOR_DATA, 'main.js')}`);
    expect(provider.getWebview())
      .toBe(webview);
    expect(webview.postMessage)
      .toHaveBeenCalledWith(expect.objectContaining({ command: 'updateTheme' }));
  });

  it('routes API requests from the webview through the ApiServer', async () => {
    writeDistHtml('<html><body></body></html>');
    const provider = new DumpTensorPanelViewProvider(context, apiServer);
    const webview = createWebview();

    await provider.resolveWebviewView({ webview } as never, {} as never, {} as never);

    webview.fire({
      channel: 'request',
      data: {
        api: 'webview/ping',
        requestId: 'req-1',
        data: undefined,
        options: {
          timeout: 0,
          useCustomErrorHandler: false,
        },
      },
    });
    webview.fire({
      channel: CONNECTOR_READY_CHANNEL,
      data: 'request',
    });
    await flushMacrotasks();

    expect(webview.postMessage)
      .toHaveBeenCalledWith({
        channel: 'request',
        data: {
          api: 'webview/ping',
          requestId: 'req-1',
          statusCode: 200,
          message: 'core.message.apiResponseSuccess',
          data: 'pong',
        },
      });
  });

  it('answers getTheme requests without touching the message list', async () => {
    writeDistHtml('<html><body></body></html>');
    const provider = new DumpTensorPanelViewProvider(context, apiServer);
    const webview = createWebview();

    await provider.resolveWebviewView({ webview } as never, {} as never, {} as never);
    webview.postMessage.mockClear();
    webview.fire({ command: 'getTheme' });

    expect(webview.postMessage)
      .toHaveBeenCalledWith(expect.objectContaining({
        command: 'updateTheme',
        themeKind: 'dark',
      }));
    expect(messageListCallback)
      .not
      .toHaveBeenCalled();
  });

  it('dispatches matching commands to the webview message list', async () => {
    writeDistHtml('<html><body></body></html>');
    const provider = new DumpTensorPanelViewProvider(context, apiServer);
    const webview = createWebview();

    await provider.resolveWebviewView({ webview } as never, {} as never, {} as never);
    webview.fire({
      command: 'test-alert',
      text: 'hello',
    });

    expect(messageListCallback)
      .toHaveBeenCalledTimes(1);
    expect(messageListCallback)
      .toHaveBeenCalledWith({
        command: 'test-alert',
        text: 'hello',
      }, provider);
  });

  it('opens the file dialog for a .bin import and surfaces import failures', async () => {
    writeDistHtml('<html><body></body></html>');
    const consoleErrorSpy = jest.spyOn(console, 'error')
      .mockImplementation(() => undefined);

    showOpenDialogMock.mockResolvedValue([{ fsPath: '/tmp/model.bin' }]);
    const provider = new DumpTensorPanelViewProvider(context, apiServer);
    const webview = createWebview();

    await provider.resolveWebviewView({ webview } as never, {} as never, {} as never);
    webview.fire({ command: 'importDumpTensorBinFile' });
    await flushMacrotasks();

    expect(showOpenDialogMock)
      .toHaveBeenCalledWith(expect.objectContaining({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
          'Binary Files': ['bin'],
          'All Files': ['*'],
        },
        title: 'extension.selectDumpTensorBinFile',
      }));
    expect(showErrorMessageMock)
      .toHaveBeenCalledWith('extension.importDumpTensorBinFailed');
    consoleErrorSpy.mockRestore();
  });

  it('does nothing when the file dialog is cancelled', async () => {
    writeDistHtml('<html><body></body></html>');
    showOpenDialogMock.mockResolvedValue(undefined);
    const provider = new DumpTensorPanelViewProvider(context, apiServer);
    const webview = createWebview();

    await provider.resolveWebviewView({ webview } as never, {} as never, {} as never);
    webview.fire({ command: 'importDumpTensorBinFile' });
    await flushMacrotasks();

    expect(showErrorMessageMock)
      .not
      .toHaveBeenCalled();
  });

  it('surfaces a failed import to the user', async () => {
    writeDistHtml('<html><body></body></html>');
    const consoleErrorSpy = jest.spyOn(console, 'error')
      .mockImplementation(() => undefined);

    showOpenDialogMock.mockRejectedValue(new Error('dialog broke'));
    const provider = new DumpTensorPanelViewProvider(context, apiServer);
    const webview = createWebview();

    await provider.resolveWebviewView({ webview } as never, {} as never, {} as never);
    webview.fire({ command: 'importDumpTensorBinFile' });
    await flushMacrotasks();

    expect(consoleErrorSpy)
      .toHaveBeenCalled();
    expect(showErrorMessageMock)
      .toHaveBeenCalledWith('extension.importDumpTensorBinFailed');
    consoleErrorSpy.mockRestore();
  });

  it('rethrows when the dist HTML cannot be transformed', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const provider = new DumpTensorPanelViewProvider(context, apiServer);

    await expect(provider.resolveWebviewView({ webview: createWebview() } as never, {} as never, {} as never))
      .rejects
      .toThrow(/Failed to transform HTML/);
    expect(consoleErrorSpy)
      .toHaveBeenCalledWith(
        expect.stringContaining('Failed to load HTML'),
        expect.any(Error),
      );
    consoleErrorSpy.mockRestore();
  });

  it('disposes the theme bridge on dispose', async () => {
    writeDistHtml('<html><body></body></html>');
    const provider = new DumpTensorPanelViewProvider(context, apiServer);

    await provider.resolveWebviewView({ webview: createWebview() } as never, {} as never, {} as never);

    const themeDisposable = (vscode.window.onDidChangeActiveColorTheme as jest.Mock).mock.results[0].value;

    provider.dispose();

    expect(themeDisposable.dispose)
      .toHaveBeenCalledTimes(1);
  });

  it('registers the provider and the open command', async () => {
    const registered = getDumpTensorPanelViewProvider(context, apiServer);

    expect(registerProviderMock)
      .toHaveBeenCalledWith(
        DUMP_TENSOR_PANEL_VIEW_ID,
        expect.any(DumpTensorPanelViewProvider),
        { webviewOptions: { retainContextWhenHidden: true } },
      );
    expect(registerCommandMock)
      .toHaveBeenCalledWith(
        COMMAND_OPEN_DUMP_TENSOR_PANEL_VIEW,
        expect.any(Function),
      );

    const openCommand = registerCommandMock.mock.calls.find((call) => call[0] === COMMAND_OPEN_DUMP_TENSOR_PANEL_VIEW)![1];

    await openCommand();

    expect(executeCommandMock)
      .toHaveBeenNthCalledWith(1, 'workbench.action.togglePanel');
    expect(executeCommandMock)
      .toHaveBeenNthCalledWith(2, `${DUMP_TENSOR_PANEL_VIEW_ID}.focus`);
    expect(registered.getWebview())
      .toBeUndefined();
  });

  it('exposes the resolved webview through the registration result', async () => {
    writeDistHtml('<html><body></body></html>');
    const registered = getDumpTensorPanelViewProvider(context, apiServer);
    const registeredProvider = registerProviderMock.mock.calls[0][1] as DumpTensorPanelViewProvider;
    const webview = createWebview();

    await registeredProvider.resolveWebviewView({ webview } as never, {} as never, {} as never);

    expect(registered.getWebview())
      .toBe(webview);
  });
});
