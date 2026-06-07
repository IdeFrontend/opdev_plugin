import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import * as vscode from 'vscode';

jest.mock('i18next', () => ({
  t: (key: string, options?: { path?: string }) => {
    const labels: Record<string, string> = {
      'extension.resetProjectConfigurationConfirmReset': 'Reset',
      'common.cancel': 'Cancel',
      'extension.reloadWindowAction': 'Reload Window',
      'extension.openWorkspaceFirst': 'Please open a workspace first',
      'extension.resetProjectConfigurationConfirm': 'Reset project configuration for {{path}}?',
      'extension.resetProjectConfigurationReload': 'Reload to regenerate defaults.',
    };
    const template = labels[key] ?? key;
    return options?.path
      ? template.replace('{{path}}', options.path)
      : template;
  },
}));

jest.mock('@plugin/domain/models/model', () => ({
  deleteOpsByProjectId: jest.fn(),
}));

jest.mock('@plugin/domain/models/config-model', () => ({
  deleteConfigsByProjectId: jest.fn(),
  deleteLegacyWorkspaceConfigsByProjectId: jest.fn(),
}));

jest.mock('@plugin/domain/models/project-model', () => {
  const actual = jest.requireActual<typeof import('@plugin/domain/models/project-model')>(
    '@plugin/domain/models/project-model',
  );
  return {
    ...actual,
    deleteProject: jest.fn(),
    getProjectByPath: jest.fn(),
  };
});

jest.mock('@plugin/helpers/remote-config', () => ({
  RemoteConfig: {
    getLastProjectPath: jest.fn(),
    clearLastProjectPath: jest.fn(),
  },
}));

jest.mock('@plugin/service/config-service', () => ({
  ConfigService: {
    clearOpDevtoolsWorkspaceSettings: jest.fn().mockResolvedValue(true),
  },
  resetLegacySettingsMigrationFlight: jest.fn(),
}));

jest.mock('@plugin/core/project/project-manager', () => ({
  ProjectManager: {
    getInstance: jest.fn(),
  },
}));

import { deleteOpsByProjectId } from '@plugin/domain/models/model';
import {
  deleteConfigsByProjectId,
  deleteLegacyWorkspaceConfigsByProjectId,
} from '@plugin/domain/models/config-model';
import {
  deleteProject,
  getProjectByPath,
} from '@plugin/domain/models/project-model';
import { getDevtoolConfigPath, getIdeConfigDir } from '@plugin/helpers/ide-config-dir';
import { RemoteConfig } from '@plugin/helpers/remote-config';
import {
  ConfigService,
  resetLegacySettingsMigrationFlight,
} from '@plugin/service/config-service';
import { ProjectManager } from '@plugin/core/project/project-manager';
import { resetCurrentProjectConfiguration } from '@plugin/service/config-reset-service';

describe('resetCurrentProjectConfiguration', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'op-devtools-reset-'));
    fs.mkdirSync(getIdeConfigDir(tmpRoot), { recursive: true });
    fs.writeFileSync(
      getDevtoolConfigPath(tmpRoot),
      `${JSON.stringify({ type: '1' }, null, 2)}\n`,
      'utf8',
    );
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: tmpRoot } } as vscode.WorkspaceFolder];
    jest.clearAllMocks();
    (ProjectManager.getInstance as jest.Mock).mockReturnValue({
      getProjectInfo: () => ({ path: tmpRoot }),
    });
    (getProjectByPath as jest.Mock).mockReturnValue({
      id: 7,
      project_path: tmpRoot,
    });
    (RemoteConfig.getLastProjectPath as jest.Mock).mockReturnValue(tmpRoot);
    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Reset');
    (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  it('clears current project data, devtool_config.json, and workspace settings after confirmation', async () => {
    await resetCurrentProjectConfiguration();

    expect(deleteLegacyWorkspaceConfigsByProjectId).toHaveBeenCalledWith(7, tmpRoot);
    expect(deleteConfigsByProjectId).toHaveBeenCalledWith(7);
    expect(deleteOpsByProjectId).toHaveBeenCalledWith(7);
    expect(deleteProject).toHaveBeenCalledWith(tmpRoot);
    expect(fs.existsSync(getDevtoolConfigPath(tmpRoot))).toBe(false);
    expect(RemoteConfig.clearLastProjectPath).toHaveBeenCalled();
    expect(ConfigService.clearOpDevtoolsWorkspaceSettings).toHaveBeenCalledWith(tmpRoot);
    expect(resetLegacySettingsMigrationFlight).toHaveBeenCalled();
  });

  it('clears filesystem artifacts under project path when it differs from workspace folder', async () => {
    const projectPath = path.join(tmpRoot, 'my-operator');
    fs.mkdirSync(getIdeConfigDir(projectPath), { recursive: true });
    fs.writeFileSync(
      getDevtoolConfigPath(projectPath),
      `${JSON.stringify({ type: '1' }, null, 2)}\n`,
      'utf8',
    );
    fs.rmSync(getDevtoolConfigPath(tmpRoot), { force: true });

    (ProjectManager.getInstance as jest.Mock).mockReturnValue({
      getProjectInfo: () => ({ path: projectPath }),
    });
    (getProjectByPath as jest.Mock).mockImplementation((lookupPath: string) => {
      if (lookupPath === projectPath) {
        return { id: 7, project_path: projectPath };
      }
      return undefined;
    });
    (RemoteConfig.getLastProjectPath as jest.Mock).mockReturnValue(projectPath);

    await resetCurrentProjectConfiguration();

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      `Reset project configuration for ${projectPath}?`,
      { modal: true },
      'Reset',
      'Cancel',
    );
    expect(deleteLegacyWorkspaceConfigsByProjectId).toHaveBeenCalledWith(7, projectPath);
    expect(deleteProject).toHaveBeenCalledWith(projectPath);
    expect(fs.existsSync(getDevtoolConfigPath(projectPath))).toBe(false);
    expect(fs.existsSync(getDevtoolConfigPath(tmpRoot))).toBe(false);
    expect(ConfigService.clearOpDevtoolsWorkspaceSettings).toHaveBeenCalledWith(projectPath);
    expect(RemoteConfig.clearLastProjectPath).toHaveBeenCalled();
  });

  it('does nothing when confirmation is cancelled', async () => {
    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Cancel');

    await resetCurrentProjectConfiguration();

    expect(deleteConfigsByProjectId).not.toHaveBeenCalled();
    expect(deleteOpsByProjectId).not.toHaveBeenCalled();
    expect(ConfigService.clearOpDevtoolsWorkspaceSettings).not.toHaveBeenCalled();
    expect(fs.existsSync(getDevtoolConfigPath(tmpRoot))).toBe(true);
  });

  it('reloads the window when the user chooses Reload Window', async () => {
    (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Reload Window');

    await resetCurrentProjectConfiguration();

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.action.reloadWindow');
  });

  it('still clears workspace artifacts when no project record exists', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(undefined);

    await resetCurrentProjectConfiguration();

    expect(deleteConfigsByProjectId).not.toHaveBeenCalled();
    expect(deleteOpsByProjectId).not.toHaveBeenCalled();
    expect(deleteProject).not.toHaveBeenCalled();
    expect(fs.existsSync(getDevtoolConfigPath(tmpRoot))).toBe(false);
    expect(ConfigService.clearOpDevtoolsWorkspaceSettings).toHaveBeenCalledWith(tmpRoot);
  });
});
