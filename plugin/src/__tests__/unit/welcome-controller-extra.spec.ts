/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
let mockExecutorExecuteImpl: ()=> Promise<unknown> = () => Promise.resolve({ code: 0 });

jest.mock('@plugin/class/command-options', () => ({
  CommandExecutor: jest.fn()
    .mockImplementation(() => ({
      execute: jest.fn()
        .mockImplementation(() => mockExecutorExecuteImpl()),
    })),
}));

jest.mock('i18next', () => ({
  t: jest.fn((key: string, params?: { error?: string }) =>
    params?.error ? `${key}: ${params.error}` : key),
}));

jest.mock('vscode', () => ({
  env: { uriScheme: 'vscode' },
  workspace: { workspaceFolders: [{ uri: { fsPath: '/c/root' } }] },
  window: {
    showInformationMessage: jest.fn()
      .mockResolvedValue(undefined),
    showErrorMessage: jest.fn()
      .mockResolvedValue(undefined),
    showWarningMessage: jest.fn()
      .mockResolvedValue(undefined),
    withProgress: jest.fn(),
  },
  commands: {
    executeCommand: jest.fn()
      .mockResolvedValue(undefined),
  },
  Uri: { file: jest.fn((fsPath: string) => ({ fsPath })) },
  ProgressLocation: { Notification: 15 },
}));

// The real fs backs everything; existsSync/mkdirSync are jest.fn so the
// mkdir-failure path can be forced without patching the core module.
jest.mock('fs', () => {
  const actual = jest.requireActual('fs') as Record<string, unknown>;
  const existsSync = jest.fn((...args: unknown[]) =>
    (actual.existsSync as (...a: unknown[])=> boolean)(...args));
  const mkdirSync = jest.fn((...args: unknown[]) =>
    (actual.mkdirSync as (...a: unknown[])=> unknown)(...args));

  return {
    ...actual,
    existsSync,
    mkdirSync,
  };
});

jest.mock('@plugin/core/project/project-manager', () => ({
  ProjectManager: {
    getInstance: jest.fn(() => ({
      checkVscode: jest.fn()
        .mockResolvedValue(undefined),
    })),
  },
}));

jest.mock('@plugin/service/project-service', () => ({
  projectService: {
    init: jest.fn()
      .mockResolvedValue('1'),
    createOps: jest.fn()
      .mockResolvedValue('created'),
    createOpsByPrototype: jest.fn()
      .mockResolvedValue(undefined),
  },
}));

jest.mock('@plugin/domain/utils/project-utils', () => ({
  viewIdToProjectType: jest.fn((id: number | string) =>
    typeof id === 'string' ? id : (id === 2 ? 'ascend' : 'cann')),
  ensureLaunchJsonExists: jest.fn()
    .mockResolvedValue(undefined),
}));

jest.mock('@plugin/helpers/sidebar-context-refresh', () => ({
  requestSidebarContextsRefresh: jest.fn()
    .mockResolvedValue(undefined),
}));

jest.mock('@plugin/service/config-service', () => ({
  ConfigService: {
    ensureOpDevtoolsSettingsSeeded: jest.fn()
      .mockResolvedValue(true),
    writeOpDevtoolsDottedSettings: jest.fn()
      .mockResolvedValue(true),
  },
}));

jest.mock('@plugin/domain/services/operator-project-detector', () => ({
  OperatorProjectType: {
    STANDARD_CUSTOM: 'standard-custom',
    TORCH_LIBRARY: 'torch-library',
    PYASC: 'pyasc',
    TRITON: 'triton',
    ASCEND_C: 'ascend-c',
  },
  OperatorProjectDetector: { detectOperatorProject: jest.fn() },
}));

jest.mock('@plugin/domain/models/project-model', () => {
  const actual = jest.requireActual('@plugin/domain/models/project-model') as Record<string, unknown>;

  return {
    ...actual,
    getProjectByPath: jest.fn(),
  };
});

jest.mock('@plugin/service/workspace-detector-service', () => ({
  WorkspaceDetectorService: {
    detectAndRegisterWorkspace: jest.fn()
      .mockResolvedValue(undefined),
    whenRegistrationReady: jest.fn()
      .mockResolvedValue(undefined),
    scanOpsMeetAndOpsLists: jest.fn(() => ({
      opsMeet: [],
      opsList: [],
      experimentalOpsList: [],
    })),
  },
}));

jest.mock('@plugin/class/operator-project-icon-theme', () => ({ OperatorProjectIconTheme: { getInstance: jest.fn(() => ({ fireDecorationUpdate: jest.fn() })) } }));

jest.mock('@plugin/helpers/post-activate-bootstrap', () => ({
  whenPostActivateBootstrapReady: jest.fn()
    .mockResolvedValue(undefined),
}));

jest.mock('@plugin/helpers/operator-project-workspace-config', () => ({
  getWorkspaceGenOpCommand: jest.fn(() => ''),
  readWorkspaceProjectTypeSetting: jest.fn(() => undefined),
}));

jest.mock('@plugin/domain/utils/genop-command', () => ({
  buildGenOpCommand: jest.fn(),
  decideSkipFileGeneration: jest.fn(() => false),
}));

jest.mock('@plugin/constants', () => ({ COMMAND_CREATE_DIRECTORY: 'create-directory' }));

