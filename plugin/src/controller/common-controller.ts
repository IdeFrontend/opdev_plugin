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
