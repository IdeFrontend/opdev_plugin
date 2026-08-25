/**
 * Regression: resetCurrentProjectConfiguration clears the workspace-local
 * cache, devtool_config.json and workspace settings — and ONLY those. Legacy
 * host-global files (projects/configs/ops.json, remote config.json) are never
 * touched (read-only importer invariant), and caches of neighbouring roots stay
 * intact.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import * as vscode from 'vscode';

jest.mock('i18next', () => ({
  t: (key: string, options?: { projectName?: string }) => {
    const labels: Record<string, string> = {
      'extension.resetProjectConfigurationConfirmReset': 'Reset',
      'common.cancel': 'Cancel',
      'extension.reloadWindowAction': 'Reload Window',
      'extension.openWorkspaceFirst': 'Please open a workspace first',
      'extension.resetProjectConfigurationConfirm':
        'Reset configuration for {{projectName}}? Choosing Reset will clear configuration stored by this plugin for {{projectName}} and regenerate defaults. Your operator source code and other project files in the repository will not be changed.',
    };
    const template = labels[key] ?? key;

    return options?.projectName
      ? template.replaceAll('{{projectName}}', options.projectName)
      : template;
  },
}));

jest.mock('@plugin/domain/models/project-model', () => {
  const actual = jest.requireActual<typeof import('@plugin/domain/models/project-model')>('@plugin/domain/models/project-model');

  return {
    ...actual,
    getProjectByPath: jest.fn(),
  };
});

jest.mock('@plugin/service/config-service', () => ({
  ConfigService: {
    clearOpDevtoolsWorkspaceSettings: jest.fn()
      .mockResolvedValue(true),
    writeOpDevtoolsDottedSettings: jest.fn()
      .mockResolvedValue(true),
  },
}));

jest.mock('@plugin/core/project/project-manager', () => ({ ProjectManager: { getInstance: jest.fn() } }));

import { getProjectByPath } from '@plugin/domain/models/project-model';
import {
  getDevtoolConfigPath, getIdeConfigDir,
} from '@plugin/helpers/ide-config-dir';
import {
  CACHE_SCHEMA_VERSION,
  type WorkspaceCache,
  getCacheFilePath,
  readWorkspaceCache,
} from '@plugin/helpers/workspace-cache';
import { ProjectManager } from '@plugin/core/project/project-manager';
import { resetCurrentProjectConfiguration } from '@plugin/service/config-reset-service';
import { ConfigService } from '@plugin/service/config-service';

function writeCache(root: string, cache: Partial<WorkspaceCache>): void {
  fs.mkdirSync(path.dirname(getCacheFilePath(root)), { recursive: true });
  fs.writeFileSync(
    getCacheFilePath(root),
    `${JSON.stringify({
      schemaVersion: CACHE_SCHEMA_VERSION,
      ...cache,
    }, null, 2)}\n`,
    'utf8',
  );
}

function seedFullCache(root: string): void {
  writeCache(root, {
    project: {
      selectedOperatorPaths: ['/op/add_custom'],
      compiledOpPaths: { '/op/built_op': true },
    },
    folders: {
      '/c/root/sub': {
        opsMeet: [],
        opsList: [
          {
            name: 'sub_op',
            path: '/c/root/sub/sub_op',
          },
        ],
        experimentalOpsList: [],
      },
    },
    fileMapLists: {
      sanitizer: [
        {
          filePath: '/tmp/san.log',
          reportTime: 1,
        },
      ],
      simulate: [],
      on_board: [],
    },
    sanitizerPythonTarget: { triton_op: 'python3 /op/triton.py' },
  });
}

describe('resetCurrentProjectConfiguration (settings + cache + devtool_config only)', () => {
  let tmpRoot: string;
  let legacyDataDir: string;
  let neighbourRoot: string;
  const previousWorkspaceFolder = process.env.WORKSPACE_FOLDER;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'op-devtools-reset-clean-'));
    legacyDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'op-devtools-reset-legacy-'));
    neighbourRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'op-devtools-reset-neighbour-'));

    seedFullCache(tmpRoot);

    fs.mkdirSync(getIdeConfigDir(tmpRoot), { recursive: true });
    fs.writeFileSync(
      getDevtoolConfigPath(tmpRoot),
      `${JSON.stringify({ type: '1' }, null, 2)}\n`,
      'utf8',
    );
    fs.writeFileSync(
      path.join(getIdeConfigDir(tmpRoot), 'settings.json'),
      `${JSON.stringify({
        'op-devtools.projectType': 'ascend',
        'op-devtools.compileAndDeploy.buildConfig.buildScript': 'bash build.sh',
      }, null, 2)}\n`,
      'utf8',
    );

    // Neighbour root keeps its own cache.
    seedFullCache(neighbourRoot);

    // Host-global files under $WORKSPACE_FOLDER (getLegacyUserDataDir).
    process.env.WORKSPACE_FOLDER = legacyDataDir;
    fs.mkdirSync(path.join(legacyDataDir, 'data'), { recursive: true });
    fs.writeFileSync(path.join(legacyDataDir, 'data', 'projects.json'), '{"lastId":1,"projects":[]}\n', 'utf8');
    fs.writeFileSync(path.join(legacyDataDir, 'data', 'configs.json'), '{"lastId":1,"configs":[]}\n', 'utf8');
    fs.writeFileSync(path.join(legacyDataDir, 'data', 'ops.json'), '{"lastId":1,"ops":[]}\n', 'utf8');

    vscode.workspace.workspaceFolders = [{ uri: { fsPath: tmpRoot } } as vscode.WorkspaceFolder];
    jest.clearAllMocks();
    (ProjectManager.getInstance as jest.Mock).mockReturnValue({ projectPath: tmpRoot });
    (getProjectByPath as jest.Mock).mockReturnValue({
      id: 7,
      project_name: 'myop',
      project_path: tmpRoot,
    });
    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Reset');
  });

  afterEach(() => {
    if (previousWorkspaceFolder === undefined) {
      delete process.env.WORKSPACE_FOLDER;
    }
    else {
      process.env.WORKSPACE_FOLDER = previousWorkspaceFolder;
    }

    for (const root of [
      tmpRoot,
      legacyDataDir,
      neighbourRoot,
    ]) {
      fs.rmSync(root, {
        recursive: true,
        force: true,
      });
    }
  });

  it('re-stamps the import marker after clearing settings so the next activation does not re-import', async () => {
    // Reset wipes EVERY op-devtools.* key, including the internal.settingsVersion
    // import marker. The marker must be written BACK (current plugin version)
    // after the clear — otherwise the import re-seeds the exact configuration
    // the user just erased (the source stores stay on disk forever).
    (globalThis as unknown as { extensionContext?: { extension?: { packageJSON?: { version?: string } } } })
      .extensionContext = { extension: { packageJSON: { version: '9.9.9' } } } as never;

    await resetCurrentProjectConfiguration();

    const clearMock = ConfigService.clearOpDevtoolsWorkspaceSettings as jest.Mock;
    const writeMock = ConfigService.writeOpDevtoolsDottedSettings as jest.Mock;

    expect(clearMock)
      .toHaveBeenCalledWith(tmpRoot);
    expect(writeMock)
      .toHaveBeenCalledWith({ 'internal.settingsVersion': '9.9.9' }, tmpRoot);
    // The marker write must come AFTER the clear (a later clear would wipe it).
    const clearOrder = clearMock.mock.invocationCallOrder[0];
    const writeOrder = writeMock.mock.invocationCallOrder[0];

    expect(writeOrder)
      .toBeGreaterThan(clearOrder);

    delete (globalThis as unknown as { extensionContext?: unknown }).extensionContext;
  });

  it('clears the cache, devtool_config.json and settings; stored files and neighbouring roots stay intact', async () => {
    const legacyFiles = [
      path.join(legacyDataDir, 'data', 'projects.json'),
      path.join(legacyDataDir, 'data', 'configs.json'),
      path.join(legacyDataDir, 'data', 'ops.json'),
    ];
    const legacyBefore = legacyFiles.map((fp) => fs.readFileSync(fp, 'utf8'));
    const neighbourBefore = fs.readFileSync(getCacheFilePath(neighbourRoot), 'utf8');

    await resetCurrentProjectConfiguration();

    // The writer always writes — cache.json exists but is stripped.
    expect(fs.existsSync(getCacheFilePath(tmpRoot)))
      .toBe(true);
    expect(readWorkspaceCache(tmpRoot))
      .toEqual({ schemaVersion: CACHE_SCHEMA_VERSION });

    expect(fs.existsSync(getDevtoolConfigPath(tmpRoot)))
      .toBe(false);
    expect(ConfigService.clearOpDevtoolsWorkspaceSettings)
      .toHaveBeenCalledWith(tmpRoot);

    // Legacy host-global files are read-only for the importer — untouched.
    legacyFiles.forEach((fp, i) => {
      expect(fs.readFileSync(fp, 'utf8'))
        .toBe(legacyBefore[i]);
    });

    // Neighbour root cache is untouched.
    expect(fs.readFileSync(getCacheFilePath(neighbourRoot), 'utf8'))
      .toBe(neighbourBefore);

    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith('workbench.action.reloadWindow');
  });

  it('clears both roots when the project path differs from the workspace folder', async () => {
    const projectPath = path.join(tmpRoot, 'my-operator');

    seedFullCache(projectPath);
    fs.mkdirSync(getIdeConfigDir(projectPath), { recursive: true });
    fs.writeFileSync(
      getDevtoolConfigPath(projectPath),
      `${JSON.stringify({ type: '1' }, null, 2)}\n`,
      'utf8',
    );
    fs.rmSync(getDevtoolConfigPath(tmpRoot), { force: true });

    (ProjectManager.getInstance as jest.Mock).mockReturnValue({ projectPath });
    (getProjectByPath as jest.Mock).mockImplementation((lookupPath: string) => {
      if (lookupPath === projectPath) {
        return {
          id: 7,
          project_name: 'my-operator',
          project_path: projectPath,
        };
      }

      return undefined;
    });

    await resetCurrentProjectConfiguration();

    expect(readWorkspaceCache(tmpRoot))
      .toEqual({ schemaVersion: CACHE_SCHEMA_VERSION });
    expect(readWorkspaceCache(projectPath))
      .toEqual({ schemaVersion: CACHE_SCHEMA_VERSION });
    expect(fs.existsSync(getDevtoolConfigPath(projectPath)))
      .toBe(false);
    expect(ConfigService.clearOpDevtoolsWorkspaceSettings)
      .toHaveBeenCalledWith(projectPath);
    expect(ConfigService.clearOpDevtoolsWorkspaceSettings)
      .toHaveBeenCalledWith(tmpRoot);
    expect(vscode.window.showWarningMessage)
      .toHaveBeenCalledWith(
        'Reset configuration for my-operator? Choosing Reset will clear configuration stored by this plugin for my-operator and regenerate defaults. Your operator source code and other project files in the repository will not be changed.',
        { modal: true },
        'Reset',
      );
  });

  it('does nothing when confirmation is cancelled', async () => {
    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);
    const cacheBefore = fs.readFileSync(getCacheFilePath(tmpRoot), 'utf8');

    await resetCurrentProjectConfiguration();

    expect(fs.readFileSync(getCacheFilePath(tmpRoot), 'utf8'))
      .toBe(cacheBefore);
    expect(fs.existsSync(getDevtoolConfigPath(tmpRoot)))
      .toBe(true);
    expect(ConfigService.clearOpDevtoolsWorkspaceSettings)
      .not.toHaveBeenCalled();
    expect(vscode.commands.executeCommand)
      .not.toHaveBeenCalled();
  });
});
