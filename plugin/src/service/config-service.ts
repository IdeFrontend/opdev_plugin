import { t } from 'i18next';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { ProjectManager } from '@plugin/core/project/project-manager';
import {
  SaveBuildConfigParams,
  SaveConfigParams,
  SaveSanitizerFormParams,
  BuildConfig,
  RemotePathSearchParams,
  RemotePathSearchResult,
} from '@shared/api-types';
import {
  postConfig, getConfig, getFiles,
} from '@plugin/domain';
import { mergeSanitizerConfigsWithOperatorProjectWorkspace } from '@plugin/helpers/operator-project-workspace-config';

const CONFIG_TYPES = {
  SANITIZER: 'sanitizer',
  ON_BOARD: 'on_board',
  SIMULATE: 'simulate',
} as const;

export class ConfigService {
  private static getOpDevtoolsSettings(): Record<string, unknown> {
    const settings = vscode.workspace.getConfiguration().get<Record<string, unknown>>('op-devtools', {});
    return { ...settings };
  }

  private loadSanitizerConfigsFromDb(): BuildConfig[] {
    const projectId = ProjectManager.getInstance().projectId;
    const config = getConfig(Number(projectId), CONFIG_TYPES.SANITIZER);
    return config.map((c) => ({
      ...c,
      user_options: c.user_options ? (c.user_options as Record<string, unknown>) : undefined,
    })) as BuildConfig[];
  }

  /**
   * Remote path search
   */
  async remotePathSearch(params: RemotePathSearchParams): Promise<RemotePathSearchResult> {
    const res = getFiles(params.keyword);

    return {
      type: params.type,
      list: res,
    };
  }

  /**
   * Save build configuration
   */
  async saveBuildConfig(params: SaveBuildConfigParams): Promise<void> {
    try {
      await postConfig('build', params.data as unknown[]);

      if (params.showMessage) {
        vscode.window.showInformationMessage(t('config.saveBuildConfigSuccess'));
      }
    }
    catch {
      vscode.window.showErrorMessage(t('config.saveBuildConfigFailed'));
    }
  }

  /**
   * Save configuration (simulation/boarding)
   */
  async saveConfig(params: SaveConfigParams): Promise<void> {
    await postConfig(params.type, params.data as unknown[]);

    if (params.type === CONFIG_TYPES.ON_BOARD) {
      await this.pushOnBoardUserOptionsToWorkspaceSettings();
    }
    if (params.type === CONFIG_TYPES.SIMULATE) {
      await this.pushSimulateUserOptionsToWorkspaceSettings();
    }

    if (params.showMessage) {
      vscode.window.showInformationMessage(t('config.saveConfigSuccess'));
    }
  }

  /**
   * Check whether the devtool_config.json configuration file exists
   * First check the project path in ProjectManager, if it does not exist, check the current workspace
   */
  async checkDevtoolConfig(): Promise<boolean> {
    const pm = ProjectManager.getInstance();

    // Prioritize the project path of ProjectManager
    const projectInfo = pm.getProjectInfo();
    let checkPath: string | undefined;

    if (projectInfo?.path) {
      checkPath = projectInfo.path;
      console.log('checkDevtoolConfig: using ProjectManager project path:', checkPath);
    }
    else {
      // Fallback to workspace path
      const workspaceFolders = vscode.workspace.workspaceFolders;

      if (workspaceFolders && workspaceFolders.length > 0) {
        checkPath = workspaceFolders[0].uri.fsPath;
        console.log('checkDevtoolConfig: using workspace path:', checkPath);
      }
    }

    if (!checkPath) {
      console.log('checkDevtoolConfig: no available path, return false');

      return false;
    }

    const devtoolConfigPath = path.join(
      checkPath,
      '.vscode',
      'devtool_config.json',
    );

    try {
      const exists = fs.existsSync(devtoolConfigPath);

      console.log('checkDevtoolConfig: config file path:', devtoolConfigPath, 'exists:', exists);

      return exists;
    }
    catch (error) {
      console.error('Error while checking devtool_config.json file:', error);

      return false;
    }
  }

  /**
   * Get anomaly detection configuration list
   */
  async getSanitizerConfigsList(): Promise<BuildConfig[]> {
    return mergeSanitizerConfigsWithOperatorProjectWorkspace(this.loadSanitizerConfigsFromDb());
  }

  /**
   * Save anomaly detection form configuration
   */
  async saveSanitizerForm(params: SaveSanitizerFormParams): Promise<void> {
    try {
      const formData = this.loadSanitizerConfigsFromDb()[0];

      await postConfig(CONFIG_TYPES.SANITIZER, [
        {
          ...formData,
          user_options: {
            ...(formData.user_options || {}),
            ...(params.data as Record<string, unknown>),
          },
        },
      ]);

      await this.pushSanitizerUserOptionsToWorkspaceSettings();

      if (params.showMessage) {
        vscode.window.showInformationMessage(t('config.saveSanitizerConfigSuccess'));
      }
    }
    catch {
      vscode.window.showErrorMessage(t('config.saveSanitizerConfigFailed'));
    }
  }

