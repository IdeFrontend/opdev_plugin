/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
const mockExistsSync = jest.fn();

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
}));

jest.mock('i18next', () => ({ t: (key: string) => key }));

jest.mock('vscode', () => ({
  window: {
    showWarningMessage: jest.fn()
      .mockResolvedValue(undefined),
    showOpenDialog: jest.fn()
      .mockResolvedValue(undefined),
    showErrorMessage: jest.fn(),
    showInformationMessage: jest.fn(),
  },
}));

jest.mock('@plugin/helpers/operator-project-workspace-config', () => ({
  ENVIRONMENT_SCRIPT_SETTING: 'environment.environmentScript',
  getEnvironmentScriptPathFromWorkspace: jest.fn(),
}));

jest.mock('@plugin/service/config-service', () => ({
  ConfigService: {
    writeOpDevtoolsDottedSettings: jest.fn()
      .mockResolvedValue(true),
  },
}));

jest.mock('@plugin/service/project-service', () => ({
  projectService: {
    syncAscendEnvScriptFromWorkspaceSettings: jest.fn()
      .mockResolvedValue(undefined),
  },
}));

import * as vscode from 'vscode';
import {
  ENVIRONMENT_SCRIPT_SETTING,
  getEnvironmentScriptPathFromWorkspace,
} from '@plugin/helpers/operator-project-workspace-config';
import { ConfigService } from '@plugin/service/config-service';
import { projectService } from '@plugin/service/project-service';
import {
  ensureEnvironmentScriptForOperateAction,
  getEnvironmentScriptPath,
  isEnvironmentScriptPathValid,
} from '@plugin/helpers/environment-script-guard';

const showWarningMessage = vscode.window.showWarningMessage as jest.Mock;
const showOpenDialog = vscode.window.showOpenDialog as jest.Mock;
const showErrorMessage = vscode.window.showErrorMessage as jest.Mock;
const showInformationMessage = vscode.window.showInformationMessage as jest.Mock;
const writeSettings = ConfigService.writeOpDevtoolsDottedSettings as jest.Mock;
const syncEnvScript = projectService.syncAscendEnvScriptFromWorkspaceSettings as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockExistsSync.mockReturnValue(true);
});

describe('getEnvironmentScriptPath / isEnvironmentScriptPathValid', () => {
  it('delegates to the workspace configuration helper', () => {
    (getEnvironmentScriptPathFromWorkspace as jest.Mock).mockReturnValue('/ws/env.sh');

    expect(getEnvironmentScriptPath())
      .toBe('/ws/env.sh');
  });

  it('returns false when no script path is configured', () => {
    (getEnvironmentScriptPathFromWorkspace as jest.Mock).mockReturnValue('');

    expect(isEnvironmentScriptPathValid())
      .toBe(false);
  });

  it('returns true when the configured script exists', () => {
    (getEnvironmentScriptPathFromWorkspace as jest.Mock).mockReturnValue('/ws/env.sh');
    mockExistsSync.mockReturnValue(true);

    expect(isEnvironmentScriptPathValid())
      .toBe(true);
    expect(mockExistsSync)
      .toHaveBeenCalledWith('/ws/env.sh');
  });

  it('returns false when the configured script does not exist', () => {
    (getEnvironmentScriptPathFromWorkspace as jest.Mock).mockReturnValue('/ws/env.sh');
    mockExistsSync.mockReturnValue(false);

    expect(isEnvironmentScriptPathValid())
      .toBe(false);
  });

  it('returns false when the existence check throws', () => {
    (getEnvironmentScriptPathFromWorkspace as jest.Mock).mockReturnValue('/ws/env.sh');
    mockExistsSync.mockImplementation(() => {
      throw new Error('boom');
    });

    expect(isEnvironmentScriptPathValid())
      .toBe(false);
  });
});

