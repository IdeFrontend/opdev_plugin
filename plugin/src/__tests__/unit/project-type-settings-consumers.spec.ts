jest.mock('i18next', () => ({
  t: jest.fn((key: string, params?: { error?: string }) =>
    params?.error ? `${key}: ${params.error}` : key),
}));

jest.mock('vscode', () => ({
  env: { uriScheme: 'vscode' },
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
      projectId: '1',
      projectPath: '/repo/ops-math/ops-math',
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

jest.mock('@plugin/service/config-service', () => ({
  configService: {},
  ConfigService: {
    ensureOpDevtoolsSettingsSeeded: jest.fn()
      .mockResolvedValue(true),
    writeOpDevtoolsDottedSettings: jest.fn()
      .mockResolvedValue(true),
  },
}));

jest.mock('@plugin/domain/services/operator-project-detector', () => ({
  OperatorProjectType: { STANDARD_CUSTOM: 'standard-custom' },
  OperatorProjectDetector: { detectOperatorProject: jest.fn() },
}));

jest.mock('@plugin/domain/models/project-model', () => {
  const actual = jest.requireActual('@plugin/domain/models/project-model') as Record<string, unknown>;

  return {
    ...actual,
    getProjectByPath: jest.fn(),
  };
});

// Sub-operator appends go into the workspace cache scan state, not a
// registry row. The cache module is mocked at the read/write boundary so the
// controller tests exercise the cascade + cache-append logic without touching
// the filesystem (the spec's fs mock has a no-op mkdirSync).
jest.mock('@plugin/helpers/workspace-cache', () => {
  const actual = jest.requireActual('@plugin/helpers/workspace-cache') as Record<string, unknown>;
  // Keyed like normalizeProjectPath (forward slashes, lowercase).
  const rootKey = '/repo/ops-math';

  return {
    ...actual,
    readWorkspaceCache: jest.fn(() => ({
      schemaVersion: 1,
      folders: {
        [rootKey]: {
          opsMeet: [],
          opsList: [],
          experimentalOpsList: [],
        },
      },
    })),
    updateWorkspaceCache: jest.fn(),
    updateFolderScanState: jest.fn(),
  };
});

jest.mock('@plugin/service/workspace-detector-service', () => ({
  WorkspaceDetectorService: {
    detectAndRegisterWorkspace: jest.fn(),
    whenRegistrationReady: jest.fn(),
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

import * as vscode from 'vscode';
import { CommandExecutor } from '@plugin/class/command-options';
import { projectService } from '@plugin/service/project-service';
import { OperatorProjectDetector } from '@plugin/domain/services/operator-project-detector';
import {
  getProjectByPath,
  type ProjectRecord,
} from '@plugin/domain/models/project-model';
import { updateWorkspaceCache } from '@plugin/helpers/workspace-cache';
import { WorkspaceDetectorService } from '@plugin/service/workspace-detector-service';
import { whenPostActivateBootstrapReady } from '@plugin/helpers/post-activate-bootstrap';
import { readWorkspaceProjectTypeSetting } from '@plugin/helpers/operator-project-workspace-config';
import { ConfigService } from '@plugin/service/config-service';
import { welcomeMethods } from '@plugin/controller/welcome-controller';
import * as path from 'path';

const createParams = {
  projectPath: '/repo/ops-math/math',
  projectName: 'add',
  createOperatorProjectDictoryFileType: 2,
};
const childPath = path.normalize('/repo/ops-math/math/add');

function makeRoot(opsList: ProjectRecord['ops_list'] = []): ProjectRecord {
  return {
    project_name: 'ops-math',
    project_path: '/repo/ops-math',
    project_type: 'ascend',
    template_name: 'preserved-template',
    ops_list: opsList,
  };
}

describe('welcomeMethods projectType settings writers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getProjectByPath as jest.Mock).mockReturnValue(undefined);
    (OperatorProjectDetector.detectOperatorProject as jest.Mock).mockResolvedValue({
      isOperatorProject: true,
      projectType: 'standard-custom',
      projectPath: '/repo/ops-math/ops-math',
      projectName: 'ops-math',
    });
    (globalThis as unknown as { extensionContext: unknown }).extensionContext = {
      extensionPath: '/extension',
      globalState: {
        update: jest.fn()
          .mockResolvedValue(undefined),
      },
    };
  });

  it('openProject existing branch writes the stored project_type into the setting', async () => {
    (getProjectByPath as jest.Mock).mockReturnValueOnce(makeRoot());

    await welcomeMethods.openProject({ projectPath: '/repo/ops-math' }, true);

    expect(ConfigService.writeOpDevtoolsDottedSettings)
      .toHaveBeenCalledWith({ projectType: 'ascend' }, '/repo/ops-math');
  });

  it('openProject existing branch skips the write when project_type is missing', async () => {
    (getProjectByPath as jest.Mock).mockReturnValueOnce({
      ...makeRoot(),
      project_type: undefined,
    });

    await welcomeMethods.openProject({ projectPath: '/repo/ops-math' }, true);

    expect(ConfigService.writeOpDevtoolsDottedSettings)
      .not.toHaveBeenCalled();
  });

  it('openProject new branch writes the canonical detected type via projectService.init', async () => {
    await welcomeMethods.openProject(
      {
        projectPath: '/repo/ops-math',
        projectName: 'ops-math',
      },
      true,
    );

    expect(projectService.init)
      .toHaveBeenCalledWith(expect.objectContaining({
        projectPath: '/repo/ops-math',
        projectName: 'ops-math',
        projectType: 'standard-custom',
      }));
    expect(ConfigService.writeOpDevtoolsDottedSettings)
      .not.toHaveBeenCalled();
  });
});

describe('welcomeMethods.createdProject projectType cascade', () => {
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
    (WorkspaceDetectorService.detectAndRegisterWorkspace as jest.Mock).mockImplementation(async () => {
      storedRoot = makeRoot([
        {
          name: 'add',
          path: childPath,
          isCompiled: false,
        },
      ]);
    });
    (WorkspaceDetectorService.whenRegistrationReady as jest.Mock).mockResolvedValue(undefined);
  });

  it('uses the workspace setting and skips detection when the setting is present', async () => {
    (readWorkspaceProjectTypeSetting as jest.Mock).mockReturnValue('ascend');

    await welcomeMethods.createdProject(createParams);

    expect(OperatorProjectDetector.detectOperatorProject)
      .not.toHaveBeenCalled();
    expect(WorkspaceDetectorService.detectAndRegisterWorkspace)
      .toHaveBeenCalledWith('/repo/ops-math');
    // The sub-operator lands in the collection's cache scan state.
    expect(updateWorkspaceCache)
      .toHaveBeenCalledWith('/repo/ops-math', expect.any(Function));
    const updater = (updateWorkspaceCache as jest.Mock).mock.calls[0][1] as
      (cache: Record<string, unknown>)=> void;

    // The controller's updater mutates the cache in place (mirrors
    // updateWorkspaceCache's write path).
    const cache = {
      schemaVersion: 1,
      folders: {},
    };

    updater(cache);
    expect(cache)
      .toEqual(expect.objectContaining({
        folders: {
          ['/repo/ops-math']: expect.objectContaining({
            opsList: [
              expect.objectContaining({
                name: 'add',
                path: childPath,
              }),
            ],
          }),
        },
      }));
  });

  it('falls back to detection only when the setting and the DB record are absent', async () => {
    (readWorkspaceProjectTypeSetting as jest.Mock).mockReturnValue(undefined);

    await welcomeMethods.createdProject(createParams);

    expect(OperatorProjectDetector.detectOperatorProject)
      .toHaveBeenCalledTimes(1);
  });

  it('prefers the workspace setting over a conflicting DB record', async () => {
    (readWorkspaceProjectTypeSetting as jest.Mock).mockReturnValue('ascend');
    storedRoot = {
      ...makeRoot(),
      project_type: 'cann',
    };

    await welcomeMethods.createdProject(createParams);

    expect(OperatorProjectDetector.detectOperatorProject)
      .not.toHaveBeenCalled();
    // The sub-operator lands in the collection's cache scan state.
    expect(updateWorkspaceCache)
      .toHaveBeenCalledWith('/repo/ops-math', expect.any(Function));
    const updater = (updateWorkspaceCache as jest.Mock).mock.calls[0][1] as
      (cache: Record<string, unknown>)=> void;

    const cache = {
      schemaVersion: 1,
      folders: {},
    };

    updater(cache);
    expect(cache)
      .toEqual(expect.objectContaining({
        folders: {
          ['/repo/ops-math']: expect.objectContaining({
            opsList: [
              expect.objectContaining({
                name: 'add',
                path: childPath,
              }),
            ],
          }),
        },
      }));
  });
});
