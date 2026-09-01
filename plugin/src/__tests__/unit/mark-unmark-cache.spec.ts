/**
 * Mark/unmark folder as operator → workspace cache persistence.
 *
 *  - mark  → `updateFolderScanState`/cache write EXISTS — `folders[key].opsList`
 *    contains the operator path (the mark lands in the scan state of the root
 *    project, the current equivalent of projects.json `ops_list`),
 *  - unmark → the operator is REMOVED from `opsList`,
 *  - the success message is shown ONLY when the cache write really happened
 *    (the `updateFolderScanState` boolean); on a failed write an error
 *    message is shown instead.
 *
 * The workspace cache (`<root>/.vscode/cache.json`) is the single source of
 * truth — the tests assert the DISK state, not the in-memory flow.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import * as vscode from 'vscode';

jest.mock('i18next', () => ({ t: (key: string) => key }));

// Mark/unmark resolve the project type through homeMethods.getProjectType();
// mock it so the flow short-circuits at step 1 (no detector invocation).
jest.mock('@plugin/controller/home-controller', () => ({ homeMethods: { getProjectType: jest.fn() } }));

// The service imports taskMethods from task-controller, which pulls a heavy
// runtime chain (build/sanitizer/st-test services) not touched by this spec.
jest.mock('@plugin/controller/task-controller', () => ({ taskMethods: { startBuild: jest.fn() } }));

// buildShHelpSupportsGenop spawns a REAL `bash build.sh --help` (detection-utils)
// — replace it with a fake that recognizes only the real fixture root, so
// findStandardCustomRoot walks up to the root and the unmark root re-check
// passes, without spawning any process.
jest.mock('@plugin/domain/plugins/detection-utils', () => ({
  buildShHelpSupportsGenop: jest.fn(),
  buildShHelpSupportsOption: jest.fn(),
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

import { FolderContextMenuService } from '@plugin/service/folder-context-menu-service';
import { normalizeProjectPath } from '@plugin/domain/models/project-model';
import * as workspaceCache from '@plugin/helpers/workspace-cache';

const buildShHelpSupportsGenop = jest.requireMock('@plugin/domain/plugins/detection-utils')
  .buildShHelpSupportsGenop as jest.Mock;
const getProjectType = jest.requireMock('@plugin/controller/home-controller')
  .homeMethods.getProjectType as jest.Mock;

/** Workspace-settings mock serving the `op-devtools.projectType` marker. */
function makeSettingsConfiguration(): {
  get: jest.Mock;
  inspect: jest.Mock;
  update: jest.Mock;
} {
  return {
    get: jest.fn(),
    inspect: jest.fn((relativePath: string) => {
      if (relativePath === 'projectType') {
        return {
          key: 'projectType',
          workspaceFolderValue: 'standard-custom',
        };
      }

      return undefined;
    }),
    update: jest.fn()
      .mockResolvedValue(undefined),
  };
}

