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
  CollectionType, DataCollectionConfig, NpuComputeSectionSelection,
} from '@shared/data-collection-config';
import {
  DATA_COLLECTION_CAMEL_TO_SECTION,
  DATA_COLLECTION_SECTIONS,
  NPU_COMPUTE_SECTION_DOTTED_KEYS,
  dataCollectionConfigSettingKey,
  mergeSavedDataCollectionConfig,
  resolveSelectedSections,
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

/**
 * Read the selected npu-compute sections from the 8 per-section boolean
 * settings (the single source of truth for on-board section selection).
 * Returns section names in {@link DATA_COLLECTION_SECTIONS} order, filtered to
 * those whose boolean is `true` or unset (the per-section default is `true`;
 * only an explicit `false` deselects).
 *
 * Module-level (not a `configMethods` method): the API router extracts handler
 * references from the object and invokes them standalone, so a `this`-based
 * method would see `this === undefined` at runtime.
 */
export async function getNpuComputeSections(): Promise<string[]> {
  const sel = readSetOptionKeys<NpuComputeSectionSelection>(NPU_COMPUTE_SECTION_DOTTED_KEYS);

  return DATA_COLLECTION_SECTIONS.filter((section) => {
    const camel = NPU_COMPUTE_SECTION_DOTTED_KEYS[DATA_COLLECTION_SECTIONS.indexOf(section)]
      .split('.')
      .pop()!;

    // Unset (undefined) defaults to true — only an explicit false deselects.
    return sel[camel as keyof NpuComputeSectionSelection] !== false;
  });
}

/**
 * Persist the npu-compute section selection to the 8 per-section boolean
 * settings. Each of the 8 booleans is written explicitly (true when selected,
 * false otherwise) so deselecting a section clears its setting. No SOC gating
 * — all 8 npu-compute sections are supported on-board.
 */
export async function saveNpuComputeSections(sections: readonly string[]): Promise<void> {
  const wanted = new Set(sections);
  const writes: Record<string, boolean> = {};

  for (const dottedKey of NPU_COMPUTE_SECTION_DOTTED_KEYS) {
    const camel = dottedKey.split('.')
      .pop()!;
    const section = DATA_COLLECTION_CAMEL_TO_SECTION[camel];

    writes[dottedKey] = wanted.has(section);
  }

  await ConfigService.writeOpDevtoolsDottedSettings(writes);
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

  // Module-level implementations referenced (not `this`-bound methods): the API
  // router invokes extracted handler references standalone, where `this` would
  // be undefined. Re-exposed here so callers/tests can use them via the object.
  getNpuComputeSections,
  saveNpuComputeSections,

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
   *
   * On-board: migrates any legacy `saved.metrics.sections` array (the pre-boolean
   * shape) into the 8 per-section boolean settings and strips it from the saved
   * object, then reads the booleans as the single source of truth. The migration
   * is idempotent — once `metrics.sections` is gone it never re-triggers.
   */
  async getDataCollectionConfig(): Promise<DataCollectionConfig> {
    const collectionType: CollectionType = pendingDataCollectionType
      ?? (ConfigService.shouldUseNewSimulationTool() && !ConfigService.shouldUseNewOnBoardTool()
        ? 'simulate'
        : 'onboard');

    // Consume the one-shot preselect so a later reopen falls back to the default.
    pendingDataCollectionType = null;

    const settingKey = dataCollectionConfigSettingKey(collectionType);
    let saved = ConfigService.readOpDevtoolsSetting<unknown>(settingKey);

    // Migrate legacy on-board shape: saved.metrics.sections array → 8 booleans.
    if (collectionType === 'onboard' && saved && typeof saved === 'object') {
      const savedObj = saved as Record<string, unknown>;
      const metrics = savedObj.metrics as Record<string, unknown> | undefined;

      if (metrics && Array.isArray(metrics.sections)) {
        const legacySections = (metrics.sections as unknown[])
          .filter((s): s is string => typeof s === 'string')
          .filter((s) => DATA_COLLECTION_SECTIONS.includes(s));

        try {
          // Write the 8 booleans (single source of truth) from the legacy array.
          await saveNpuComputeSections(legacySections);
          // Strip the legacy field so the migration never re-triggers, then persist.
          delete metrics.sections;
          await ConfigService.writeOpDevtoolsDottedSettings({ [settingKey]: savedObj });
          saved = savedObj;
        }
        catch (_) {
          // Best-effort migration; the next open will retry since sections still set.
        }
      }
    }

    // On-board: the 8 booleans are the source of truth; simulate has none.
    const sectionSelection = collectionType === 'onboard'
      ? await getNpuComputeSections()
      : undefined;

    return mergeSavedDataCollectionConfig(collectionType, saved, sectionSelection);
  },

  /**
   * Persist the "数据采集配置" dialog config for its collection type so the next
   * open restores it. Called from the web panel on 确认. `collectionType` is not
   * itself stored (it is the setting key), and a failed write is swallowed — the
   * collection run itself must not be blocked by a settings-file write error.
   *
   * On-board: the 8 per-section booleans are the single source of truth, so the
   * resolved sections are written to them, and only the non-section dialog state
   * (common.outputFile/forceOverwrite, metrics.kind/set UI linkage) is persisted
   * to the object key — `metrics.sections` and `common.commandLine` are derived,
   * never stored. Simulate keeps the legacy whole-object write (npu-emulate gated).
   */
  async saveDataCollectionConfig(config: DataCollectionConfig): Promise<void> {
    try {
      if (config.collectionType === 'onboard') {
        // Source of truth: write the 8 section booleans.
        await saveNpuComputeSections(resolveSelectedSections(config));

        // Persist only the derived state (common + UI linkage), not sections/commandLine.
        const {
          outputFile, forceOverwrite,
        } = config.common;
        const cleaned: DataCollectionConfig = {
          ...config,
          common: {
            ...config.common,
            outputFile,
            forceOverwrite,
            commandLine: '',
          },
          metrics: {
            kind: config.metrics.kind,
            set: config.metrics.set,
            sections: [],
          },
        };

        await ConfigService.writeOpDevtoolsDottedSettings({ [dataCollectionConfigSettingKey('onboard')]: cleaned });
      }
      else {
        await ConfigService.writeOpDevtoolsDottedSettings({ [dataCollectionConfigSettingKey(config.collectionType)]: config });
      }
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