  /**
   * After devtool save, mirror sanitizer `user_options` into workspace `op-devtools.*`
   * (same mapping as extension sync) so the panel and Settings stay aligned immediately.
   */
  private async pushSanitizerUserOptionsToWorkspaceSettings(): Promise<void> {
    try {
      const row = this.loadSanitizerConfigsFromDb()[0];
      if (!row?.user_options) {
        return;
      }
      const opts = row.user_options as Record<string, unknown>;
      const tool = (opts.tool || {}) as Record<string, unknown>;
      const mem = (opts.memcheckOption || {}) as Record<string, unknown>;
      const currentSettings = ConfigService.getOpDevtoolsSettings();
      const compileAndDeploy = (currentSettings.compileAndDeploy as Record<string, unknown>) || {};
      const buildConfig = (compileAndDeploy.buildConfig as Record<string, unknown>) || {};
      const sanitizer = (currentSettings.sanitizer as Record<string, unknown>) || {};

      const nextSettings: Record<string, unknown> = {
        ...currentSettings,
        compileAndDeploy: {
          ...compileAndDeploy,
          buildConfig: {
            ...buildConfig,
            ...(opts.script !== undefined ? { sanitizerCompileCommand: opts.script } : {}),
          },
        },
        sanitizer: {
          ...sanitizer,
          ...(opts.logLevel !== undefined ? { reportLogLevel: opts.logLevel } : {}),
          ...(opts.maxDebuglogSize !== undefined ? { maxSingleLogFileSize: opts.maxDebuglogSize } : {}),
          ...(tool.memcheck !== undefined ? { memory: tool.memcheck } : {}),
          ...(tool.racecheck !== undefined ? { race: tool.racecheck } : {}),
          ...(tool.initcheck !== undefined ? { uninitialized: tool.initcheck } : {}),
          ...(mem['leak-check'] !== undefined ? { memoryLeak: mem['leak-check'] } : {}),
          ...(mem['check-unused-memory'] !== undefined ? { allocUnused: mem['check-unused-memory'] } : {}),
          ...(typeof opts.useBlock === 'boolean'
            ? { detectionScope: opts.useBlock ? 'singleBlock' : 'global' }
            : {}),
          ...(opts.blockId !== undefined ? { blockId: opts.blockId } : {}),
        },
      };

      await vscode.workspace.getConfiguration().update(
        'op-devtools',
        nextSettings,
        vscode.ConfigurationTarget.Workspace,
      );
    }
    catch (error) {
      console.warn('[pushSanitizerUserOptionsToWorkspaceSettings] failed:', error);
    }
  }

  private static toKeyValueMapFromAdvanceParam(raw: unknown): Record<string, string> {
    if (!Array.isArray(raw)) {
      return {};
    }
    return raw.reduce((acc, item) => {
      if (!item || typeof item !== 'object') {
        return acc;
      }
      const row = item as Record<string, unknown>;
      const name = row.name;
      if (typeof name !== 'string' || name.trim().length === 0) {
        return acc;
      }
      const value = row.value;
      acc[name] = value === undefined || value === null ? '' : String(value);
      return acc;
    }, {} as Record<string, string>);
  }

