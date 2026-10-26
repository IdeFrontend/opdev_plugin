/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import * as vscode from 'vscode';

import {
  CANNWORK_EXTENSION_ID,
  ensureCannworkExtension,
  isCannworkVersionSatisfied,
} from '@plugin/helpers/cannwork-extension-support';
import { SettingsLoader } from '@plugin/service/settings-loader';

jest.mock('@plugin/service/settings-loader', () => ({
  SettingsLoader: {
    isCannworkAutoInstallEnabled: jest.fn()
      .mockReturnValue(true),
  },
}));

const logDebug = jest.fn();

function installCannwork(version: string): void {
  (vscode.extensions.getExtension as jest.Mock)
    .mockReturnValueOnce({ packageJSON: { version } });
}

function expectNoUserVisibleOutput(): void {
  expect(vscode.window.showInformationMessage)
    .not
    .toHaveBeenCalled();
  expect(vscode.window.showWarningMessage)
    .not
    .toHaveBeenCalled();
  expect(vscode.window.showErrorMessage)
    .not
    .toHaveBeenCalled();
}

beforeEach(() => {
  jest.clearAllMocks();
  (SettingsLoader.isCannworkAutoInstallEnabled as jest.Mock).mockReturnValue(true);
});

describe('isCannworkVersionSatisfied', () => {
  it('accepts the minimum version and everything newer', () => {
    expect(isCannworkVersionSatisfied('2.0.0'))
      .toBe(true);
    expect(isCannworkVersionSatisfied('2.0.1'))
      .toBe(true);
    expect(isCannworkVersionSatisfied('2.1.0'))
      .toBe(true);
    expect(isCannworkVersionSatisfied('3.0.0'))
      .toBe(true);
  });

  it('rejects versions below the minimum', () => {
    expect(isCannworkVersionSatisfied('1.9.9'))
      .toBe(false);
    expect(isCannworkVersionSatisfied('1.2.3'))
      .toBe(false);
  });

  it('tolerates two-segment, pre-release and garbage version strings', () => {
    expect(isCannworkVersionSatisfied('2.0'))
      .toBe(true);
    expect(isCannworkVersionSatisfied('2.0.0-beta'))
      .toBe(true);
    expect(isCannworkVersionSatisfied('garbage'))
      .toBe(false);
    expect(isCannworkVersionSatisfied(''))
      .toBe(false);
  });
});

describe('ensureCannworkExtension', () => {
  it('silently installs the latest marketplace version when missing', async () => {
    await ensureCannworkExtension(logDebug);

    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith('workbench.extensions.installExtension', CANNWORK_EXTENSION_ID);
    expect(logDebug)
      .toHaveBeenCalledWith('cannwork:ensure:installed', { repairedOldVersion: false });
    expectNoUserVisibleOutput();
  });

  it('is a no-op when an up-to-date CANNWork is installed', async () => {
    installCannwork('2.0.0');

    await ensureCannworkExtension(logDebug);

    expect(vscode.commands.executeCommand)
      .not
      .toHaveBeenCalled();
    expect(logDebug)
      .not
      .toHaveBeenCalled();
    expectNoUserVisibleOutput();
  });

  it('silently upgrades an outdated installation', async () => {
    installCannwork('1.9.9');

    await ensureCannworkExtension(logDebug);

    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith('workbench.extensions.installExtension', CANNWORK_EXTENSION_ID);
    expect(logDebug)
      .toHaveBeenCalledWith('cannwork:ensure:installed', { repairedOldVersion: true });
    expectNoUserVisibleOutput();
  });

  it('installs when the installed manifest carries no version', async () => {
    (vscode.extensions.getExtension as jest.Mock)
      .mockReturnValueOnce({ packageJSON: {} });

    await ensureCannworkExtension(logDebug);

    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith('workbench.extensions.installExtension', CANNWORK_EXTENSION_ID);
  });

  it('skips entirely when the setting is turned off', async () => {
    (SettingsLoader.isCannworkAutoInstallEnabled as jest.Mock).mockReturnValue(false);

    await ensureCannworkExtension(logDebug);

    expect(vscode.commands.executeCommand)
      .not
      .toHaveBeenCalled();
    expect(logDebug)
      .toHaveBeenCalledWith('cannwork:ensure:skipped (setting off)');
    expectNoUserVisibleOutput();
  });

  it('stays silent and never throws when the marketplace is unreachable', async () => {
    (vscode.commands.executeCommand as jest.Mock).mockRejectedValueOnce(new Error('offline'));

    await expect(ensureCannworkExtension(logDebug))
      .resolves
      .toBeUndefined();

    expect(logDebug)
      .toHaveBeenCalledWith('cannwork:ensure:error (retry next activation)', expect.any(Error));
    expectNoUserVisibleOutput();
  });
});
