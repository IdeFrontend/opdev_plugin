/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
jest.mock('vscode', () => ({
  env: { openExternal: jest.fn() },
  Uri: { parse: jest.fn((value: string) => ({ value })) },
  commands: { executeCommand: jest.fn(() => Promise.resolve('done')) },
}));

jest.mock('@plugin/service/file-service', () => ({ fileService: { pathExists: jest.fn() } }));

jest.mock('@plugin/service/config-service', () => ({ ConfigService: { writeOpDevtoolsDottedSettings: jest.fn(() => Promise.resolve(true)) } }));

jest.mock('@plugin/service/settings-loader', () => ({
  SettingsLoader: {
    read: jest.fn(),
    isOperatorSupportEnabled: jest.fn(() => true),
  },
}));

import * as vscode from 'vscode';
import { commonMethods } from '@plugin/controller/common-controller';
import { fileService } from '@plugin/service/file-service';
import { ConfigService } from '@plugin/service/config-service';
import { SettingsLoader } from '@plugin/service/settings-loader';
import { OperatorProjectViewId } from '@shared/project-type-view-id';

describe('commonMethods.pathExists', () => {
  it('delegates to fileService.pathExists', async () => {
    (fileService.pathExists as jest.Mock).mockResolvedValue(true);

    await expect(commonMethods.pathExists({ path: '/workspace/op' }))
      .resolves
      .toBe(true);
    expect(fileService.pathExists)
      .toHaveBeenCalledWith({ path: '/workspace/op' });
  });
});

describe('commonMethods.openExternalLink', () => {
  it('opens the parsed URL in the external browser', () => {
    commonMethods.openExternalLink('https://example.com/docs');

    expect(vscode.Uri.parse)
      .toHaveBeenCalledWith('https://example.com/docs');
    expect(vscode.env.openExternal)
      .toHaveBeenCalledWith({ value: 'https://example.com/docs' });
  });
});

describe('commonMethods.executeVscodeCommand', () => {
  it('executes the command with the spread args and returns the result', async () => {
    await expect(commonMethods.executeVscodeCommand({
      command: 'editor.action.formatDocument',
      args: [
        1,
        'two',
      ],
    }))
      .resolves
      .toBe('done');
    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith('editor.action.formatDocument', 1, 'two');
  });
});

describe('commonMethods quick-options getters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads the sanitizer quick options with a default of true', () => {
    (SettingsLoader.read as jest.Mock).mockReturnValue(false);

    expect(commonMethods.getSanitizerShowQuickOptions())
      .toBe(false);
    expect(SettingsLoader.read)
      .toHaveBeenCalledWith('sanitizer.showQuickOptions', true);
  });

  it('reads the simulation quick options with a default of true', () => {
    (SettingsLoader.read as jest.Mock).mockReturnValue(true);

    expect(commonMethods.getSimulationShowQuickOptions())
      .toBe(true);
    expect(SettingsLoader.read)
      .toHaveBeenCalledWith('performanceTuning.simulation.showQuickOptions', true);
  });

  it('reads the on-board analysis quick options with a default of true', () => {
    (SettingsLoader.read as jest.Mock).mockReturnValue(true);

    expect(commonMethods.getOnBoardAnalysisShowQuickOptions())
      .toBe(true);
    expect(SettingsLoader.read)
      .toHaveBeenCalledWith('performanceTuning.onBoard.showQuickOptions', true);
  });
});

describe('commonMethods quick-options setters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('writes the sanitizer quick options as a dotted setting', async () => {
    await commonMethods.setSanitizerShowQuickOptions({ value: false });

    expect(ConfigService.writeOpDevtoolsDottedSettings)
      .toHaveBeenCalledWith({ 'sanitizer.showQuickOptions': false });
  });

  it('writes the simulation quick options as a dotted setting', async () => {
    await commonMethods.setSimulationShowQuickOptions({ value: false });

    expect(ConfigService.writeOpDevtoolsDottedSettings)
      .toHaveBeenCalledWith({ 'performanceTuning.simulation.showQuickOptions': false });
  });

  it('writes the on-board analysis quick options as a dotted setting', async () => {
    await commonMethods.setOnBoardAnalysisShowQuickOptions({ value: false });

    expect(ConfigService.writeOpDevtoolsDottedSettings)
      .toHaveBeenCalledWith({ 'performanceTuning.onBoard.showQuickOptions': false });
  });
});

describe('commonMethods.getProjectTypeSupportEnabled', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes a string project type and consults the support map', () => {
    commonMethods.getProjectTypeSupportEnabled({ projectType: 'cann' });

    expect(SettingsLoader.isOperatorSupportEnabled)
      .toHaveBeenCalledWith('cann');
  });

  it('maps the CANN view id to cann', () => {
    commonMethods.getProjectTypeSupportEnabled({ projectType: OperatorProjectViewId.CANN });

    expect(SettingsLoader.isOperatorSupportEnabled)
      .toHaveBeenCalledWith('cann');
  });

  it('maps the STANDARD_CUSTOM view id to standard-custom', () => {
    commonMethods.getProjectTypeSupportEnabled({ projectType: OperatorProjectViewId.STANDARD_CUSTOM });

    expect(SettingsLoader.isOperatorSupportEnabled)
      .toHaveBeenCalledWith('standard-custom');
  });

  it('maps the PYASC view id to pyasc', () => {
    commonMethods.getProjectTypeSupportEnabled({ projectType: OperatorProjectViewId.PYASC });

    expect(SettingsLoader.isOperatorSupportEnabled)
      .toHaveBeenCalledWith('pyasc');
  });

  it('maps the TRITON view id to triton', () => {
    commonMethods.getProjectTypeSupportEnabled({ projectType: OperatorProjectViewId.TRITON });

    expect(SettingsLoader.isOperatorSupportEnabled)
      .toHaveBeenCalledWith('triton');
  });

  it('maps unknown numeric view ids to an empty type', () => {
    commonMethods.getProjectTypeSupportEnabled({ projectType: 99 });

    expect(SettingsLoader.isOperatorSupportEnabled)
      .toHaveBeenCalledWith('');
  });

  it('normalizes a missing project type to an empty string', () => {
    commonMethods.getProjectTypeSupportEnabled({} as never);
    commonMethods.getProjectTypeSupportEnabled(undefined as never);

    expect(SettingsLoader.isOperatorSupportEnabled)
      .toHaveBeenCalledTimes(2);
    expect(SettingsLoader.isOperatorSupportEnabled)
      .toHaveBeenNthCalledWith(1, '');
    expect(SettingsLoader.isOperatorSupportEnabled)
      .toHaveBeenNthCalledWith(2, '');
  });

  it('returns the support-map verdict for the normalized type', () => {
    (SettingsLoader.isOperatorSupportEnabled as jest.Mock)
      .mockReturnValue(false);

    expect(commonMethods.getProjectTypeSupportEnabled({ projectType: 'triton' }))
      .toBe(false);
  });
});
