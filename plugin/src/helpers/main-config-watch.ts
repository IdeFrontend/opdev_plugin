/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { t } from 'i18next';
import * as vscode from 'vscode';

import {
  SETTINGS_PREFIX, settingsKey,
} from '@shared/flavor';
import { isAscendA5ProfilerCannSoc } from '@shared/msprof-onboard-env';
import { AsyncSingleFlight } from '@plugin/helpers/async-single-flight';
import { isIdeSettingsFileEmpty } from '@plugin/helpers/ide-config-dir';
import { ConfigService } from '@plugin/service/config-service';
import type { ProjectService } from '@plugin/service/project-service';
import {
  ensureSimulatorFlag,
  resolveEffectiveCannSoc,
  stripSimulatorFlag,
} from '@plugin/domain/utils/ascend-util';

/**
 * The single `onDidChangeConfiguration` handler for `op-devtools` settings.
 * Extracted from extension.ts activate() so the watch behavior can be unit-tested
 * (see extension-watch-main-config.spec.ts). Loop safety relies on the
 * content-diff guard inside writeOpDevtoolsDottedSettings: a write that does not
 * change the file produces no event, so write → event → write cycles die on the
 * first echo.
 */

const ON_BOARD_OPERATOR_METRIC_CHILD_KEYS = [
  'performanceTuning.onBoard.cubeAndVectorInstructionTimeAndRatio',
  'performanceTuning.onBoard.l2CacheHitRate',
  'performanceTuning.onBoard.memoryReadWriteBandwidth',
  'performanceTuning.onBoard.l0ReadWriteBandwidth',
  'performanceTuning.onBoard.ubReadWriteBandwidth',
  'performanceTuning.onBoard.computeAndMoveUnitTimeRatio',
  'performanceTuning.onBoard.resourceConflictRatio',
] as const;

/** Base config areas: specific → broad; within each case, sub-keys run before base actions. */
const MAIN_CONFIG_AREAS = [
  'onBoard',
  'operatorSupport',
  'environment',
  'opDevtools',
] as const;

export interface MainConfigWatchTreeProvider {
  notifyConfigurationChanged(): void;
}

export interface MainConfigWatchDeps {
  projectService: Pick<ProjectService, 'syncAscendEnvScriptFromWorkspaceSettings'>;
  operateTreeProvider: MainConfigWatchTreeProvider;
  operatorProjectsTreeProvider: MainConfigWatchTreeProvider;
  logDebug: (...args: unknown[])=> void;
  promptReloadWindow: (message: string)=> Promise<void>;
}

const syncOnBoardOperatorMetricChildren = async (): Promise<void> => {
  const desired = ConfigService.readOpDevtoolsSetting<boolean>('performanceTuning.onBoard.operatorMetrics');

  if (typeof desired !== 'boolean') {
    return;
  }

  const metricWrites = Object.fromEntries(ON_BOARD_OPERATOR_METRIC_CHILD_KEYS.map((key) => [
    key,
    desired,
  ]));

  await ConfigService.writeOpDevtoolsDottedSettings(metricWrites);
};

/**
 * When a non-A5 environment selects npu-emulate / npu-compute, reset to msprof
 * and warn the user. The new tools are A5-only; the runtime guards already
 * fall back to msprof, but silently ignoring a user's deliberate choice is
 * confusing — an explicit reset + message is clearer.
 */
async function guardNewToolSelectionForNonA5(e: vscode.ConfigurationChangeEvent): Promise<void> {
  const isA5 = isAscendA5ProfilerCannSoc(resolveEffectiveCannSoc());

  if (isA5) {
    return;
  }

  const simToolKey = settingsKey('performanceTuning.simulation.tool');
  const onBoardToolKey = settingsKey('performanceTuning.onBoard.tool');

  if (e.affectsConfiguration(simToolKey)) {
    const configured = ConfigService.readOpDevtoolsSetting<string>('performanceTuning.simulation.tool');

    if (configured === 'npu-emulate') {
      await ConfigService.writeOpDevtoolsDottedSettings({ 'performanceTuning.simulation.tool': 'msprof' });
      vscode.window.showWarningMessage(t('performanceTuning.simulation.tool.notA5ResetToMsprof'));
    }
  }

  if (e.affectsConfiguration(onBoardToolKey)) {
    const configured = ConfigService.readOpDevtoolsSetting<string>('performanceTuning.onBoard.tool');

    if (configured === 'npu-compute') {
      await ConfigService.writeOpDevtoolsDottedSettings({ 'performanceTuning.onBoard.tool': 'msprof' });
      vscode.window.showWarningMessage(t('performanceTuning.onBoard.tool.notA5ResetToMsprof'));
    }
  }
}

/**
 * Keep the `--simulator` flag in `simulationCompileCommand` consistent with the
 * selected simulation tool:
 *  - `npu-emulate` (A5): the CANN simulator build path is unused, so remove
 *    `--simulator` if present.
 *  - `msprof`: the legacy flow requires `--simulator`, so add it if missing.
 *
 * Runs after {@link guardNewToolSelectionForNonA5} so a non-A5 `npu-emulate`
 * selection has already been reset to `msprof` before the flag is synced.
 */
