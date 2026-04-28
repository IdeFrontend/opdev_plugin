import {
  CheckPathExistsParams, SaveFileParams, SaveFileResult,
} from '@shared/api-types';
import { fileService } from '@plugin/service/file-service';
import * as vscode from 'vscode';
import { OperatorProjectViewId } from '@shared/project-type-view-id';
import { isOperatorSupportEnabled } from '@plugin/helpers/feature-toggle';

export const commonMethods = {
  /**
   * Check if the path exists
   */
  pathExists(params: CheckPathExistsParams): Promise<boolean> {
    return fileService.pathExists(params);
  },

  /**
   * Save file locally
   * The web version returns file data, the desktop version returns boolean
   */
  async saveFileToLocal(params: SaveFileParams): Promise<SaveFileResult> {
    return await fileService.saveFileToLocal(params);
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
    return vscode.workspace.getConfiguration('op-devtools').get<boolean>('sanitizer.showQuickOptions', true) ?? true;
  },

  async setSanitizerShowQuickOptions(params: { value: boolean }): Promise<void> {
    await vscode.workspace.getConfiguration('op-devtools').update(
      'sanitizer.showQuickOptions',
      params.value,
      vscode.ConfigurationTarget.Workspace,
    );
  },

  getSimulationShowQuickOptions(): boolean {
    return vscode.workspace.getConfiguration('op-devtools').get<boolean>(
      'performanceTuning.simulation.showQuickOptions',
      true,
    ) ?? true;
  },

  async setSimulationShowQuickOptions(params: { value: boolean }): Promise<void> {
    await vscode.workspace.getConfiguration('op-devtools').update(
      'performanceTuning.simulation.showQuickOptions',
      params.value,
      vscode.ConfigurationTarget.Workspace,
    );
  },

  getOnBoardAnalysisShowQuickOptions(): boolean {
    return vscode.workspace.getConfiguration('op-devtools').get<boolean>(
      'performanceTuning.onBoard.showQuickOptions',
      true,
    ) ?? true;
  },

  async setOnBoardAnalysisShowQuickOptions(params: { value: boolean }): Promise<void> {
    await vscode.workspace.getConfiguration('op-devtools').update(
      'performanceTuning.onBoard.showQuickOptions',
      params.value,
      vscode.ConfigurationTarget.Workspace,
    );
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

    // Support API should reflect settings map in feature-toggle (source of truth).
    return isOperatorSupportEnabled(normalized);
  },
};
