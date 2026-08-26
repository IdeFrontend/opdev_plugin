jest.mock('@plugin/helpers/operator-project-workspace-config', () => ({
  ENVIRONMENT_SCRIPT_SETTING: 'environment.environmentScript',
  getConfiguredEnvironmentScriptPath: jest.fn(),
  readWorkspaceProjectTypeSetting: jest.fn(),
}));
jest.mock('@plugin/helpers/workspace-cache', () => ({
  readWorkspaceCache: jest.fn(),
  updateWorkspaceCache: jest.fn(),
}));
jest.mock('@plugin/service/config-service', () => ({ ConfigService: { writeOpDevtoolsDottedSettings: jest.fn() } }));
jest.mock('@plugin/domain/plugins/detection-utils', () => ({
  hasAscFiles: jest.fn(),
  hasPyFilesInRoot: jest.fn(),
  hasPyFilesRecursive: jest.fn(),
  hasTritonPythonIndicatorsInRoot: jest.fn(),
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  createProject,
  getProjectByPath,
  normalizeProjectPath,
  projectPathsEqual,
  updateShScript,
} from '@plugin/domain/models/project-model';
import { OperatorProjectType } from '@plugin/domain/models/operator-project-type';
import {
  getConfiguredEnvironmentScriptPath,
  readWorkspaceProjectTypeSetting,
} from '@plugin/helpers/operator-project-workspace-config';
import {
  readWorkspaceCache,
  updateWorkspaceCache,
} from '@plugin/helpers/workspace-cache';
import { ConfigService } from '@plugin/service/config-service';
import {
  hasAscFiles,
  hasPyFilesInRoot,
  hasPyFilesRecursive,
  hasTritonPythonIndicatorsInRoot,
} from '@plugin/domain/plugins/detection-utils';

const writeOpDevtoolsDottedSettings = ConfigService.writeOpDevtoolsDottedSettings as jest.Mock;
const readWorkspaceProjectTypeSettingMock = readWorkspaceProjectTypeSetting as jest.Mock;
const getConfiguredEnvironmentScriptPathMock = getConfiguredEnvironmentScriptPath as jest.Mock;
const readWorkspaceCacheMock = readWorkspaceCache as jest.Mock;
const updateWorkspaceCacheMock = updateWorkspaceCache as jest.Mock;
const hasAscFilesMock = hasAscFiles as jest.Mock;
const hasPyFilesInRootMock = hasPyFilesInRoot as jest.Mock;
const hasPyFilesRecursiveMock = hasPyFilesRecursive as jest.Mock;
const hasTritonPythonIndicatorsInRootMock = hasTritonPythonIndicatorsInRoot as jest.Mock;

describe('normalizeProjectPath', () => {
  it('normalizes separators, case, and trailing separators', () => {
    expect(normalizeProjectPath('C:\\Repo\\Project\\'))
      .toBe('c:/repo/project');
    expect(normalizeProjectPath('C:\\Repo\\Project\\\\'))
      .toBe('c:/repo/project');
  });

  it('keeps a bare root path without stripping', () => {
    expect(normalizeProjectPath('C:\\'))
      .toBe('c:/');
  });

  it('normalizes forward-slash paths', () => {
    expect(normalizeProjectPath('/home/user/Op'))
      .toBe('/home/user/op');
  });
});

describe('projectPathsEqual', () => {
  it('compares case- and separator-insensitively', () => {
    expect(projectPathsEqual('C:\\Repo\\Op', 'c:/repo/op'))
      .toBe(true);
    expect(projectPathsEqual('C:\\Repo\\Op', 'C:\\Repo\\Other'))
      .toBe(false);
  });
});

describe('createProject', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('persists project_type into dotted settings when provided', async () => {
    await createProject({
      project_name: 'op',
      project_path: '/ws/op',
      project_type: 'cann',
    });

    expect(writeOpDevtoolsDottedSettings)
      .toHaveBeenCalledWith(
        { projectType: 'cann' },
        '/ws/op',
      );
    expect(updateWorkspaceCacheMock)
      .not.toHaveBeenCalled();
  });

  it('does not write settings when project_type is absent', async () => {
    await createProject({
      project_name: 'op',
      project_path: '/ws/op',
    });

    expect(writeOpDevtoolsDottedSettings)
      .not.toHaveBeenCalled();
  });

  it('re-keys selected operator ids into paths in the workspace cache', async () => {
    const normalized = normalizeProjectPath('/ws/op');

    readWorkspaceCacheMock.mockReturnValue({
      schemaVersion: 1,
      folders: {
        [normalized]: {
          opsMeet: [],
          opsList: [
            {
              name: 'add',
              path: '/ws/op/ops/add',
            },
            {
              name: 'sub',
              path: '/ws/op/ops/sub',
            },
          ],
          experimentalOpsList: [
            {
              name: 'exp',
              path: '/ws/op/ops/exp',
            },
          ],
        },
      },
    });

    let mutated: unknown;

    updateWorkspaceCacheMock.mockImplementation(async (_root: string, mutate: (c: unknown)=> void) => {
      const next = {
        schemaVersion: 1,
        project: { selectedOperatorPaths: [] },
      };

      mutate(next);

      mutated = next;

      return true;
    });

    await createProject({
      project_name: 'op',
      project_path: '/ws/op',
      selected_operator_ids: [
        0,
        1000,
        1001,
        2,
        99999,
      ],
    });

    expect(mutated)
      .toEqual({
        schemaVersion: 1,
        project: {
          selectedOperatorPaths: [
            '/ws/op/ops/add',
            '/ws/op/ops/exp',
          ],
        },
      });
  });

  it('skips ids without a matching operator and wraps through id % 10000', async () => {
    readWorkspaceCacheMock.mockReturnValue({
      schemaVersion: 1,
      folders: {
        [normalizeProjectPath('/ws/op')]: {
          opsMeet: [],
          opsList: [
            {
              name: 'add',
              path: '/ws/op/ops/add',
            },
          ],
          experimentalOpsList: [],
        },
      },
    });

    let paths: string[] = [];

    updateWorkspaceCacheMock.mockImplementation(async (_root: string, mutate: (c: { project: { selectedOperatorPaths: string[] } })=> void) => {
      const next = { project: { selectedOperatorPaths: [] } };

      mutate(next);

      paths = next.project.selectedOperatorPaths;

      return true;
    });

    await createProject({
      project_name: 'op',
      project_path: '/ws/op',
      selected_operator_ids: [
        10000,
        5,
      ],
    });

    expect(paths)
      .toEqual(['/ws/op/ops/add']);
  });

  it('does not touch the cache when no operator ids are selected', async () => {
    await createProject({
      project_name: 'op',
      project_path: '/ws/op',
    });

    expect(readWorkspaceCacheMock)
      .not.toHaveBeenCalled();
    expect(updateWorkspaceCacheMock)
      .not.toHaveBeenCalled();
  });

  it('records an empty selection when the folder is not cached', async () => {
    readWorkspaceCacheMock.mockReturnValue({
      schemaVersion: 1,
      folders: {},
    });

    let paths: string[] | undefined;

    updateWorkspaceCacheMock.mockImplementation(async (_root: string, mutate: (c: { project: { selectedOperatorPaths: string[] } })=> void) => {
      const next = { schemaVersion: 1 };

      mutate(next as { project: { selectedOperatorPaths: string[] } });

      paths = (next as { project?: { selectedOperatorPaths: string[] } }).project?.selectedOperatorPaths;

      return true;
    });

    await createProject({
      project_name: 'op',
      project_path: '/ws/op',
      selected_operator_ids: [
        0,
        1000,
      ],
    });

    expect(paths)
      .toEqual([]);
  });
});

describe('updateShScript', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('writes the ascend env script into workspace settings', async () => {
    await updateShScript({
      project_name: 'op',
      project_path: '/ws/op',
      ascend_env_script: '/opt/ascend/set_env.sh',
    });

    expect(writeOpDevtoolsDottedSettings)
      .toHaveBeenCalledWith(
        { 'environment.environmentScript': '/opt/ascend/set_env.sh' },
        '/ws/op',
      );
  });

  it('clears the stored script when null is passed', async () => {
    await updateShScript({
      project_name: 'op',
      project_path: '/ws/op',
      ascend_env_script: null,
    });

    expect(writeOpDevtoolsDottedSettings)
      .toHaveBeenCalledWith(
        { 'environment.environmentScript': undefined },
        '/ws/op',
      );
  });

  it('leaves the setting untouched when the field is absent', async () => {
    await updateShScript({
      project_name: 'op',
      project_path: '/ws/op',
    });

    expect(writeOpDevtoolsDottedSettings)
      .not.toHaveBeenCalled();
  });
});

