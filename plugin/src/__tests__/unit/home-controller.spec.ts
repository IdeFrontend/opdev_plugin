jest.mock('i18next', () => ({ t: (key: string) => key }));

jest.mock('@plugin/class/explorer-root-utils', () => ({ ExplorerRootUtils: { getPrimaryRoot: jest.fn(() => null) } }));

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
  const actual = jest.requireActual('@plugin/domain/models/project-model') as Record<string, unknown>;

  return {
    ...actual,
    getProjectByPath: jest.fn(),
    createProject: jest.fn(),
  };
});

jest.mock('@plugin/helpers/ide-config-dir', () => {
  const actual = jest.requireActual('@plugin/helpers/ide-config-dir') as Record<string, unknown>;

  return {
    ...actual,
    getWorkspaceFolderFromEnv: jest.fn(() => ''),
  };
});

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import { homeMethods } from '@plugin/controller/home-controller';
import { ExplorerRootUtils } from '@plugin/class/explorer-root-utils';
import { ConfigService } from '@plugin/service/config-service';
import { OperatorProjectDetector } from '@plugin/domain/services/operator-project-detector';
import { hasAnyPythonOperatorActiveContext } from '@plugin/helpers/python-operator-editor-context';
import {
  getProjectByPath,
  createProject,
  normalizeProjectPath,
} from '@plugin/domain/models/project-model';
import { readWorkspaceProjectTypeSetting } from '@plugin/helpers/operator-project-workspace-config';
import { getWorkspaceFolderFromEnv } from '@plugin/helpers/ide-config-dir';
import {
  CACHE_SCHEMA_VERSION,
  type FolderScanState,
  type WorkspaceCache,
  getCacheFilePath,
} from '@plugin/helpers/workspace-cache';

const consoleWarn = console.warn;

function writeCache(root: string, cache: Partial<WorkspaceCache>): void {
  fs.mkdirSync(path.dirname(getCacheFilePath(root)), { recursive: true });
  fs.writeFileSync(
    getCacheFilePath(root),
    JSON.stringify({
      schemaVersion: CACHE_SCHEMA_VERSION,
      ...cache,
    }),
    'utf8',
  );
}

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
      isCompiled: true,
    },
  ],
  experimentalOpsList: [
    {
      name: 'exp_op',
      path: '/c/root/experimental/exp_op',
    },
  ],
};

function rootProject(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    project_name: 'root',
    project_path: '/c/root',
    project_type: 'ascend',
    ops_list: [],
    ...overrides,
  };
}

describe('homeMethods.getProjectType', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-home-'));
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: tmpRoot } }];
    (getProjectByPath as jest.Mock).mockReset();
    (readWorkspaceProjectTypeSetting as jest.Mock).mockReset();
    (OperatorProjectDetector.detectOperatorProject as jest.Mock).mockReset();
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  it('returns null projectType without workspace folders', async () => {
    vscode.workspace.workspaceFolders = undefined;

    await expect(homeMethods.getProjectType())
      .resolves
      .toEqual({ projectType: null });
    expect(getProjectByPath).not.toHaveBeenCalled();
  });

  it('prefers the workspace projectType setting over the stored project row', async () => {
    (readWorkspaceProjectTypeSetting as jest.Mock).mockReturnValue('triton');
    (getProjectByPath as jest.Mock).mockReturnValue(rootProject({ template_name: 'triton_template' }));

    await expect(homeMethods.getProjectType())
      .resolves
      .toEqual({
        projectType: 'triton',
        projectTemplateName: 'triton_template',
      });
  });

  it('falls back to the stored project row when the setting is unset', async () => {
    (readWorkspaceProjectTypeSetting as jest.Mock).mockReturnValue(undefined);
    (getProjectByPath as jest.Mock).mockReturnValue(rootProject({
      project_type: 'cann',
      template_name: 'hello_world',
    }));

    await expect(homeMethods.getProjectType())
      .resolves
      .toEqual({
        projectType: 'cann',
        projectTemplateName: 'hello_world',
      });
  });

  it('detects the workspace path when no registered project exists', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(undefined);
    (OperatorProjectDetector.detectOperatorProject as jest.Mock).mockResolvedValue({
      isOperatorProject: true,
      projectType: 'torch-library',
    });

    await expect(homeMethods.getProjectType())
      .resolves
      .toEqual({
        projectType: 'torch-library',
        projectTemplateName: 'torch_library_template',
      });
  });

  it('returns null when detection finds no operator project', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(undefined);
    (OperatorProjectDetector.detectOperatorProject as jest.Mock).mockResolvedValue({
      isOperatorProject: false,
      projectType: undefined,
    });

    await expect(homeMethods.getProjectType())
      .resolves
      .toEqual({ projectType: null });
  });

  it('swallows detection failures and returns null projectType', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(undefined);
    (OperatorProjectDetector.detectOperatorProject as jest.Mock).mockRejectedValue(new Error('boom'));

    await expect(homeMethods.getProjectType())
      .resolves
      .toEqual({ projectType: null });
  });
});

