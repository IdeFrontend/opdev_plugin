import * as fs from 'fs-extra';
import * as path from 'path';
import { t } from 'i18next';
import * as vscode from 'vscode';

import { ProjectManager } from '@plugin/core/project/project-manager';
import {
  getProjectByPath,
  projectPathsEqual,
  type ProjectRecord,
} from '@plugin/domain/models/project-model';
import { getDevtoolConfigPath } from '@plugin/helpers/ide-config-dir';
import { resolveWorkspaceRoot } from '@plugin/helpers/resolve-workspace-root';
import { updateWorkspaceCache } from '@plugin/helpers/workspace-cache';
import { SETTINGS_VERSION_KEY } from '@plugin/helpers/legacy-state-importer';
import { ConfigService } from '@plugin/service/config-service';

function resolveProjectForWorkspace(workspaceRoot: string): ProjectRecord | undefined {
  const direct = getProjectByPath(workspaceRoot);

  if (direct) {
    return direct;
  }

  const projectPath = ProjectManager.getInstance()
    .projectPath;

  if (projectPath) {
    return getProjectByPath(projectPath);
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

  // Clear the per-workspace cache (project record, scan state, runtime state)
  // for every reset root. Source store files are untouched (read-only import
  // invariant).
  for (const root of resetRoots) {
    await updateWorkspaceCache(root, (cache) => {
      cache.project = undefined;
      cache.folders = undefined;
      cache.fileMapLists = undefined;
      cache.sanitizerPythonTarget = undefined;
    });
  }

  for (const root of resetRoots) {
    const devtoolConfigPath = getDevtoolConfigPath(root);

    if (fs.existsSync(devtoolConfigPath)) {
      await fs.remove(devtoolConfigPath);
    }
  }

  for (const root of resetRoots) {
    await ConfigService.clearOpDevtoolsWorkspaceSettings(root);
  }

  // The reset wipes the re-import marker along with the settings — re-stamp it
  // with the current plugin version so the import sees a COMPLETED marker on
  // the next activation and does not re-seed the configuration the user just
  // erased (the source stores stay on disk forever by design).
  const pluginVersion = (globalThis as unknown as {
    extensionContext?: { extension?: { packageJSON?: { version?: string } } }
  }).extensionContext?.extension?.packageJSON?.version ?? '0.0.0';

  for (const root of resetRoots) {
    await ConfigService.writeOpDevtoolsDottedSettings({ [SETTINGS_VERSION_KEY]: pluginVersion }, root);
  }

  await vscode.commands.executeCommand('workbench.action.reloadWindow');
}