describe('detectProjectTypeSync (via getProjectByPath)', () => {
  let root: string;

  beforeEach(() => {
    jest.resetAllMocks();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-model-'));
    readWorkspaceProjectTypeSettingMock.mockReturnValue('unknown-type');
    getConfiguredEnvironmentScriptPathMock.mockReturnValue(undefined);
    readWorkspaceCacheMock.mockReturnValue({ schemaVersion: 1 });
    hasPyFilesInRootMock.mockReturnValue(false);
    hasTritonPythonIndicatorsInRootMock.mockReturnValue(false);
    hasPyFilesRecursiveMock.mockReturnValue(false);
    hasAscFilesMock.mockReturnValue(false);
  });

  afterEach(() => {
    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
  });

  it('detects torch-library from CMakeLists.txt plus py files in root', () => {
    fs.writeFileSync(path.join(root, 'CMakeLists.txt'), 'cmake');
    hasPyFilesInRootMock.mockReturnValue(true);

    expect(getProjectByPath(root)?.project_type)
      .toBe(OperatorProjectType.TORCH_LIBRARY);
  });

  it('detects triton from triton markers', () => {
    hasTritonPythonIndicatorsInRootMock.mockReturnValue(true);

    expect(getProjectByPath(root)?.project_type)
      .toBe(OperatorProjectType.TRITON);
  });

  it('detects pyasc from recursive py files without cmake', () => {
    hasPyFilesRecursiveMock.mockReturnValue(true);

    expect(getProjectByPath(root)?.project_type)
      .toBe(OperatorProjectType.PYASC);
    expect(hasPyFilesRecursiveMock)
      .toHaveBeenCalledWith(root, 2);
  });

  it('detects ascend-c from cmake plus asc files without py files', () => {
    fs.writeFileSync(path.join(root, 'CMakeLists.txt'), 'cmake');
    hasAscFilesMock.mockReturnValue(true);

    expect(getProjectByPath(root)?.project_type)
      .toBe(OperatorProjectType.ASCEND_C);
  });

  it('resolves to null when no structure is distinctive', () => {
    expect(getProjectByPath(root)?.project_type)
      .toBeNull();
  });

  it('does not map unknown types to standard-custom', () => {
    expect(getProjectByPath(root)?.project_type)
      .not.toBe(OperatorProjectType.STANDARD_CUSTOM);
  });
});

