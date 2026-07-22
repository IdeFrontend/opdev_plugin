jest.mock('i18next', () => ({
  t: jest.fn((key: string, params?: { error?: string }) =>
    params?.error ? `${key}: ${params.error}` : key),
}));

jest.mock('vscode', () => ({
  workspace: { workspaceFolders: [{ uri: { fsPath: '/repo/ops-math' } }] },
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

jest.mock('fs', () => ({
  existsSync: jest.fn(() => true),
  mkdirSync: jest.fn(),
}));

jest.mock('@plugin/class/command-options', () => ({
  CommandExecutor: jest.fn()
    .mockImplementation(() => ({
      execute: jest.fn()
        .mockResolvedValue({ code: 0 }),
    })),
}));

jest.mock('@plugin/core/project/project-manager', () => ({
  ProjectManager: {
    getInstance: jest.fn(() => ({
      initProject: jest.fn()
        .mockResolvedValue('1'),
      checkVscode: jest.fn()
        .mockResolvedValue(false),
    })),
  },
}));

jest.mock('@plugin/service/project-service', () => ({
  projectService: {
    init: jest.fn()
      .mockResolvedValue('1'),
    createOps: jest.fn(),
    createOpsByPrototype: jest.fn(),
  },
}));

jest.mock('@plugin/domain', () => ({
  generateStructure: jest.fn(),
  completeProjectConfigs: jest.fn(),
}));

jest.mock('@plugin/domain/utils/project-utils', () => ({
  viewIdToProjectType: jest.fn((id: number | string) =>
    id === 2 || id === 'standard-custom' ? 'ascend' : 'cann'),
  ensureLaunchJsonExists: jest.fn()
    .mockResolvedValue(undefined),
}));

jest.mock('@plugin/helpers/sidebar-context-refresh', () => ({
  requestSidebarContextsRefresh: jest.fn()
    .mockResolvedValue(undefined),
}));

jest.mock('@plugin/service/config-service', () => ({ configService: { maybeMigrateLegacySettingsToWorkspace: jest.fn() } }));

jest.mock('@plugin/domain/services/operator-project-detector', () => ({
  OperatorProjectType: { STANDARD_CUSTOM: 'standard-custom' },
  OperatorProjectDetector: { detectOperatorProject: jest.fn() },
}));

jest.mock('@plugin/domain/models/project-model', () => ({
  getProjectByPath: jest.fn(),
  updateStandardCustomOperators: jest.fn(),
  appendStandardCustomOperator: jest.fn(),
}));

jest.mock('@plugin/service/workspace-detector-service', () => ({
  WorkspaceDetectorService: {
    detectAndRegisterWorkspace: jest.fn(),
    whenRegistrationReady: jest.fn(),
  },
}));

jest.mock('@plugin/class/operator-project-icon-theme', () => ({ OperatorProjectIconTheme: { getInstance: jest.fn(() => ({ fireDecorationUpdate: jest.fn() })) } }));

jest.mock('@plugin/helpers/post-activate-bootstrap', () => ({
  whenPostActivateBootstrapReady: jest.fn()
    .mockResolvedValue(undefined),
}));

jest.mock('@plugin/helpers/operator-project-workspace-config', () => ({ getWorkspaceGenOpCommand: jest.fn(() => '') }));

jest.mock('@plugin/domain/utils/genop-command', () => ({
  buildGenOpCommand: jest.fn(),
  decideSkipFileGeneration: jest.fn(() => false),
}));

jest.mock('@plugin/constants', () => ({ COMMAND_CREATE_DIRECTORY: 'create-directory' }));

jest.mock('@plugin/helpers/open-folder-window-options', () => ({ buildOpenFolderWindowOptions: jest.fn() }));

import * as vscode from 'vscode';
import * as fs from 'fs';
import { CommandExecutor } from '@plugin/class/command-options';
import { projectService } from '@plugin/service/project-service';
import { OperatorProjectDetector } from '@plugin/domain/services/operator-project-detector';
import {
  appendStandardCustomOperator,
  getProjectByPath,
  type ProjectRecord,
} from '@plugin/domain/models/project-model';
import { WorkspaceDetectorService } from '@plugin/service/workspace-detector-service';
import { whenPostActivateBootstrapReady } from '@plugin/helpers/post-activate-bootstrap';
import { welcomeMethods } from '@plugin/controller/welcome-controller';
import * as path from 'path';

const params = {
  projectPath: '/repo/ops-math/math',
  projectName: 'add',
  createOperatorProjectDictoryFileType: 2,
};
const childPath = path.normalize('/repo/ops-math/math/add');

function makeRoot(opsList: ProjectRecord['ops_list'] = []): ProjectRecord {
  return {
    id: 91,
    project_name: 'ops-math',
    project_path: '/repo/ops-math',
    project_type: 'ascend',
    template_name: 'preserved-template',
    ops_list: opsList,
  };
}

describe('welcomeMethods.createdProject standard-custom registration recovery', () => {
  let storedRoot: ProjectRecord | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    storedRoot = undefined;
    (globalThis as unknown as { extensionContext: unknown }).extensionContext = {
      extensionPath: '/extension',
      globalState: {
        update: jest.fn()
          .mockResolvedValue(undefined),
      },
    };
    (vscode.workspace as { workspaceFolders?: unknown }).workspaceFolders = [{ uri: { fsPath: '/repo/ops-math' } }];
    (vscode.window.withProgress as jest.Mock).mockImplementation(async (_options, task) =>
      await task({ report: jest.fn() }));
    (whenPostActivateBootstrapReady as jest.Mock).mockResolvedValue(undefined);
    (OperatorProjectDetector.detectOperatorProject as jest.Mock).mockResolvedValue({
      isOperatorProject: true,
      projectType: 'standard-custom',
      projectPath: '/repo/ops-math',
      projectName: 'ops-math',
    });
    (getProjectByPath as jest.Mock).mockImplementation(() => storedRoot);
    (WorkspaceDetectorService.detectAndRegisterWorkspace as jest.Mock).mockResolvedValue(undefined);
    (WorkspaceDetectorService.whenRegistrationReady as jest.Mock).mockResolvedValue(undefined);
    (appendStandardCustomOperator as jest.Mock).mockImplementation(async () => storedRoot);
  });

  it('waits for pending bootstrap and uses the root it registered', async () => {
    let finishBootstrap: (()=> void) | undefined;
    const pendingBootstrap = new Promise<void>((resolve) => {
      finishBootstrap = resolve;
    });

    (whenPostActivateBootstrapReady as jest.Mock).mockReturnValue(pendingBootstrap);
    const creation = welcomeMethods.createdProject(params);

    await Promise.resolve();
    expect(getProjectByPath).not.toHaveBeenCalled();

    storedRoot = makeRoot();
    finishBootstrap?.();
    await creation;

    expect(WorkspaceDetectorService.whenRegistrationReady)
      .toHaveBeenCalledWith('/repo/ops-math');
    expect(WorkspaceDetectorService.detectAndRegisterWorkspace).not.toHaveBeenCalled();
    expect(appendStandardCustomOperator)
      .toHaveBeenCalledWith(
        '/repo/ops-math',
        expect.objectContaining({
          name: 'add',
          path: childPath,
        }),
        false,
      );
  });

  it('recovers a missing root, keeps one child entry, and scaffolds with the root id', async () => {
    (WorkspaceDetectorService.detectAndRegisterWorkspace as jest.Mock).mockImplementation(async () => {
      storedRoot = makeRoot([
        {
          name: 'add',
          path: childPath,
          isCompiled: false,
        },
      ]);
    });

    await welcomeMethods.createdProject(params);

    expect(WorkspaceDetectorService.detectAndRegisterWorkspace)
      .toHaveBeenCalledWith('/repo/ops-math');
    expect(appendStandardCustomOperator)
      .toHaveBeenCalledWith(
        '/repo/ops-math',
        {
          name: 'add',
          path: childPath,
          isCompiled: false,
        },
        false,
      );
    expect(projectService.init).not.toHaveBeenCalled();
    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith(
        'create-directory',
        expect.objectContaining({
          subOperatorContext: expect.objectContaining({
            parentProjectId: 91,
            opName: 'add',
            outputPath: childPath,
          }),
        }),
        expect.anything(),
      );
  });

  it('fails before scaffolding when recovery cannot produce a parent record', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    await expect(welcomeMethods.createdProject(params))
      .rejects.toThrow('standard-custom collection is not registered');

    expect(WorkspaceDetectorService.detectAndRegisterWorkspace)
      .toHaveBeenCalledWith('/repo/ops-math');
    expect(appendStandardCustomOperator).not.toHaveBeenCalled();
    expect(fs.mkdirSync).not.toHaveBeenCalled();
    expect((CommandExecutor as jest.Mock).mock.results[0].value.execute)
      .not.toHaveBeenCalled();
    expect(vscode.commands.executeCommand)
      .not.toHaveBeenCalledWith(
        'create-directory',
        expect.anything(),
        expect.anything(),
      );
  });

  it('joins registration before reading an already stored root', async () => {
    storedRoot = makeRoot();
    let finishRegistration: (()=> void) | undefined;
    const pendingRegistration = new Promise<void>((resolve) => {
      finishRegistration = resolve;
    });

    (WorkspaceDetectorService.whenRegistrationReady as jest.Mock).mockReturnValue(pendingRegistration);
    const creation = welcomeMethods.createdProject(params);

    await Promise.resolve();
    await Promise.resolve();
    expect(appendStandardCustomOperator).not.toHaveBeenCalled();

    finishRegistration?.();
    await creation;

    expect(appendStandardCustomOperator)
      .toHaveBeenCalledTimes(1);
    expect(WorkspaceDetectorService.detectAndRegisterWorkspace).not.toHaveBeenCalled();
  });
});