describe('ensureEnvironmentScriptForOperateAction', () => {
  beforeEach(() => {
    showWarningMessage.mockResolvedValue(undefined);
    showOpenDialog.mockResolvedValue(undefined);
    // The configured path is invalid unless a test overrides this.
    mockExistsSync.mockReturnValue(false);
  });

  it('returns true immediately when the path is already valid', async () => {
    (getEnvironmentScriptPathFromWorkspace as jest.Mock).mockReturnValue('/ws/env.sh');
    mockExistsSync.mockReturnValue(true);

    await expect(ensureEnvironmentScriptForOperateAction()).resolves.toBe(true);
    expect(showWarningMessage).not.toHaveBeenCalled();
    expect(showOpenDialog).not.toHaveBeenCalled();
  });

  it('warns with the missing-script message and continues on request', async () => {
    (getEnvironmentScriptPathFromWorkspace as jest.Mock).mockReturnValue('');
    showWarningMessage.mockResolvedValue('extension.environmentScript.continue');

    await expect(ensureEnvironmentScriptForOperateAction()).resolves.toBe(true);
    expect(showWarningMessage)
      .toHaveBeenCalledWith(
        'extension.environmentScript.missing',
        'extension.environmentScript.browse',
        'extension.environmentScript.continue',
      );
  });

  it('warns with the invalid-path message and continues on request', async () => {
    (getEnvironmentScriptPathFromWorkspace as jest.Mock).mockReturnValue('/missing/env.sh');
    showWarningMessage.mockResolvedValue('extension.environmentScript.continue');

    await expect(ensureEnvironmentScriptForOperateAction()).resolves.toBe(true);
    expect(showWarningMessage)
      .toHaveBeenCalledWith(
        'extension.environmentScript.invalidPath',
        'extension.environmentScript.browse',
        'extension.environmentScript.continue',
      );
  });

  it('returns false when the warning is dismissed', async () => {
    (getEnvironmentScriptPathFromWorkspace as jest.Mock).mockReturnValue('/missing/env.sh');
    showWarningMessage.mockResolvedValue(undefined);

    await expect(ensureEnvironmentScriptForOperateAction()).resolves.toBe(false);
  });

  it('returns false when an unexpected button is chosen', async () => {
    (getEnvironmentScriptPathFromWorkspace as jest.Mock).mockReturnValue('/missing/env.sh');
    showWarningMessage.mockResolvedValue('unexpected');

    await expect(ensureEnvironmentScriptForOperateAction()).resolves.toBe(false);
  });

  it('returns false when the open dialog is cancelled', async () => {
    (getEnvironmentScriptPathFromWorkspace as jest.Mock).mockReturnValue('/missing/env.sh');
    showWarningMessage.mockResolvedValue('extension.environmentScript.browse');
    showOpenDialog.mockResolvedValue(undefined);

    await expect(ensureEnvironmentScriptForOperateAction()).resolves.toBe(false);
    expect(showOpenDialog)
      .toHaveBeenCalledWith(expect.objectContaining({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: 'extension.environmentScript.selectFile',
        filters: {
          'Shell scripts': [
            'sh',
            'bash',
          ],
          'All files': ['*'],
        },
      }));
  });

  it('returns false when the picked file disappeared before saving', async () => {
    (getEnvironmentScriptPathFromWorkspace as jest.Mock).mockReturnValue('/missing/env.sh');
    showWarningMessage.mockResolvedValue('extension.environmentScript.browse');
    showOpenDialog.mockResolvedValue([{ fsPath: '/picked/env.sh' }]);
    mockExistsSync.mockReturnValue(false);

    await expect(ensureEnvironmentScriptForOperateAction()).resolves.toBe(false);
    expect(showErrorMessage)
      .toHaveBeenCalledWith('extension.environmentScript.fileNotFound');
    expect(writeSettings).not.toHaveBeenCalled();
  });

  it('returns false when the picked file existence check throws', async () => {
    (getEnvironmentScriptPathFromWorkspace as jest.Mock).mockReturnValue('/missing/env.sh');
    showWarningMessage.mockResolvedValue('extension.environmentScript.browse');
    showOpenDialog.mockResolvedValue([{ fsPath: '/picked/env.sh' }]);
    mockExistsSync.mockImplementation((p: string) => {
      if (p === '/picked/env.sh') {
        throw new Error('boom');
      }

      return false;
    });

    await expect(ensureEnvironmentScriptForOperateAction()).resolves.toBe(false);
    expect(showErrorMessage)
      .toHaveBeenCalledWith('extension.environmentScript.fileNotFound');
  });

  it('saves the picked file and syncs the workspace settings', async () => {
    (getEnvironmentScriptPathFromWorkspace as jest.Mock).mockReturnValue('/missing/env.sh');
    showWarningMessage.mockResolvedValue('extension.environmentScript.browse');
    showOpenDialog.mockResolvedValue([{ fsPath: '/picked/env.sh' }]);
    mockExistsSync.mockImplementation((p: string) => p === '/picked/env.sh');

    await expect(ensureEnvironmentScriptForOperateAction()).resolves.toBe(true);
    expect(writeSettings)
      .toHaveBeenCalledWith({ [ENVIRONMENT_SCRIPT_SETTING]: '/picked/env.sh' });
    expect(syncEnvScript)
      .toHaveBeenCalledTimes(1);
    expect(showInformationMessage)
      .toHaveBeenCalledWith('extension.environmentScript.saved');
  });
});
