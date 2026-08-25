import { t } from 'i18next';
import * as vscode from 'vscode';

import {
  SETTINGS_PREFIX, settingsKey,
} from '@shared/flavor';
import { AsyncSingleFlight } from '@plugin/helpers/async-single-flight';
import { isIdeSettingsFileEmpty } from '@plugin/helpers/ide-config-dir';
import { ConfigService } from '@plugin/service/config-service';
import type { ProjectService } from '@plugin/service/project-service';

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

    logDebug('event:onDidChangeConfiguration', {
      onBoardAffected,
      onBoardOperatorMetricsAffected,
      operatorSupportAffected,
      tritonSupportAffected,
      envAffected,
      opDevtoolsAffected,
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
