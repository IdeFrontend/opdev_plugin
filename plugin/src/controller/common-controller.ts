import {
  CheckPathExistsParams, SaveFileParams, SaveFileResult,
} from '@shared/api-types';
import { fileService } from '@plugin/service/file-service';
import { ConfigService } from '@plugin/service/config-service';
import { ConfigHelper } from '@plugin/helpers/ConfigHelper';
import * as vscode from 'vscode';
import { OperatorProjectViewId } from '@shared/project-type-view-id';
import {
  isOperatorSupportEnabled, isSanitizerEnabled, isPerformanceTuningEnabled, isNpuDebugEnabled, isDumpTensorEnabled,
} from '@plugin/helpers/feature-toggle';
import {
  FLAVOR_GATES, FLAVOR_ID, BRANDING,
} from '@shared/flavor';

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
    return ConfigHelper.get<boolean>('sanitizer.showQuickOptions', true);
  },

  async setSanitizerShowQuickOptions(params: { value: boolean }): Promise<void> {
    await ConfigService.writeOpDevtoolsDottedSettings({ 'sanitizer.showQuickOptions': params.value });
  },

  getSimulationShowQuickOptions(): boolean {
    return ConfigHelper.get<boolean>('performanceTuning.simulation.showQuickOptions', true);
  },

  async setSimulationShowQuickOptions(params: { value: boolean }): Promise<void> {
    await ConfigService.writeOpDevtoolsDottedSettings({ 'performanceTuning.simulation.showQuickOptions': params.value });
  },

  getOnBoardAnalysisShowQuickOptions(): boolean {
    return ConfigHelper.get<boolean>('performanceTuning.onBoard.showQuickOptions', true);
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

    // Support API should reflect settings map in feature-toggle (source of truth).
    return isOperatorSupportEnabled(normalized);
  },

  getFlavorFeatures(): {
    flavorId: string;
    productName: string;
    gates: typeof FLAVOR_GATES;
    sanitizer: boolean;
    performanceTuning: boolean;
    npuDebug: boolean;
    dumpTensor: boolean;
  } {
    return {
      flavorId: FLAVOR_ID,
      productName: BRANDING.productName,
      gates: FLAVOR_GATES,
      sanitizer: isSanitizerEnabled(),
      performanceTuning: isPerformanceTuningEnabled(),
      npuDebug: isNpuDebugEnabled(),
      dumpTensor: isDumpTensorEnabled(),
    };
  },
};