describe('homeMethods.validatePyascForAnalysis', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-home-'));
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: tmpRoot } }];
    (getProjectByPath as jest.Mock).mockReset();
    (readWorkspaceProjectTypeSetting as jest.Mock).mockReset();
    (OperatorProjectDetector.detectOperatorProject as jest.Mock).mockReset();
    (hasAnyPythonOperatorActiveContext as jest.Mock).mockReset()
      .mockReturnValue(true);
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  it('passes through for non pyasc/triton project types', async () => {
    (readWorkspaceProjectTypeSetting as jest.Mock).mockReturnValue('ascend');

    await expect(homeMethods.validatePyascForAnalysis())
      .resolves
      .toEqual({ valid: true });
    expect(hasAnyPythonOperatorActiveContext).not.toHaveBeenCalled();
  });

  it('passes through when no workspace folders exist to derive a pyasc type from', async () => {
    vscode.workspace.workspaceFolders = undefined;

    await expect(homeMethods.validatePyascForAnalysis())
      .resolves
      .toEqual({ valid: true });
  });

  it('reports openPyFirst when no .py file is active in a triton workspace', async () => {
    (readWorkspaceProjectTypeSetting as jest.Mock).mockReturnValue('triton');
    (hasAnyPythonOperatorActiveContext as jest.Mock).mockReturnValue(false);

    await expect(homeMethods.validatePyascForAnalysis())
      .resolves
      .toEqual({
        valid: false,
        message: 'extension.openPyFirst',
      });
    expect(hasAnyPythonOperatorActiveContext)
      .toHaveBeenCalledWith('.py', tmpRoot);
  });

  it('passes when an active .py exists for a pyasc workspace', async () => {
    (readWorkspaceProjectTypeSetting as jest.Mock).mockReturnValue('pyasc');

    await expect(homeMethods.validatePyascForAnalysis())
      .resolves
      .toEqual({ valid: true });
  });

  it('falls back to detection when neither setting nor project row yields a type', async () => {
    (readWorkspaceProjectTypeSetting as jest.Mock).mockReturnValue(undefined);
    (getProjectByPath as jest.Mock).mockReturnValue(undefined);
    (OperatorProjectDetector.detectOperatorProject as jest.Mock).mockResolvedValue({
      isOperatorProject: true,
      projectType: 'pyasc',
    });

    await expect(homeMethods.validatePyascForAnalysis())
      .resolves
      .toEqual({ valid: true });
  });

  it('returns the failure message when the validation itself throws', async () => {
    (readWorkspaceProjectTypeSetting as jest.Mock).mockImplementation(() => {
      throw new Error('settings exploded');
    });

    await expect(homeMethods.validatePyascForAnalysis())
      .resolves
      .toEqual({
        valid: false,
        message: 'settings exploded',
      });
  });
});

