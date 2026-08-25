/**
 * resolveDebugOperatorEntry on a standard-custom collection with
 * 2+ operators and NO explicit selection must return the FIRST SCANNED operator
 * (order: opsList, then experimentalOpsList) — the settings-native
 * equivalent of the build_example config rows (one per scanned operator,
 * first row = first operator of the collection), so msdebug auto-adapt patches
 * launch.json without a sidebar selection.
 */
jest.mock('i18next', () => ({ t: (key: string) => key }));

jest.mock('@plugin/class/explorer-root-utils', () => ({ ExplorerRootUtils: { getPrimaryRoot: jest.fn(() => null) } }));

jest.mock('@plugin/core/project/project-manager', () => ({ ProjectManager: { getInstance: jest.fn() } }));

jest.mock('@plugin/service/config-service', () => ({ ConfigService: { readBuildExampleTargetFromWorkspace: jest.fn() } }));

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

jest.mock('@plugin/helpers/ide-config-dir', () => {
  const actual = jest.requireActual('@plugin/helpers/ide-config-dir');

  return {
    ...actual,
    getWorkspaceFolderFromEnv: jest.fn(() => ''),
  };
});

jest.mock('@plugin/domain/plugins/detection-utils', () => ({ buildShHelpSupportsGenop: jest.fn() }));

jest.mock('@plugin/helpers/python-operator-editor-context', () => ({ hasAnyPythonOperatorActiveContext: jest.fn(() => true) }));

jest.mock('@plugin/helpers/operator-project-workspace-config', () => ({
  getConfiguredValue: jest.fn(() => undefined),
  getOpDevtoolsWorkspaceConfiguration: jest.fn(() => ({
    inspect: jest.fn(() => undefined),
    get: jest.fn(),
  })),
  readWorkspaceProjectTypeSetting: jest.fn(),
}));

jest.mock('@plugin/domain/models/project-model', () => {
  const actual = jest.requireActual('@plugin/domain/models/project-model');

  return {
    ...actual,
    getProjectByPath: jest.fn(),
    createProject: jest.fn(),
  };
});

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import { homeMethods } from '@plugin/controller/home-controller';
import {
  getProjectByPath,
  normalizeProjectPath,
} from '@plugin/domain/models/project-model';
import { readWorkspaceProjectTypeSetting } from '@plugin/helpers/operator-project-workspace-config';
import {
  CACHE_SCHEMA_VERSION,
  type FolderScanState,
  getCacheFilePath,
} from '@plugin/helpers/workspace-cache';
import {
  updateMsdebugTarget,
  DEFAULT_MSDEBUG_TARGET,
} from '@plugin/domain/utils/debug-target';

describe('resolveDebugOperatorEntry (standard-custom, no selection)', () => {
  let tmpRoot: string;

  const folderState: FolderScanState = {
    opsMeet: [],
    opsList: [
      {
        name: 'alpha',
        path: '/c/root/alpha',
      },
      {
        name: 'beta',
        path: '/c/root/beta',
      },
    ],
    experimentalOpsList: [
      {
        name: 'exp_gamma',
        path: '/c/root/experimental/exp_gamma',
      },
    ],
  };

  function writeCache(overrides: Partial<{ folders: Record<string, FolderScanState> }> = {}): void {
    fs.mkdirSync(path.dirname(getCacheFilePath(tmpRoot)), { recursive: true });
    fs.writeFileSync(
      getCacheFilePath(tmpRoot),
      JSON.stringify({
        schemaVersion: CACHE_SCHEMA_VERSION,
        folders: { [normalizeProjectPath(tmpRoot)]: folderState },
        ...overrides,
      }),
      'utf8',
    );
  }

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'op-devtools-debugop-'));
    (getProjectByPath as jest.Mock).mockReset();
    (readWorkspaceProjectTypeSetting as jest.Mock).mockReset()
      .mockReturnValue('ascend');
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: tmpRoot } }];
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  it('returns the FIRST scanned operator (base build_example row order) when nothing is selected', async () => {
    writeCache();
    (getProjectByPath as jest.Mock).mockReturnValue({
      project_name: 'root',
      project_path: tmpRoot,
      project_type: 'ascend',
      ops_list: [],
    });

    const operator = await homeMethods.resolveDebugOperatorEntry();

    expect(operator)
      .toEqual({
        name: 'alpha',
        path: '/c/root/alpha',
      });
  });

  it('falls back to the first EXPERIMENTAL scanned operator when opsList is empty', async () => {
    writeCache({
      folders: {
        [normalizeProjectPath(tmpRoot)]: {
          ...folderState,
          opsList: [],
        },
      },
    });
    (getProjectByPath as jest.Mock).mockReturnValue({
      project_name: 'root',
      project_path: tmpRoot,
      project_type: 'ascend',
      ops_list: [],
    });

    const operator = await homeMethods.resolveDebugOperatorEntry();

    expect(operator)
      .toEqual({
        name: 'exp_gamma',
        path: '/c/root/experimental/exp_gamma',
      });
  });

  it('returns undefined with no scan state (base had no build_example rows)', async () => {
    // No cache.json at all.
    (getProjectByPath as jest.Mock).mockReturnValue({
      project_name: 'root',
      project_path: tmpRoot,
      project_type: 'ascend',
      ops_list: [],
    });

    const operator = await homeMethods.resolveDebugOperatorEntry();

    expect(operator)
      .toBeUndefined();
  });

  it('patches launch.json through the auto-adapt chain without a sidebar selection', async () => {
    // Scan state paths must point at the real temp root so the binary lookup
    // (operator.path/build) hits the file created below.
    writeCache({
      folders: {
        [normalizeProjectPath(tmpRoot)]: {
          opsMeet: [],
          opsList: [
            {
              name: 'alpha',
              path: path.join(tmpRoot, 'alpha'),
            },
            {
              name: 'beta',
              path: path.join(tmpRoot, 'beta'),
            },
          ],
          experimentalOpsList: [],
        },
      },
    });
    (getProjectByPath as jest.Mock).mockReturnValue({
      project_name: 'root',
      project_path: tmpRoot,
      project_type: 'ascend',
      ops_list: [],
    });

    // The first scanned operator has a built binary (base auto-adapt outcome:
    // msdebug attaches to the first operator's executable).
    const opDir = path.join(tmpRoot, 'alpha');
    const buildDir = path.join(opDir, 'build');

    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'alpha'), '');
    fs.mkdirSync(path.join(tmpRoot, '.vscode'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpRoot, '.vscode', 'launch.json'),
      `${JSON.stringify({
        configurations: [
          {
            name: 'msdebug',
            type: 'msdebug-mi',
            request: 'attach',
            target: DEFAULT_MSDEBUG_TARGET,
          },
        ],
      }, null, 2)}\n`,
      'utf8',
    );

    const operator = await homeMethods.resolveDebugOperatorEntry();

    expect(operator)
      .toBeDefined();
    const result = await updateMsdebugTarget(tmpRoot, operator, undefined);

    expect(result)
      .toMatchObject({ status: 'patched' });

    const launchJson = JSON.parse(fs.readFileSync(path.join(tmpRoot, '.vscode', 'launch.json'), 'utf8')) as {
      configurations: Array<{ target: string }>
    };

    expect(launchJson.configurations[0].target)
      .toBe('${workspaceFolder}/alpha/build/alpha');
  });
});
