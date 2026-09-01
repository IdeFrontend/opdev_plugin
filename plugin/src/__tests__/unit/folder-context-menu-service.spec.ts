/**
 * FolderContextMenuService — folder right-click actions.
 *
 * Complements mark-unmark-cache.spec.ts (mark/unmark → cache persistence):
 * this spec drives every guard, fallback and error path of the service with a
 * mocked vscode.commands / detection / controller layer and a REAL workspace
 * cache on disk.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import * as vscode from 'vscode';

jest.mock('i18next', () => ({ t: jest.fn((key: string) => key) }));

// Mark/unmark resolve the project type through homeMethods.getProjectType();
// mock it so the flow can be steered without the real controller.
jest.mock('@plugin/controller/home-controller', () => ({ homeMethods: { getProjectType: jest.fn() } }));

// The service delegates run/build/debug to taskMethods; only the delegation
// matters here (the real chain spawns processes).
jest.mock('@plugin/controller/task-controller', () => ({
  taskMethods: {
    startBuild: jest.fn(),
    startBuildExample: jest.fn(),
    startRun: jest.fn(),
    runCpuDebug: jest.fn(),
    runDebug: jest.fn(),
    cpuDebugConfig: jest.fn(),
    debugConfig: jest.fn(),
  },
}));

// buildShHelpSupportsGenop spawns a REAL `bash build.sh --help` (detection-utils)
// — replace it with a fake so findStandardCustomRoot walks the fixture without
// spawning any process. The other detection helpers are used by the real
// project-model getProjectByPath structural re-detect.
jest.mock('@plugin/domain/plugins/detection-utils', () => ({
  buildShHelpSupportsGenop: jest.fn(),
  buildShHelpSupportsOption: jest.fn(),
  hasAscFiles: jest.fn(),
  hasPyFilesInRoot: jest.fn(),
  hasPyFilesRecursive: jest.fn(),
  hasTritonPythonIndicatorsInRoot: jest.fn(),
}));

jest.mock('@plugin/domain/services/operator-project-detector', () => ({
  OperatorProjectType: {
    STANDARD_CUSTOM: 'standard-custom',
    ASCEND_C: 'ascend-c',
    TORCH_LIBRARY: 'torch-library',
    PYASC: 'pyasc',
    TRITON: 'triton',
    MULTI_PROJECT: 'multi-project',
  },
  OperatorProjectDetector: { detectOperatorProject: jest.fn() },
}));

// buildPythonDeployTarget lives in a module that pulls the profiler runtime;
// the service only needs the pure path → command template mapping.
jest.mock('@plugin/domain/services/command-strategy/python-operator-strategy-shared', () => ({ buildPythonDeployTarget: jest.fn((relativePath: string) => `python3 ${relativePath}`) }));

// The real OperatorProjectIconTheme registers a file decoration provider on
// construction — not part of the shared vscode mock; only getInstance/fire are
// exercised by the service.
jest.mock('@plugin/class/operator-project-icon-theme', () => ({ OperatorProjectIconTheme: { getInstance: jest.fn() } }));

jest.mock('@plugin/service/config-service', () => ({ ConfigService: { writeBuildOpDeployTarget: jest.fn() } }));

const mockProjectManager = {
  projectPath: '',
  setProjectContext: jest.fn(),
};

jest.mock('@plugin/core/project/project-manager', () => ({ ProjectManager: { getInstance: () => mockProjectManager } }));

const mockFsStat = jest.fn();

import { FolderContextMenuService } from '@plugin/service/folder-context-menu-service';
import { normalizeProjectPath } from '@plugin/domain/models/project-model';
import * as workspaceCache from '@plugin/helpers/workspace-cache';
import { OperatorProjectType } from '@plugin/domain/services/operator-project-detector';

const tMock = jest.requireMock('i18next').t as jest.Mock;
const getProjectType = jest.requireMock('@plugin/controller/home-controller')
  .homeMethods.getProjectType as jest.Mock;
const taskMethods = jest.requireMock('@plugin/controller/task-controller')
  .taskMethods as Record<string, jest.Mock>;
const buildShHelpSupportsGenop = jest.requireMock('@plugin/domain/plugins/detection-utils')
  .buildShHelpSupportsGenop as jest.Mock;
const buildShHelpSupportsOption = jest.requireMock('@plugin/domain/plugins/detection-utils')
  .buildShHelpSupportsOption as jest.Mock;
const detectOperatorProject = jest.requireMock('@plugin/domain/services/operator-project-detector')
  .OperatorProjectDetector.detectOperatorProject as jest.Mock;
const mockGetIconThemeInstance = jest.requireMock('@plugin/class/operator-project-icon-theme')
  .OperatorProjectIconTheme.getInstance as jest.Mock;
const mockWriteDeployTarget = jest.requireMock('@plugin/service/config-service')
  .ConfigService.writeBuildOpDeployTarget as jest.Mock;

const mockFireDecorationUpdate = jest.fn();

/** Workspace-settings mock serving the `op-devtools.projectType` marker. */
function makeSettingsConfiguration(): {
  get: jest.Mock;
  inspect: jest.Mock;
  update: jest.Mock;
} {
  return {
    get: jest.fn(),
    inspect: jest.fn((relativePath: string) => {
      if (relativePath === 'projectType' && projectTypeSetting !== undefined) {
        return {
          key: relativePath,
          workspaceFolderValue: projectTypeSetting,
        };
      }

      return undefined;
    }),
    update: jest.fn()
      .mockResolvedValue(undefined),
  };
}

let projectTypeSetting: string | undefined;