describe('homeMethods.getWorkspace / getHome', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the primary explorer root path', async () => {
    (ExplorerRootUtils.getPrimaryRoot as jest.Mock).mockReturnValue({ path: '/repo/ops-math' });

    await expect(homeMethods.getWorkspace())
      .resolves
      .toBe('/repo/ops-math');
  });

  it('returns null when no primary root exists', async () => {
    (ExplorerRootUtils.getPrimaryRoot as jest.Mock).mockReturnValue(null);

    await expect(homeMethods.getWorkspace())
      .resolves
      .toBeNull();
  });

  it('returns the workspace folder from the environment', async () => {
    (getWorkspaceFolderFromEnv as jest.Mock).mockReturnValue('/env/workspace');

    await expect(homeMethods.getHome())
      .resolves
      .toBe('/env/workspace');
  });

  it('falls back to HOME and USERPROFILE', async () => {
    const previousHome = process.env.HOME;
    const previousProfile = process.env.USERPROFILE;
    const previousWorkspace = (getWorkspaceFolderFromEnv as jest.Mock).getMockImplementation();

    (getWorkspaceFolderFromEnv as jest.Mock).mockReturnValue('');

    try {
      process.env.HOME = '/home/user';
      process.env.USERPROFILE = '/c/Users/user';

      await expect(homeMethods.getHome())
        .resolves
        .toBe('/home/user');
      process.env.HOME = '';

      await expect(homeMethods.getHome())
        .resolves
        .toBe('/c/Users/user');
    }
    finally {
      if (previousHome === undefined) {
        delete process.env.HOME;
      }
      else {
        process.env.HOME = previousHome;
      }

      if (previousProfile === undefined) {
        delete process.env.USERPROFILE;
      }
      else {
        process.env.USERPROFILE = previousProfile;
      }

      (getWorkspaceFolderFromEnv as jest.Mock).mockImplementation(previousWorkspace as ()=> string);
    }
  });

  it('returns an empty string when every source is missing', async () => {
    const previousHome = process.env.HOME;
    const previousProfile = process.env.USERPROFILE;

    (getWorkspaceFolderFromEnv as jest.Mock).mockReturnValue('');

    try {
      delete process.env.HOME;
      delete process.env.USERPROFILE;

      await expect(homeMethods.getHome())
        .resolves
        .toBe('');
    }
    finally {
      if (previousHome !== undefined) {
        process.env.HOME = previousHome;
      }

      if (previousProfile !== undefined) {
        process.env.USERPROFILE = previousProfile;
      }
    }
  });
});

describe('homeMethods.checkMultipleOperators', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-home-'));
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: tmpRoot } }];
    (getProjectByPath as jest.Mock).mockReset()
      .mockReturnValue(rootProject());
    (readWorkspaceProjectTypeSetting as jest.Mock).mockReset()
      .mockReturnValue('ascend');
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  it('reports no multiple operators without workspace folders', async () => {
    vscode.workspace.workspaceFolders = undefined;

    await expect(homeMethods.checkMultipleOperators())
      .resolves
      .toEqual({ hasMultiple: false });
  });

  it('delegates to checkMultipleOperatorsCore with the sanitizer flag', async () => {
    writeCache(tmpRoot, { folders: { [normalizeProjectPath(tmpRoot)]: folderState } });

    const result = await homeMethods.checkMultipleOperators();

    expect(result)
      .toMatchObject({
        hasMultiple: true,
        isStandardCustom: true,
      });
    expect(result.operators?.map((operator) => operator.name))
      .toEqual([
        'add_custom',
        'built_op',
        'exp_op',
      ]);
  });
});

describe('homeMethods.setSelectedOperators', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-home-'));
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: tmpRoot } }];
    (getProjectByPath as jest.Mock).mockReset();
    (createProject as jest.Mock).mockReset()
      .mockResolvedValue(undefined);
    consoleWarnSpy();
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  it('is a no-op without workspace folders', async () => {
    vscode.workspace.workspaceFolders = undefined;

    await homeMethods.setSelectedOperators({ operatorIds: [1] });
    expect(getProjectByPath).not.toHaveBeenCalled();
    expect(createProject).not.toHaveBeenCalled();
  });

  it('is a no-op when no project is registered for the workspace', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(undefined);

    await homeMethods.setSelectedOperators();
    expect(createProject).not.toHaveBeenCalled();
  });

  it('persists numeric operator ids through createProject', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(rootProject({
      project_name: 'root',
      project_path: '/c/root',
    }));

    await homeMethods.setSelectedOperators({
      operatorIds: [
        0,
        2,
      ],
    });

    expect(createProject)
      .toHaveBeenCalledWith({
        project_name: 'root',
        project_path: '/c/root',
        selected_operator_ids: [
          0,
          2,
        ],
      });
  });

  it('converts string ids to numbers and drops NaN values', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(rootProject({
      project_name: 'root',
      project_path: '/c/root',
    }));

    await homeMethods.setSelectedOperators({
      operatorIds: [
        '1',
        'not-a-number',
        3,
      ],
    });

    expect(createProject)
      .toHaveBeenCalledWith({
        project_name: 'root',
        project_path: '/c/root',
        selected_operator_ids: [
          1,
          3,
        ],
      });
  });

  it('deduplicates operator ids before persisting', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(rootProject({
      project_name: 'root',
      project_path: '/c/root',
    }));

    await homeMethods.setSelectedOperators({
      operatorIds: [
        0,
        0,
        2,
        '2',
        2,
      ],
    });

    expect(createProject)
      .toHaveBeenCalledWith({
        project_name: 'root',
        project_path: '/c/root',
        selected_operator_ids: [
          0,
          2,
        ],
      });
  });

  it('resets to an empty selection when operatorIds is not an array', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(rootProject({
      project_name: 'root',
      project_path: '/c/root',
    }));

    await homeMethods.setSelectedOperators({ operatorIds: 'nope' as unknown as number[] });

    expect(createProject)
      .toHaveBeenCalledWith({
        project_name: 'root',
        project_path: '/c/root',
        selected_operator_ids: [],
      });
  });
});

