/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
jest.mock('i18next', () => ({
  t: jest.fn((key: string, params?: { error?: string }) =>
    params?.error ? `${key}: ${params.error}` : key),
}));

jest.mock('vscode', () => ({
  env: { language: 'EN' },
  Uri: {
    joinPath: jest.fn(() => ({ fsPath: '/ext/out/web' })),
    file: jest.fn((fsPath: string) => ({ fsPath })),
  },
  ViewColumn: { Active: 1 },
  window: {
    createWebviewPanel: jest.fn(),
    registerWebviewViewProvider: jest.fn(),
    showErrorMessage: jest.fn(),
  },
}));

jest.mock('fs', () => ({ existsSync: jest.fn() }));

jest.mock('@plugin/class/permanent-storage', () => ({ PermanentStorage: jest.fn() }));

jest.mock('@plugin/class/html-transformer', () => ({ HtmlTransformer: { transformDistHtml: jest.fn() } }));

jest.mock('@plugin/core/api-server', () => ({ ApiServer: jest.fn() }));

jest.mock('@plugin/core/view/webview-theme', () => ({
  handleThemeRequest: jest.fn(() => false),
  registerWebviewThemeBridge: jest.fn(() => ({ dispose: jest.fn() })),
}));

jest.mock('@plugin/class/webview-message-list', () => ({
  __esModule: true,
  default: [
    {
      command: 'test-cmd',
      callback: jest.fn(),
    },
  ],
}));

import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { WebviewProvider } from '@plugin/class/webview-provider';
import { HtmlTransformer } from '@plugin/class/html-transformer';
import webviewMessageList from '@plugin/class/webview-message-list';
import {
  handleThemeRequest,
  registerWebviewThemeBridge,
} from '@plugin/core/view/webview-theme';
import {
  BRANDING,
  MINDSTUDIO_OPSUITE_PANEL_TYPE,
  PLUGIN_SIDEBAR_VIEW_TYPE,
} from '@shared/flavor';

type FakeWebview = {
  options?: unknown;
  html: string;
  postMessage: jest.Mock;
  onDidReceiveMessage: jest.Mock;
};

type FakePanel = {
  webview: FakeWebview;
  iconPath: unknown;
  reveal: jest.Mock;
  dispose: jest.Mock;
  onDidDispose: jest.Mock;
};

type ViewProvider = {
  resolveWebviewView: (webviewView: {
    webview: FakeWebview;
  })=> Promise<void>;
};

function createFakePanel(): {
  panel: FakePanel;
  fireMessage: (message: unknown)=> void;
  fireDispose: ()=> void;
} {
  const handlers: {
    message?: (message: unknown)=> void;
    dispose?: ()=> void;
  } = {};

  const webview: FakeWebview = {
    options: undefined,
    html: '',
    postMessage: jest.fn(),
    onDidReceiveMessage: jest.fn((callback: (message: unknown)=> void) => {
      handlers.message = callback;

      return { dispose: jest.fn() };
    }),
  };

  const panel: FakePanel = {
    webview,
    iconPath: undefined,
    reveal: jest.fn(),
    dispose: jest.fn(),
    onDidDispose: jest.fn((callback: ()=> void) => {
      handlers.dispose = callback;
    }),
  };

  return {
    panel,
    fireMessage: (message: unknown) => handlers.message?.(message),
    fireDispose: () => handlers.dispose?.(),
  };
}

function createSidebarWebview(): FakeWebview & {
  fire: (message: unknown)=> void;
} {
  let receiver: ((message: unknown)=> void) | undefined;

  return {
    options: undefined,
    html: '',
    postMessage: jest.fn(),
    onDidReceiveMessage: jest.fn((callback: (message: unknown)=> void) => {
      receiver = callback;

      return { dispose: jest.fn() };
    }),
    fire: (message: unknown) => receiver?.(message),
  };
}

function createContext(): any {
  return {
    extensionPath: '/ext',
    extensionUri: { fsPath: '/ext' },
    subscriptions: [],
    globalState: {
      get: jest.fn(),
      update: jest.fn(),
    },
  };
}

function getViewProvider(index: number): ViewProvider {
  return (vscode.window.registerWebviewViewProvider as jest.Mock).mock
    .calls[index][1];
}

function getListCallback(): jest.Mock {
  return (webviewMessageList as Array<{
    command: string;
    callback: jest.Mock;
  }>)[0].callback;
}