async function syncSimulatorFlagWithSimulationTool(): Promise<void> {
  const tool = ConfigService.readOpDevtoolsSetting<string>('performanceTuning.simulation.tool');
  const script = ConfigService.readOpDevtoolsSetting<string>('compileAndDeploy.buildConfig.simulationCompileCommand');

  if (typeof script !== 'string' || !script.trim()) {
    return;
  }

  let nextScript: string;

  if (tool === 'npu-emulate') {
    nextScript = stripSimulatorFlag(script);
  }
  else if (tool === 'msprof') {
    nextScript = ensureSimulatorFlag(script);
  }
  else {
    return;
  }

  if (nextScript === script) {
    return;
  }

  await ConfigService.writeOpDevtoolsDottedSettings({ 'compileAndDeploy.buildConfig.simulationCompileCommand': nextScript });
}

export function createMainConfigHandler(deps: MainConfigWatchDeps) {
  const { logDebug } = deps;
  const onBoardOperatorMetricsSyncFlight = new AsyncSingleFlight<void>();

  return async (e: vscode.ConfigurationChangeEvent): Promise<void> => {
    const onBoardOperatorMetricsAffected = e.affectsConfiguration(settingsKey('performanceTuning.onBoard.operatorMetrics'));
    const onBoardAffected = e.affectsConfiguration(settingsKey('performanceTuning.onBoard'));
    const tritonSupportAffected = e.affectsConfiguration(settingsKey('operatorSupport.triton'));
    const operatorSupportAffected = e.affectsConfiguration(settingsKey('operatorSupport'));
    const envAffected = e.affectsConfiguration(settingsKey('environment'));
    const opDevtoolsAffected = e.affectsConfiguration(SETTINGS_PREFIX);
    const simulationToolAffected = e.affectsConfiguration(settingsKey('performanceTuning.simulation.tool'));

    logDebug('event:onDidChangeConfiguration', {
      onBoardAffected,
      onBoardOperatorMetricsAffected,
      operatorSupportAffected,
      tritonSupportAffected,
      envAffected,
      opDevtoolsAffected,
      simulationToolAffected,
    });

    let shouldSyncAscendEnvFromWorkspace = false;

    for (const area of MAIN_CONFIG_AREAS) {
      switch (area) {
        case 'onBoard': {
          if (!onBoardAffected && !onBoardOperatorMetricsAffected) {
            break;
          }

          if (isIdeSettingsFileEmpty()) {
            logDebug('watchMainConfig:onBoard:skipEmptySettingsFile');
            break;
          }

          // Sub-key: parent operatorMetrics toggles child metric keys.
          if (onBoardOperatorMetricsAffected) {
            await onBoardOperatorMetricsSyncFlight
              .run(() => syncOnBoardOperatorMetricChildren())
              .catch((error) => {
                console.warn('[watchMainConfig] onBoard operatorMetrics sync failed:', error);
              });
          }

          break;
        }
        case 'operatorSupport': {
          if (!operatorSupportAffected && !tritonSupportAffected) {
            break;
          }

          // Sub-key: triton support change may require reload.
          if (tritonSupportAffected) {
            await deps.promptReloadWindow(t('extension.tritonSupportChangedReload'));
          }

          if (operatorSupportAffected) {
            shouldSyncAscendEnvFromWorkspace = true;
          }

          break;
        }
        case 'environment': {
          if (!envAffected) {
            break;
          }

          shouldSyncAscendEnvFromWorkspace = true;
          break;
        }
        case 'opDevtools': {
          if (!opDevtoolsAffected) {
            break;
          }

          // Root: flatten nested op-devtools after all specific handlers.
          await ConfigService.writeOpDevtoolsDottedSettings({});
          break;
        }
        default:
          break;
      }
    }

    // Guard: reset npu-emulate / npu-compute to msprof on non-A5 environments.
    await guardNewToolSelectionForNonA5(e)
      .catch((error) => {
        console.warn('[watchMainConfig] guardNewToolSelectionForNonA5 failed:', error);
      });

    // Keep the `--simulator` flag in the simulation compile command in sync
    // with the selected simulation tool (npu-emulate drops it, msprof adds it).
    // Runs after the non-A5 guard so a reset npu-emulate → msprof is reflected.
    if (simulationToolAffected) {
      await syncSimulatorFlagWithSimulationTool()
        .catch((error) => {
          console.warn('[watchMainConfig] syncSimulatorFlagWithSimulationTool failed:', error);
        });
    }

    if (shouldSyncAscendEnvFromWorkspace) {
      logDebug('event:onDidChangeConfiguration:syncAscendEnvScriptFromWorkspaceSettings:start');
      await deps.projectService.syncAscendEnvScriptFromWorkspaceSettings();
      logDebug('event:onDidChangeConfiguration:syncAscendEnvScriptFromWorkspaceSettings:end');
      deps.operateTreeProvider.notifyConfigurationChanged();
      deps.operatorProjectsTreeProvider.notifyConfigurationChanged();
    }
  };
}

export function createMainConfigWatcher(deps: MainConfigWatchDeps): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration(createMainConfigHandler(deps));
}