describe('homeMethods.getSelectedOperatorIds', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-home-'));
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: tmpRoot } }];
    (getProjectByPath as jest.Mock).mockReset()
      .mockReturnValue(rootProject());
    (readWorkspaceProjectTypeSetting as jest.Mock).mockReset()
      .mockReturnValue('ascend');
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  it('returns undefined without workspace folders', async () => {
    vscode.workspace.workspaceFolders = undefined;

    await expect(homeMethods.getSelectedOperatorIds())
      .resolves
      .toBeUndefined();
  });

  it('returns undefined when no project is registered', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(undefined);

    await expect(homeMethods.getSelectedOperatorIds())
      .resolves
      .toBeUndefined();
  });

  it('returns undefined when nothing was ever selected', async () => {
    await expect(homeMethods.getSelectedOperatorIds())
      .resolves
      .toBeUndefined();
  });

  it('resolves the scan ids of the selected operator paths', async () => {
    writeCache(tmpRoot, {
      folders: { [normalizeProjectPath(tmpRoot)]: folderState },
      project: { selectedOperatorPaths: ['/c/root/built_op'] },
    });

    await expect(homeMethods.getSelectedOperatorIds())
      .resolves
      .toEqual([1]);
  });

  it('deduplicates a duplicated persisted selection before resolving ids', async () => {
    writeCache(tmpRoot, {
      folders: { [normalizeProjectPath(tmpRoot)]: folderState },
      project: {
        selectedOperatorPaths: [
          '/c/root/built_op',
          '/c/root/built_op',
        ],
      },
    });

    await expect(homeMethods.getSelectedOperatorIds())
      .resolves
      .toEqual([1]);
  });

  it('returns undefined when no selected path matches a scanned operator', async () => {
    writeCache(tmpRoot, {
      folders: { [normalizeProjectPath(tmpRoot)]: folderState },
      project: { selectedOperatorPaths: ['/c/root/unknown_op'] },
    });

    await expect(homeMethods.getSelectedOperatorIds())
      .resolves
      .toBeUndefined();
  });
});

describe('homeMethods.getSelectedOperatorEntries / getSelectedOperators', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-home-'));
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: tmpRoot } }];
    (getProjectByPath as jest.Mock).mockReset()
      .mockReturnValue(rootProject());
    (readWorkspaceProjectTypeSetting as jest.Mock).mockReset()
      .mockReturnValue('ascend');
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  it('returns an empty array without workspace folders', async () => {
    vscode.workspace.workspaceFolders = undefined;

    await expect(homeMethods.getSelectedOperatorEntries())
      .resolves
      .toEqual([]);
  });

  it('returns an empty array when no project is registered', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(undefined);

    await expect(homeMethods.getSelectedOperatorEntries())
      .resolves
      .toEqual([]);
  });

  it('returns an empty array when nothing was selected', async () => {
    await expect(homeMethods.getSelectedOperatorEntries())
      .resolves
      .toEqual([]);
  });

  it('returns an empty array when the workspace is not standard-custom', async () => {
    writeCache(tmpRoot, {
      folders: { [normalizeProjectPath(tmpRoot)]: folderState },
      project: { selectedOperatorPaths: ['/c/root/add_custom'] },
    });
    (readWorkspaceProjectTypeSetting as jest.Mock).mockReturnValue('cann');

    await expect(homeMethods.getSelectedOperatorEntries())
      .resolves
      .toEqual([]);
  });

  it('matches selected paths against the scan entries case-insensitively', async () => {
    writeCache(tmpRoot, {
      folders: { [normalizeProjectPath(tmpRoot)]: folderState },
      project: {
        selectedOperatorPaths: [
          '/C/ROOT/add_custom',
          '/c/root/experimental/exp_op',
        ],
      },
    });

    const entries = await homeMethods.getSelectedOperatorEntries();

    expect(entries.map((entry) => entry.name))
      .toEqual([
        'add_custom',
        'exp_op',
      ]);
  });

  it('getSelectedOperators joins the selected names with commas', async () => {
    writeCache(tmpRoot, {
      folders: { [normalizeProjectPath(tmpRoot)]: folderState },
      project: {
        selectedOperatorPaths: [
          '/c/root/add_custom',
          '/c/root/built_op',
        ],
      },
    });

    await expect(homeMethods.getSelectedOperators())
      .resolves
      .toBe('add_custom,built_op');
  });

  it('getSelectedOperators returns undefined when nothing is selected', async () => {
    await expect(homeMethods.getSelectedOperators())
      .resolves
      .toBeUndefined();
  });
});

