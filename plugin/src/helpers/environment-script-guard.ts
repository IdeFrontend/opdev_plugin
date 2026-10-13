/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import * as fs from 'fs';
import * as vscode from 'vscode';
import { t } from 'i18next';

import {
  ENVIRONMENT_SCRIPT_SETTING,
  getEnvironmentScriptPathFromWorkspace,
} from '@plugin/helpers/operator-project-workspace-config';
import { projectService } from '@plugin/service/project-service';
import { ConfigService } from '@plugin/service/config-service';

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
  const continueLabel = t('extension.environmentScript.continue');
  const msg = getEnvironmentScriptPath()
    ? t('extension.environmentScript.invalidPath')
    : t('extension.environmentScript.missing');

  const choice = await vscode.window.showWarningMessage(msg, browseLabel, continueLabel);

  if (choice === continueLabel) {
    return true;
  }

  if (choice !== browseLabel) {
    return false;
  }

  const uris = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    openLabel: t('extension.environmentScript.selectFile'),
    filters: {
      'Shell scripts': [
        'sh',
        'bash',
      ],
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

  await ConfigService.writeOpDevtoolsDottedSettings({ [ENVIRONMENT_SCRIPT_SETTING]: fsPath });

  await projectService.syncAscendEnvScriptFromWorkspaceSettings();

  vscode.window.showInformationMessage(t('extension.environmentScript.saved'));

  return true;
}