describe('getProjectByPath', () => {
  let root: string;

  beforeEach(() => {
    jest.resetAllMocks();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-model-'));
    readWorkspaceProjectTypeSettingMock.mockReturnValue(undefined);
    getConfiguredEnvironmentScriptPathMock.mockReturnValue(undefined);
    readWorkspaceCacheMock.mockReturnValue({ schemaVersion: 1 });
    hasPyFilesInRootMock.mockReturnValue(false);
    hasTritonPythonIndicatorsInRootMock.mockReturnValue(false);
    hasPyFilesRecursiveMock.mockReturnValue(false);
    hasAscFilesMock.mockReturnValue(false);
  });

  afterEach(() => {
    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
  });

  it('returns undefined for an empty or non-string path', () => {
    const warn = jest.spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    try {
      expect(getProjectByPath(''))
        .toBeUndefined();
      expect(getProjectByPath(42 as unknown as string))
        .toBeUndefined();
      expect(warn)
        .toHaveBeenCalledTimes(2);
    }
    finally {
      warn.mockRestore();
    }
  });

  it('returns undefined when no marker exists', () => {
    expect(getProjectByPath(root))
      .toBeUndefined();
  });

  it('recognizes a project through the devtool_config.json marker', () => {
    fs.mkdirSync(path.join(root, '.vscode'));
    fs.writeFileSync(path.join(root, '.vscode', 'devtool_config.json'), '{}');

    expect(getProjectByPath(root))
      .toBeDefined();
  });

  it('uses a recognized settings project_type verbatim', () => {
    readWorkspaceProjectTypeSettingMock.mockReturnValue('cann');

    expect(getProjectByPath(root)?.project_type)
      .toBe('cann');
  });

  it('uses a recognized triton setting verbatim', () => {
    readWorkspaceProjectTypeSettingMock.mockReturnValue('triton');

    expect(getProjectByPath(root)?.project_type)
      .toBe('triton');
  });

  it('builds the record with name, path, env script, and template name', () => {
    readWorkspaceProjectTypeSettingMock.mockReturnValue('cann');
    getConfiguredEnvironmentScriptPathMock.mockReturnValue('/opt/ascend/set_env.sh');

    const record = getProjectByPath(root);

    expect(record)
      .toEqual({
        project_name: path.basename(root),
        project_path: root,
        project_type: 'cann',
        ascend_env_script: '/opt/ascend/set_env.sh',
        template_name: '',
      });
  });

  it('records torch_library_template for torch-library projects', () => {
    readWorkspaceProjectTypeSettingMock.mockReturnValue(OperatorProjectType.TORCH_LIBRARY);

    expect(getProjectByPath(root)?.template_name)
      .toBe('torch_library_template');
  });

  it('uses null for the env script when the workspace setting is absent', () => {
    readWorkspaceProjectTypeSettingMock.mockReturnValue('cann');

    expect(getProjectByPath(root)?.ascend_env_script)
      .toBeNull();
  });

  it('falls back to structural detection for unknown settings values', () => {
    readWorkspaceProjectTypeSettingMock.mockReturnValue('mystery-type');
    hasTritonPythonIndicatorsInRootMock.mockReturnValue(true);

    expect(getProjectByPath(root)?.project_type)
      .toBe(OperatorProjectType.TRITON);
  });

  it('recognizes a scanned cache folder marker', () => {
    readWorkspaceCacheMock.mockReturnValue({
      schemaVersion: 1,
      folders: {
        [normalizeProjectPath(root)]: {
          opsMeet: [],
          opsList: [],
          experimentalOpsList: [],
        },
      },
    });

    expect(getProjectByPath(root)?.project_type)
      .toBeNull();
  });

  it('matches cache folder keys case-insensitively', () => {
    readWorkspaceCacheMock.mockReturnValue({
      schemaVersion: 1,
      folders: {
        [normalizeProjectPath(root)
          .toUpperCase()]: {
          opsMeet: [],
          opsList: [],
          experimentalOpsList: [],
        },
      },
    });

    expect(getProjectByPath(root)?.project_type)
      .toBeNull();
  });

  it('returns undefined when only the cache has no matching folder', () => {
    readWorkspaceCacheMock.mockReturnValue({
      schemaVersion: 1,
      folders: {},
    });

    expect(getProjectByPath(root))
      .toBeUndefined();
  });
});
