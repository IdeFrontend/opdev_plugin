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
 * Unit tests for webview-message-list: the default message handler registry
 * (alert/info/loaded/navigation/external-link commands) and the
 * handleOperatorProjectDirectoryFile flow for every project view id (CANN,
 * STANDARD_CUSTOM, PYASC, TRITON) including disabled-type, missing-template,
 * prototype-empty-path and runner-failure paths.
 */

jest.mock('i18next', () => ({ t: (key: string) => key }));

jest.mock('vscode', () => ({
  Uri: { parse: jest.fn((value: string) => ({ value })) },
  window: {
    showErrorMessage: jest.fn(),
    showInformationMessage: jest.fn(),
    showWarningMessage: jest.fn(),
  },
  commands: {
    executeCommand: jest.fn(),
    // focusOpsOperateViewContainer resolves the first registered focus command;
    // expose the view-container command so it executes instead of skipping.
    getCommands: jest.fn(async () => ['workbench.view.extension.mstt']),
  },
  env: { openExternal: jest.fn() },
}));

jest.mock('@plugin/service/settings-loader', () => ({ SettingsLoader: { isOperatorSupportEnabled: jest.fn(() => true) } }));

jest.mock('@plugin/core/project/project-manager', () => ({ ProjectManager: { getInstance: jest.fn(() => ({ projectPath: '/ws/operator-demo' })) } }));

jest.mock('@plugin/controller/welcome-controller', () => ({
  welcomeMethods: {
    createOpsByPrototype: jest.fn(async () => undefined),
    createOps: jest.fn(async () => '/ws/ops/prototype.sh'),
  },
}));

jest.mock('@shared/flavor', () => ({ workbenchViewContainerCommand: jest.fn(() => 'workbench.view.extension.mstt') }));

import * as vscode from 'vscode';
import {
  handleOperatorProjectDirectoryFile,
  default as webviewMessageList,
} from '@plugin/class/webview-message-list';
import {
  COMMAND_OPEN,
  COMMAND_OPEN_PROJECT,
  COMMAND_WELCOME,
} from '@plugin/constants';
import { SettingsLoader } from '@plugin/service/settings-loader';
import { ProjectManager } from '@plugin/core/project/project-manager';
import { welcomeMethods } from '@plugin/controller/welcome-controller';

const showErrorMessageMock = vscode.window.showErrorMessage as jest.Mock;
const showInformationMessageMock = vscode.window.showInformationMessage as jest.Mock;
const showWarningMessageMock = vscode.window.showWarningMessage as jest.Mock;
const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
const openExternalMock = vscode.env.openExternal as jest.Mock;
const uriParseMock = vscode.Uri.parse as jest.Mock;
const isOperatorSupportEnabledMock = SettingsLoader.isOperatorSupportEnabled as jest.Mock;
const getInstanceMock = ProjectManager.getInstance as jest.Mock;
const createOpsByPrototypeMock = welcomeMethods.createOpsByPrototype as jest.Mock;
const createOpsMock = welcomeMethods.createOps as jest.Mock;

const progressReport = jest.fn();

const makeProgress = (): { report: jest.Mock } => ({ report: progressReport });

const makeMessage = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  createOperatorProjectDirectoryFileType: 1,
  ...overrides,
});

