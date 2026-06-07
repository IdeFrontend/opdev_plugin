import * as fs from 'fs-extra';
import { t } from 'i18next';
import * as vscode from 'vscode';

import { ProjectManager } from '@plugin/core/project/project-manager';
import {
  deleteConfigsByProjectId,
  deleteLegacyWorkspaceConfigsByProjectId,
} from '@plugin/domain/models/config-model';
import { deleteOpsByProjectId } from '@plugin/domain/models/model';
import {
  deleteProject,
  getProjectByPath,
  projectPathsEqual,
  type ProjectRecord,
} from '@plugin/domain/models/project-model';
import { getDevtoolConfigPath } from '@plugin/helpers/ide-config-dir';
import { promptReloadWindow } from '@plugin/helpers/reload-window-prompt';
import { resolveWorkspaceRoot } from '@plugin/helpers/resolve-workspace-root';
import { RemoteConfig } from '@plugin/helpers/remote-config';
import {
  ConfigService,
  resetLegacySettingsMigrationFlight,
} from '@plugin/service/config-service';

function resolveProjectForWorkspace(workspaceRoot: string): ProjectRecord | undefined {
  const direct = getProjectByPath(workspaceRoot);
  if (direct) {
    return direct;
  }

  const info = ProjectManager.getInstance().getProjectInfo();
  if (info.path) {
    return getProjectByPath(info.path);
  }

  return undefined;
}

export async function resetCurrentProjectConfiguration(): Promise<void> {
  const workspaceRoot = resolveWorkspaceRoot(undefined, 'workspaceFolderFirst');
  if (!workspaceRoot) {
    await vscode.window.showErrorMessage(t('extension.openWorkspaceFirst'));
    return;
  }

  const project = resolveProjectForWorkspace(workspaceRoot);
  const effectiveRoot = project?.project_path ?? workspaceRoot;

  const resetLabel = t('extension.resetProjectConfigurationConfirmReset');
  const cancelLabel = t('common.cancel');
  const choice = await vscode.window.showWarningMessage(
    t('extension.resetProjectConfigurationConfirm', { path: effectiveRoot }),
    { modal: true },
    resetLabel,
    cancelLabel,
  );

  if (choice !== resetLabel) {
    return;
  }

  if (project) {
    deleteLegacyWorkspaceConfigsByProjectId(project.id, effectiveRoot);
    deleteConfigsByProjectId(project.id);
    deleteOpsByProjectId(project.id);
    deleteProject(project.project_path);
  }

  const devtoolConfigPath = getDevtoolConfigPath(effectiveRoot);
  if (fs.existsSync(devtoolConfigPath)) {
    await fs.remove(devtoolConfigPath);
  }

  const lastProjectPath = RemoteConfig.getLastProjectPath();
  if (lastProjectPath && projectPathsEqual(lastProjectPath, effectiveRoot)) {
    RemoteConfig.clearLastProjectPath();
  }

  await ConfigService.clearOpDevtoolsWorkspaceSettings(effectiveRoot);
  resetLegacySettingsMigrationFlight();

  await promptReloadWindow(t('extension.resetProjectConfigurationReload'));
}
