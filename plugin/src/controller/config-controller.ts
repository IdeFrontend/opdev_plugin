import * as vscode from 'vscode';
import { t } from 'i18next';
import { isAscendA5ProfilerCannSoc } from '@shared/msprof-onboard-env';
import { resolveEffectiveCannSoc } from '@plugin/domain/utils/ascend-util';
import {
  ConfigService, configService,
} from '@plugin/service/config-service';
import {
  OnBoardOptions,
  RemotePathSearchParams,
  RemotePathSearchResult,
  SanitizerOptions,
  SimulateOptions,
} from '@shared/api-types';
import type {
  CollectionType, DataCollectionConfig,
} from '@shared/data-collection-config';
import {
  dataCollectionConfigSettingKey,
  mergeSavedDataCollectionConfig,
} from '@shared/data-collection-config';

/**
 * One-shot preselect for the "数据采集配置" dialog. The on-board / simulation
 * entry command stashes which side the user clicked here; `getDataCollectionConfig`
 * consumes it on the next open so the top Collection type switch matches the entry.
 */
let pendingDataCollectionType: CollectionType | null = null;

/** Stash the collection type the next dialog open should preselect (one-shot). */
export function setPendingDataCollectionType(collectionType: CollectionType): void {
  pendingDataCollectionType = collectionType;
}

/** Dotted `performanceTuning.onBoard.*` keys (flat payload, no `user_options` wrapper). */
const ON_BOARD_DOTTED_KEYS = [
  'performanceTuning.onBoard.interCoreLoad',
  'performanceTuning.onBoard.roofline',
  'performanceTuning.onBoard.operatorCodeHotspot',
  'performanceTuning.onBoard.cacheHeatmap',
  'performanceTuning.onBoard.pcSampling',
  'performanceTuning.onBoard.cubeAndVectorInstructionTimeAndRatio',
  'performanceTuning.onBoard.l2CacheHitRate',
  'performanceTuning.onBoard.memoryReadWriteBandwidth',
  'performanceTuning.onBoard.l0ReadWriteBandwidth',
  'performanceTuning.onBoard.ubReadWriteBandwidth',
  'performanceTuning.onBoard.computeAndMoveUnitTimeRatio',
  'performanceTuning.onBoard.resourceConflictRatio',
  'performanceTuning.onBoard.operatorMetrics',
] as const;

/** Dotted `performanceTuning.simulation.*` keys. */
const SIMULATE_DOTTED_KEYS = [
  'performanceTuning.simulation.memoryThroughputWaveform',
  'performanceTuning.simulation.resourceConflictRatio',
] as const;

/** Dotted `sanitizer.*` keys. */
const SANITIZER_DOTTED_KEYS = [
  'sanitizer.toolType',
  'sanitizer.memory',
  'sanitizer.memCheck',
  'sanitizer.sync',
  'sanitizer.race',
  'sanitizer.uninitialized',
  'sanitizer.memoryLeak',
  'sanitizer.allocUnused',
  'sanitizer.reportLogLevel',
  'sanitizer.maxSingleLogFileSize',
  'sanitizer.detectionScope',
  'sanitizer.blockId',
] as const;

/**
 * Read the explicitly set option keys from the merged settings layer
 * (workspace folder > workspace > global). Keys that were never set are omitted,
 * so the panel can merge the result over its defaults.
 */
function readSetOptionKeys<T>(dottedKeys: readonly string[]): Partial<T> {
  const out: Record<string, unknown> = {};

  for (const dottedKey of dottedKeys) {
    const value = ConfigService.readOpDevtoolsSetting<unknown>(dottedKey);

    if (value !== undefined) {
      out[dottedKey.slice(dottedKey.lastIndexOf('.') + 1)] = value;
    }
  }

  return out as Partial<T>;
}

/**
 * Map a flat option payload to dotted relative settings keys, dropping
 * `undefined` fields: `writeOpDevtoolsDottedSettings` deletes a key when its
 * value is `undefined`, and the panels' merged payloads must never delete
 * settings they did not touch.
 */
function definedDottedWrites(
  dottedKeys: readonly string[],
  params: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const writes: Record<string, unknown> = {};

  for (const dottedKey of dottedKeys) {
    const flatKey = dottedKey.slice(dottedKey.lastIndexOf('.') + 1);
    const value = params?.[flatKey];

    if (value !== undefined) {
      writes[dottedKey] = value;
    }
  }

  return writes;
}

