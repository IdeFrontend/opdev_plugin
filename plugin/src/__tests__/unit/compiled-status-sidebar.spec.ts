jest.mock('i18next', () => ({ t: (key: string) => key }));

jest.mock('@plugin/core/project/project-manager', () => ({ ProjectManager: { getInstance: jest.fn() } }));

jest.mock('@plugin/class/explorer-root-utils', () => ({ ExplorerRootUtils: { getPrimaryRoot: jest.fn() } }));

jest.mock('@plugin/helpers/python-operator-editor-context', () => ({ hasAnyPythonOperatorActiveContext: jest.fn() }));

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

jest.mock('@plugin/service/config-service', () => ({ ConfigService: { writeOpDevtoolsDottedSettings: jest.fn() } }));

jest.mock('@plugin/domain/models/project-model', () => {
  const actual = jest.requireActual('@plugin/domain/models/project-model');

  return {
    ...actual,
    getProjectByPath: jest.fn(),
  };
});

jest.mock('@plugin/domain/plugins/detection-utils', () => ({ buildShHelpSupportsGenop: jest.fn() }));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import {
  getProjectByPath, normalizeProjectPath,
} from '@plugin/domain/models/project-model';
import { checkMultipleOperatorsCore } from '@plugin/helpers/check-multiple-operators';
import {
  CACHE_SCHEMA_VERSION, type FolderScanState, type WorkspaceCache, getCacheFilePath, updateWorkspaceCache,
} from '@plugin/helpers/workspace-cache';
import { homeMethods } from '@plugin/controller/home-controller';

describe('compiled status to the sidebar', () => {
  let tmpRoot: string;

  const folderState: FolderScanState = {
    opsMeet: [],
    opsList: [
      {
        name: 'add_custom',
        path: '/c/root/add_custom',
      },
      {
        name: 'built_op',
        path: '/c/root/built_op',
      },
    ],
    experimentalOpsList: [
      {
        name: 'exp_op',
        path: '/c/root/experimental/exp_op',
      },
    ],
  };

  function writeCache(cache: Partial<WorkspaceCache>): void {
    fs.mkdirSync(path.dirname(getCacheFilePath(tmpRoot)), { recursive: true });
    fs.writeFileSync(
      getCacheFilePath(tmpRoot),
      JSON.stringify({
        schemaVersion: CACHE_SCHEMA_VERSION,
        ...cache,
      }),
      'utf8',
    );
  }

  function mockRootProject(selectedOperatorIds: number[]): void {
    (getProjectByPath as jest.Mock).mockReturnValue({
      project_name: 'root',
      project_path: tmpRoot,
      project_type: 'ascend',
      selected_operator_ids: selectedOperatorIds,
    });
  }

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'op-devtools-compiled-sidebar-'));
    (getProjectByPath as jest.Mock).mockReset();
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: tmpRoot } }];
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  it('flows compiled status to the sidebar through getSelectedOperatorEntries', async () => {
    const opPath = path.join(tmpRoot, 'built_op');

    mockRootProject([0]);
    writeCache({
      folders: {
        [normalizeProjectPath(tmpRoot)]: {
          opsMeet: [],
          opsList: [
            {
              name: 'built_op',
              path: opPath,
            },
          ],
          experimentalOpsList: [],
        },
      },
      project: {
        // The selection persists as PATHS in the workspace cache.
        selectedOperatorPaths: [opPath],
        compiledOpPaths: { [opPath]: true },
      },
    });

    const entries = await homeMethods.getSelectedOperatorEntries();

    expect(entries)
      .toEqual([
        {
          id: 0,
          name: 'built_op',
          path: opPath,
          isExperimental: false,
          isCompiled: true,
        },
      ]);
  });

  it('merges folder-level isCompiled and compiledOpPaths flags end-to-end', async () => {
    const addPath = path.join(tmpRoot, 'add_custom');
    const builtPath = path.join(tmpRoot, 'built_op');

    mockRootProject([
      0,
      1,
    ]);
    writeCache({
      folders: {
        [normalizeProjectPath(tmpRoot)]: {
          opsMeet: [],
          opsList: [
            // compiled only via compiledOpPaths
            {
              name: 'add_custom',
              path: addPath,
            },
            // compiled only via the folder scan flag
            {
              name: 'built_op',
              path: builtPath,
              isCompiled: true,
            },
          ],
          experimentalOpsList: [],
        },
      },
      project: {
        // The selection persists as PATHS in the workspace cache.
        selectedOperatorPaths: [
          addPath,
          builtPath,
        ],
        compiledOpPaths: { [addPath]: true },
      },
    });

    const entries = await homeMethods.getSelectedOperatorEntries();

    expect(entries.map((entry) => [
      entry.name,
      entry.isCompiled,
    ]))
      .toEqual([
        [
          'add_custom',
          true,
        ],
        [
          'built_op',
          true,
        ],
      ]);
  });

  it('compiledOpPaths written via updateWorkspaceCache are visible to the sidebar chain', async () => {
    const opPath = path.join(tmpRoot, 'built_op');

    mockRootProject([0]);
    writeCache({
      folders: {
        [normalizeProjectPath(tmpRoot)]: {
          opsMeet: [],
          opsList: [
            {
              name: 'built_op',
              path: opPath,
            },
          ],
          experimentalOpsList: [],
        },
      },
    });

    // The build flow (tryMarkOperatorsAsCompiled) marks compiled paths through
    // the same updateWorkspaceCache primitive.
    await updateWorkspaceCache(tmpRoot, (cache) => {
      cache.project = {
        selectedOperatorPaths: [opPath],
        compiledOpPaths: { [opPath]: true },
      };
    });

    const entries = await homeMethods.getSelectedOperatorEntries();

    expect(entries)
      .toEqual([
        expect.objectContaining({
          name: 'built_op',
          isCompiled: true,
        }),
      ]);
  });

  it('repeated reads are idempotent and never rewrite the cache file', async () => {
    const opPath = path.join(tmpRoot, 'built_op');

    mockRootProject([1]);
    writeCache({
      folders: {
        [normalizeProjectPath(tmpRoot)]: {
          opsMeet: [],
          opsList: [
            {
              name: 'built_op',
              path: opPath,
            },
          ],
          experimentalOpsList: [],
        },
      },
      project: {
        selectedOperatorPaths: [],
        compiledOpPaths: { [opPath]: true },
      },
    });
    const before = fs.readFileSync(getCacheFilePath(tmpRoot), 'utf8');

    const first = await checkMultipleOperatorsCore(tmpRoot);
    const second = await checkMultipleOperatorsCore(tmpRoot);

    const after = fs.readFileSync(getCacheFilePath(tmpRoot), 'utf8');

    expect(second)
      .toEqual(first);
    expect(after)
      .toBe(before);
  });
});