jest.mock('@plugin/helpers/open-folder-window-options', () => ({ buildOpenFolderWindowOptions: jest.fn() }));

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import { CommandExecutor } from '@plugin/class/command-options';
import { welcomeMethods } from '@plugin/controller/welcome-controller';
import { ConfigService } from '@plugin/service/config-service';
import { projectService } from '@plugin/service/project-service';
import { OperatorProjectDetector } from '@plugin/domain/services/operator-project-detector';
import {
  getProjectByPath,
  type ProjectRecord,
} from '@plugin/domain/models/project-model';
import { ensureLaunchJsonExists } from '@plugin/domain/utils/project-utils';
import { requestSidebarContextsRefresh } from '@plugin/helpers/sidebar-context-refresh';
import { whenPostActivateBootstrapReady } from '@plugin/helpers/post-activate-bootstrap';
import { readWorkspaceProjectTypeSetting } from '@plugin/helpers/operator-project-workspace-config';
import { OperatorProjectIconTheme } from '@plugin/class/operator-project-icon-theme';
import { ProjectManager } from '@plugin/core/project/project-manager';

const actualFs = jest.requireActual('fs') as typeof fs;

const executeCommand = vscode.commands.executeCommand as jest.Mock;
const showInformationMessage = vscode.window.showInformationMessage as jest.Mock;
const showErrorMessage = vscode.window.showErrorMessage as jest.Mock;
const showWarningMessage = vscode.window.showWarningMessage as jest.Mock;
const withProgress = vscode.window.withProgress as jest.Mock;

function makeRoot(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: 91,
    project_name: 'root',
    project_path: '/c/root',
    project_type: 'ascend',
    template_name: '',
    ops_list: [],
    ...overrides,
  };
}

function primeCreatedProject(): void {
  (whenPostActivateBootstrapReady as jest.Mock).mockResolvedValue(undefined);
  (getProjectByPath as jest.Mock).mockReturnValue(undefined);
  (readWorkspaceProjectTypeSetting as jest.Mock).mockReturnValue(undefined);
  (projectService.init as jest.Mock).mockResolvedValue('1');
  withProgress.mockImplementation(async (_options, task) =>
    await task({ report: jest.fn() }));
}

/** openFolderFn is fire-and-forget inside openProject; drain its microtask chain. */
async function flushOpenFolder(): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
}

describe('welcomeMethods.createOps / createOpsByPrototype', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates to projectService.createOps', async () => {
    await expect(welcomeMethods.createOps({} as never))
      .resolves
      .toBe('created');
    expect(projectService.createOps)
      .toHaveBeenCalledWith({});
  });

  it('delegates to projectService.createOpsByPrototype', async () => {
    await welcomeMethods.createOpsByPrototype({} as never);
    expect(projectService.createOpsByPrototype)
      .toHaveBeenCalledWith({});
  });
});