describe('homeMethods.resolveDebugOperatorEntry', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-home-'));
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: tmpRoot } }];
    (getProjectByPath as jest.Mock).mockReset()
      .mockReturnValue(rootProject());
    (readWorkspaceProjectTypeSetting as jest.Mock).mockReset()
      .mockReturnValue('ascend');
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  it('returns the explicitly selected operator', async () => {
    writeCache(tmpRoot, {
      folders: { [normalizeProjectPath(tmpRoot)]: folderState },
      project: { selectedOperatorPaths: ['/c/root/built_op'] },
    });

    await expect(homeMethods.resolveDebugOperatorEntry())
      .resolves
      .toEqual({
        name: 'built_op',
        path: '/c/root/built_op',
      });
  });

  it('returns the only operator of a single-operator standard-custom collection', async () => {
    writeCache(tmpRoot, {
      folders: {
        [normalizeProjectPath(tmpRoot)]: {
          opsMeet: [],
          opsList: [
            {
              name: 'only_op',
              path: '/c/root/only_op',
            },
          ],
          experimentalOpsList: [],
        },
      },
    });

    await expect(homeMethods.resolveDebugOperatorEntry())
      .resolves
      .toEqual({
        name: 'only_op',
        path: '/c/root/only_op',
      });
  });

  it('returns undefined without workspace folders', async () => {
    vscode.workspace.workspaceFolders = undefined;

    await expect(homeMethods.resolveDebugOperatorEntry())
      .resolves
      .toBeUndefined();
  });

  it('falls back to the lone project ops_list entry', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(rootProject({
      project_type: 'cann',
      ops_list: [
        {
          name: 'hello_world',
          path: '/c/root/hello_world',
        },
      ],
    }));
    (readWorkspaceProjectTypeSetting as jest.Mock).mockReturnValue('cann');

    await expect(homeMethods.resolveDebugOperatorEntry())
      .resolves
      .toEqual({
        name: 'hello_world',
        path: '/c/root/hello_world',
      });
  });

  it('defaults to the project root when the collection is not standard-custom and has no operators', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(rootProject({
      project_type: 'cann',
      project_name: 'root',
      ops_list: [],
    }));
    (readWorkspaceProjectTypeSetting as jest.Mock).mockReturnValue('cann');

    await expect(homeMethods.resolveDebugOperatorEntry())
      .resolves
      .toEqual({
        name: 'root',
        path: '/c/root',
      });
  });

  it('returns undefined when the project has no ops and the collection is standard-custom', async () => {
    writeCache(tmpRoot, {});

    await expect(homeMethods.resolveDebugOperatorEntry())
      .resolves
      .toBeUndefined();
  });
});

describe('homeMethods.resolveBuildExampleTargetFile', () => {
  it('delegates to ConfigService.readBuildExampleTargetFromWorkspace', () => {
    (ConfigService.readBuildExampleTargetFromWorkspace as jest.Mock).mockReturnValue('tests/run_example.py');

    expect(homeMethods.resolveBuildExampleTargetFile('add'))
      .toBe('tests/run_example.py');
  });
});

function consoleWarnSpy(): void {
  jest.spyOn(console, 'warn')
    .mockImplementation(() => undefined);

  if (typeof consoleWarn !== 'function') {
    return;
  }
}
