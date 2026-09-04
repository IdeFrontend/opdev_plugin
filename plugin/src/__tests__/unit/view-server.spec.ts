/**
 * Unit tests for ViewServer: provider registration per route, webview
 * activation (render + query + opened callbacks), theme bridging and message
 * routing, and disposal of registered disposables. The ViewRenderer is mocked
 * so activation order can be asserted deterministically; the renderer itself
 * is covered by view-render.spec.ts.
 */

import * as vscode from 'vscode';

import type { ViewRouteRaw } from '@plugin/core/view/view-router';
import { CONNECTOR_READY_CHANNEL } from '@shared/connector';
import { ViewServer } from '@plugin/core/view/view-server';

jest.mock('vscode', () => {
  class Disposable {
    private disposeCallback?: ()=> void;

    constructor(disposeCallback?: ()=> void) {
      this.disposeCallback = disposeCallback;
    }

    dispose(): void {
      this.disposeCallback?.();
    }
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
      file: (fsPath: string) => ({ fsPath }),
      joinPath: (uri: { fsPath: string }, ...segments: string[]) => ({
        fsPath: [
          uri.fsPath,
          ...segments,
        ].join('/'),
      }),
    },
    env: { language: 'en' },
    window: {
      activeColorTheme: { kind: 2 },
      registerWebviewViewProvider: jest.fn(() => ({ dispose: jest.fn() })),
      onDidChangeActiveColorTheme: jest.fn(() => ({ dispose: jest.fn() })),
      showErrorMessage: jest.fn(),
    },
  };
});

jest.mock('@plugin/core/view/view-render', () => ({
  ViewRenderer: jest.fn()
    .mockImplementation(() => ({
      render: jest.fn()
        .mockResolvedValue(undefined),
      dispose: jest.fn(),
    })),
}));

type ResolvableProvider = {
  resolveWebviewView: (webviewView: unknown, context: unknown, token: unknown)=> Promise<void>;
};

const waitFor = async (predicate: ()=> boolean): Promise<void> => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) {
      return;
    }

    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  throw new Error('Timed out waiting for asynchronous test state');
};