export const configMethods = {
  /** Get the explicitly set on-board profiler options (dotted settings). */
  async getOnBoardOptions(): Promise<OnBoardOptions> {
    return readSetOptionKeys<OnBoardOptions>(ON_BOARD_DOTTED_KEYS);
  },

  /** Save on-board profiler options as dotted `performanceTuning.onBoard.*` settings. */
  async saveOnBoardOptions(params: OnBoardOptions): Promise<void> {
    const writes = definedDottedWrites(ON_BOARD_DOTTED_KEYS, params as Record<string, unknown>);

    // The panel surfaces PCSampling only on an A5 profiler and MemoryDetail
    // only on non-A5 (SOC-gated in the section DAO). A save must never persist
    // the HIDDEN counterpart and clobber the other SOC's value.
    if (isAscendA5ProfilerCannSoc(resolveEffectiveCannSoc())) {
      delete writes['performanceTuning.onBoard.cacheHeatmap'];
    }
    else {
      delete writes['performanceTuning.onBoard.pcSampling'];
    }

    await ConfigService.writeOpDevtoolsDottedSettings(writes);
  },

  /** Get the explicitly set simulator options (dotted settings). */
  async getSimulateOptions(): Promise<SimulateOptions> {
    return readSetOptionKeys<SimulateOptions>(SIMULATE_DOTTED_KEYS);
  },

  /** Save simulator options as dotted `performanceTuning.simulation.*` settings. */
  async saveSimulateOptions(params: SimulateOptions): Promise<void> {
    await ConfigService.writeOpDevtoolsDottedSettings(definedDottedWrites(SIMULATE_DOTTED_KEYS, params as Record<string, unknown>));
  },

  /** Get the explicitly set sanitizer options (dotted settings). */
  async getSanitizerOptions(): Promise<SanitizerOptions> {
    return readSetOptionKeys<SanitizerOptions>(SANITIZER_DOTTED_KEYS);
  },

  /**
   * Initial "数据采集配置" dialog config. When the entry command
   * (`COMMAND_DATA_COLLECTION_CONFIG`) stashed a collection type via
   * {@link setPendingDataCollectionType}, honor it so the dialog preselects the
   * side the user clicked (on-board / simulation); otherwise default to whichever
   * new tool is active on A5 (`npu-emulate` → simulate, else `npu-compute` → onboard).
   *
   * The last config the user confirmed for that side (persisted by
   * {@link configMethods.saveDataCollectionConfig}) is merged over the fresh
   * default so reopening the dialog shows the same settings.
   */
  async getDataCollectionConfig(): Promise<DataCollectionConfig> {
    const collectionType: CollectionType = pendingDataCollectionType
      ?? (ConfigService.shouldUseNewSimulationTool() && !ConfigService.shouldUseNewOnBoardTool()
        ? 'simulate'
        : 'onboard');

    // Consume the one-shot preselect so a later reopen falls back to the default.
    pendingDataCollectionType = null;

    const saved = ConfigService.readOpDevtoolsSetting<unknown>(dataCollectionConfigSettingKey(collectionType));

    return mergeSavedDataCollectionConfig(collectionType, saved);
  },

  /**
   * Persist the "数据采集配置" dialog config for its collection type so the next
   * open restores it. Called from the web panel on 确认. `collectionType` is not
   * itself stored (it is the setting key), and a failed write is swallowed — the
   * collection run itself must not be blocked by a settings-file write error.
   */
  async saveDataCollectionConfig(config: DataCollectionConfig): Promise<void> {
    try {
      await ConfigService.writeOpDevtoolsDottedSettings({ [dataCollectionConfigSettingKey(config.collectionType)]: config });
    }
    catch (_) {
      // Persisting the dialog config is best-effort; keep the run flow going.
    }
  },

  /**
   * Save sanitizer options as dotted `sanitizer.*` settings.
   * Keeps the old `saveSanitizerForm` UX: a failed write surfaces
   * `config.saveSanitizerConfigFailed` instead of bubbling up.
   */
  async saveSanitizerOptions(params: SanitizerOptions): Promise<void> {
    try {
      await ConfigService.writeOpDevtoolsDottedSettings(definedDottedWrites(SANITIZER_DOTTED_KEYS, params as Record<string, unknown>));
    }
    catch {
      vscode.window.showErrorMessage(t('config.saveSanitizerConfigFailed'));
    }
  },

  /**
   * Remote path search (new-project wizard).
   */
  async remotePathSearch(params: RemotePathSearchParams): Promise<RemotePathSearchResult> {
    return await configService.remotePathSearch(params);
  },
};