describe('WebviewProvider', () => {
  let provider: WebviewProvider;
  let fakeApiServer: { addWebview: jest.Mock };
  let fakePanel: FakePanel;
  let fireMessage: (message: unknown)=> void;
  let fireDispose: ()=> void;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log')
      .mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const created = createFakePanel();

    fakePanel = created.panel;
    fireMessage = created.fireMessage;
    fireDispose = created.fireDispose;

    (vscode.window.createWebviewPanel as jest.Mock)
      .mockReturnValue(fakePanel);
    (vscode.window.registerWebviewViewProvider as jest.Mock)
      .mockImplementation(() => ({ dispose: jest.fn() }));
    (HtmlTransformer.transformDistHtml as jest.Mock)
      .mockResolvedValue('<html>panel</html>');
    (fs.existsSync as jest.Mock)
      .mockReturnValue(false);

    fakeApiServer = { addWebview: jest.fn() };

    provider = new WebviewProvider(createContext(), fakeApiServer);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe('show', () => {
    it('creates a new panel and renders the panel view for a known router', async () => {
      await provider.show('config');

      expect(vscode.window.createWebviewPanel)
        .toHaveBeenCalledWith(
          MINDSTUDIO_OPSUITE_PANEL_TYPE,
          BRANDING.productName,
          vscode.ViewColumn.Active,
          {
            enableScripts: true,
            retainContextWhenHidden: true,
          },
        );
      expect(fakeApiServer.addWebview)
        .toHaveBeenCalledWith('config', fakePanel.webview);
      expect(HtmlTransformer.transformDistHtml)
        .toHaveBeenCalledWith(
          path.join('/ext', 'out', 'web'),
          fakePanel.webview,
          'panels/config',
          { lang: 'en' },
        );
      expect(fakePanel.webview.html)
        .toBe('<html>panel</html>');
      expect(registerWebviewThemeBridge)
        .toHaveBeenCalledWith(fakePanel.webview);
      expect(fakePanel.onDidDispose)
        .toHaveBeenCalledTimes(1);
      expect(fakePanel.webview.onDidReceiveMessage)
        .toHaveBeenCalledTimes(1);
      expect(fakePanel.reveal)
        .not.toHaveBeenCalled();
    });

    it.each([
      [
        'new-project',
        'web.home.newOperatorProject',
      ],
      [
        'options-st-test',
        'stTest.options.title',
      ],
    ])('uses the localized title for router %s', async (router, expectedTitle) => {
      await provider.show(router);

      expect(vscode.window.createWebviewPanel)
        .toHaveBeenCalledWith(
          MINDSTUDIO_OPSUITE_PANEL_TYPE,
          expectedTitle,
          vscode.ViewColumn.Active,
          expect.anything(),
        );
    });

    it('uses the branding product name for the welcome router', async () => {
      await provider.show('welcome');

      expect(vscode.window.createWebviewPanel)
        .toHaveBeenCalledWith(
          MINDSTUDIO_OPSUITE_PANEL_TYPE,
          BRANDING.productName,
          vscode.ViewColumn.Active,
          expect.anything(),
        );
    });

    it('uses the router as-is and the branding title for unknown routers', async () => {
      await provider.show('some-other-view');

      expect(vscode.window.createWebviewPanel)
        .toHaveBeenCalledWith(
          MINDSTUDIO_OPSUITE_PANEL_TYPE,
          BRANDING.productName,
          vscode.ViewColumn.Active,
          expect.anything(),
        );
      expect(HtmlTransformer.transformDistHtml)
        .toHaveBeenCalledWith(
          path.join('/ext', 'out', 'web'),
          fakePanel.webview,
          'some-other-view',
          { lang: 'en' },
        );
    });

    it('reveals the existing panel without re-rendering for a non-st-test router', async () => {
      await provider.show('welcome');
      (HtmlTransformer.transformDistHtml as jest.Mock).mockClear();

      await provider.show('welcome');

      expect(fakePanel.reveal)
        .toHaveBeenCalledTimes(1);
      expect(HtmlTransformer.transformDistHtml)
        .not.toHaveBeenCalled();
      expect(vscode.window.createWebviewPanel)
        .toHaveBeenCalledTimes(1);
    });

    it('re-renders the existing panel when re-shown with the st-test router', async () => {
      await provider.show('welcome');

      await provider.show('options-st-test');

      expect(HtmlTransformer.transformDistHtml)
        .toHaveBeenCalledTimes(2);
      expect(HtmlTransformer.transformDistHtml)
        .toHaveBeenLastCalledWith(
          expect.anything(),
          fakePanel.webview,
          'panels/options-st-test',
          expect.anything(),
        );
      expect(fakePanel.reveal)
        .toHaveBeenCalledTimes(1);
    });

    it('logs when panel creation fails inside createPanel', async () => {
      (vscode.window.createWebviewPanel as jest.Mock)
        .mockImplementation(() => {
          throw new Error('boom');
        });

      await provider.show('config');

      expect(errorSpy)
        .toHaveBeenCalledWith(new Error('boom'));
      expect(vscode.window.showErrorMessage)
        .not.toHaveBeenCalled();
    });

    it('reports a friendly error message when revealing the existing panel fails', async () => {
      await provider.show('config');
      fakePanel.reveal.mockImplementation(() => {
        throw new Error('reveal boom');
      });

      await provider.show('config');

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('extension.openDevToolsFailed: Error: reveal boom');
    });

    it('logs and keeps the previous content when html transformation fails', async () => {
      (HtmlTransformer.transformDistHtml as jest.Mock)
        .mockRejectedValue(new Error('bad html'));

      await provider.show('config');

      expect(fakePanel.webview.html)
        .toBe('');
      expect(logSpy)
        .toHaveBeenCalledTimes(1);
    });

    it('skips the content update when no panel exists', async () => {
      await (provider as unknown as {
        updateWebviewContent: (router: string)=> Promise<void>;
      }).updateWebviewContent('config');

      expect(HtmlTransformer.transformDistHtml)
        .not.toHaveBeenCalled();
    });

    it('creates a panel when invoked without a router', async () => {
      await (provider as unknown as {
        createPanel: (router?: string)=> Promise<void>;
      }).createPanel(undefined);

      expect(vscode.window.createWebviewPanel)
        .toHaveBeenCalledTimes(1);
      expect(fakeApiServer.addWebview)
        .toHaveBeenCalledWith('', fakePanel.webview);
    });

    it('sets a branding icon on the panel when the out icon file exists', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      await provider.show('config');

      const iconUri = path.join(
        '/ext',
        'out',
        'web',
        'branding',
        'extension_icon.png',
      );

      expect(vscode.window.createWebviewPanel)
        .toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          expect.anything(),
          expect.objectContaining({
            iconPath: {
              light: { fsPath: iconUri },
              dark: { fsPath: iconUri },
            },
          }),
        );
      expect(fakePanel.iconPath)
        .toEqual({
          light: { fsPath: iconUri },
          dark: { fsPath: iconUri },
        });
    });

    it('falls back to the web src assets icon when the out icon is missing', async () => {
      (fs.existsSync as jest.Mock)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);

      await provider.show('config');

      const iconUri = path.join(
        '/ext',
        'web',
        'src',
        'assets',
        'branding',
        'extension_icon.png',
      );

      expect(vscode.window.createWebviewPanel)
        .toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          expect.anything(),
          expect.objectContaining({
            iconPath: {
              light: { fsPath: iconUri },
              dark: { fsPath: iconUri },
            },
          }),
        );
    });
  });

  describe('postMessage', () => {
    it('forwards messages to the panel webview', async () => {
      await provider.show('config');

      provider.postMessage({ hello: 'world' });

      expect(fakePanel.webview.postMessage)
        .toHaveBeenCalledWith({ hello: 'world' });
    });

    it('ignores messages when no panel exists', () => {
      expect(() => provider.postMessage({ hello: 'world' }))
        .not.toThrow();
    });
  });

  describe('showLeftPage', () => {
    it('registers a sidebar webview view provider', () => {
      const disposable = provider.showLeftPage('welcome');

      expect(vscode.window.registerWebviewViewProvider)
        .toHaveBeenCalledWith(
          PLUGIN_SIDEBAR_VIEW_TYPE,
          expect.objectContaining({ resolveWebviewView: expect.any(Function) }),
          { webviewOptions: { retainContextWhenHidden: true } },
        );
      expect(typeof disposable.dispose)
        .toBe('function');
    });

    it('registers the sidebar when invoked without a router', () => {
      const disposable = (provider as unknown as {
        createLeftNavWebview: ()=> vscode.Disposable;
      }).createLeftNavWebview();

      expect(vscode.window.registerWebviewViewProvider)
        .toHaveBeenCalledTimes(1);
      expect(typeof disposable.dispose)
        .toBe('function');
    });

    it('disposes the previous sidebar registration on re-registration', () => {
      const first = provider.showLeftPage('welcome') as { dispose: jest.Mock };
      const second = provider.showLeftPage('home');

      expect(first.dispose)
        .toHaveBeenCalledTimes(1);
      expect(second)
        .not.toBe(first);
      expect(vscode.window.registerWebviewViewProvider)
        .toHaveBeenCalledTimes(2);
    });

    it('disposes the previous theme bridge when a new sidebar is registered', async () => {
      provider.showLeftPage('welcome');
      await getViewProvider(0)
        .resolveWebviewView({ webview: createSidebarWebview() });

      const firstThemeBridge = (registerWebviewThemeBridge as jest.Mock).mock
        .results[0].value;

      provider.showLeftPage('home');

      expect(firstThemeBridge.dispose)
        .toHaveBeenCalledTimes(1);
    });

    it('resolves the sidebar webview with scripts, html and message handling', async () => {
      const sidebarWebview = createSidebarWebview();

      provider.showLeftPage('welcome');
      await getViewProvider(0)
        .resolveWebviewView({ webview: sidebarWebview });

      expect(sidebarWebview.options)
        .toEqual({
          enableScripts: true,
          localResourceRoots: [{ fsPath: '/ext/out/web' }],
        });
      expect(HtmlTransformer.transformDistHtml)
        .toHaveBeenCalledWith(
          path.join('/ext', 'out', 'web'),
          sidebarWebview,
          'sidebars/welcome',
          { lang: 'en' },
        );
      expect(sidebarWebview.html)
        .toBe('<html>panel</html>');
      expect(registerWebviewThemeBridge)
        .toHaveBeenCalledWith(sidebarWebview);
      expect(sidebarWebview.onDidReceiveMessage)
        .toHaveBeenCalledTimes(1);
    });

    it('dispatches sidebar messages to the registered message list', async () => {
      const sidebarWebview = createSidebarWebview();

      provider.showLeftPage('welcome');
      await getViewProvider(0)
        .resolveWebviewView({ webview: sidebarWebview });

      sidebarWebview.fire({
        command: 'test-cmd',
        value: 42,
      });

      expect(getListCallback())
        .toHaveBeenCalledWith({
          command: 'test-cmd',
          value: 42,
        }, provider);
    });

    it('returns an empty disposable when sidebar registration fails', () => {
      (vscode.window.registerWebviewViewProvider as jest.Mock)
        .mockImplementation(() => {
          throw new Error('register failed');
        });

      const disposable = provider.showLeftPage('welcome');

      expect(typeof disposable.dispose)
        .toBe('function');
      expect(errorSpy)
        .toHaveBeenCalledWith(
          'Failed to register pluginSidebar webview provider:',
          expect.any(Error),
        );
    });
  });

  describe('webview messages', () => {
    it('forwards theme requests to the theme bridge and skips the message list', async () => {
      (handleThemeRequest as jest.Mock)
        .mockReturnValueOnce(true);
      await provider.show('config');

      fireMessage({ command: 'getTheme' });

      expect(handleThemeRequest)
        .toHaveBeenCalledWith(fakePanel.webview, { command: 'getTheme' });
      expect(getListCallback())
        .not.toHaveBeenCalled();
    });

    it('dispatches matching messages to the message list', async () => {
      await provider.show('config');

      fireMessage({
        command: 'test-cmd',
        data: 1,
      });

      expect(getListCallback())
        .toHaveBeenCalledWith({
          command: 'test-cmd',
          data: 1,
        }, provider);
    });

    it('ignores unknown commands', async () => {
      await provider.show('config');

      fireMessage({ command: 'nope' });

      expect(getListCallback())
        .not.toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('disposes the panel, sidebar registration and theme bridge', async () => {
      await provider.show('config');
      const sidebar = provider.showLeftPage('welcome') as { dispose: jest.Mock };
      const panelThemeBridge = (registerWebviewThemeBridge as jest.Mock).mock
        .results[0].value;

      provider.dispose();

      expect(fakePanel.dispose)
        .toHaveBeenCalledTimes(1);
      expect(sidebar.dispose)
        .toHaveBeenCalledTimes(1);
      expect(panelThemeBridge.dispose)
        .toHaveBeenCalledTimes(1);
    });

    it('disposes the provider when the panel is closed', async () => {
      await provider.show('config');

      fireDispose();

      expect(fakePanel.dispose)
        .toHaveBeenCalledTimes(1);
      expect(registerWebviewThemeBridge)
        .toHaveBeenCalledTimes(1);
    });

    it('disposes the sidebar theme bridge on provider dispose', async () => {
      provider.showLeftPage('welcome');
      await getViewProvider(0)
        .resolveWebviewView({ webview: createSidebarWebview() });

      const sidebarThemeBridge = (registerWebviewThemeBridge as jest.Mock).mock
        .results[0].value;

      provider.dispose();

      expect(sidebarThemeBridge.dispose)
        .toHaveBeenCalledTimes(1);
    });

    it('is idempotent', async () => {
      await provider.show('config');

      provider.dispose();
      provider.dispose();

      expect(fakePanel.dispose)
        .toHaveBeenCalledTimes(1);
    });
  });
});