describe('ViewServer', () => {
  const registerProviderMock = vscode.window.registerWebviewViewProvider as jest.Mock;
  const onDidChangeActiveColorThemeMock = vscode.window.onDidChangeActiveColorTheme as jest.Mock;

  const createWebview = () => {
    const receivers: Array<(message: unknown)=> void> = [];

    return {
      options: undefined,
      postMessage: jest.fn()
        .mockResolvedValue(true),
      onDidReceiveMessage: jest.fn((callback: (message: unknown)=> void) => {
        receivers.push(callback);

        return { dispose: jest.fn() };
      }),
      fire: (message: unknown) => receivers.forEach((callback) => callback(message)),
    };
  };

  const createViewServer = (routes: ViewRouteRaw[]): ViewServer =>
    new ViewServer(routes, { extensionUri: { fsPath: '/extension' } } as unknown as vscode.ExtensionContext);

  beforeEach(() => {
    registerProviderMock.mockClear();
    onDidChangeActiveColorThemeMock.mockClear();
    (ViewServer as unknown as { instance?: ViewServer }).instance = undefined;
  });

  afterEach(() => {
    (ViewServer as unknown as { instance?: ViewServer }).instance = undefined;
  });

  it('registers a provider for every route that declares a providerViewType', () => {
    const viewServer = createViewServer([
      {
        path: 'home',
        providerViewType: 'homeView',
      },
      {
        path: 'config',
        providerViewType: 'configView',
      },
      { path: 'operate' },
    ]);

    expect(registerProviderMock)
      .toHaveBeenCalledTimes(2);
    expect(registerProviderMock)
      .toHaveBeenCalledWith(
        'homeView',
        expect.objectContaining({ resolveWebviewView: expect.any(Function) }),
        { webviewOptions: { retainContextWhenHidden: true } },
      );
    expect(registerProviderMock)
      .toHaveBeenCalledWith(
        'configView',
        expect.objectContaining({ resolveWebviewView: expect.any(Function) }),
        { webviewOptions: { retainContextWhenHidden: true } },
      );
    viewServer.dispose();
  });

  it('exposes the singleton instance', () => {
    const viewServer = createViewServer([
      {
        path: 'home',
        providerViewType: 'homeView',
      },
    ]);

    expect(ViewServer.getInstance())
      .toBe(viewServer);
    viewServer.dispose();
  });

  it('resolves a webview view: options, render, query, callbacks and theme bridge', async () => {
    const viewServer = createViewServer([
      {
        path: 'home',
        providerViewType: 'homeView',
      },
    ]);
    const provider = registerProviderMock.mock.calls[0][1] as ResolvableProvider;
    const webview = createWebview();
    const webviewView = { webview };
    const opened = jest.fn();

    viewServer.onViewActivated(opened);
    await provider.resolveWebviewView(webviewView, undefined, undefined);

    expect(webview.options)
      .toEqual({
        enableScripts: true,
        localResourceRoots: [{ fsPath: '/extension/out/web' }],
      });
    expect(viewServer.providerWebViewMap.homeView)
      .toBe(webviewView);
    const renderer = (viewServer as unknown as { renderer: { render: jest.Mock } }).renderer;

    expect(renderer.render)
      .toHaveBeenCalledWith(webview, { lang: 'en' }, 'home');
    expect(opened)
      .toHaveBeenCalledWith('home', webview);
    expect(webview.postMessage)
      .toHaveBeenCalledWith(expect.objectContaining({ command: 'updateTheme' }));
    expect(onDidChangeActiveColorThemeMock)
      .toHaveBeenCalledTimes(1);
    viewServer.dispose();
  });

  it('sends the route query to the webview once the connector is ready', async () => {
    const viewServer = createViewServer([
      {
        path: 'home',
        providerViewType: 'homeView',
      },
    ]);
    const provider = registerProviderMock.mock.calls[0][1] as ResolvableProvider;
    const webview = createWebview();

    await provider.resolveWebviewView({ webview }, undefined, undefined);
    webview.fire({
      channel: CONNECTOR_READY_CHANNEL,
      data: 'viewQuery',
    });

    expect(webview.postMessage)
      .toHaveBeenCalledWith({
        channel: 'viewQuery',
        data: { _path: 'home' },
      });
    viewServer.dispose();
  });

  it('answers getTheme requests through the registered message listener', async () => {
    const viewServer = createViewServer([
      {
        path: 'home',
        providerViewType: 'homeView',
      },
    ]);
    const provider = registerProviderMock.mock.calls[0][1] as ResolvableProvider;
    const webview = createWebview();

    await provider.resolveWebviewView({ webview }, undefined, undefined);
    webview.postMessage.mockClear();
    webview.fire({ command: 'getTheme' });

    expect(webview.postMessage)
      .toHaveBeenCalledWith(expect.objectContaining({
        command: 'updateTheme',
        themeKind: 'dark',
      }));
    viewServer.dispose();
  });

  it('runs activation callbacks only after rendering finishes', async () => {
    let resolveRender!: ()=> void;
    const renderPromise = new Promise<void>((resolve) => {
      resolveRender = resolve;
    });
    const viewServer = createViewServer([
      {
        path: 'home',
        providerViewType: 'homeView',
      },
    ]);
    const provider = registerProviderMock.mock.calls[0][1] as ResolvableProvider;
    const renderer = (viewServer as unknown as { renderer: { render: jest.Mock } }).renderer;

    renderer.render.mockReturnValueOnce(renderPromise);
    const webview = createWebview();
    const opened = jest.fn();

    viewServer.onViewActivated(opened);
    const activation = provider.resolveWebviewView({ webview }, undefined, undefined);

    await waitFor(() => renderer.render.mock.calls.length === 1);
    expect(opened)
      .not
      .toHaveBeenCalled();
    resolveRender();
    await activation;
    expect(opened)
      .toHaveBeenCalledWith('home', webview);
    viewServer.dispose();
  });

  it('disposes providers, theme bridges and the renderer on dispose', async () => {
    const viewServer = createViewServer([
      {
        path: 'home',
        providerViewType: 'homeView',
      },
    ]);
    const provider = registerProviderMock.mock.calls[0][1] as ResolvableProvider;
    const providerDisposable = registerProviderMock.mock.results[0].value;

    await provider.resolveWebviewView({ webview: createWebview() }, undefined, undefined);
    const themeDisposable = onDidChangeActiveColorThemeMock.mock.results[0].value;

    viewServer.dispose();

    expect(providerDisposable.dispose)
      .toHaveBeenCalledTimes(1);
    expect(themeDisposable.dispose)
      .toHaveBeenCalledTimes(1);
    const renderer = (viewServer as unknown as { renderer: { dispose: jest.Mock } }).renderer;

    expect(renderer.dispose)
      .toHaveBeenCalledTimes(1);
  });
});
