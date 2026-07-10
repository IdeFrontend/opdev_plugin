import * as fs from 'fs-extra';
import * as path from 'path';
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

  const info = ProjectManager.getInstance()
    .getProjectInfo();

  if (info.path) {
    return getProjectByPath(info.path);
  }

  return undefined;
}

function getResetRoots(workspaceRoot: string, effectiveRoot: string): string[] {
  if (projectPathsEqual(workspaceRoot, effectiveRoot)) {
    return [effectiveRoot];
  }

  return [
    effectiveRoot,
    workspaceRoot,
  ];
}

export async function resetCurrentProjectConfiguration(): Promise<void> {
  const workspaceRoot = resolveWorkspaceRoot(undefined, 'workspaceFolderFirst');

  if (!workspaceRoot) {
    await vscode.window.showErrorMessage(t('extension.openWorkspaceFirst'));

    return;
  }

  const project = resolveProjectForWorkspace(workspaceRoot);
  const effectiveRoot = project?.project_path ?? workspaceRoot;
  const resetRoots = getResetRoots(workspaceRoot, effectiveRoot);

  const projectName = project?.project_name || path.basename(effectiveRoot);
  const resetLabel = t('extension.resetProjectConfigurationConfirmReset');
  const choice = await vscode.window.showWarningMessage(
    t('extension.resetProjectConfigurationConfirm', { projectName }),
    { modal: true },
    resetLabel,
  );

  if (choice !== resetLabel) {
    return;
  }

  if (project) {
    for (const root of resetRoots) {
      deleteLegacyWorkspaceConfigsByProjectId(project.id, root);
    }

    deleteConfigsByProjectId(project.id);
    deleteOpsByProjectId(project.id);
    deleteProject(project.project_path);
  }

  for (const root of resetRoots) {
    const devtoolConfigPath = getDevtoolConfigPath(root);

    if (fs.existsSync(devtoolConfigPath)) {
      await fs.remove(devtoolConfigPath);
    }
  }

  const lastProjectPath = RemoteConfig.getLastProjectPath();

  if (lastProjectPath && resetRoots.some((root) => projectPathsEqual(lastProjectPath, root))) {
    RemoteConfig.clearLastProjectPath();
  }

  for (const root of resetRoots) {
    await ConfigService.clearOpDevtoolsWorkspaceSettings(root);
  }

  resetLegacySettingsMigrationFlight();

  await vscode.commands.executeCommand('workbench.action.reloadWindow');
}