describe('mark/unmark → workspace cache persistence', () => {
  let tmpRoot: string;
  let operatorDir: string;

  const cacheFilePath = (): string => path.join(tmpRoot, '.vscode', 'cache.json');

  function readCacheFolders(): Record<string, { opsList: Array<{ name: string;
    path: string;
    isCompiled?: boolean }> }> {
    const raw = fs.readFileSync(cacheFilePath(), 'utf8');

    return (JSON.parse(raw) as { folders: Record<string, { opsList: Array<{ name: string;
      path: string;
      isCompiled?: boolean }> }> }).folders;
  }

  beforeEach(() => {
    // Restore spyOn spies from the previous test (clearAllMocks keeps their
    // mockResolvedValue implementations, which would leak across tests).
    jest.restoreAllMocks();
    jest.clearAllMocks();

    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opdevtools-markunmark-'));
    operatorDir = path.join(tmpRoot, 'my_op');
    fs.mkdirSync(operatorDir, { recursive: true });
    fs.writeFileSync(path.join(operatorDir, 'CMakeLists.txt'), '', 'utf8');

    // Workspace root = the fixture root; the root's build interface supports --genop.
    (vscode.workspace as { workspaceFolders: Array<{ uri: { fsPath: string } }> | undefined })
      .workspaceFolders = [{ uri: { fsPath: tmpRoot } }];
    (vscode.workspace.getConfiguration as jest.Mock)
      .mockImplementation(() => makeSettingsConfiguration());

    buildShHelpSupportsGenop.mockImplementation(async (dir: string) => dir === tmpRoot);
    getProjectType.mockResolvedValue({ projectType: 'standard-custom' });
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  it('a workspace opened ABOVE the collection root still resolves the marked operator on build', async () => {
    // Workspace root = parent; the standard-custom collection lives one level
    // down. Mark writes the scan state into the COLLECTION root's cache —
    // buildOperatorProject must read the same cache (findStandardCustomRoot),
    // otherwise the marked operator is invisible and the user gets
    // "mark it first" in an unbreakable loop.
    const collectionRoot = path.join(tmpRoot, 'ops_math');
    const opDir = path.join(collectionRoot, 'math', 'add');

    fs.mkdirSync(opDir, { recursive: true });
    fs.writeFileSync(path.join(opDir, 'CMakeLists.txt'), '', 'utf8');
    buildShHelpSupportsGenop.mockImplementation(async (dir: string) => dir === collectionRoot);

    await FolderContextMenuService.markAsOperatorProject(vscode.Uri.file(opDir));

    // The cache landed in the COLLECTION root (not the workspace root).
    expect(fs.existsSync(path.join(collectionRoot, '.vscode', 'cache.json')))
      .toBe(true);

    const detectOperatorProject = jest.requireMock('@plugin/domain/services/operator-project-detector')
      .OperatorProjectDetector.detectOperatorProject as jest.Mock;

    detectOperatorProject.mockResolvedValue({
      isOperatorProject: true,
      projectType: 'standard-custom',
    });

    const startBuild = jest.requireMock('@plugin/controller/task-controller')
      .taskMethods.startBuild as jest.Mock;
    const showErrorMessage = jest.spyOn(vscode.window, 'showErrorMessage')
      .mockResolvedValue(undefined);

    await FolderContextMenuService.buildOperatorProject(vscode.Uri.file(opDir));

    expect(showErrorMessage)
      .not.toHaveBeenCalledWith('folderContext.noProjectIdMarkFirst');
    expect(startBuild)
      .toHaveBeenCalled();
    showErrorMessage.mockRestore();
  });

  it('mark persists the operator into the cache scan state (opsList contains the path)', async () => {
    await FolderContextMenuService.markAsOperatorProject(vscode.Uri.file(operatorDir));

    expect(fs.existsSync(cacheFilePath()))
      .toBe(true);

    const folders = readCacheFolders();
    const key = normalizeProjectPath(tmpRoot);

    expect(folders[key].opsList)
      .toContainEqual({
        name: 'my_op',
        path: operatorDir,
        isCompiled: false,
      });
    expect(vscode.window.showInformationMessage)
      .toHaveBeenCalledWith('folderContext.markedAsOperator');
  });

  it('unmark removes the operator from the cache scan state', async () => {
    await FolderContextMenuService.markAsOperatorProject(vscode.Uri.file(operatorDir));
    await FolderContextMenuService.unmarkAsOperatorProject(vscode.Uri.file(operatorDir));

    const key = normalizeProjectPath(tmpRoot);
    const opsList = readCacheFolders()[key].opsList;

    expect(opsList.some((op) => op.path === operatorDir))
      .toBe(false);
    expect(vscode.window.showInformationMessage)
      .toHaveBeenCalledWith('folderContext.unmarkedAsOperator');
  });

  it('mark: success message only on a real cache write — write failure shows an error instead', async () => {
    jest.spyOn(workspaceCache, 'updateFolderScanState')
      .mockResolvedValue(false);

    await FolderContextMenuService.markAsOperatorProject(vscode.Uri.file(operatorDir));

    expect(vscode.window.showInformationMessage)
      .not.toHaveBeenCalledWith('folderContext.markedAsOperator');
    expect(vscode.window.showErrorMessage)
      .toHaveBeenCalledWith('folderContext.markAsOperatorFailed');
  });

  it('unmark: success message only on a real cache write — write failure shows an error instead', async () => {
    // Real mark first (cache.json on disk has the operator).
    await FolderContextMenuService.markAsOperatorProject(vscode.Uri.file(operatorDir));

    jest.spyOn(workspaceCache, 'updateFolderScanState')
      .mockResolvedValue(false);

    await FolderContextMenuService.unmarkAsOperatorProject(vscode.Uri.file(operatorDir));

    expect(vscode.window.showInformationMessage)
      .not.toHaveBeenCalledWith('folderContext.unmarkedAsOperator');
    expect(vscode.window.showErrorMessage)
      .toHaveBeenCalledWith('folderContext.unmarkFailed');
  });
});