describe('welcomeMethods.createdProject (non-sub-operator and error paths)', () => {
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecutorExecuteImpl = () => Promise.resolve({ code: 0 });
    // The real-fs fixture tree (C:\c\root\...) persists between runs; drop it
    // so cache.json reads never observe scan state written by an earlier run
    // (keeps the ??-fallback branches in createdProject reachable).
    actualFs.rmSync(path.join('/c/root'), {
      recursive: true,
      force: true,
    });
    consoleWarnSpy = jest.spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    (globalThis as unknown as { extensionContext: unknown }).extensionContext = {
      extensionPath: '/extension',
      globalState: {
        update: jest.fn()
          .mockResolvedValue(undefined),
      },
    };
    (vscode.workspace as { workspaceFolders?: unknown }).workspaceFolders = [{ uri: { fsPath: '/c/root' } }];
    (OperatorProjectDetector.detectOperatorProject as jest.Mock).mockResolvedValue({
      isOperatorProject: true,
      projectType: 'cann',
    });
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    (fs.existsSync as jest.Mock).mockImplementation((...args: unknown[]) =>
      actualFs.existsSync(...args));
    (fs.mkdirSync as jest.Mock).mockImplementation((...args: unknown[]) =>
      actualFs.mkdirSync(...args));
  });

  it('creates a standalone cann project: init, reveal, and openFolder with forceNewWindow=false', async () => {
    primeCreatedProject();
    showInformationMessage.mockResolvedValue('welcome.openInCurrentWindow');

    await welcomeMethods.createdProject({
      projectPath: '/c/root',
      projectName: 'mul',
      createOperatorProjectDictoryFileType: 'cann',
      templateName: 'hello_world',
    });

    expect(projectService.init)
      .toHaveBeenCalledWith(expect.objectContaining({
        projectPath: '/c/root',
        projectName: 'mul',
        projectType: 'cann',
        templateName: 'hello_world',
      }));
    expect(executeCommand)
      .toHaveBeenCalledWith(
        'create-directory',
        expect.objectContaining({ createOperatorProjectDirectoryFileType: 'cann' }),
        expect.anything(),
      );
    // Standalone creation opens in the current window.
    expect(showInformationMessage)
      .toHaveBeenCalledWith('welcome.openProjectDirSuccess');
    expect(executeCommand)
      .toHaveBeenCalledWith('vscode.openFolder', { fsPath: path.join('/c/root', 'mul') }, undefined);
  });

  it('seeds the pyasc sanitizer target as python3 ./<op>.py', async () => {
    primeCreatedProject();

    await welcomeMethods.createdProject({
      projectPath: '/c/root',
      projectName: 'mul',
      createOperatorProjectDictoryFileType: 'pyasc',
    });

    const cachePath = path.join('/c/root', 'mul', '.vscode', 'cache.json');
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as {
      sanitizerPythonTarget: Record<string, string>;
    };

    expect(Object.values(cache.sanitizerPythonTarget))
      .toContain('python3 ./mul.py');
  });

  it('seeds the torch-library sanitizer target as python ../run.py', async () => {
    primeCreatedProject();

    await welcomeMethods.createdProject({
      projectPath: '/c/root',
      projectName: 'build_op',
      createOperatorProjectDictoryFileType: 'torch-library',
      templateName: 'torch_library_template',
    });

    const cachePath = path.join('/c/root', 'build_op', '.vscode', 'cache.json');
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as {
      sanitizerPythonTarget: Record<string, string>;
    };

    expect(Object.values(cache.sanitizerPythonTarget))
      .toContain('python ../run.py');
  });

  it('throws createProjectDirFailed when the operator directory cannot be created', async () => {
    primeCreatedProject();
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {
      throw new Error('disk full');
    });

    await expect(welcomeMethods.createdProject({
      projectPath: '/c/root',
      projectName: 'mul',
      createOperatorProjectDictoryFileType: 'cann',
    }))
      .rejects
      .toThrow('welcome.createProjectDirFailed: disk full');
    expect(showErrorMessage)
      .toHaveBeenCalledWith('welcome.createProjectFailed: welcome.createProjectDirFailed: disk full');
  });

  it('warns and continues when the environment script execution fails', async () => {
    primeCreatedProject();
    mockExecutorExecuteImpl = () => Promise.reject(new Error('chmod failed'));

    await welcomeMethods.createdProject({
      projectPath: '/c/root',
      projectName: 'mul',
      createOperatorProjectDictoryFileType: 'cann',
      projectSH: '/c/env.sh',
    });

    expect(consoleWarnSpy)
      .toHaveBeenCalledWith(expect.stringContaining('Failed to execute environment variable script'));
    expect(projectService.init)
      .toHaveBeenCalled();
  });

  it('throws initOperatorProjectFailed when projectService.init fails', async () => {
    primeCreatedProject();
    (projectService.init as jest.Mock).mockRejectedValue(new Error('init exploded'));

    await expect(welcomeMethods.createdProject({
      projectPath: '/c/root',
      projectName: 'mul',
      createOperatorProjectDictoryFileType: 'cann',
    }))
      .rejects
      .toThrow('welcome.initOperatorProjectFailed: init exploded');
  });

  it('throws when the sub-operator collection has no scan state in the cache', async () => {
    primeCreatedProject();
    // Sub-operator: standard-custom view inside a registered ascend collection.
    (getProjectByPath as jest.Mock).mockReturnValue(makeRoot());
    (readWorkspaceProjectTypeSetting as jest.Mock).mockReturnValue('ascend');

    await expect(welcomeMethods.createdProject({
      projectPath: '/c/root',
      projectName: 'add',
      createOperatorProjectDictoryFileType: 2,
    }))
      .rejects
      .toThrow('welcome.initOperatorProjectFailed: standard-custom collection is not registered');
  });

  it('warns and continues when revealInExplorer fails', async () => {
    primeCreatedProject();
    showInformationMessage.mockResolvedValue('welcome.openInCurrentWindow');
    executeCommand.mockImplementation((command: string) => {
      if (command === 'revealInExplorer') {
        return Promise.reject(new Error('tree closed'));
      }

      return Promise.resolve(undefined);
    });

    await welcomeMethods.createdProject({
      projectPath: '/c/root',
      projectName: 'mul',
      createOperatorProjectDictoryFileType: 'cann',
    });

    expect(consoleWarnSpy)
      .toHaveBeenCalledWith(expect.stringContaining('Failed to reveal in explorer'));
    expect(showInformationMessage)
      .toHaveBeenCalledWith('welcome.openProjectDirSuccess');
  });

  it('warns but continues when the create-directory command fails inside withProgress', async () => {
    primeCreatedProject();
    showInformationMessage.mockResolvedValue('welcome.openInCurrentWindow');
    executeCommand.mockImplementation((command: string) => {
      if (command === 'create-directory') {
        return Promise.reject(new Error('template missing'));
      }

      return Promise.resolve(undefined);
    });

    await welcomeMethods.createdProject({
      projectPath: '/c/root',
      projectName: 'mul',
      createOperatorProjectDictoryFileType: 'cann',
    });

    expect(showWarningMessage)
      .toHaveBeenCalledWith('welcome.createDirOkCreateFilesError: template missing');
    // The open flow still runs.
    expect(showInformationMessage)
      .toHaveBeenCalledWith('welcome.openProjectDirSuccess');
  });

  it('returns without opening when the user dismisses the open-mode prompt', async () => {
    primeCreatedProject();
    showInformationMessage.mockResolvedValue(undefined);

    await welcomeMethods.createdProject({
      projectPath: '/c/root',
      projectName: 'mul',
      createOperatorProjectDictoryFileType: 'cann',
    });

    expect(executeCommand)
      .not
      .toHaveBeenCalledWith('vscode.openFolder', expect.anything(), expect.anything());
  });

  it('shows an error when vscode.openFolder itself fails', async () => {
    primeCreatedProject();
    showInformationMessage.mockResolvedValue('welcome.openInCurrentWindow');
    executeCommand.mockImplementation((command: string) => {
      if (command === 'vscode.openFolder') {
        return Promise.reject(new Error('window busy'));
      }

      return Promise.resolve(undefined);
    });

    await welcomeMethods.createdProject({
      projectPath: '/c/root',
      projectName: 'mul',
      createOperatorProjectDictoryFileType: 'cann',
    });

    expect(showErrorMessage)
      .toHaveBeenCalledWith('welcome.openProjectDirFailed: window busy');
  });

  it('opens in the current window when the workspace folders are undefined', async () => {
    primeCreatedProject();
    (vscode.workspace as { workspaceFolders?: unknown }).workspaceFolders = undefined;
    showInformationMessage.mockResolvedValue('welcome.openInCurrentWindow');

    await welcomeMethods.createdProject({
      projectPath: '/c/root',
      projectName: 'mul',
      createOperatorProjectDictoryFileType: 'cann',
    });

    expect(showInformationMessage)
      .not
      .toHaveBeenCalledWith('welcome.chooseOpenMode');
    expect(executeCommand)
      .toHaveBeenCalledWith('vscode.openFolder', { fsPath: path.join('/c/root', 'mul') }, undefined);
  });

  it('stringifies non-Error vscode.openFolder failures during creation', async () => {
    primeCreatedProject();
    showInformationMessage.mockResolvedValue('welcome.openInCurrentWindow');
    executeCommand.mockImplementation((command: string) => {
      if (command === 'vscode.openFolder') {
        return Promise.reject('window busy');
      }

      return Promise.resolve(undefined);
    });

    await welcomeMethods.createdProject({
      projectPath: '/c/root',
      projectName: 'mul',
      createOperatorProjectDictoryFileType: 'cann',
    });

    expect(showErrorMessage)
      .toHaveBeenCalledWith('welcome.openProjectDirFailed: window busy');
  });

  it('rethrows after surfacing createProjectFailed when the bootstrap never resolves', async () => {
    (whenPostActivateBootstrapReady as jest.Mock).mockRejectedValue(new Error('host restarting'));

    await expect(welcomeMethods.createdProject({
      projectPath: '/c/root',
      projectName: 'mul',
      createOperatorProjectDictoryFileType: 'cann',
    }))
      .rejects
      .toThrow('host restarting');
    expect(showErrorMessage)
      .toHaveBeenCalledWith('welcome.createProjectFailed: host restarting');
  });

  it('creates a standalone ascend collection and seeds its scan state when no workspace is open', async () => {
    primeCreatedProject();
    (vscode.workspace as { workspaceFolders?: unknown }).workspaceFolders = [];

    await welcomeMethods.createdProject({
      projectPath: '/c/root',
      projectName: 'ascend-c1',
      createOperatorProjectDictoryFileType: 'ascend',
    });

    expect(projectService.init)
      .toHaveBeenCalledWith(expect.objectContaining({ projectType: 'ascend' }));
    // No workspace folder: the open-mode prompt is skipped entirely.
    expect(showInformationMessage)
      .not
      .toHaveBeenCalledWith('welcome.chooseOpenMode');
    expect(executeCommand)
      .toHaveBeenCalledWith('vscode.openFolder', { fsPath: path.join('/c/root', 'ascend-c1') }, undefined);

    const cache = JSON.parse(fs.readFileSync(path.join('/c/root', 'ascend-c1', '.vscode', 'cache.json'), 'utf8')) as {
      folders: Record<string, unknown>;
    };

    expect(cache.folders['/c/root/ascend-c1'])
      .toEqual({
        opsMeet: [],
        opsList: [],
        experimentalOpsList: [],
      });
  });

  it('merges the ascend collection scan state into an existing cache without clobbering other keys', async () => {
    primeCreatedProject();
    (vscode.workspace as { workspaceFolders?: unknown }).workspaceFolders = [];
    const cacheDir = path.join('/c/root', 'ascend-c2', '.vscode');

    actualFs.mkdirSync(cacheDir, { recursive: true });
    actualFs.writeFileSync(
      path.join(cacheDir, 'cache.json'),
      JSON.stringify({
        schemaVersion: 1,
        folders: {
          '/c/root/other': {
            opsMeet: [],
            opsList: [],
            experimentalOpsList: [],
          },
        },
      }),
    );

    await welcomeMethods.createdProject({
      projectPath: '/c/root',
      projectName: 'ascend-c2',
      createOperatorProjectDictoryFileType: 'ascend',
    });

    const cache = JSON.parse(fs.readFileSync(path.join('/c/root', 'ascend-c2', '.vscode', 'cache.json'), 'utf8')) as {
      folders: Record<string, unknown>;
    };

    expect(cache.folders['/c/root/other'])
      .toBeDefined();
    expect(cache.folders['/c/root/ascend-c2'])
      .toEqual({
        opsMeet: [],
        opsList: [],
        experimentalOpsList: [],
      });
  });

  it('leaves an existing ascend collection scan state untouched', async () => {
    primeCreatedProject();
    (vscode.workspace as { workspaceFolders?: unknown }).workspaceFolders = [];
    const cacheDir = path.join('/c/root', 'ascend-c3', '.vscode');

    actualFs.mkdirSync(cacheDir, { recursive: true });
    actualFs.writeFileSync(
      path.join(cacheDir, 'cache.json'),
      JSON.stringify({
        schemaVersion: 1,
        folders: {
          '/c/root/ascend-c3': {
            opsMeet: [{ name: 'existing' }],
            opsList: [],
            experimentalOpsList: [],
          },
        },
      }),
    );

    await welcomeMethods.createdProject({
      projectPath: '/c/root',
      projectName: 'ascend-c3',
      createOperatorProjectDictoryFileType: 'ascend',
    });

    const cache = JSON.parse(fs.readFileSync(path.join('/c/root', 'ascend-c3', '.vscode', 'cache.json'), 'utf8')) as {
      folders: Record<string, unknown>;
    };

    expect(cache.folders['/c/root/ascend-c3'])
      .toEqual({
        opsMeet: [{ name: 'existing' }],
        opsList: [],
        experimentalOpsList: [],
      });
  });

  it('keeps the setting cascade falling back to detection when the workspace is not an operator project', async () => {
    primeCreatedProject();
    (OperatorProjectDetector.detectOperatorProject as jest.Mock).mockResolvedValue({
      isOperatorProject: false,
      projectType: undefined,
    });
    showInformationMessage.mockResolvedValue('welcome.openInCurrentWindow');

    await welcomeMethods.createdProject({
      projectPath: '/c/root',
      projectName: 'mul',
      createOperatorProjectDictoryFileType: 'cann',
    });

    expect(OperatorProjectDetector.detectOperatorProject)
      .toHaveBeenCalledWith('/c/root');
    expect(projectService.init)
      .toHaveBeenCalledWith(expect.objectContaining({ projectType: 'cann' }));
  });

  it('stringifies non-Error mkdir failures', async () => {
    primeCreatedProject();
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {
      throw 'disk full string';
    });

    await expect(welcomeMethods.createdProject({
      projectPath: '/c/root',
      projectName: 'mul',
      createOperatorProjectDictoryFileType: 'cann',
    }))
      .rejects
      .toThrow('welcome.createProjectDirFailed: disk full string');
  });

  it('warns with stringified details when the env script fails with a non-Error', async () => {
    primeCreatedProject();
    mockExecutorExecuteImpl = () => Promise.reject('env exploded');

    await welcomeMethods.createdProject({
      projectPath: '/c/root',
      projectName: 'mul',
      createOperatorProjectDictoryFileType: 'cann',
      projectSH: '/c/env.sh',
    });

    expect(consoleWarnSpy)
      .toHaveBeenCalledWith(expect.stringContaining('env exploded'));
    expect(projectService.init)
      .toHaveBeenCalled();
  });

  it('stringifies non-Error init failures during creation', async () => {
    primeCreatedProject();
    (projectService.init as jest.Mock).mockRejectedValue('init exploded');

    await expect(welcomeMethods.createdProject({
      projectPath: '/c/root',
      projectName: 'mul',
      createOperatorProjectDictoryFileType: 'cann',
    }))
      .rejects
      .toThrow('welcome.initOperatorProjectFailed: init exploded');
  });

  it('warns with stringified details when revealInExplorer fails with a non-Error', async () => {
    primeCreatedProject();
    showInformationMessage.mockResolvedValue('welcome.openInCurrentWindow');
    executeCommand.mockImplementation((command: string) => {
      if (command === 'revealInExplorer') {
        return Promise.reject('tree closed');
      }

      return Promise.resolve(undefined);
    });

    await welcomeMethods.createdProject({
      projectPath: '/c/root',
      projectName: 'mul',
      createOperatorProjectDictoryFileType: 'cann',
    });

    expect(consoleWarnSpy)
      .toHaveBeenCalledWith(expect.stringContaining('tree closed'));
    expect(showInformationMessage)
      .toHaveBeenCalledWith('welcome.openProjectDirSuccess');
  });

  it('warns with stringified details when the create-directory command fails with a non-Error', async () => {
    primeCreatedProject();
    showInformationMessage.mockResolvedValue('welcome.openInCurrentWindow');
    executeCommand.mockImplementation((command: string) => {
      if (command === 'create-directory') {
        return Promise.reject('template missing');
      }

      return Promise.resolve(undefined);
    });

    await welcomeMethods.createdProject({
      projectPath: '/c/root',
      projectName: 'mul',
      createOperatorProjectDictoryFileType: 'cann',
    });

    expect(showWarningMessage)
      .toHaveBeenCalledWith('welcome.createDirOkCreateFilesError: template missing');
    expect(showInformationMessage)
      .toHaveBeenCalledWith('welcome.openProjectDirSuccess');
  });

  it('stringifies non-Error bootstrap failures', async () => {
    (whenPostActivateBootstrapReady as jest.Mock).mockRejectedValue('host restarting');

    await expect(welcomeMethods.createdProject({
      projectPath: '/c/root',
      projectName: 'mul',
      createOperatorProjectDictoryFileType: 'cann',
    }))
      .rejects
      .toBe('host restarting');
    expect(showErrorMessage)
      .toHaveBeenCalledWith('welcome.createProjectFailed: host restarting');
  });

  it('merges the pyasc sanitizer target into an existing cache entry', async () => {
    primeCreatedProject();
    const params = {
      projectPath: '/c/root',
      projectName: 'mul',
      createOperatorProjectDictoryFileType: 'pyasc',
    };

    await welcomeMethods.createdProject(params);
    await welcomeMethods.createdProject(params);

    const cache = JSON.parse(fs.readFileSync(path.join('/c/root', 'mul', '.vscode', 'cache.json'), 'utf8')) as {
      sanitizerPythonTarget: Record<string, string>;
    };

    expect(Object.values(cache.sanitizerPythonTarget)
      .filter((target) => target === 'python3 ./mul.py'))
      .toHaveLength(1);
  });
});

