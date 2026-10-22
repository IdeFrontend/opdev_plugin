/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { CheckPathExistsParams } from '@shared/api-types';
import { fileService } from '@plugin/service/file-service';
import { ConfigService } from '@plugin/service/config-service';
import * as vscode from 'vscode';
import { OperatorProjectViewId } from '@shared/project-type-view-id';
import { SettingsLoader } from '@plugin/service/settings-loader';

export const commonMethods = {
  /**
   * Check if the path exists
   */
  pathExists(params: CheckPathExistsParams): Promise<boolean> {
    return fileService.pathExists(params);
  },

  /**
   * Open external website
   */
  openExternalLink(url: string) {
    vscode.env.openExternal(vscode.Uri.parse(url));
  },

  /**
   * Execute VSCode command
   */
  async executeVscodeCommand(params: { command: string;
    args: any[] }) {
    const {
      command, args,
    } = params;

    return await vscode.commands.executeCommand(command, ...args);
  },

  /**
   * Workspace setting: show sanitizer quick options panel from the Actions tree.
   */
  getSanitizerShowQuickOptions(): boolean {
    return SettingsLoader.read<boolean>('sanitizer.showQuickOptions', true);
  },

  async setSanitizerShowQuickOptions(params: { value: boolean }): Promise<void> {
    await ConfigService.writeOpDevtoolsDottedSettings({ 'sanitizer.showQuickOptions': params.value });
  },

  getSimulationShowQuickOptions(): boolean {
    return SettingsLoader.read<boolean>('performanceTuning.simulation.showQuickOptions', true);
  },

  async setSimulationShowQuickOptions(params: { value: boolean }): Promise<void> {
    await ConfigService.writeOpDevtoolsDottedSettings({ 'performanceTuning.simulation.showQuickOptions': params.value });
  },

  getOnBoardAnalysisShowQuickOptions(): boolean {
    return SettingsLoader.read<boolean>('performanceTuning.onBoard.showQuickOptions', true);
  },

  async setOnBoardAnalysisShowQuickOptions(params: { value: boolean }): Promise<void> {
    await ConfigService.writeOpDevtoolsDottedSettings({ 'performanceTuning.onBoard.showQuickOptions': params.value });
  },

  getProjectTypeSupportEnabled(params: { projectType: string | number }): boolean {
    const raw = params?.projectType;
    let normalized = String(raw ?? '');

    if (typeof raw === 'number') {
      switch (raw) {
        case OperatorProjectViewId.CANN:
          normalized = 'cann';
          break;
        case OperatorProjectViewId.STANDARD_CUSTOM:
          normalized = 'standard-custom';
          break;
        case OperatorProjectViewId.PYASC:
          normalized = 'pyasc';
          break;
        case OperatorProjectViewId.TRITON:
          normalized = 'triton';
          break;
        default:
          normalized = '';
      }
    }

    // Support API should reflect the settings map in SettingsLoader (source of truth).
    return SettingsLoader.isOperatorSupportEnabled(normalized);
  },
};
