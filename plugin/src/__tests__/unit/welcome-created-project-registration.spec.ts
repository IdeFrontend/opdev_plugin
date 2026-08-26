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

let mockExecutorExecuteImpl: ()=> Promise<unknown> = () => Promise.resolve({ code: 0 });

jest.mock('@plugin/class/command-options', () => ({
  CommandExecutor: jest.fn()
    .mockImplementation(() => ({
      execute: jest.fn()
        .mockImplementation(() => mockExecutorExecuteImpl()),
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
import * as fs from 'fs';
import { CommandExecutor } from '@plugin/class/command-options';
import { projectService } from '@plugin/service/project-service';
import { OperatorProjectDetector } from '@plugin/domain/services/operator-project-detector';
import {
  getProjectByPath,
  type ProjectRecord,
} from '@plugin/domain/models/project-model';
import {
  updateWorkspaceCache,
  type WorkspaceCache,
} from '@plugin/helpers/workspace-cache';
import { WorkspaceDetectorService } from '@plugin/service/workspace-detector-service';
import { whenPostActivateBootstrapReady } from '@plugin/helpers/post-activate-bootstrap';
import { welcomeMethods } from '@plugin/controller/welcome-controller';
import { getWorkspaceGenOpCommand } from '@plugin/helpers/operator-project-workspace-config';
import {
  buildGenOpCommand,
  decideSkipFileGeneration,
} from '@plugin/domain/utils/genop-command';
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

/** The updater the controller passed to updateWorkspaceCache for the collection root. */
function collectionAppendUpdater(): (cache: WorkspaceCache)=> void {
  const call = (updateWorkspaceCache as jest.Mock).mock.calls
    .find(([root]) => root === '/repo/ops-math');

  return call?.[1] as (cache: WorkspaceCache)=> void;
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
    // The child lands in the collection's cache scan state (no
    // appendStandardCustomOperator registry call).
    expect(updateWorkspaceCache)
      .toHaveBeenCalledWith('/repo/ops-math', expect.any(Function));
    const cache = {
      schemaVersion: 1,
      folders: {} as Record<string, unknown>,
    };

    collectionAppendUpdater()(cache);
    expect(cache.folders['/repo/ops-math'])
      .toEqual({
        opsMeet: [],
        opsList: [
          {
            name: 'add',
            path: childPath,
            isCompiled: false,
          },
        ],
        experimentalOpsList: [],
      });
  });

  it('recovers a missing root, keeps one child entry, and scaffolds with the collection path', async () => {
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
    expect(updateWorkspaceCache)
      .toHaveBeenCalledWith('/repo/ops-math', expect.any(Function));
    const cache = {
      schemaVersion: 1,
      folders: {} as Record<string, unknown>,
    };

    collectionAppendUpdater()(cache);
    expect(cache.folders['/repo/ops-math'])
      .toEqual({
        opsMeet: [],
        opsList: [
          {
            name: 'add',
            path: childPath,
            isCompiled: false,
          },
        ],
        experimentalOpsList: [],
      });
    expect(projectService.init).not.toHaveBeenCalled();
    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith(
        'create-directory',
        expect.objectContaining({
          createOperatorProjectDirectoryFileType: 2,
          subOperatorContext: expect.objectContaining({
            // The scaffold context carries the collection PATH instead of
            // a registry row id.
            parentProjectPath: '/repo/ops-math',
            opName: 'add',
            outputPath: childPath,
            skipFileGeneration: false,
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
    expect(updateWorkspaceCache).not.toHaveBeenCalled();
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
    expect(updateWorkspaceCache).not.toHaveBeenCalled();

    finishRegistration?.();
    await creation;

    // Only the collection scan-state registration writes the cache now — the
    // created-project path goes to the extension global state, not cache.json.
    expect(updateWorkspaceCache)
      .toHaveBeenCalledTimes(1);
    expect(updateWorkspaceCache)
      .toHaveBeenNthCalledWith(1, '/repo/ops-math', expect.any(Function));
  });

  it('seeds the scan state for a cache without a folders key', async () => {
    storedRoot = makeRoot();

    await welcomeMethods.createdProject(params);

    const cache = { schemaVersion: 1 } as WorkspaceCache;

    collectionAppendUpdater()(cache);
    expect(cache.folders?.['/repo/ops-math'])
      .toEqual({
        opsMeet: [],
        opsList: [
          {
            name: 'add',
            path: childPath,
            isCompiled: false,
          },
        ],
        experimentalOpsList: [],
      });
  });

  it('warns when the reveal of a new sub-operator fails with an error', async () => {
    storedRoot = makeRoot();
    const warnSpy = jest.spyOn(console, 'warn')
      .mockImplementation();

    (vscode.commands.executeCommand as jest.Mock).mockImplementation((command: string) => {
      if (command === 'revealInExplorer') {
        return Promise.reject(new Error('tree busy'));
      }

      return Promise.resolve(undefined);
    });

    await welcomeMethods.createdProject(params);

    expect(console.warn)
      .toHaveBeenCalledWith(expect.stringContaining('tree busy'));
    (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined);
    warnSpy.mockRestore();
  });

  it('warns with stringified details when the reveal of a new sub-operator fails with a non-Error', async () => {
    storedRoot = makeRoot();
    const warnSpy = jest.spyOn(console, 'warn')
      .mockImplementation();

    (vscode.commands.executeCommand as jest.Mock).mockImplementation((command: string) => {
      if (command === 'revealInExplorer') {
        return Promise.reject('tree busy');
      }

      return Promise.resolve(undefined);
    });

    await welcomeMethods.createdProject(params);

    expect(console.warn)
      .toHaveBeenCalledWith(expect.stringContaining('tree busy'));
    (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined);
    warnSpy.mockRestore();
  });
});

describe('welcomeMethods.createdProject genop scaffold', () => {
  let storedRoot: ProjectRecord | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    storedRoot = makeRoot();
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
    (getWorkspaceGenOpCommand as jest.Mock).mockReturnValue('build.sh --genop');
    (buildGenOpCommand as jest.Mock).mockReturnValue('genop-cmd');
    (decideSkipFileGeneration as jest.Mock).mockReturnValue(true);
    (getProjectByPath as jest.Mock).mockImplementation(() => storedRoot);
    mockExecutorExecuteImpl = () => Promise.resolve({ code: 0 });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('defers to the collection genop command and skips file generation when it succeeds', async () => {
    await welcomeMethods.createdProject(params);

    expect(buildGenOpCommand)
      .toHaveBeenCalledWith('build.sh --genop', 'math', 'add');
    const executor = (CommandExecutor as jest.Mock).mock.results[0].value as { execute: jest.Mock };

    expect(executor.execute)
      .toHaveBeenCalledWith('genop-cmd', [], [], expect.objectContaining({
        cwd: '/repo/ops-math',
        toolOutputLabel: 'create',
      }), true);
    expect(vscode.window.showInformationMessage)
      .toHaveBeenCalledWith('welcome.genopRunning');
    expect(vscode.window.showWarningMessage)
      .not
      .toHaveBeenCalledWith('welcome.genopFellBack');
    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith(
        'create-directory',
        expect.objectContaining({ subOperatorContext: expect.objectContaining({ skipFileGeneration: true }) }),
        expect.anything(),
      );
  });

  it('scaffolds from the collection root when the project path equals it', async () => {
    await welcomeMethods.createdProject({
      projectPath: '/repo/ops-math',
      projectName: 'add',
      createOperatorProjectDictoryFileType: 2,
    });

    expect(buildGenOpCommand)
      .toHaveBeenCalledWith('build.sh --genop', '.', 'add');
  });

  it('falls back to template scaffolding when genop leaves no sources', async () => {
    (decideSkipFileGeneration as jest.Mock).mockReturnValue(false);

    await welcomeMethods.createdProject(params);

    expect(vscode.window.showWarningMessage)
      .toHaveBeenCalledWith('welcome.genopFellBack');
    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith(
        'create-directory',
        expect.objectContaining({ subOperatorContext: expect.objectContaining({ skipFileGeneration: false }) }),
        expect.anything(),
      );
  });

  it('falls back to template scaffolding when the genop execution rejects with an error', async () => {
    const warnSpy = jest.spyOn(console, 'warn')
      .mockImplementation();

    mockExecutorExecuteImpl = () => Promise.reject(new Error('bash missing'));

    await welcomeMethods.createdProject(params);

    expect(console.warn)
      .toHaveBeenCalledWith(expect.stringContaining('falling back to template scaffolding'), expect.stringContaining('bash missing'));
    expect(vscode.window.showWarningMessage)
      .toHaveBeenCalledWith('welcome.genopFellBack');
    // Template scaffolding still completes the flow.
    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith(
        'create-directory',
        expect.objectContaining({ subOperatorContext: expect.objectContaining({ skipFileGeneration: false }) }),
        expect.anything(),
      );
    warnSpy.mockRestore();
  });

  it('falls back to template scaffolding when the genop execution rejects with a string', async () => {
    const warnSpy = jest.spyOn(console, 'warn')
      .mockImplementation();

    mockExecutorExecuteImpl = () => Promise.reject('no bash at all');

    await welcomeMethods.createdProject(params);

    expect(console.warn)
      .toHaveBeenCalledWith(expect.stringContaining('falling back to template scaffolding'), expect.stringContaining('no bash at all'));
    expect(vscode.window.showWarningMessage)
      .toHaveBeenCalledWith('welcome.genopFellBack');
    warnSpy.mockRestore();
  });
});
