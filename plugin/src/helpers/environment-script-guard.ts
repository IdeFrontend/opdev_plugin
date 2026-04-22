import * as fs from 'fs';
import * as vscode from 'vscode';
import { t } from 'i18next';

import { getEnvironmentScriptPathFromWorkspace } from '@plugin/helpers/operator-project-workspace-config';
import { projectService } from '@plugin/service/project-service';

const CONFIG_SECTION = 'op-devtools';
const CONFIG_KEY = 'environment.environmentScript';

function getOpDevtoolsConfiguration(): vscode.WorkspaceConfiguration {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return vscode.workspace.getConfiguration(CONFIG_SECTION, folder?.uri);
}

export function getEnvironmentScriptPath(): string {
  return getEnvironmentScriptPathFromWorkspace();
}

export function isEnvironmentScriptPathValid(): boolean {
  const p = getEnvironmentScriptPath();
  if (!p) {
    return false;
  }
  try {
    return fs.existsSync(p);
  }
  catch {
    return false;
  }
}

/**
 * When the workspace env script is missing or the path does not exist, show a warning with
 * a browse action. If the user picks a file, save it to workspace settings.
 *
 * @returns true if the flow action may run (path was already valid or user fixed it).
 */
export async function ensureEnvironmentScriptForOperateAction(): Promise<boolean> {
  if (isEnvironmentScriptPathValid()) {
    return true;
  }

  const browseLabel = t('extension.environmentScript.browse');
  const msg = getEnvironmentScriptPath()
    ? t('extension.environmentScript.invalidPath')
    : t('extension.environmentScript.missing');

  const choice = await vscode.window.showWarningMessage(msg, browseLabel);
  if (choice !== browseLabel) {
    return false;
  }

  const uris = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    openLabel: t('extension.environmentScript.selectFile'),
    filters: {
      'Shell scripts': ['sh', 'bash'],
      'All files': ['*'],
    },
  });

  if (!uris?.length) {
    return false;
  }

  const fsPath = uris[0].fsPath;
  try {
    if (!fs.existsSync(fsPath)) {
      vscode.window.showErrorMessage(t('extension.environmentScript.fileNotFound'));
      return false;
    }
  }
  catch {
    vscode.window.showErrorMessage(t('extension.environmentScript.fileNotFound'));
    return false;
  }

  await getOpDevtoolsConfiguration().update(
    CONFIG_KEY,
    fsPath,
    vscode.ConfigurationTarget.Workspace,
  );

  await projectService.syncAscendEnvScriptFromWorkspaceSettings();

  vscode.window.showInformationMessage(t('extension.environmentScript.saved'));
  return true;
}