describe('webviewMessageList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers an alert handler that surfaces message text as an error', () => {
    const handler = webviewMessageList.find((item) => item.command === 'alert');

    expect(handler)
      .toBeDefined();
    handler?.callback({ text: 'boom' }, undefined);

    expect(showErrorMessageMock)
      .toHaveBeenCalledWith('boom');
  });

  it('registers an info handler that surfaces message text as information', () => {
    const handler = webviewMessageList.find((item) => item.command === 'info');

    handler?.callback({ text: 'done' }, undefined);

    expect(showInformationMessageMock)
      .toHaveBeenCalledWith('done');
  });

  it('warns on loaded messages carrying an error status', () => {
    const handler = webviewMessageList.find((item) => item.command === 'loaded');

    handler?.callback({
      status: 'error',
      message: 'load failed',
    }, undefined);

    expect(showWarningMessageMock)
      .toHaveBeenCalledWith('webview.opsuiteLoadError');
  });

  it('ignores loaded messages with a non-error status', () => {
    const handler = webviewMessageList.find((item) => item.command === 'loaded');

    handler?.callback({ status: 'ok' }, undefined);

    expect(showWarningMessageMock).not.toHaveBeenCalled();
  });

  it('executes the open-link, open-project and welcome commands from webview messages', () => {
    const linkHandler = webviewMessageList.find((item) => item.command === 'openLinkWebviewPanel');
    const projectHandler = webviewMessageList.find((item) => item.command === 'openProjectWebviewPanel');
    const welcomeHandler = webviewMessageList.find((item) => item.command === 'openWelcome');

    linkHandler?.callback({}, undefined);
    projectHandler?.callback({}, undefined);
    welcomeHandler?.callback({}, undefined);

    expect(executeCommandMock)
      .toHaveBeenNthCalledWith(1, COMMAND_OPEN);
    expect(executeCommandMock)
      .toHaveBeenNthCalledWith(2, COMMAND_OPEN_PROJECT);
    expect(executeCommandMock)
      .toHaveBeenNthCalledWith(3, COMMAND_WELCOME);
  });

  it('opens the sidebar view container from webview messages', async () => {
    const handler = webviewMessageList.find((item) => item.command === 'vscodeOpenSidebar');

    // The handler fires focusOpsOperateViewContainer() (async: getCommands → executeCommand);
    // await it so the resolved focus command is executed before asserting.
    await handler?.callback({}, undefined);
    await Promise.resolve();

    // The focus candidate list (which calls workbenchViewContainerCommand()) is built at
    // module-load time, so beforeEach's clearAllMocks wipes that call before the body runs.
    // Assert on the resolved command actually executed instead.
    expect(executeCommandMock)
      .toHaveBeenCalledWith('workbench.view.extension.mstt');
  });

  it('opens external urls only when the message carries one', async () => {
    const handler = webviewMessageList.find((item) => item.command === 'openExternalLink');

    await handler?.callback({ url: 'https://example.com' }, undefined);

    expect(uriParseMock)
      .toHaveBeenCalledWith('https://example.com');
    expect(openExternalMock)
      .toHaveBeenCalledWith({ value: 'https://example.com' });

    await handler?.callback({}, undefined);

    expect(openExternalMock)
      .toHaveBeenCalledTimes(1);
  });
});

describe('handleOperatorProjectDirectoryFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getInstanceMock.mockReturnValue({ projectPath: '/ws/operator-demo' });
    isOperatorSupportEnabledMock.mockReturnValue(true);
    createOpsByPrototypeMock.mockResolvedValue(undefined);
    createOpsMock.mockResolvedValue('/ws/ops/prototype.sh');
    (globalThis as unknown as { extensionContext: unknown }).extensionContext = {
      globalState: {
        get: jest.fn(() => 'custom-template'),
        update: jest.fn(),
      },
    };
  });

  afterEach(() => {
    delete (globalThis as unknown as { extensionContext?: unknown }).extensionContext;
  });

  it('returns early when the message is empty', async () => {
    await handleOperatorProjectDirectoryFile(undefined, undefined, makeProgress());

    expect(createOpsByPrototypeMock).not.toHaveBeenCalled();
    expect(showErrorMessageMock).not.toHaveBeenCalled();
  });

  it('rejects when the requested triton project type is disabled by settings', async () => {
    isOperatorSupportEnabledMock.mockReturnValue(false);

    await expect(handleOperatorProjectDirectoryFile(
      makeMessage({ createOperatorProjectDirectoryFileType: 4 }),
      undefined,
      makeProgress(),
    ))
      .rejects
      .toThrow("Project type 'triton' is currently disabled by settings.");
    expect(showErrorMessageMock)
      .toHaveBeenCalledWith('extension.unsupportedProjectTypeDisabled');
    expect(createOpsByPrototypeMock).not.toHaveBeenCalled();
  });

  it('keeps non-triton types enabled without consulting the settings', async () => {
    isOperatorSupportEnabledMock.mockClear();

    await handleOperatorProjectDirectoryFile(
      makeMessage({ createOperatorProjectDirectoryFileType: 1 }),
      undefined,
      makeProgress(),
    );

    expect(isOperatorSupportEnabledMock).not.toHaveBeenCalled();
  });

  it('ignores unknown project view ids entirely', async () => {
    await handleOperatorProjectDirectoryFile(
      makeMessage({ createOperatorProjectDirectoryFileType: 99 }),
      undefined,
      makeProgress(),
    );

    expect(createOpsByPrototypeMock).not.toHaveBeenCalled();
    expect(createOpsMock).not.toHaveBeenCalled();
    expect(progressReport).not.toHaveBeenCalled();
    expect(showErrorMessageMock).not.toHaveBeenCalled();
  });

  it('creates a CANN operator prototype and cleans the stored template', async () => {
    await handleOperatorProjectDirectoryFile(
      makeMessage({ createOperatorProjectDirectoryFileType: 1 }),
      undefined,
      makeProgress(),
    );

    expect(createOpsByPrototypeMock)
      .toHaveBeenCalledWith({
        opsPrototypeFile: '',
        opType: 'cann',
        templateName: 'custom-template',
        opName: 'operator-demo',
      });
    expect((globalThis as unknown as { extensionContext: { globalState: { update: jest.Mock } } })
      .extensionContext.globalState.update)
      .toHaveBeenCalledWith('templateName', undefined);
    expect(executeCommandMock)
      .toHaveBeenCalledWith('workbench.action.closeActiveEditor');
    expect(progressReport)
      .toHaveBeenCalledWith({
        increment: 25,
        message: 'welcome.createFilesProgressTitle',
      });
    expect(progressReport)
      .toHaveBeenCalledWith({
        increment: 100,
        message: 'webview.opFileCreated',
      });
    expect(showInformationMessageMock)
      .toHaveBeenCalledWith('webview.opFileCreated');
  });

  it('creates a CANN operator without a template and without a project path', async () => {
    getInstanceMock.mockReturnValue({ projectPath: undefined });
    (globalThis as unknown as { extensionContext: { globalState: { get: jest.Mock } } })
      .extensionContext.globalState.get
      .mockReturnValue(undefined);

    await handleOperatorProjectDirectoryFile(
      makeMessage({ createOperatorProjectDirectoryFileType: 1 }),
      undefined,
      makeProgress(),
    );

    expect(createOpsByPrototypeMock)
      .toHaveBeenCalledWith({
        opsPrototypeFile: '',
        opType: 'cann',
        templateName: undefined,
        opName: undefined,
      });
    expect((globalThis as unknown as { extensionContext: { globalState: { update: jest.Mock } } })
      .extensionContext.globalState.update)
      .not
      .toHaveBeenCalled();
  });

  it('creates a pyasc operator prototype', async () => {
    await handleOperatorProjectDirectoryFile(
      makeMessage({ createOperatorProjectDirectoryFileType: 3 }),
      undefined,
      makeProgress(),
    );

    expect(createOpsByPrototypeMock)
      .toHaveBeenCalledWith({
        opsPrototypeFile: '',
        opType: 'pyasc',
        templateName: 'custom-template',
        opName: 'operator-demo',
      });
    expect(executeCommandMock)
      .toHaveBeenCalledWith('workbench.action.closeActiveEditor');
  });

  it('creates a pyasc operator prototype without a project path', async () => {
    getInstanceMock.mockReturnValue({ projectPath: undefined });

    await handleOperatorProjectDirectoryFile(
      makeMessage({ createOperatorProjectDirectoryFileType: 3 }),
      undefined,
      makeProgress(),
    );

    expect(createOpsByPrototypeMock)
      .toHaveBeenCalledWith(expect.objectContaining({ opName: undefined }));
  });

  it('creates a triton operator prototype falling back to the default template', async () => {
    (globalThis as unknown as { extensionContext: { globalState: { get: jest.Mock } } })
      .extensionContext.globalState.get
      .mockReturnValue(undefined);

    await handleOperatorProjectDirectoryFile(
      makeMessage({ createOperatorProjectDirectoryFileType: 4 }),
      undefined,
      makeProgress(),
    );

    expect(createOpsByPrototypeMock)
      .toHaveBeenCalledWith({
        opsPrototypeFile: '',
        opType: 'triton',
        templateName: 'triton_vector_add',
        opName: 'operator-demo',
      });
  });

  it('creates a triton operator prototype without a project path', async () => {
    getInstanceMock.mockReturnValue({ projectPath: undefined });

    await handleOperatorProjectDirectoryFile(
      makeMessage({ createOperatorProjectDirectoryFileType: 4 }),
      undefined,
      makeProgress(),
    );

    expect(createOpsByPrototypeMock)
      .toHaveBeenCalledWith(expect.objectContaining({ opName: undefined }));
  });

  it('cleans the stored template after creating a triton operator from it', async () => {
    await handleOperatorProjectDirectoryFile(
      makeMessage({ createOperatorProjectDirectoryFileType: 4 }),
      undefined,
      makeProgress(),
    );

    expect(createOpsByPrototypeMock)
      .toHaveBeenCalledWith(expect.objectContaining({ templateName: 'custom-template' }));
    expect((globalThis as unknown as { extensionContext: { globalState: { update: jest.Mock } } })
      .extensionContext.globalState.update)
      .toHaveBeenCalledWith('templateName', undefined);
    expect(executeCommandMock)
      .toHaveBeenCalledWith('workbench.action.closeActiveEditor');
  });

  it('creates a standard-custom operator without sub-operator context', async () => {
    await handleOperatorProjectDirectoryFile(
      makeMessage({ createOperatorProjectDirectoryFileType: 2 }),
      undefined,
      makeProgress(),
    );

    expect(createOpsMock)
      .toHaveBeenCalledWith({});
    expect(createOpsByPrototypeMock)
      .toHaveBeenCalledWith({
        opsPrototypeFile: '/ws/ops/prototype.sh',
        opType: 'ascend',
        opName: 'operator-demo',
      });
    expect(executeCommandMock)
      .toHaveBeenCalledWith('workbench.action.closeActiveEditor');
  });

  it('creates a standard-custom operator without a project path to fall back on', async () => {
    getInstanceMock.mockReturnValue({ projectPath: undefined });

    await handleOperatorProjectDirectoryFile(
      makeMessage({ createOperatorProjectDirectoryFileType: 2 }),
      undefined,
      makeProgress(),
    );

    expect(createOpsByPrototypeMock)
      .toHaveBeenCalledWith(expect.objectContaining({ opName: undefined }));
  });

  it('creates a standard-custom operator from sub-operator context with file generation skipped', async () => {
    const ctx = {
      parentProjectPath: '/ws/parent',
      opName: 'op-ctx',
      outputPath: '/ws/out',
      skipFileGeneration: true,
    };

    await handleOperatorProjectDirectoryFile(
      makeMessage({
        createOperatorProjectDirectoryFileType: 2,
        subOperatorContext: ctx,
      }),
      undefined,
      makeProgress(),
    );

    expect(createOpsMock)
      .toHaveBeenCalledWith({
        projectPath: '/ws/parent',
        projectName: 'op-ctx',
        outputPath: '/ws/out',
      });
    expect(createOpsByPrototypeMock)
      .toHaveBeenCalledWith({
        opsPrototypeFile: '/ws/ops/prototype.sh',
        opType: 'ascend',
        opName: 'op-ctx',
        projectPath: '/ws/parent',
        opPath: '/ws/out',
        skipFileGeneration: true,
      });
  });

  it('passes skipFileGeneration as false when the context does not request skipping', async () => {
    await handleOperatorProjectDirectoryFile(
      makeMessage({
        createOperatorProjectDirectoryFileType: 2,
        subOperatorContext: {
          parentProjectPath: '/ws/parent',
          opName: 'op-ctx',
          outputPath: '/ws/out',
        },
      }),
      undefined,
      makeProgress(),
    );

    expect(createOpsByPrototypeMock)
      .toHaveBeenCalledWith(expect.objectContaining({ skipFileGeneration: false }));
  });

  it('throws when the prototype file path is empty', async () => {
    createOpsMock.mockResolvedValue('');

    await expect(handleOperatorProjectDirectoryFile(
      makeMessage({ createOperatorProjectDirectoryFileType: 2 }),
      undefined,
      makeProgress(),
    ))
      .rejects
      .toThrow('webview.createPrototypeFailedEmptyPath');
    expect(createOpsByPrototypeMock).not.toHaveBeenCalled();
  });

  it('reports a translated failure and rethrows when prototype creation fails', async () => {
    createOpsByPrototypeMock.mockRejectedValue(new Error('gen failed'));

    await expect(handleOperatorProjectDirectoryFile(
      makeMessage({ createOperatorProjectDirectoryFileType: 1 }),
      undefined,
      makeProgress(),
    ))
      .rejects
      .toThrow('gen failed');
    expect(progressReport)
      .toHaveBeenCalledWith({
        increment: 100,
        message: 'webview.createOpFileFailed',
      });
    expect(showErrorMessageMock)
      .toHaveBeenCalledWith('webview.createOpFileFailed');
  });

  it('reports string errors thrown by the prototype creation flow', async () => {
    createOpsByPrototypeMock.mockRejectedValue('string failure');

    await expect(handleOperatorProjectDirectoryFile(
      makeMessage({ createOperatorProjectDirectoryFileType: 1 }),
      undefined,
      makeProgress(),
    ))
      .rejects
      .toBe('string failure');
    expect(showErrorMessageMock)
      .toHaveBeenCalledWith('webview.createOpFileFailed');
  });
});