describe('welcomeMethods.openProject', () => {
  let consoleWarnSpy: jest.SpyInstance;
  const mockIconTheme = { fireDecorationUpdate: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecutorExecuteImpl = () => Promise.resolve({ code: 0 });
    // The real-fs fixture tree (C:\c\root\...) persists between runs; drop it
    // so cache.json reads never observe scan state written by an earlier run
    // (keeps the ??-fallback branches in createdProject reachable).
    actualFs.rmSync(path.join('/c/root'), {
      recursive: true,
      force: true,
    });
    consoleWarnSpy = jest.spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    (globalThis as unknown as { extensionContext: unknown }).extensionContext = {
      extensionPath: '/extension',
      globalState: {
        update: jest.fn()
          .mockResolvedValue(undefined),
      },
    };
    (vscode.workspace as { workspaceFolders?: unknown }).workspaceFolders = [{ uri: { fsPath: '/c/root' } }];
    (whenPostActivateBootstrapReady as jest.Mock).mockResolvedValue(undefined);
    (OperatorProjectDetector.detectOperatorProject as jest.Mock).mockResolvedValue({
      isOperatorProject: true,
      projectType: 'cann',
    });
    (requestSidebarContextsRefresh as jest.Mock).mockResolvedValue(undefined);
    (ProjectManager.getInstance as jest.Mock).mockReturnValue({
      checkVscode: jest.fn()
        .mockResolvedValue(undefined),
    });
    (projectService.init as jest.Mock).mockResolvedValue('1');
    showInformationMessage.mockResolvedValue('welcome.openInCurrentWindow');
    mockIconTheme.fireDecorationUpdate.mockClear();
    (OperatorProjectIconTheme.getInstance as jest.Mock).mockReturnValue(mockIconTheme);
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it('short-circuits for an already registered project: seeds settings, refreshes, and opens', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(makeRoot({ template_name: 'hello' }));

    await welcomeMethods.openProject({ projectPath: '/c/root' });
    await flushOpenFolder();

    expect(ConfigService.writeOpDevtoolsDottedSettings)
      .toHaveBeenCalledWith({ projectType: 'ascend' }, '/c/root');
    expect(ConfigService.ensureOpDevtoolsSettingsSeeded)
      .toHaveBeenCalled();
    expect(requestSidebarContextsRefresh)
      .toHaveBeenCalled();
    expect(executeCommand)
      .toHaveBeenCalledWith('vscode.openFolder', { fsPath: '/c/root' }, undefined);
    expect(OperatorProjectDetector.detectOperatorProject)
      .not
      .toHaveBeenCalled();
  });

  it('warns but continues when the settings seeding of an existing project fails', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(makeRoot());
    (ConfigService.writeOpDevtoolsDottedSettings as jest.Mock).mockRejectedValue(new Error('readonly'));

    await welcomeMethods.openProject({ projectPath: '/c/root' });

    expect(consoleWarnSpy)
      .toHaveBeenCalledWith(expect.stringContaining('[openProject] Settings seeding failed'));
    expect(requestSidebarContextsRefresh)
      .toHaveBeenCalled();
  });

  it('warns but continues when ensureLaunchJsonExists fails', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(makeRoot());
    (ensureLaunchJsonExists as jest.Mock).mockRejectedValue(new Error('no config'));

    await welcomeMethods.openProject({ projectPath: '/c/root' });

    expect(consoleWarnSpy)
      .toHaveBeenCalledWith(expect.stringContaining('Failed to ensure VS Code config files'));
  });

  it('warns but continues when the settings seed itself fails', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(makeRoot());
    (ConfigService.ensureOpDevtoolsSettingsSeeded as jest.Mock).mockRejectedValue(new Error('seed boom'));

    await welcomeMethods.openProject({ projectPath: '/c/root' });

    expect(consoleWarnSpy)
      .toHaveBeenCalledWith(expect.stringContaining('[openProject] Settings seeding failed'));
  });

  it('does not refresh the sidebar or open the folder when isFromSystem', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(makeRoot());

    await welcomeMethods.openProject({ projectPath: '/c/root' }, true);

    expect(requestSidebarContextsRefresh)
      .not
      .toHaveBeenCalled();
    expect(executeCommand)
      .not
      .toHaveBeenCalledWith('vscode.openFolder', expect.anything(), expect.anything());
  });

  it('extracts the project name from the path and defaults the env script for system opens', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(undefined);

    await welcomeMethods.openProject({ projectPath: '/repo/parents/math' }, true);

    expect(projectService.init)
      .toHaveBeenCalledWith(expect.objectContaining({
        projectPath: '/repo/parents',
        projectName: 'math',
        ascendEnvScript: '/etc/profile',
      }));
    // System opens only refresh the icon theme.
    expect(executeCommand)
      .not
      .toHaveBeenCalledWith('workbench.action.closeActiveEditor', undefined);
  });

  it('warns and continues when the env script fails during openProject', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(undefined);
    mockExecutorExecuteImpl = () => Promise.reject(new Error('env script broken'));

    await welcomeMethods.openProject({
      projectPath: '/c/root',
      projectName: 'math',
      projectSH: '/c/env.sh',
    });

    expect(consoleWarnSpy)
      .toHaveBeenCalledWith(expect.stringContaining('Failed to execute environment variable script'));
    expect(projectService.init)
      .toHaveBeenCalled();
  });

  it('opens the folder directly when the opened directory is not an operator project', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(undefined);
    (OperatorProjectDetector.detectOperatorProject as jest.Mock).mockResolvedValue({
      isOperatorProject: false,
      projectType: undefined,
    });

    await welcomeMethods.openProject({
      projectPath: '/c/root',
      projectName: 'math',
    });
    await flushOpenFolder();

    expect(projectService.init).not.toHaveBeenCalled();
    expect(executeCommand)
      .toHaveBeenCalledWith('vscode.openFolder', { fsPath: path.join('/c/root', 'math') }, undefined);
  });

  it('rethrows initOperatorProjectFailed when projectService.init fails', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(undefined);
    (projectService.init as jest.Mock).mockRejectedValue(new Error('registry locked'));

    await expect(welcomeMethods.openProject({
      projectPath: '/c/root',
      projectName: 'math',
    }))
      .rejects
      .toThrow('welcome.initOperatorProjectFailed: registry locked');
    expect(showErrorMessage)
      .toHaveBeenCalledWith('welcome.openProjectFailed: welcome.initOperatorProjectFailed: registry locked');
  });

  it('runs the full success flow for a fresh standard-custom project', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(undefined);
    (OperatorProjectDetector.detectOperatorProject as jest.Mock).mockResolvedValue({
      isOperatorProject: true,
      projectType: 'standard-custom',
    });

    await welcomeMethods.openProject({
      projectPath: '/c/root',
      projectName: 'math',
    });
    await flushOpenFolder();

    expect(projectService.init)
      .toHaveBeenCalledWith(expect.objectContaining({
        projectPath: '/c/root',
        projectName: 'math',
        projectType: 'standard-custom',
      }));
    expect(ProjectManager.getInstance().checkVscode)
      .toHaveBeenCalled();
    expect(requestSidebarContextsRefresh)
      .toHaveBeenCalled();
    expect(executeCommand)
      .toHaveBeenCalledWith('workbench.action.closeActiveEditor');
    expect(executeCommand)
      .toHaveBeenCalledWith('vscode.openFolder', { fsPath: path.join('/c/root', 'math') }, undefined);

    // The standard-custom scan state was persisted into the real cache.
    const cachePath = path.join('/c/root', 'math', '.vscode', 'cache.json');
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as {
      folders: Record<string, unknown>;
    };

    expect(cache.folders['/c/root/math'])
      .toEqual({
        opsMeet: [],
        opsList: [],
        experimentalOpsList: [],
      });
  });

  it('warns but continues when the standard-custom scan fails', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(undefined);
    (OperatorProjectDetector.detectOperatorProject as jest.Mock).mockResolvedValue({
      isOperatorProject: true,
      projectType: 'standard-custom',
    });
    const { WorkspaceDetectorService } = jest.requireMock('@plugin/service/workspace-detector-service') as {
      WorkspaceDetectorService: { scanOpsMeetAndOpsLists: jest.Mock };
    };

    WorkspaceDetectorService.scanOpsMeetAndOpsLists.mockImplementation(() => {
      throw new Error('scan exploded');
    });

    await welcomeMethods.openProject({
      projectPath: '/c/root',
      projectName: 'math',
    });
    await flushOpenFolder();

    expect(consoleWarnSpy)
      .toHaveBeenCalledWith(expect.stringContaining('Failed to detect operator info'));
    expect(executeCommand)
      .toHaveBeenCalledWith('vscode.openFolder', { fsPath: path.join('/c/root', 'math') }, undefined);
  });

  it('fires the icon theme decoration update and skips UI actions for system opens', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(undefined);

    await welcomeMethods.openProject({
      projectPath: '/c/root',
      projectName: 'math',
    }, true);

    expect(mockIconTheme.fireDecorationUpdate)
      .toHaveBeenCalled();
    expect(requestSidebarContextsRefresh)
      .not
      .toHaveBeenCalled();
    expect(executeCommand)
      .not
      .toHaveBeenCalledWith('vscode.openFolder', expect.anything(), expect.anything());
  });

  it('rethrows after surfacing openProjectFailed when detection fails', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(undefined);
    (OperatorProjectDetector.detectOperatorProject as jest.Mock).mockRejectedValue(new Error('detector down'));

    await expect(welcomeMethods.openProject({
      projectPath: '/c/root',
      projectName: 'math',
    }))
      .rejects
      .toThrow('detector down');
    expect(showErrorMessage)
      .toHaveBeenCalledWith('welcome.openProjectFailed: detector down');
  });

  it('uses the torch-library template for torch-library detection', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(undefined);
    (OperatorProjectDetector.detectOperatorProject as jest.Mock).mockResolvedValue({
      isOperatorProject: true,
      projectType: 'torch-library',
    });

    await welcomeMethods.openProject({
      projectPath: '/c/root',
      projectName: 'math',
    });
    await flushOpenFolder();

    expect(projectService.init)
      .toHaveBeenCalledWith(expect.objectContaining({
        projectType: 'torch-library',
        templateName: 'torch_library_template',
      }));
    expect(ConfigService.ensureOpDevtoolsSettingsSeeded)
      .toHaveBeenCalledWith(
        path.join('/c/root', 'math'),
        '',
        'torch-library',
        undefined,
        'torch_library_template',
      );
  });

  it('falls back to an empty template name for projects without one', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(makeRoot({ template_name: undefined }));

    await welcomeMethods.openProject({ projectPath: '/c/root' });

    expect(ConfigService.ensureOpDevtoolsSettingsSeeded)
      .toHaveBeenCalledWith('/c/root', undefined, undefined, undefined, '');
  });

  it('shows the success message after opening the project folder', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(makeRoot());

    await welcomeMethods.openProject({ projectPath: '/c/root' });
    await flushOpenFolder();

    expect(showInformationMessage)
      .toHaveBeenCalledWith('welcome.openProjectDirSuccess');
  });

  it('does not open the folder when the user dismisses the open-mode prompt', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(makeRoot());
    showInformationMessage.mockResolvedValue(undefined);

    await welcomeMethods.openProject({ projectPath: '/c/root' });
    await flushOpenFolder();

    expect(executeCommand)
      .not
      .toHaveBeenCalledWith('vscode.openFolder', expect.anything(), expect.anything());
  });

  it('shows an error when openFolder fails during openProject', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(makeRoot());
    showInformationMessage.mockResolvedValue('welcome.openInCurrentWindow');
    executeCommand.mockImplementation((command: string) => {
      if (command === 'vscode.openFolder') {
        return Promise.reject(new Error('window busy'));
      }

      return Promise.resolve(undefined);
    });

    await welcomeMethods.openProject({ projectPath: '/c/root' });
    await flushOpenFolder();

    expect(showErrorMessage)
      .toHaveBeenCalledWith('welcome.openProjectDirFailed: window busy');
  });

  it('stringifies non-Error openFolder failures during openProject', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(makeRoot());
    showInformationMessage.mockResolvedValue('welcome.openInCurrentWindow');
    executeCommand.mockImplementation((command: string) => {
      if (command === 'vscode.openFolder') {
        return Promise.reject('window busy');
      }

      return Promise.resolve(undefined);
    });

    await welcomeMethods.openProject({ projectPath: '/c/root' });
    await flushOpenFolder();

    expect(showErrorMessage)
      .toHaveBeenCalledWith('welcome.openProjectDirFailed: window busy');
  });

  it('logs stringified details when ensureLaunchJsonExists throws a non-Error', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(makeRoot());
    (ensureLaunchJsonExists as jest.Mock).mockRejectedValue('no config');

    await welcomeMethods.openProject({ projectPath: '/c/root' });

    expect(consoleWarnSpy)
      .toHaveBeenCalledWith(expect.stringContaining('no config'));
  });

  it('logs stringified details when the settings seed throws a non-Error', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(makeRoot());
    (ConfigService.ensureOpDevtoolsSettingsSeeded as jest.Mock).mockRejectedValue('seed boom');

    await welcomeMethods.openProject({ projectPath: '/c/root' });

    expect(consoleWarnSpy)
      .toHaveBeenCalledWith(expect.stringContaining('seed boom'));
  });

  it('logs stringified details when the dotted settings write throws a non-Error', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(makeRoot());
    (ConfigService.writeOpDevtoolsDottedSettings as jest.Mock).mockRejectedValue('readonly');

    await welcomeMethods.openProject({ projectPath: '/c/root' });

    expect(consoleWarnSpy)
      .toHaveBeenCalledWith(expect.stringContaining('readonly'));
  });

  it('warns with stringified details when the openProject env script fails with a non-Error', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(undefined);
    mockExecutorExecuteImpl = () => Promise.reject('env script broken');

    await welcomeMethods.openProject({
      projectPath: '/c/root',
      projectName: 'math',
      projectSH: '/c/env.sh',
    });

    expect(consoleWarnSpy)
      .toHaveBeenCalledWith(expect.stringContaining('env script broken'));
    expect(projectService.init)
      .toHaveBeenCalled();
  });

  it('stringifies non-Error init failures during openProject', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(undefined);
    (projectService.init as jest.Mock).mockRejectedValue('registry locked');

    await expect(welcomeMethods.openProject({
      projectPath: '/c/root',
      projectName: 'math',
    }))
      .rejects
      .toThrow('welcome.initOperatorProjectFailed: registry locked');
    expect(showErrorMessage)
      .toHaveBeenCalledWith('welcome.openProjectFailed: welcome.initOperatorProjectFailed: registry locked');
  });

  it('warns with stringified details when the standard-custom scan throws a non-Error', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(undefined);
    (OperatorProjectDetector.detectOperatorProject as jest.Mock).mockResolvedValue({
      isOperatorProject: true,
      projectType: 'standard-custom',
    });
    const { WorkspaceDetectorService } = jest.requireMock('@plugin/service/workspace-detector-service') as {
      WorkspaceDetectorService: { scanOpsMeetAndOpsLists: jest.Mock };
    };

    WorkspaceDetectorService.scanOpsMeetAndOpsLists.mockImplementation(() => {
      throw 'scan exploded';
    });

    await welcomeMethods.openProject({
      projectPath: '/c/root',
      projectName: 'math',
    });
    await flushOpenFolder();

    expect(consoleWarnSpy)
      .toHaveBeenCalledWith(expect.stringContaining('scan exploded'));
  });

  it('stringifies non-Error detection failures during openProject', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(undefined);
    (OperatorProjectDetector.detectOperatorProject as jest.Mock).mockRejectedValue('detector down');

    await expect(welcomeMethods.openProject({
      projectPath: '/c/root',
      projectName: 'math',
    }))
      .rejects
      .toBe('detector down');
    expect(showErrorMessage)
      .toHaveBeenCalledWith('welcome.openProjectFailed: detector down');
  });
});