  /** After on_board devtool save, mirror `user_options` into workspace `op-devtools.performanceTuning.onBoard.*` (and script). */
  private async pushOnBoardUserOptionsToWorkspaceSettings(): Promise<void> {
    try {
      const projectId = ProjectManager.getInstance().projectId;
      const rows = getConfig(Number(projectId), CONFIG_TYPES.ON_BOARD);
      const row = rows[0];
      if (!row?.user_options) {
        return;
      }
      const onBoardOpts = row.user_options as Record<string, unknown>;
      const currentSettings = ConfigService.getOpDevtoolsSettings();
      const compileAndDeploy = (currentSettings.compileAndDeploy as Record<string, unknown>) || {};
      const buildConfig = (compileAndDeploy.buildConfig as Record<string, unknown>) || {};
      const performanceTuning = (currentSettings.performanceTuning as Record<string, unknown>) || {};
      const onBoard = (performanceTuning.onBoard as Record<string, unknown>) || {};
      // Do not write `performanceTuning.onBoard.operatorMetrics` here. Updating that
      // aggregate key triggers extension `onBoardOperatorMetricsSync`, which sets every
      // metric child workspace key to the same boolean and wipes per-metric choices.
      const nextSettings: Record<string, unknown> = {
        ...currentSettings,
        compileAndDeploy: {
          ...compileAndDeploy,
          buildConfig: {
            ...buildConfig,
            ...(onBoardOpts.script !== undefined ? { onBoardCompileCommand: onBoardOpts.script } : {}),
          },
        },
        performanceTuning: {
          ...performanceTuning,
          onBoard: {
            ...onBoard,
            ...(onBoardOpts.Occupancy !== undefined ? { interCoreLoad: onBoardOpts.Occupancy } : {}),
            ...(onBoardOpts.Roofline !== undefined ? { roofline: onBoardOpts.Roofline } : {}),
            ...(onBoardOpts.Source !== undefined ? { operatorCodeHotspot: onBoardOpts.Source } : {}),
            ...(onBoardOpts.MemoryDetail !== undefined ? { cacheHeatmap: onBoardOpts.MemoryDetail } : {}),
            ...(onBoardOpts.ArithmeticUtilization !== undefined
              ? { cubeAndVectorInstructionTimeAndRatio: onBoardOpts.ArithmeticUtilization }
              : {}),
            ...(onBoardOpts.L2Cache !== undefined ? { l2CacheHitRate: onBoardOpts.L2Cache } : {}),
            ...(onBoardOpts.Memory !== undefined ? { memoryReadWriteBandwidth: onBoardOpts.Memory } : {}),
            ...(onBoardOpts.MemoryL0 !== undefined ? { l0ReadWriteBandwidth: onBoardOpts.MemoryL0 } : {}),
            ...(onBoardOpts.MemoryUB !== undefined ? { ubReadWriteBandwidth: onBoardOpts.MemoryUB } : {}),
            ...(onBoardOpts.PipeUtilization !== undefined
              ? { computeAndMoveUnitTimeRatio: onBoardOpts.PipeUtilization }
              : {}),
            ...(onBoardOpts.ResourceConflictRatio !== undefined
              ? { resourceConflictRatio: onBoardOpts.ResourceConflictRatio }
              : {}),
            ...(onBoardOpts.KernelScale !== undefined
              ? { enableKernelCodeSegmentProfiling: onBoardOpts.KernelScale }
              : {}),
            parameters: ConfigService.toKeyValueMapFromAdvanceParam(onBoardOpts.advance_param),
          },
        },
      };

      await vscode.workspace.getConfiguration().update(
        'op-devtools',
        nextSettings,
        vscode.ConfigurationTarget.Workspace,
      );
    }
    catch (error) {
      console.warn('[pushOnBoardUserOptionsToWorkspaceSettings] failed:', error);
    }
  }

  /** After simulate devtool save, mirror `user_options` into workspace simulation keys (and script). */
  private async pushSimulateUserOptionsToWorkspaceSettings(): Promise<void> {
    try {
      const projectId = ProjectManager.getInstance().projectId;
      const rows = getConfig(Number(projectId), CONFIG_TYPES.SIMULATE);
      const row = rows[0];
      if (!row?.user_options) {
        return;
      }
      const simulateOpts = row.user_options as Record<string, unknown>;
      const currentSettings = ConfigService.getOpDevtoolsSettings();
      const compileAndDeploy = (currentSettings.compileAndDeploy as Record<string, unknown>) || {};
      const buildConfig = (compileAndDeploy.buildConfig as Record<string, unknown>) || {};
      const performanceTuning = (currentSettings.performanceTuning as Record<string, unknown>) || {};
      const simulation = (performanceTuning.simulation as Record<string, unknown>) || {};

      const nextSettings: Record<string, unknown> = {
        ...currentSettings,
        compileAndDeploy: {
          ...compileAndDeploy,
          buildConfig: {
            ...buildConfig,
            ...(simulateOpts.script !== undefined ? { simulationCompileCommand: simulateOpts.script } : {}),
          },
        },
        performanceTuning: {
          ...performanceTuning,
          simulation: {
            ...simulation,
            ...(simulateOpts.simulatorType !== undefined ? { simulatorType: simulateOpts.simulatorType } : {}),
            ...(simulateOpts.PMSampling !== undefined ? { memoryThroughputWaveform: simulateOpts.PMSampling } : {}),
            ...(simulateOpts.ResourceConflictRatio !== undefined
              ? { resourceConflictRatio: simulateOpts.ResourceConflictRatio }
              : {}),
            parameters: ConfigService.toKeyValueMapFromAdvanceParam(simulateOpts.advance_param),
          },
        },
      };

      await vscode.workspace.getConfiguration().update(
        'op-devtools',
        nextSettings,
        vscode.ConfigurationTarget.Workspace,
      );
    }
    catch (error) {
      console.warn('[pushSimulateUserOptionsToWorkspaceSettings] failed:', error);
    }
  }
}

export const configService = new ConfigService();