describe('FolderContextMenuService', () => {
  let tmpRoot: string;
  let operatorDir: string;

  const cacheFilePath = (): string => path.join(tmpRoot, '.vscode', 'cache.json');

  function readCache(): {
    folders?: Record<string, unknown>;
    fileMapLists?: Record<string, Array<{ filePath: string }>>;
  } {
    const raw = fs.readFileSync(cacheFilePath(), 'utf8');

    return JSON.parse(raw) as {
      folders?: Record<string, unknown>;
      fileMapLists?: Record<string, Array<{ filePath: string }>>;
    };
  }

  beforeEach(() => {
    // Restore spyOn spies from the previous test (clearAllMocks keeps their
    // mockResolvedValue implementations, which would leak across tests).
    jest.restoreAllMocks();
    jest.clearAllMocks();

    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opdevtools-fcm-'));
    operatorDir = path.join(tmpRoot, 'my_op');
    fs.mkdirSync(operatorDir, { recursive: true });
    fs.writeFileSync(path.join(operatorDir, 'CMakeLists.txt'), '', 'utf8');

    projectTypeSetting = 'standard-custom';
    (globalThis as unknown as { extensionContext?: unknown }).extensionContext = { subscriptions: [] };

    (vscode.workspace as { workspaceFolders?: Array<{ uri: { fsPath: string } }> })
      .workspaceFolders = [{ uri: { fsPath: tmpRoot } }];
    (vscode.workspace.getConfiguration as jest.Mock)
      .mockImplementation(() => makeSettingsConfiguration());
    (vscode as unknown as { FileType?: { File: number;
      Directory: number } }).FileType = {
      File: 1,
      Directory: 2,
    };
    (vscode.workspace as { fs?: { stat: jest.Mock } }).fs = { stat: mockFsStat };
    mockFsStat.mockResolvedValue({ type: vscode.FileType.File });

    getProjectType.mockResolvedValue({ projectType: 'standard-custom' });
    buildShHelpSupportsGenop.mockImplementation(async (dir: string) => dir === tmpRoot);
    buildShHelpSupportsOption.mockResolvedValue(true);
    detectOperatorProject.mockResolvedValue({
      isOperatorProject: false,
      projectPath: tmpRoot,
      projectName: path.basename(tmpRoot),
    });
    mockProjectManager.projectPath = tmpRoot;
    mockGetIconThemeInstance.mockReturnValue({ fireDecorationUpdate: mockFireDecorationUpdate });
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  describe('markAsOperatorProject', () => {
    it('rejects the ascend-c type with the angle-ops warning', async () => {
      getProjectType.mockResolvedValue({ projectType: OperatorProjectType.ASCEND_C });

      await FolderContextMenuService.markAsOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.angleOpsNotSupported');
    });

    it('rejects the pyasc type with the no-mark-unmark warning', async () => {
      getProjectType.mockResolvedValue({ projectType: OperatorProjectType.PYASC });

      await FolderContextMenuService.markAsOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.pyascNoMarkUnmark');
    });

    it('falls back to getProjectByPath when getProjectType fails', async () => {
      getProjectType.mockRejectedValue(new Error('api down'));
      projectTypeSetting = OperatorProjectType.PYASC;

      await FolderContextMenuService.markAsOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.pyascNoMarkUnmark');
    });

    it('falls back to the detector when the project record is absent', async () => {
      getProjectType.mockResolvedValue({});
      projectTypeSetting = undefined;
      detectOperatorProject.mockResolvedValue({
        isOperatorProject: true,
        projectType: OperatorProjectType.PYASC,
        projectPath: operatorDir,
        projectName: 'my_op',
      });

      await FolderContextMenuService.markAsOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.pyascNoMarkUnmark');
    });

    it('falls back to the workspace root when neither path nor detector match', async () => {
      getProjectType.mockResolvedValue({});
      projectTypeSetting = undefined;
      detectOperatorProject.mockResolvedValueOnce({
        isOperatorProject: false,
        projectPath: operatorDir,
        projectName: 'my_op',
      });
      detectOperatorProject.mockResolvedValueOnce({
        isOperatorProject: true,
        projectType: OperatorProjectType.PYASC,
        projectPath: tmpRoot,
        projectName: path.basename(tmpRoot),
      });

      await FolderContextMenuService.markAsOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.pyascNoMarkUnmark');
    });

    it('swallows detector failures on both the path and the workspace root', async () => {
      getProjectType.mockResolvedValue({});
      projectTypeSetting = undefined;
      detectOperatorProject.mockRejectedValue(new Error('detector down'));

      await FolderContextMenuService.markAsOperatorProject(vscode.Uri.file(operatorDir));

      // Type resolution fell through every source without crashing; the mark
      // flow continued to the root project lookup, which has no markers.
      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('folderContext.noProjectInfo');
    });

    it('stops the root walk at the filesystem root (no parent)', async () => {
      const driveRoot = path.parse(tmpRoot).root;

      buildShHelpSupportsGenop.mockResolvedValue(false);

      await FolderContextMenuService.markAsOperatorProject(vscode.Uri.file(driveRoot));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.noOperatorRoot');
    });

    it('shows an error when the cache write fails', async () => {
      jest.spyOn(workspaceCache, 'updateFolderScanState')
        .mockResolvedValue(false);

      await FolderContextMenuService.markAsOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('folderContext.markAsOperatorFailed');
      expect(tMock)
        .toHaveBeenCalledWith('folderContext.markAsOperatorFailed', { error: 'cache write failed' });
    });

    it('warns when no standard-custom root exposes --genop', async () => {
      buildShHelpSupportsGenop.mockResolvedValue(false);

      await FolderContextMenuService.markAsOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.noOperatorRoot');
    });

    it('shows an error when the root has no project record', async () => {
      buildShHelpSupportsGenop.mockResolvedValue(true);
      projectTypeSetting = undefined;

      await FolderContextMenuService.markAsOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('folderContext.noProjectInfo');
    });

    it('warns when the selected folder is not an operator (no CMakeLists.txt)', async () => {
      const plainDir = path.join(tmpRoot, 'plain');

      fs.mkdirSync(plainDir);

      await FolderContextMenuService.markAsOperatorProject(vscode.Uri.file(plainDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.notOperatorDir');
    });

    it('reports an already-marked operator from the cache scan state', async () => {
      await workspaceCache.updateWorkspaceCache(tmpRoot, (cache) => {
        cache.folders = {
          [normalizeProjectPath(tmpRoot)]: {
            opsMeet: [],
            opsList: [
              {
                name: 'my_op',
                path: operatorDir,
              },
            ],
            experimentalOpsList: [],
          },
        };
      });

      await FolderContextMenuService.markAsOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('folderContext.operatorAlreadyMarked');
    });

    it('marks a compiled operator (build dir) into the root scan state and refreshes the icon', async () => {
      fs.mkdirSync(path.join(operatorDir, 'build'));

      await FolderContextMenuService.markAsOperatorProject(vscode.Uri.file(operatorDir));

      const folders = readCache().folders as Record<string, {
        opsList: Array<{ name: string;
          path: string;
          isCompiled?: boolean }>;
      }>;

      expect(folders[normalizeProjectPath(tmpRoot)].opsList)
        .toContainEqual({
          name: 'my_op',
          path: operatorDir,
          isCompiled: true,
        });
      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('folderContext.markedAsOperator');
      expect(mockGetIconThemeInstance)
        .toHaveBeenCalled();
      expect(mockFireDecorationUpdate)
        .toHaveBeenCalledWith(vscode.Uri.file(operatorDir));
    });

    it('marks an operator under experimental/ into the experimentalOpsList', async () => {
      const experimentalOp = path.join(tmpRoot, 'experimental', 'math', 'add');

      fs.mkdirSync(experimentalOp, { recursive: true });
      fs.writeFileSync(path.join(experimentalOp, 'CMakeLists.txt'), '', 'utf8');

      await FolderContextMenuService.markAsOperatorProject(vscode.Uri.file(experimentalOp));

      const folders = readCache().folders as Record<string, {
        opsList: Array<{ name: string;
          path: string }>;
        experimentalOpsList: Array<{ name: string;
          path: string }>;
      }>;
      const scan = folders[normalizeProjectPath(tmpRoot)];

      expect(scan.opsList)
        .toHaveLength(0);
      expect(scan.experimentalOpsList)
        .toContainEqual({
          name: 'add',
          path: experimentalOp,
          isCompiled: false,
        });
    });

    it('skips the icon refresh when no extension context is installed', async () => {
      delete (globalThis as unknown as { extensionContext?: unknown }).extensionContext;

      await FolderContextMenuService.markAsOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('folderContext.markedAsOperator');
      expect(mockGetIconThemeInstance)
        .not.toHaveBeenCalled();
    });

    it('surfaces a thrown error as markAsOperatorFailed', async () => {
      buildShHelpSupportsGenop.mockRejectedValue(new Error('boom'));

      await FolderContextMenuService.markAsOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('folderContext.markAsOperatorFailed');
      expect(tMock)
        .toHaveBeenCalledWith('folderContext.markAsOperatorFailed', { error: 'boom' });
    });

    it('falls back to the workspace-root project record for the type', async () => {
      getProjectType.mockResolvedValue({});
      detectOperatorProject.mockResolvedValue({
        isOperatorProject: false,
        projectPath: operatorDir,
        projectName: 'my_op',
      });
      // The workspace-root record is only visible when its OWN scope is read —
      // the selected folder itself has no markers.
      (vscode.workspace.getConfiguration as jest.Mock)
        .mockImplementation((_section: string, scopeUri?: vscode.Uri) => ({
          inspect: <T>(key: string): T | undefined => {
            if (key === 'projectType' && scopeUri?.fsPath === tmpRoot) {
              return {
                key,
                workspaceFolderValue: OperatorProjectType.PYASC,
              } as unknown as T;
            }

            return undefined;
          },
          get: jest.fn(),
          update: jest.fn(),
        }));

      await FolderContextMenuService.markAsOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.pyascNoMarkUnmark');
    });

    it('reports an already-marked operator matched by name', async () => {
      await workspaceCache.updateWorkspaceCache(tmpRoot, (cache) => {
        cache.folders = {
          [normalizeProjectPath(tmpRoot)]: {
            opsMeet: [],
            opsList: [
              {
                name: 'my_op',
                path: path.join(tmpRoot, 'old_my_op'),
              },
            ],
            experimentalOpsList: [],
          },
        };
      });

      await FolderContextMenuService.markAsOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('folderContext.operatorAlreadyMarked');
    });

    it('formats a non-Error failure into markAsOperatorFailed', async () => {
      buildShHelpSupportsGenop.mockImplementation(() => {
        throw 'boom-str';
      });

      await FolderContextMenuService.markAsOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('folderContext.markAsOperatorFailed');
      expect(tMock)
        .toHaveBeenCalledWith('folderContext.markAsOperatorFailed', { error: 'boom-str' });
    });
  });

  describe('markAsMultiOperatorProject', () => {
    it('rejects the torch-library type with the angle-ops warning', async () => {
      getProjectType.mockResolvedValue({ projectType: OperatorProjectType.TORCH_LIBRARY });

      await FolderContextMenuService.markAsMultiOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.angleOpsNotSupported');
    });

    it('rejects the pyasc type with the no-mark-unmark warning', async () => {
      getProjectType.mockResolvedValue({ projectType: OperatorProjectType.PYASC });

      await FolderContextMenuService.markAsMultiOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.pyascNoMarkUnmark');
    });

    it('warns when no standard-custom root exposes --genop', async () => {
      buildShHelpSupportsGenop.mockResolvedValue(false);

      await FolderContextMenuService.markAsMultiOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.noOperatorRoot');
    });

    it('shows an error when the root has no project record', async () => {
      buildShHelpSupportsGenop.mockResolvedValue(true);
      projectTypeSetting = undefined;

      await FolderContextMenuService.markAsMultiOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('folderContext.noProjectInfo');
    });

    it('warns when the collection is not in the root whitelist', async () => {
      const unknownCollection = path.join(tmpRoot, 'not_a_collection');

      fs.mkdirSync(unknownCollection);

      await FolderContextMenuService.markAsMultiOperatorProject(vscode.Uri.file(unknownCollection));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.notInWhitelist');
      expect(tMock)
        .toHaveBeenCalledWith('folderContext.notInWhitelist', { name: 'not_a_collection' });
    });

    it('warns when the collection is not in the experimental whitelist', async () => {
      const unknownCollection = path.join(tmpRoot, 'experimental', 'not_a_collection');

      fs.mkdirSync(unknownCollection, { recursive: true });

      await FolderContextMenuService.markAsMultiOperatorProject(vscode.Uri.file(unknownCollection));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.notInExperimentalWhitelist');
      expect(tMock)
        .toHaveBeenCalledWith('folderContext.notInExperimentalWhitelist', { name: 'not_a_collection' });
    });

    it('warns when the collection contains no operators', async () => {
      const emptyCollection = path.join(tmpRoot, 'loss');

      fs.mkdirSync(emptyCollection);
      fs.mkdirSync(path.join(emptyCollection, 'no_cmake_dir'));

      await FolderContextMenuService.markAsMultiOperatorProject(vscode.Uri.file(emptyCollection));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.noOperatorsInDir');
    });

    it('tolerates a readdirSync failure during the operator scan', async () => {
      const collection = path.join(tmpRoot, 'math');

      fs.mkdirSync(collection);
      // The scan throws on a missing directory (readdirSync ENOENT) — the
      // service must fall through to the no-operators warning.
      fs.rmSync(collection, {
        recursive: true,
        force: true,
      });

      await FolderContextMenuService.markAsMultiOperatorProject(vscode.Uri.file(collection));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.noOperatorsInDir');
    });

    it('reports an already-marked collection from the cache scan state', async () => {
      const collection = path.join(tmpRoot, 'math');
      const addPath = path.join(collection, 'add');

      fs.mkdirSync(addPath, { recursive: true });
      fs.writeFileSync(path.join(addPath, 'CMakeLists.txt'), '', 'utf8');
      await workspaceCache.updateWorkspaceCache(tmpRoot, (cache) => {
        cache.folders = {
          [normalizeProjectPath(tmpRoot)]: {
            opsMeet: [
              {
                name: 'math',
                path: collection,
              },
            ],
            opsList: [],
            experimentalOpsList: [],
          },
        };
      });

      await FolderContextMenuService.markAsMultiOperatorProject(vscode.Uri.file(collection));

      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('folderContext.collectionAlreadyMarked');
    });

    it('marks a root collection: scans sub-operators, dedupes and preserves compile status', async () => {
      const collection = path.join(tmpRoot, 'math');
      const addPath = path.join(collection, 'add');
      const mulPath = path.join(collection, 'mul');

      fs.mkdirSync(addPath, { recursive: true });
      fs.writeFileSync(path.join(addPath, 'CMakeLists.txt'), '', 'utf8');
      fs.mkdirSync(mulPath, { recursive: true });
      fs.writeFileSync(path.join(mulPath, 'CMakeLists.txt'), '', 'utf8');
      fs.mkdirSync(path.join(mulPath, 'build'));
      fs.mkdirSync(path.join(collection, '.hidden'));
      fs.writeFileSync(path.join(collection, 'readme.txt'), '', 'utf8');

      // 'add' already exists in the scan state as compiled — the mark must keep
      // isCompiled true and refresh its path.
      await workspaceCache.updateWorkspaceCache(tmpRoot, (cache) => {
        cache.folders = {
          [normalizeProjectPath(tmpRoot)]: {
            opsMeet: [],
            opsList: [
              {
                name: 'add',
                path: path.join(collection, 'old_add'),
                isCompiled: true,
              },
            ],
            experimentalOpsList: [],
          },
        };
      });

      await FolderContextMenuService.markAsMultiOperatorProject(vscode.Uri.file(collection));

      const folders = readCache().folders as Record<string, {
        opsMeet: Array<{ name: string;
          path: string }>;
        opsList: Array<{ name: string;
          path: string;
          isCompiled?: boolean }>;
      }>;
      const scan = folders[normalizeProjectPath(tmpRoot)];

      expect(scan.opsMeet)
        .toContainEqual({
          name: 'math',
          path: collection,
        });
      expect(scan.opsList)
        .toContainEqual({
          name: 'add',
          path: addPath,
          isCompiled: true,
        });
      expect(scan.opsList)
        .toContainEqual({
          name: 'mul',
          path: mulPath,
          isCompiled: true,
        });
      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('folderContext.markedAsCollection');
      expect(mockGetIconThemeInstance)
        .toHaveBeenCalled();
    });

    it('marks an experimental collection into the experimentalOpsList', async () => {
      const collection = path.join(tmpRoot, 'experimental', 'math');
      const addPath = path.join(collection, 'add');

      fs.mkdirSync(addPath, { recursive: true });
      fs.writeFileSync(path.join(addPath, 'CMakeLists.txt'), '', 'utf8');

      await FolderContextMenuService.markAsMultiOperatorProject(vscode.Uri.file(collection));

      const folders = readCache().folders as Record<string, {
        opsMeet: Array<{ name: string;
          path: string }>;
        opsList: Array<{ name: string;
          path: string }>;
        experimentalOpsList: Array<{ name: string;
          path: string }>;
      }>;
      const scan = folders[normalizeProjectPath(tmpRoot)];

      expect(scan.opsMeet)
        .toContainEqual({
          name: 'experimental/math',
          path: collection,
        });
      expect(scan.experimentalOpsList)
        .toContainEqual({
          name: 'add',
          path: addPath,
          isCompiled: false,
        });
      expect(scan.opsList)
        .toHaveLength(0);
    });

    it('surfaces a thrown error as markAsCollectionFailed', async () => {
      buildShHelpSupportsGenop.mockRejectedValue(new Error('boom'));

      await FolderContextMenuService.markAsMultiOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('folderContext.markAsCollectionFailed');
      expect(tMock)
        .toHaveBeenCalledWith('folderContext.markAsCollectionFailed', { error: 'boom' });
    });

    it('reports an already-marked collection matched by its meet name', async () => {
      const collection = path.join(tmpRoot, 'math');
      const addPath = path.join(collection, 'add');

      fs.mkdirSync(addPath, { recursive: true });
      fs.writeFileSync(path.join(addPath, 'CMakeLists.txt'), '', 'utf8');
      await workspaceCache.updateWorkspaceCache(tmpRoot, (cache) => {
        cache.folders = {
          [normalizeProjectPath(tmpRoot)]: {
            opsMeet: [
              {
                name: 'math',
                path: path.join(tmpRoot, 'old_math'),
              },
            ],
            opsList: [],
            experimentalOpsList: [],
          },
        };
      });

      await FolderContextMenuService.markAsMultiOperatorProject(vscode.Uri.file(collection));

      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('folderContext.collectionAlreadyMarked');
    });

    it('formats a non-Error failure into markAsCollectionFailed', async () => {
      buildShHelpSupportsGenop.mockImplementation(() => {
        throw 'coll-boom';
      });

      await FolderContextMenuService.markAsMultiOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('folderContext.markAsCollectionFailed');
      expect(tMock)
        .toHaveBeenCalledWith('folderContext.markAsCollectionFailed', { error: 'coll-boom' });
    });
  });

  describe('unmarkAsOperatorProject', () => {
    it('rejects the ascend-c type with the angle-ops warning', async () => {
      getProjectType.mockResolvedValue({ projectType: OperatorProjectType.ASCEND_C });

      await FolderContextMenuService.unmarkAsOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.angleOpsNotSupported');
    });

    it('rejects the pyasc type with the no-mark-unmark warning', async () => {
      getProjectType.mockResolvedValue({ projectType: OperatorProjectType.PYASC });

      await FolderContextMenuService.unmarkAsOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.pyascNoMarkUnmark');
    });

    it('warns when no standard-custom root is found', async () => {
      buildShHelpSupportsGenop.mockResolvedValue(false);

      await FolderContextMenuService.unmarkAsOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.noOperatorRootShort');
    });

    it('warns when the found root is not a standard custom operator', async () => {
      buildShHelpSupportsGenop.mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      await FolderContextMenuService.unmarkAsOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.rootNotStandardOperator');
    });

    it('shows an error when the root has no project record', async () => {
      projectTypeSetting = undefined;

      await FolderContextMenuService.unmarkAsOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('folderContext.noProjectInfo');
    });

    it('reports a directory that was never marked', async () => {
      await FolderContextMenuService.unmarkAsOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('folderContext.dirNotMarkedAsOperator');
    });

    it('unmarks a marked operator and refreshes the icon', async () => {
      await FolderContextMenuService.markAsOperatorProject(vscode.Uri.file(operatorDir));
      mockGetIconThemeInstance.mockClear();

      await FolderContextMenuService.unmarkAsOperatorProject(vscode.Uri.file(operatorDir));

      const folders = readCache().folders as Record<string, {
        opsList: Array<{ name: string;
          path: string }>;
      }>;

      expect(folders[normalizeProjectPath(tmpRoot)].opsList)
        .toHaveLength(0);
      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('folderContext.unmarkedAsOperator');
      expect(mockFireDecorationUpdate)
        .toHaveBeenCalledWith(vscode.Uri.file(operatorDir));
    });

    it('unmarks an operator from the experimentalOpsList', async () => {
      const experimentalOp = path.join(tmpRoot, 'experimental', 'math', 'add');

      fs.mkdirSync(experimentalOp, { recursive: true });
      fs.writeFileSync(path.join(experimentalOp, 'CMakeLists.txt'), '', 'utf8');
      await FolderContextMenuService.markAsOperatorProject(vscode.Uri.file(experimentalOp));

      await FolderContextMenuService.unmarkAsOperatorProject(vscode.Uri.file(experimentalOp));

      const folders = readCache().folders as Record<string, {
        experimentalOpsList: Array<{ name: string;
          path: string }>;
      }>;

      expect(folders[normalizeProjectPath(tmpRoot)].experimentalOpsList)
        .toHaveLength(0);
    });

    it('formats a non-Error throw into the unmarkFailed message', async () => {
      buildShHelpSupportsGenop.mockImplementation(() => {
        throw 'boom-str';
      });

      await FolderContextMenuService.unmarkAsOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('folderContext.unmarkFailed');
      expect(tMock)
        .toHaveBeenCalledWith('folderContext.unmarkFailed', { error: 'boom-str' });
    });

    it('shows an error when the cache write fails', async () => {
      await FolderContextMenuService.markAsOperatorProject(vscode.Uri.file(operatorDir));
      jest.spyOn(workspaceCache, 'updateFolderScanState')
        .mockResolvedValue(false);

      await FolderContextMenuService.unmarkAsOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('folderContext.unmarkFailed');
      expect(tMock)
        .toHaveBeenCalledWith('folderContext.unmarkFailed', { error: 'cache write failed' });
    });

    it('unmarks an operator matched by name in either scan list', async () => {
      await workspaceCache.updateWorkspaceCache(tmpRoot, (cache) => {
        cache.folders = {
          [normalizeProjectPath(tmpRoot)]: {
            opsMeet: [],
            opsList: [
              {
                name: 'my_op',
                path: path.join(tmpRoot, 'old_ops'),
              },
            ],
            experimentalOpsList: [
              {
                name: 'my_op',
                path: path.join(tmpRoot, 'old_exp'),
              },
            ],
          },
        };
      });

      await FolderContextMenuService.unmarkAsOperatorProject(vscode.Uri.file(operatorDir));

      const scan = readCache().folders?.[normalizeProjectPath(tmpRoot)] as {
        opsList: Array<unknown>;
        experimentalOpsList: Array<unknown>;
      };

      expect(scan.opsList)
        .toHaveLength(0);
      expect(scan.experimentalOpsList)
        .toHaveLength(0);
      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('folderContext.unmarkedAsOperator');
    });

    it('tolerates a scan state without the opsMeet field', async () => {
      await workspaceCache.updateWorkspaceCache(tmpRoot, (cache) => {
        cache.folders = {
          [normalizeProjectPath(tmpRoot)]: {
            opsList: [
              {
                name: 'my_op',
                path: operatorDir,
              },
            ],
            experimentalOpsList: [],
          },
        };
      });

      await FolderContextMenuService.unmarkAsOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('folderContext.unmarkedAsOperator');
    });

    it('surfaces an Error throw as unmarkFailed', async () => {
      buildShHelpSupportsGenop.mockRejectedValue(new Error('unmark-boom'));

      await FolderContextMenuService.unmarkAsOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('folderContext.unmarkFailed');
      expect(tMock)
        .toHaveBeenCalledWith('folderContext.unmarkFailed', { error: 'unmark-boom' });
    });
  });

  describe('unmarkAsMultiOperatorProject', () => {
    it('rejects the ascend-c type with the angle-ops warning', async () => {
      getProjectType.mockResolvedValue({ projectType: OperatorProjectType.ASCEND_C });

      await FolderContextMenuService.unmarkAsMultiOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.angleOpsNotSupported');
    });

    it('rejects the pyasc type with the no-mark-unmark warning', async () => {
      getProjectType.mockResolvedValue({ projectType: OperatorProjectType.PYASC });

      await FolderContextMenuService.unmarkAsMultiOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.pyascNoMarkUnmark');
    });

    it('warns when no standard-custom root is found', async () => {
      buildShHelpSupportsGenop.mockResolvedValue(false);

      await FolderContextMenuService.unmarkAsMultiOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.noOperatorRootShort');
    });

    it('warns when the found root is not a standard custom operator', async () => {
      buildShHelpSupportsGenop.mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      await FolderContextMenuService.unmarkAsMultiOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.rootNotStandardOperator');
    });

    it('shows an error when the root has no project record', async () => {
      projectTypeSetting = undefined;

      await FolderContextMenuService.unmarkAsMultiOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('folderContext.noProjectInfo');
    });

    it('reports a directory that was never marked as a collection', async () => {
      await FolderContextMenuService.unmarkAsMultiOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('folderContext.dirNotMarkedAsCollection');
    });

    it('unmarks a collection and drops every operator under it', async () => {
      const collection = path.join(tmpRoot, 'math');
      const addPath = path.join(collection, 'add');
      const outsidePath = path.join(tmpRoot, 'other_op');

      fs.mkdirSync(collection, { recursive: true });
      await workspaceCache.updateWorkspaceCache(tmpRoot, (cache) => {
        cache.folders = {
          [normalizeProjectPath(tmpRoot)]: {
            opsMeet: [
              {
                name: 'math',
                path: collection,
              },
            ],
            opsList: [
              {
                name: 'add',
                path: addPath,
              },
              {
                name: 'other_op',
                path: outsidePath,
              },
            ],
            experimentalOpsList: [
              {
                name: 'exp_add',
                path: path.join(collection, 'exp', 'add'),
              },
            ],
          },
        };
      });

      await FolderContextMenuService.unmarkAsMultiOperatorProject(vscode.Uri.file(collection));

      const folders = readCache().folders as Record<string, {
        opsMeet: Array<{ name: string;
          path: string }>;
        opsList: Array<{ name: string;
          path: string }>;
        experimentalOpsList: Array<{ name: string;
          path: string }>;
      }>;
      const scan = folders[normalizeProjectPath(tmpRoot)];

      expect(scan.opsMeet)
        .toHaveLength(0);
      expect(scan.opsList)
        .toEqual([
          {
            name: 'other_op',
            path: outsidePath,
          },
        ]);
      expect(scan.experimentalOpsList)
        .toHaveLength(0);
      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('folderContext.unmarkedAsCollection');
      expect(mockFireDecorationUpdate)
        .toHaveBeenCalledWith(vscode.Uri.file(collection));
    });

    it('surfaces a thrown error as unmarkFailed', async () => {
      buildShHelpSupportsGenop.mockRejectedValue(new Error('boom'));

      await FolderContextMenuService.unmarkAsMultiOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('folderContext.unmarkFailed');
      expect(tMock)
        .toHaveBeenCalledWith('folderContext.unmarkFailed', { error: 'boom' });
    });

    it('tolerates a scan state without ops lists when unmarking a collection', async () => {
      const collection = path.join(tmpRoot, 'math');

      fs.mkdirSync(collection);
      await workspaceCache.updateWorkspaceCache(tmpRoot, (cache) => {
        cache.folders = {
          [normalizeProjectPath(tmpRoot)]: {
            opsMeet: [
              {
                name: 'math',
                path: collection,
              },
            ],
          },
        };
      });

      await FolderContextMenuService.unmarkAsMultiOperatorProject(vscode.Uri.file(collection));

      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('folderContext.unmarkedAsCollection');
    });

    it('formats a non-Error failure into unmarkFailed', async () => {
      buildShHelpSupportsGenop.mockImplementation(() => {
        throw 'coll-boom';
      });

      await FolderContextMenuService.unmarkAsMultiOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('folderContext.unmarkFailed');
      expect(tMock)
        .toHaveBeenCalledWith('folderContext.unmarkFailed', { error: 'coll-boom' });
    });
  });

  describe('buildOperatorProject', () => {
    it('refuses to run without a workspace', async () => {
      (vscode.workspace as { workspaceFolders?: unknown }).workspaceFolders = undefined;

      await FolderContextMenuService.buildOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('folderContext.noWorkspaceCannotRun');
    });

    it('rejects the angle-ops workspace root with a warning', async () => {
      detectOperatorProject.mockResolvedValue({
        isOperatorProject: true,
        projectType: OperatorProjectType.ASCEND_C,
        projectPath: tmpRoot,
        projectName: path.basename(tmpRoot),
      });

      await FolderContextMenuService.buildOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.angleOpsNotSupported');
    });

    it('prompts when the selection cannot be statted', async () => {
      const missing = path.join(tmpRoot, 'does-not-exist');

      detectOperatorProject.mockResolvedValue({
        isOperatorProject: true,
        projectType: OperatorProjectType.PYASC,
        projectPath: tmpRoot,
        projectName: path.basename(tmpRoot),
      });

      await FolderContextMenuService.buildOperatorProject(vscode.Uri.file(missing));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.noOperatorsToValidate');
    });

    it('errors when the folder is not registered as a project yet', async () => {
      projectTypeSetting = undefined;
      detectOperatorProject.mockResolvedValue({
        isOperatorProject: true,
        projectType: OperatorProjectType.STANDARD_CUSTOM,
        projectPath: tmpRoot,
        projectName: path.basename(tmpRoot),
      });

      await FolderContextMenuService.buildOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('folderContext.noProjectIdMarkFirst');
    });

    it('starts the build for a registered folder (cache-keyed root)', async () => {
      projectTypeSetting = undefined;
      detectOperatorProject.mockResolvedValue({
        isOperatorProject: true,
        projectType: OperatorProjectType.STANDARD_CUSTOM,
        projectPath: tmpRoot,
        projectName: path.basename(tmpRoot),
      });
      await workspaceCache.updateWorkspaceCache(tmpRoot, (cache) => {
        cache.folders = {
          [normalizeProjectPath(operatorDir)]: {
            opsMeet: [],
            opsList: [],
            experimentalOpsList: [],
          },
        };
      });

      await FolderContextMenuService.buildOperatorProject(vscode.Uri.file(operatorDir));

      expect(taskMethods.startBuild)
        .toHaveBeenCalledWith({
          operatorNames: 'my_op',
          operatorType: 'standard-custom',
          compileOption: undefined,
        });
    });

    it('passes --experimental for an experimental folder', async () => {
      const experimentalOp = path.join(tmpRoot, 'experimental', 'math', 'add');

      fs.mkdirSync(experimentalOp, { recursive: true });
      detectOperatorProject.mockResolvedValue({
        isOperatorProject: true,
        projectType: OperatorProjectType.STANDARD_CUSTOM,
        projectPath: tmpRoot,
        projectName: path.basename(tmpRoot),
      });
      await workspaceCache.updateWorkspaceCache(tmpRoot, (cache) => {
        cache.folders = {
          [normalizeProjectPath(experimentalOp)]: {
            opsMeet: [],
            opsList: [],
            experimentalOpsList: [],
          },
        };
      });

      await FolderContextMenuService.buildOperatorProject(vscode.Uri.file(experimentalOp));

      expect(taskMethods.startBuild)
        .toHaveBeenCalledWith({
          operatorNames: 'add',
          operatorType: 'standard-custom',
          compileOption: '--experimental',
        });
    });

    it('resolves the containing root by longest prefix match', async () => {
      projectTypeSetting = undefined;
      detectOperatorProject.mockResolvedValue({
        isOperatorProject: true,
        projectType: OperatorProjectType.STANDARD_CUSTOM,
        projectPath: tmpRoot,
        projectName: path.basename(tmpRoot),
      });
      // Both the workspace root and the exact folder key match — the longer
      // (folder) key must win.
      await workspaceCache.updateWorkspaceCache(tmpRoot, (cache) => {
        cache.folders = {
          [normalizeProjectPath(tmpRoot)]: {
            opsMeet: [],
            opsList: [],
            experimentalOpsList: [],
          },
          [normalizeProjectPath(operatorDir)]: {
            opsMeet: [],
            opsList: [],
            experimentalOpsList: [],
          },
        };
      });

      await FolderContextMenuService.buildOperatorProject(vscode.Uri.file(operatorDir));

      expect(taskMethods.startBuild)
        .toHaveBeenCalledWith({
          operatorNames: 'my_op',
          operatorType: 'standard-custom',
          compileOption: undefined,
        });
    });

    it('logs a placeholder and returns for a .py file in a pyasc workspace', async () => {
      const pyFile = path.join(tmpRoot, 'main.py');

      fs.writeFileSync(pyFile, '', 'utf8');
      const consoleLog = jest.spyOn(console, 'log')
        .mockImplementation(() => undefined);

      detectOperatorProject.mockResolvedValue({
        isOperatorProject: true,
        projectType: OperatorProjectType.PYASC,
        projectPath: tmpRoot,
        projectName: path.basename(tmpRoot),
      });

      await FolderContextMenuService.buildOperatorProject(vscode.Uri.file(pyFile));

      expect(consoleLog)
        .toHaveBeenCalledWith('[buildOperatorProject] pyasc run verification not implemented yet');
      expect(taskMethods.startBuild)
        .not.toHaveBeenCalled();
    });

    it('prompts the user for any other selection', async () => {
      await FolderContextMenuService.buildOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.noOperatorsToValidate');
    });

    it('falls back to the workspace root when no genop root is found', async () => {
      buildShHelpSupportsGenop.mockResolvedValue(false);
      detectOperatorProject.mockResolvedValue({
        isOperatorProject: true,
        projectType: OperatorProjectType.STANDARD_CUSTOM,
        projectPath: tmpRoot,
        projectName: path.basename(tmpRoot),
      });

      await FolderContextMenuService.buildOperatorProject(vscode.Uri.file(operatorDir));

      expect(taskMethods.startBuild)
        .toHaveBeenCalledWith({
          operatorNames: 'my_op',
          operatorType: 'standard-custom',
          compileOption: undefined,
        });
    });
  });

  describe('runOperatorProject', () => {
    it('refuses to run without a workspace', async () => {
      (vscode.workspace as { workspaceFolders?: unknown }).workspaceFolders = undefined;

      await FolderContextMenuService.runOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('folderContext.noWorkspaceCannotRun');
    });

    it('rejects the angle-ops workspace root with a warning', async () => {
      detectOperatorProject.mockResolvedValue({
        isOperatorProject: true,
        projectType: OperatorProjectType.TORCH_LIBRARY,
        projectPath: tmpRoot,
        projectName: path.basename(tmpRoot),
      });

      await FolderContextMenuService.runOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.angleOpsNotSupported');
    });

    it('errors when the standard-custom root is not recognized as a project', async () => {
      projectTypeSetting = undefined;
      detectOperatorProject.mockResolvedValue({
        isOperatorProject: true,
        projectType: OperatorProjectType.STANDARD_CUSTOM,
        projectPath: tmpRoot,
        projectName: path.basename(tmpRoot),
      });

      await FolderContextMenuService.runOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('folderContext.rootNotRecognized');
    });

    it('runs build_example for a recognized standard-custom folder', async () => {
      detectOperatorProject.mockResolvedValue({
        isOperatorProject: true,
        projectType: OperatorProjectType.STANDARD_CUSTOM,
        projectPath: tmpRoot,
        projectName: path.basename(tmpRoot),
      });

      await FolderContextMenuService.runOperatorProject(vscode.Uri.file(operatorDir));

      expect(taskMethods.startBuildExample)
        .toHaveBeenCalledWith({
          operatorNames: 'my_op',
          operatorType: 'standard-custom',
          compileOption: undefined,
        });
    });

    it('passes --experimental for an experimental folder', async () => {
      const experimentalOp = path.join(tmpRoot, 'experimental', 'math', 'add');

      fs.mkdirSync(experimentalOp, { recursive: true });
      detectOperatorProject.mockResolvedValue({
        isOperatorProject: true,
        projectType: OperatorProjectType.STANDARD_CUSTOM,
        projectPath: tmpRoot,
        projectName: path.basename(tmpRoot),
      });

      await FolderContextMenuService.runOperatorProject(vscode.Uri.file(experimentalOp));

      expect(taskMethods.startBuildExample)
        .toHaveBeenCalledWith({
          operatorNames: 'add',
          operatorType: 'standard-custom',
          compileOption: '--experimental',
        });
    });

    it('updates the deploy target and runs for a .py file in a pyasc workspace', async () => {
      const pyFile = path.join(tmpRoot, 'main.py');

      fs.writeFileSync(pyFile, '', 'utf8');
      projectTypeSetting = OperatorProjectType.PYASC;
      detectOperatorProject.mockResolvedValue({
        isOperatorProject: true,
        projectType: OperatorProjectType.PYASC,
        projectPath: tmpRoot,
        projectName: path.basename(tmpRoot),
      });

      await FolderContextMenuService.runOperatorProject(vscode.Uri.file(pyFile));

      expect(mockWriteDeployTarget)
        .toHaveBeenCalledWith('python3 ./main.py');
      expect(taskMethods.startRun)
        .toHaveBeenCalledWith({ filePath: 'main.py' });
    });

    it('keeps running when the deploy-target config update fails', async () => {
      const pyFile = path.join(tmpRoot, 'main.py');

      fs.writeFileSync(pyFile, '', 'utf8');
      projectTypeSetting = OperatorProjectType.PYASC;
      detectOperatorProject.mockResolvedValue({
        isOperatorProject: true,
        projectType: OperatorProjectType.PYASC,
        projectPath: tmpRoot,
        projectName: path.basename(tmpRoot),
      });
      mockWriteDeployTarget.mockRejectedValue(new Error('write fail'));
      const consoleError = jest.spyOn(console, 'error')
        .mockImplementation(() => undefined);

      await FolderContextMenuService.runOperatorProject(vscode.Uri.file(pyFile));

      expect(consoleError)
        .toHaveBeenCalledWith('[runOperatorProject] Failed to update config:', expect.anything());
      expect(taskMethods.startRun)
        .toHaveBeenCalledWith({ filePath: 'main.py' });
    });

    it('runs without a deploy-target update when the pyasc project is not recognized', async () => {
      const pyFile = path.join(tmpRoot, 'main.py');

      fs.writeFileSync(pyFile, '', 'utf8');
      projectTypeSetting = undefined;
      detectOperatorProject.mockResolvedValue({
        isOperatorProject: true,
        projectType: OperatorProjectType.PYASC,
        projectPath: tmpRoot,
        projectName: path.basename(tmpRoot),
      });

      await FolderContextMenuService.runOperatorProject(vscode.Uri.file(pyFile));

      expect(mockWriteDeployTarget)
        .not.toHaveBeenCalled();
      expect(taskMethods.startRun)
        .toHaveBeenCalledWith({ filePath: 'main.py' });
    });

    it('runs a pyasc folder without a file argument', async () => {
      projectTypeSetting = OperatorProjectType.PYASC;
      detectOperatorProject.mockResolvedValue({
        isOperatorProject: true,
        projectType: OperatorProjectType.PYASC,
        projectPath: tmpRoot,
        projectName: path.basename(tmpRoot),
      });

      await FolderContextMenuService.runOperatorProject(vscode.Uri.file(operatorDir));

      expect(taskMethods.startRun)
        .toHaveBeenCalledWith({ filePath: undefined });
    });

    it('runs a pyasc folder when the selection cannot be statted', async () => {
      const missing = path.join(tmpRoot, 'does-not-exist');

      detectOperatorProject.mockResolvedValue({
        isOperatorProject: true,
        projectType: OperatorProjectType.PYASC,
        projectPath: tmpRoot,
        projectName: path.basename(tmpRoot),
      });

      await FolderContextMenuService.runOperatorProject(vscode.Uri.file(missing));

      expect(taskMethods.startRun)
        .toHaveBeenCalledWith({ filePath: undefined });
    });

    it('prompts the user for any other selection', async () => {
      await FolderContextMenuService.runOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.noOperatorsToValidate');
    });

    it('keeps a ..-prefixed relative path for selections outside the run root', async () => {
      const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opdevtools-fcm-outside-'));
      const pyFile = path.join(outsideDir, 'main.py');

      try {
        fs.writeFileSync(pyFile, '', 'utf8');
        projectTypeSetting = OperatorProjectType.PYASC;
        detectOperatorProject.mockResolvedValue({
          isOperatorProject: true,
          projectType: OperatorProjectType.PYASC,
          projectPath: tmpRoot,
          projectName: path.basename(tmpRoot),
        });

        await FolderContextMenuService.runOperatorProject(vscode.Uri.file(pyFile));

        const rel = path.relative(tmpRoot, pyFile)
          .replace(/\\/g, '/');

        expect(mockWriteDeployTarget)
          .toHaveBeenCalledWith(`python3 ${rel}`);
        expect(taskMethods.startRun)
          .toHaveBeenCalledWith({ filePath: 'main.py' });
      }
      finally {
        fs.rmSync(outsideDir, {
          recursive: true,
          force: true,
        });
      }
    });
  });

  describe('debug actions', () => {
    it('cpuDebugOperatorProject rejects the ascend-c type', async () => {
      getProjectType.mockResolvedValue({ projectType: OperatorProjectType.ASCEND_C });

      await FolderContextMenuService.cpuDebugOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.angleOpsNotSupported');
    });

    it('cpuDebugOperatorProject rejects standard custom with the no-CPU-debug warning', async () => {
      await FolderContextMenuService.cpuDebugOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.standardOpsNoCpuDebug');
    });

    it('cpuDebugOperatorProject warns when the folder is not an operator project', async () => {
      getProjectType.mockResolvedValue({ projectType: OperatorProjectType.PYASC });
      projectTypeSetting = undefined;

      await FolderContextMenuService.cpuDebugOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.folderNotOperatorProject');
    });

    it('cpuDebugOperatorProject switches to the project and runs CPU debug', async () => {
      getProjectType.mockResolvedValue({ projectType: OperatorProjectType.PYASC });
      projectTypeSetting = OperatorProjectType.PYASC;

      await FolderContextMenuService.cpuDebugOperatorProject(vscode.Uri.file(operatorDir));

      expect(mockProjectManager.setProjectContext)
        .toHaveBeenCalledWith(operatorDir, 'my_op');
      expect(taskMethods.runCpuDebug)
        .toHaveBeenCalled();
    });

    it('cpuDebugOperatorProject surfaces an action failure', async () => {
      getProjectType.mockResolvedValue({ projectType: OperatorProjectType.PYASC });
      projectTypeSetting = OperatorProjectType.PYASC;
      taskMethods.runCpuDebug.mockRejectedValue(new Error('debug fail'));

      await FolderContextMenuService.cpuDebugOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('folderContext.actionFailed');
      expect(tMock)
        .toHaveBeenCalledWith('folderContext.actionFailed', { error: 'debug fail' });
    });

    it('cpuDebugOperatorProject formats a non-Error action failure', async () => {
      getProjectType.mockResolvedValue({ projectType: OperatorProjectType.PYASC });
      projectTypeSetting = OperatorProjectType.PYASC;
      taskMethods.runCpuDebug.mockRejectedValue('debug-str');

      await FolderContextMenuService.cpuDebugOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('folderContext.actionFailed');
      expect(tMock)
        .toHaveBeenCalledWith('folderContext.actionFailed', { error: 'debug-str' });
    });

    it('npuDebugOperatorProject runs NPU debug', async () => {
      projectTypeSetting = OperatorProjectType.PYASC;

      await FolderContextMenuService.npuDebugOperatorProject(vscode.Uri.file(operatorDir));

      expect(mockProjectManager.setProjectContext)
        .toHaveBeenCalledWith(operatorDir, 'my_op');
      expect(taskMethods.runDebug)
        .toHaveBeenCalled();
    });

    it('npuDebugOperatorProject warns when the folder is not an operator project', async () => {
      projectTypeSetting = undefined;

      await FolderContextMenuService.npuDebugOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.folderNotOperatorProject');
    });

    it('npuDebugOperatorProject rejects the torch-library type', async () => {
      getProjectType.mockResolvedValue({ projectType: OperatorProjectType.TORCH_LIBRARY });

      await FolderContextMenuService.npuDebugOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.angleOpsNotSupported');
    });

    it('cpuDebugConfigOperatorProject runs the CPU debug config', async () => {
      getProjectType.mockResolvedValue({ projectType: OperatorProjectType.PYASC });
      projectTypeSetting = OperatorProjectType.PYASC;

      await FolderContextMenuService.cpuDebugConfigOperatorProject(vscode.Uri.file(operatorDir));

      expect(taskMethods.cpuDebugConfig)
        .toHaveBeenCalled();
    });

    it('cpuDebugConfigOperatorProject rejects standard custom with the no-CPU-debug warning', async () => {
      await FolderContextMenuService.cpuDebugConfigOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.standardOpsNoCpuDebug');
    });

    it('cpuDebugConfigOperatorProject warns when the folder is not an operator project', async () => {
      getProjectType.mockResolvedValue({ projectType: OperatorProjectType.PYASC });
      projectTypeSetting = undefined;

      await FolderContextMenuService.cpuDebugConfigOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.folderNotOperatorProject');
    });

    it('cpuDebugConfigOperatorProject rejects the ascend-c type', async () => {
      getProjectType.mockResolvedValue({ projectType: OperatorProjectType.ASCEND_C });

      await FolderContextMenuService.cpuDebugConfigOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.angleOpsNotSupported');
    });

    it('npuDebugConfigOperatorProject runs the NPU debug config', async () => {
      projectTypeSetting = OperatorProjectType.PYASC;

      await FolderContextMenuService.npuDebugConfigOperatorProject(vscode.Uri.file(operatorDir));

      expect(taskMethods.debugConfig)
        .toHaveBeenCalled();
    });

    it('npuDebugConfigOperatorProject rejects the torch-library type', async () => {
      getProjectType.mockResolvedValue({ projectType: OperatorProjectType.TORCH_LIBRARY });

      await FolderContextMenuService.npuDebugConfigOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.angleOpsNotSupported');
    });

    it('npuDebugConfigOperatorProject warns when the folder is not an operator project', async () => {
      projectTypeSetting = undefined;

      await FolderContextMenuService.npuDebugConfigOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.folderNotOperatorProject');
    });
  });

  describe('analysis actions (sanitizer / on-board / simulation)', () => {
    it('sanitizerOperatorProject rejects the angle-ops type', async () => {
      getProjectType.mockResolvedValue({ projectType: OperatorProjectType.ASCEND_C });

      await FolderContextMenuService.sanitizerOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.angleOpsNotSupported');
    });

    it('sanitizerOperatorProject requires --bisheng_flags in the root build.sh', async () => {
      buildShHelpSupportsOption.mockResolvedValue(false);

      await FolderContextMenuService.sanitizerOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.needBishengFlags');
    });

    it('sanitizerOperatorProject opens the sanitizer options when supported', async () => {
      await FolderContextMenuService.sanitizerOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith(expect.stringContaining('.sanitizerOptions'));
    });

    it('sanitizerOperatorProject opens the options even without a genop root', async () => {
      buildShHelpSupportsGenop.mockResolvedValue(false);

      await FolderContextMenuService.sanitizerOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith(expect.stringContaining('.sanitizerOptions'));
    });

    it('sanitizerOperatorProject errors when the folder is not a project', async () => {
      projectTypeSetting = undefined;

      await FolderContextMenuService.sanitizerOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('folderContext.folderNotOperatorProject');
    });

    it('onBoardOperatorProject rejects the angle-ops type', async () => {
      getProjectType.mockResolvedValue({ projectType: OperatorProjectType.ASCEND_C });

      await FolderContextMenuService.onBoardOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.angleOpsNotSupported');
    });

    it('onBoardOperatorProject rejects standard custom with the no-tuning warning', async () => {
      await FolderContextMenuService.onBoardOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.standardOpsNoTuning');
    });

    it('onBoardOperatorProject requires --bisheng_flags in the root build.sh', async () => {
      getProjectType.mockResolvedValue({ projectType: OperatorProjectType.PYASC });
      projectTypeSetting = OperatorProjectType.PYASC;
      buildShHelpSupportsOption.mockResolvedValue(false);

      await FolderContextMenuService.onBoardOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.needBishengFlags');
    });

    it('onBoardOperatorProject opens the on-board options when supported', async () => {
      getProjectType.mockResolvedValue({ projectType: OperatorProjectType.PYASC });
      projectTypeSetting = OperatorProjectType.PYASC;

      await FolderContextMenuService.onBoardOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith(expect.stringContaining('.onBoardOptions'));
    });

    it('simulationOperatorProject rejects the angle-ops type', async () => {
      getProjectType.mockResolvedValue({ projectType: OperatorProjectType.TORCH_LIBRARY });

      await FolderContextMenuService.simulationOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.angleOpsNotSupported');
    });

    it('simulationOperatorProject rejects standard custom with the no-tuning warning', async () => {
      await FolderContextMenuService.simulationOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.standardOpsNoTuning');
    });

    it('simulationOperatorProject requires --bisheng_flags in the root build.sh', async () => {
      getProjectType.mockResolvedValue({ projectType: OperatorProjectType.PYASC });
      projectTypeSetting = OperatorProjectType.PYASC;
      buildShHelpSupportsOption.mockResolvedValue(false);

      await FolderContextMenuService.simulationOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('folderContext.needBishengFlags');
    });

    it('simulationOperatorProject opens the simulator options when supported', async () => {
      getProjectType.mockResolvedValue({ projectType: OperatorProjectType.PYASC });
      projectTypeSetting = OperatorProjectType.PYASC;

      await FolderContextMenuService.simulationOperatorProject(vscode.Uri.file(operatorDir));

      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith(expect.stringContaining('.simulatorOptions'));
    });
  });

  describe('checkIsOperatorProject', () => {
    it('reports a non-project folder', async () => {
      projectTypeSetting = undefined;

      const result = await FolderContextMenuService.checkIsOperatorProject(vscode.Uri.file(operatorDir));

      expect(result)
        .toEqual({
          isOperatorProject: false,
          isMultiProject: false,
        });
    });

    it('reports the project type of a recognized folder', async () => {
      const result = await FolderContextMenuService.checkIsOperatorProject(vscode.Uri.file(operatorDir));

      expect(result)
        .toEqual({
          isOperatorProject: true,
          isMultiProject: false,
          projectType: 'standard-custom',
        });
    });

    it('omits projectType when the record carries none', async () => {
      projectTypeSetting = 'unknown-type';

      const result = await FolderContextMenuService.checkIsOperatorProject(vscode.Uri.file(operatorDir));

      expect(result)
        .toEqual({
          isOperatorProject: true,
          isMultiProject: false,
          projectType: undefined,
        });
    });
  });

  describe('addReportToFileMapList', () => {
    it('shows an error when the selection cannot be statted', async () => {
      mockFsStat.mockRejectedValue(new Error('stat fail'));

      await FolderContextMenuService.addReportToFileMapList(vscode.Uri.file(operatorDir), 'sanitizer');

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('folderContext.addFailed');
      expect(tMock)
        .toHaveBeenCalledWith('folderContext.addFailed', { error: 'stat fail' });
    });

    it('refuses a directory for the sanitizer config', async () => {
      mockFsStat.mockResolvedValue({ type: vscode.FileType.Directory });

      await FolderContextMenuService.addReportToFileMapList(vscode.Uri.file(operatorDir), 'sanitizer');

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('folderContext.sanitizerSelectFile');
    });

    it('refuses a non-file/non-directory selection for tuning configs', async () => {
      mockFsStat.mockResolvedValue({ type: 3 });

      await FolderContextMenuService.addReportToFileMapList(vscode.Uri.file(operatorDir), 'simulate');

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('folderContext.selectFileOrFolder');
    });

    it('shows an error when no project is active', async () => {
      mockProjectManager.projectPath = '';

      await FolderContextMenuService.addReportToFileMapList(vscode.Uri.file(operatorDir), 'sanitizer');

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('folderContext.noProjectId');
    });

    it('adds a report file for the sanitizer config and refreshes the panel', async () => {
      const reportFile = path.join(tmpRoot, 'report.json');

      fs.writeFileSync(reportFile, '{}', 'utf8');

      await FolderContextMenuService.addReportToFileMapList(vscode.Uri.file(reportFile), 'sanitizer');

      const cache = readCache();

      expect(cache.fileMapLists?.sanitizer)
        .toEqual([
          {
            filePath: reportFile,
            reportTime: expect.any(Number),
          },
        ]);
      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('folderContext.addedToReportList');
      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith(expect.stringContaining('.flashMsSanitizerRunData'));
    });

    it('adds a directory for the on_board config and refreshes the tuning panel', async () => {
      await FolderContextMenuService.addReportToFileMapList(vscode.Uri.file(operatorDir), 'on_board');

      const cache = readCache();

      expect(cache.fileMapLists?.on_board)
        .toEqual([
          {
            filePath: operatorDir,
            reportTime: expect.any(Number),
          },
        ]);
      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith(expect.stringContaining('.flashPerformanceRunData'));
    });

    it('rejects a path that is already in the list (case-insensitive)', async () => {
      const reportFile = path.join(tmpRoot, 'report.json');

      fs.writeFileSync(reportFile, '{}', 'utf8');
      await FolderContextMenuService.addReportToFileMapList(vscode.Uri.file(reportFile), 'sanitizer');

      await FolderContextMenuService.addReportToFileMapList(vscode.Uri.file(reportFile.toUpperCase()), 'sanitizer');

      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('folderContext.alreadyInConfig');
      expect(readCache().fileMapLists?.sanitizer)
        .toHaveLength(1);
    });

    it('dedupes the cached list before appending', async () => {
      const reportFile = path.join(tmpRoot, 'report.json');
      const dupA = path.join(tmpRoot, 'dup.json');
      const dupB = path.join(tmpRoot, 'DUP.JSON');

      fs.writeFileSync(reportFile, '{}', 'utf8');
      fs.writeFileSync(dupA, '{}', 'utf8');
      fs.writeFileSync(dupB, '{}', 'utf8');
      await workspaceCache.updateWorkspaceCache(tmpRoot, (cache) => {
        cache.fileMapLists = {
          sanitizer: [
            {
              filePath: dupA,
              reportTime: 1,
            },
            {
              filePath: dupB,
              reportTime: 2,
            },
          ],
          simulate: [],
          on_board: [],
        };
      });

      await FolderContextMenuService.addReportToFileMapList(vscode.Uri.file(reportFile), 'sanitizer');

      const entries = readCache().fileMapLists?.sanitizer ?? [];

      expect(entries)
        .toHaveLength(2);
      expect(entries[0])
        .toEqual({
          filePath: dupA,
          reportTime: 1,
        });
      expect(entries[1].filePath)
        .toBe(reportFile);
    });

    it('keeps the entry when the panel refresh fails', async () => {
      const reportFile = path.join(tmpRoot, 'report.json');

      fs.writeFileSync(reportFile, '{}', 'utf8');
      (vscode.commands.executeCommand as jest.Mock)
        .mockRejectedValueOnce(new Error('refresh fail'));
      const consoleError = jest.spyOn(console, 'error')
        .mockImplementation(() => undefined);

      await FolderContextMenuService.addReportToFileMapList(vscode.Uri.file(reportFile), 'sanitizer');

      expect(consoleError)
        .toHaveBeenCalledWith('Failed to refresh panel:', expect.anything());
      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('folderContext.addedToReportList');
      expect(vscode.window.showErrorMessage)
        .not.toHaveBeenCalled();
    });

    it('adds a directory for the simulate config and refreshes the tuning panel', async () => {
      mockFsStat.mockResolvedValue({ type: vscode.FileType.Directory });

      await FolderContextMenuService.addReportToFileMapList(vscode.Uri.file(operatorDir), 'simulate');

      const cache = readCache();

      expect(cache.fileMapLists?.simulate)
        .toEqual([
          {
            filePath: operatorDir,
            reportTime: expect.any(Number),
          },
        ]);
      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith(expect.stringContaining('.flashPerformanceRunData'));
    });

    it('formats a non-Error failure into addFailed', async () => {
      mockFsStat.mockRejectedValue('stat-str');

      await FolderContextMenuService.addReportToFileMapList(vscode.Uri.file(operatorDir), 'sanitizer');

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('folderContext.addFailed');
      expect(tMock)
        .toHaveBeenCalledWith('folderContext.addFailed', { error: 'stat-str' });
    });

    it('tolerates a malformed cached file path in the dedupe check', async () => {
      const reportFile = path.join(tmpRoot, 'report.json');

      fs.writeFileSync(reportFile, '{}', 'utf8');
      await workspaceCache.updateWorkspaceCache(tmpRoot, (cache) => {
        cache.fileMapLists = {
          sanitizer: [
            {
              filePath: undefined as unknown as string,
              reportTime: 1,
            },
          ],
          simulate: [],
          on_board: [],
        };
      });

      await FolderContextMenuService.addReportToFileMapList(vscode.Uri.file(reportFile), 'sanitizer');

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('folderContext.addFailed');
      expect(tMock)
        .toHaveBeenCalledWith('folderContext.addFailed', expect.objectContaining({ error: expect.stringContaining('path') }));
    });
  });
});
