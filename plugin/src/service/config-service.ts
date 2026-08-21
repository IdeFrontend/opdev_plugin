import { t } from 'i18next';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { ProjectManager } from '@plugin/core/project/project-manager';
import {
  SaveConfigParams,
  SaveSanitizerFormParams,
  BuildConfig,
  RemotePathSearchParams,
  RemotePathSearchResult,
} from '@shared/api-types';
import {
  getConfig, getConfigById,
} from '@plugin/domain/services/configuration';
import { getFiles } from '@plugin/domain/services/system';
import {
  getOpDevtoolsWorkspaceConfiguration,
  mapKeyValueObjectToAdvanceParams,
  mapSanitizerScopeToUseBlock,
} from '@plugin/helpers/operator-project-workspace-config';
import { isAscendA5ProfilerCannSoc } from '@shared/msprof-onboard-env';
import {
  defaultSanitizerToolTypeForSoc,
  SanitizerToolType,
} from '@shared/cann-env-constants';
import { resolveEffectiveCannSoc } from '@plugin/domain/utils/ascend-util';
import { AsyncSingleFlight } from '@plugin/helpers/async-single-flight';
import {
  ON_BOARD_METRIC_LEGACY_TO_DOTTED,
  SIMULATE_METRIC_LEGACY_TO_DOTTED,
  collectDottedEntriesFromLegacyPairs,
  readLegacyFieldsFromDottedPairs,
} from '@plugin/helpers/workspace-user-options-dotted-map';
import {
  getDevtoolConfigPath, getIdeSettingsFilePath,
} from '@plugin/helpers/ide-config-dir';
import { resolveWorkspaceRoot } from '@plugin/helpers/resolve-workspace-root';
import { projectService } from '@plugin/service/project-service';
import { SETTINGS_PREFIX } from '@shared/flavor';

const CONFIG_TYPES = {
  SANITIZER: 'sanitizer',
  ON_BOARD: 'on_board',
  SIMULATE: 'simulate',
} as const;

const OP_DEVTOOLS_PREFIX = `${SETTINGS_PREFIX}.`;

/** Relative key under `op-devtools`; written as `op-devtools.internal.settingsMigratedFromLegacy`. */
export const SETTINGS_MIGRATED_FROM_LEGACY_KEY = 'internal.settingsMigratedFromLegacy';

const DB_ONLY_USER_OPTION_KEYS = new Set([
  'fileMapList',
  'config_name',
  'target_dir',
  'downloadToLocal',
  'renderInPlatform',
  'dataStoragePath',
  'enableDump',
]);

/** Relative dotted keys under `op-devtools` (e.g. `sanitizer.memory`). */
export type OpDevtoolsDottedWrites = Record<string, unknown>;

function toFullDottedKey(relativeKey: string): string {
  return relativeKey.startsWith(OP_DEVTOOLS_PREFIX)
    ? relativeKey
    : `${OP_DEVTOOLS_PREFIX}${relativeKey}`;
}

function readWorkspaceScopedSetting<T>(relativeKey: string): T | undefined {
  const inspection = getOpDevtoolsWorkspaceConfiguration()
    .inspect<T>(relativeKey);

  if (!inspection) {
    return undefined;
  }

  if (inspection.workspaceFolderValue !== undefined) {
    return inspection.workspaceFolderValue;
  }

  if (inspection.workspaceValue !== undefined) {
    return inspection.workspaceValue;
  }

  return inspection.globalValue;
}

function flattenNestedOpDevtools(
  nested: Record<string, unknown>,
  prefix: string,
  out: Record<string, unknown>,
): void {
  for (const [
    key,
    value,
  ] of Object.entries(nested)) {
    const dottedKey = `${prefix}.${key}`;

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      flattenNestedOpDevtools(value as Record<string, unknown>, dottedKey, out);
    }
    else if (!(dottedKey in out)) {
      out[dottedKey] = value;
    }
  }
}

function parseRawSettingsJson(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const raw = fs.readFileSync(filePath, 'utf8')
    .trim();

  if (!raw) {
    return {};
  }

  return JSON.parse(raw) as Record<string, unknown>;
}

function isLegacyNestedOpDevtoolsRoot(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readSettingsJsonFile(filePath: string): Record<string, unknown> {
  try {
    const parsed = parseRawSettingsJson(filePath);

    if (Object.keys(parsed).length === 0) {
      return {};
    }

    const nested = parsed[SETTINGS_PREFIX];

    if (isLegacyNestedOpDevtoolsRoot(nested)) {
      const rest = { ...parsed };

      delete rest[SETTINGS_PREFIX];
      flattenNestedOpDevtools(nested, SETTINGS_PREFIX, rest);

      return rest;
    }

    return parsed;
  }
  catch (error) {
    console.warn('[readSettingsJsonFile] failed:', filePath, error);

    return {};
  }
}

function assignIfDefined(
  updates: OpDevtoolsDottedWrites,
  key: string,
  value: unknown,
): void {
  if (value !== undefined) {
    updates[key] = value;
  }
}

function assignNonEmptyStringIfDefined(
  updates: OpDevtoolsDottedWrites,
  key: string,
  value: unknown,
): void {
  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (trimmed) {
      updates[key] = trimmed;
    }
  }
}

function setIfDefined(
  opts: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  if (value !== undefined) {
    opts[key] = value;
  }
}

/** Non-empty string from workspace settings only (empty/whitespace → undefined). */
function readNonEmptyOpDevtoolsSetting(relativeKey: string): string | undefined {
  const value = ConfigService.readOpDevtoolsSetting<string>(relativeKey);

  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed : undefined;
}

function normalizeExecutionMode(value: unknown): 'eager' | 'graph' | undefined {
  if (value === 'eager' || value === 'graph') {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const normalized = value.trim();

    if (normalized === 'eager' || normalized === 'graph') {
      return normalized;
    }
  }

  return undefined;
}

function extractDbOnlyUserOptionFields(userOptions: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!userOptions) {
    return {};
  }

  const out: Record<string, unknown> = {};

  for (const key of DB_ONLY_USER_OPTION_KEYS) {
    if (userOptions[key] !== undefined) {
      out[key] = userOptions[key];
    }
  }

  return out;
}

function sanitizerUserOptionsToDottedWrites(opts: Record<string, unknown>): OpDevtoolsDottedWrites {
  const tool = (opts.tool || {}) as Record<string, unknown>;
  const mem = (opts.memcheckOption || {}) as Record<string, unknown>;
  const updates: OpDevtoolsDottedWrites = {};

  assignNonEmptyStringIfDefined(updates, 'compileAndDeploy.buildConfig.sanitizerCompileCommand', opts.script);
  assignIfDefined(updates, 'sanitizer.toolType', opts.toolType);
  assignIfDefined(updates, 'sanitizer.reportLogLevel', opts.logLevel);
  assignIfDefined(updates, 'sanitizer.maxSingleLogFileSize', opts.maxDebuglogSize);
  assignIfDefined(updates, 'sanitizer.memory', tool.memcheck);
  assignIfDefined(updates, 'sanitizer.sync', tool.synccheck);
  assignIfDefined(updates, 'sanitizer.race', tool.racecheck);
  assignIfDefined(updates, 'sanitizer.uninitialized', tool.initcheck);
  assignIfDefined(updates, 'sanitizer.soc', tool.soccheck);
  assignIfDefined(updates, 'sanitizer.over', tool.overcheck);
  assignIfDefined(updates, 'sanitizer.memoryLeak', mem['leak-check']);
  assignIfDefined(updates, 'sanitizer.allocUnused', mem['check-unused-memory']);

  if (typeof opts.useBlock === 'boolean') {
    updates['sanitizer.detectionScope'] = opts.useBlock ? 'singleBlock' : 'global';
  }

  assignIfDefined(updates, 'sanitizer.blockId', opts.blockId);

  return updates;
}

function toKeyValueMapFromAdvanceParam(raw: unknown): Record<string, string> {
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

function onBoardUserOptionsToDottedWrites(opts: Record<string, unknown>): OpDevtoolsDottedWrites {
  const updates: OpDevtoolsDottedWrites = {};

  assignNonEmptyStringIfDefined(updates, 'compileAndDeploy.buildConfig.onBoardCompileCommand', opts.script);

  for (const [
    dotted,
    value,
  ] of collectDottedEntriesFromLegacyPairs(ON_BOARD_METRIC_LEGACY_TO_DOTTED, opts)) {
    assignIfDefined(updates, dotted, value);
  }

  assignIfDefined(updates, 'performanceTuning.onBoard.pcSampling', opts.PCSampling);
  assignIfDefined(updates, 'performanceTuning.onBoard.cacheHeatmap', opts.MemoryDetail);
  updates['performanceTuning.onBoard.parameters'] = toKeyValueMapFromAdvanceParam(opts.advance_param);

  if (typeof opts.operatorMetrics === 'boolean') {
    updates['performanceTuning.onBoard.operatorMetrics'] = opts.operatorMetrics;
  }

  return updates;
}

function simulateUserOptionsToDottedWrites(opts: Record<string, unknown>): OpDevtoolsDottedWrites {
  const updates: OpDevtoolsDottedWrites = {};

  assignNonEmptyStringIfDefined(updates, 'compileAndDeploy.buildConfig.simulationCompileCommand', opts.script);

  for (const [
    dotted,
    value,
  ] of collectDottedEntriesFromLegacyPairs(SIMULATE_METRIC_LEGACY_TO_DOTTED, opts)) {
    assignIfDefined(updates, dotted, value);
  }

  updates['performanceTuning.simulation.parameters'] = toKeyValueMapFromAdvanceParam(opts.advance_param);

  return updates;
}

function isOpDevtoolsSettingsKey(key: string): boolean {
  return key === SETTINGS_PREFIX || key.startsWith(OP_DEVTOOLS_PREFIX);
}

function stripOpDevtoolsKeysFromRaw(raw: Record<string, unknown>): {
  output: Record<string, unknown>;
  removedAny: boolean;
} {
  const output: Record<string, unknown> = {};
  let removedAny = false;

  for (const [
    key,
    value,
  ] of Object.entries(raw)) {
    if (isOpDevtoolsSettingsKey(key)) {
      removedAny = true;
      continue;
    }

    output[key] = value;
  }

  return {
    output,
    removedAny,
  };
}

async function persistIdeSettingsFile(
  filePath: string,
  output: Record<string, unknown>,
  deleteIfEmpty = false,
): Promise<void> {
  if (Object.keys(output).length === 0 && deleteIfEmpty) {
    await fs.promises.rm(filePath, { force: true });

    return;
  }

  await fs.promises.writeFile(
    filePath,
    `${JSON.stringify(output, null, 2)}\n`,
    'utf8',
  );
}

function buildDottedOnlySettingsFileContent(filePath: string): Record<string, unknown> {
  const raw = parseRawSettingsJson(filePath);
  const flat = readSettingsJsonFile(filePath);
  const { output } = stripOpDevtoolsKeysFromRaw(raw);

  for (const [
    key,
    value,
  ] of Object.entries(flat)) {
    if (key.startsWith(OP_DEVTOOLS_PREFIX)) {
      output[key] = value;
    }
  }

  return output;
}

const legacySettingsMigrationFlight = new AsyncSingleFlight<void>();

export function isLegacySettingsMigrationInFlight(): boolean {
  return legacySettingsMigrationFlight.pending !== undefined;
}

/** @internal */
export function resetLegacySettingsMigrationFlightForTest(): void {
  resetLegacySettingsMigrationFlight();
}

export function resetLegacySettingsMigrationFlight(): void {
  legacySettingsMigrationFlight.reset();
}

export class ConfigService {
  /**
   * Remove all `op-devtools` keys from workspace settings.json (dotted and nested).
   * @returns true if settings.json was changed or removed, false if no-op
   */
  static async clearOpDevtoolsWorkspaceSettings(workspaceRoot?: string): Promise<boolean> {
    const root = resolveWorkspaceRoot(workspaceRoot);

    if (!root) {
      console.warn('[clearOpDevtoolsWorkspaceSettings] no workspace root');

      return false;
    }

    const filePath = getIdeSettingsFilePath(root);

    if (!fs.existsSync(filePath)) {
      return false;
    }

    const raw = parseRawSettingsJson(filePath);
    const {
      output, removedAny,
    } = stripOpDevtoolsKeysFromRaw(raw);

    if (!removedAny) {
      return false;
    }

    try {
      await persistIdeSettingsFile(filePath, output, true);

      return true;
    }
    catch (error) {
      console.warn('[clearOpDevtoolsWorkspaceSettings] failed:', error);

      return false;
    }
  }

  /**
   * Batch-write `op-devtools` settings as dotted keys in one `settings.json` update.
   * Also rewrites legacy nested `"op-devtools": { ... }` to dotted keys when present,
   * even when `updates` is empty (existing dotted keys win over nested values).
   * Intentionally uses direct file I/O (not `cfg.update` per key) for performance.
   * Concurrent callers may interleave; last writer wins.
   * @returns true if settings.json was written, false if no-op
   */
  static async writeOpDevtoolsDottedSettings(
    updates: OpDevtoolsDottedWrites = {},
    workspaceRoot?: string,
  ): Promise<boolean> {
    const root = resolveWorkspaceRoot(workspaceRoot);

    if (!root) {
      console.warn('[writeOpDevtoolsDottedSettings] no workspace root');

      return false;
    }

    const filePath = getIdeSettingsFilePath(root);
    const hasUpdates = Object.keys(updates).length > 0;
    const needsNestedMigration = isLegacyNestedOpDevtoolsRoot(parseRawSettingsJson(filePath)[SETTINGS_PREFIX]);

    if (!needsNestedMigration && !hasUpdates) {
      return false;
    }

    try {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });

      const output = buildDottedOnlySettingsFileContent(filePath);

      for (const [
        relativeKey,
        value,
      ] of Object.entries(updates)) {
        const fullKey = toFullDottedKey(relativeKey);

        if (value === undefined) {
          delete output[fullKey];
        }
        else {
          output[fullKey] = value;
        }
      }

      await persistIdeSettingsFile(filePath, output);

      // Sync VS Code configuration cache so that reads via Configuration API
      // (inspect()) immediately reflect the new values. Direct file writes are
      // picked up by VS Code's file watcher asynchronously, which causes stale
      // reads when a subsequent command reads the config right after save
      // (e.g. runSanitizer reading sanitizer.toolType after saveSanitizerForm —
      // without this sync, toolType falls back to the default npu-sanitizer on
      // A5 instead of the user-selected mssanitizer).
      if (hasUpdates) {
        await ConfigService.syncConfigurationCache(updates);
      }

      return true;
    }
    catch (error) {
      console.warn('[writeOpDevtoolsDottedSettings] failed:', error);

      return false;
    }
  }

  /**
   * Push `writeOpDevtoolsDottedSettings` file writes into the VS Code
   * Configuration API memory cache via `cfg.update()`. VS Code's file watcher
   * eventually reloads settings.json on its own, but not synchronously — a
   * read via `workspace.getConfiguration().inspect()` immediately after a
   * direct file write can still return the stale cached value. Mirrors the
   * write+update pattern already used in `ascend-soc-warning.ts`.
   */
  static async syncConfigurationCache(updates: OpDevtoolsDottedWrites): Promise<void> {
    const cfg = getOpDevtoolsWorkspaceConfiguration();

    for (const [
      relativeKey,
      value,
    ] of Object.entries(updates)) {
      try {
        await cfg.update(relativeKey, value, vscode.ConfigurationTarget.Workspace);
      }
      catch (error) {
        console.warn(`[syncConfigurationCache] failed to sync ${relativeKey}:`, error);
      }
    }
  }

  /**
   * Drop seed/migration entries for keys that appeared in settings.json after the initial snapshot,
   * or are explicitly set in the VS Code configuration layer.
   */
  private static filterPendingWritesByCurrentFile(
    pendingWrites: OpDevtoolsDottedWrites,
    cfg: vscode.WorkspaceConfiguration,
    workspaceRoot?: string,
  ): OpDevtoolsDottedWrites {
    const fileKeys = ConfigService.getWorkspaceSettingsFileKeySet(workspaceRoot);
    const filtered: OpDevtoolsDottedWrites = {};

    for (const [
      relativeKey,
      value,
    ] of Object.entries(pendingWrites)) {
      const scratch: OpDevtoolsDottedWrites = {};

      ConfigService.queueSettingIfMissingInFile(scratch, fileKeys, cfg, relativeKey, value);

      if (relativeKey in scratch) {
        filtered[relativeKey] = scratch[relativeKey];
      }
    }

    return filtered;
  }

  private static getWorkspaceSettingsFileKeySet(workspaceRoot?: string): Set<string> {
    const root = resolveWorkspaceRoot(workspaceRoot);

    if (!root) {
      return new Set();
    }

    return new Set(Object.keys(readSettingsJsonFile(getIdeSettingsFilePath(root))));
  }

  private static queueSettingIfMissingInFile(
    pendingWrites: OpDevtoolsDottedWrites,
    fileKeys: Set<string>,
    cfg: vscode.WorkspaceConfiguration,
    relativeKey: string,
    value: unknown,
  ): void {
    if (value === undefined) {
      return;
    }

    const inspection = cfg.inspect<unknown>(relativeKey);
    const explicitlySet = inspection
      && (
        inspection.workspaceFolderValue !== undefined
        || inspection.workspaceValue !== undefined
      );

    if (explicitlySet) {
      return;
    }

    if (fileKeys.has(toFullDottedKey(relativeKey))) {
      return;
    }

    pendingWrites[relativeKey] = value;
  }

  /** Queue every dotted key from a legacy→settings batch (same contract as single `queue` calls). */
  private static queueLegacyDottedWritesBatch(
    pendingWrites: OpDevtoolsDottedWrites,
    fileKeys: Set<string>,
    cfg: vscode.WorkspaceConfiguration,
    batch: OpDevtoolsDottedWrites,
  ): void {
    for (const [
      relativeKey,
      value,
    ] of Object.entries(batch)) {
      ConfigService.queueSettingIfMissingInFile(pendingWrites, fileKeys, cfg, relativeKey, value);
    }
  }

  static isSettingsMigratedFromLegacy(): boolean {
    return ConfigService.readOpDevtoolsSetting<boolean>(SETTINGS_MIGRATED_FROM_LEGACY_KEY) === true;
  }

  /** Persist build_op deploy/run target to workspace settings only. */
  static async writeBuildOpDeployTarget(deployTarget: string): Promise<void> {
    await ConfigService.writeOpDevtoolsDottedSettings({ 'compileAndDeploy.buildConfig.deployCommandOrRunCommand': deployTarget });
  }

  /** Direct read of one `op-devtools` key via VS Code configuration API (backed by settings.json). */
  static readOpDevtoolsSetting<T>(relativeKey: string): T | undefined {
    return readWorkspaceScopedSetting<T>(relativeKey);
  }

  static getDefaultSanitizerToolType(): SanitizerToolType {
    return defaultSanitizerToolTypeForSoc(resolveEffectiveCannSoc());
  }

  /**
   * Build `user_options` for runtime entirely from workspace settings (no legacy DB values).
   * `dbOnlyFields` preserves non-settings metadata still stored only in configs.json (e.g. fileMapList).
   */
  static buildUserOptionsFromWorkspaceSettings(
    configType: string,
    dbOnlyFields: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const opts: Record<string, unknown> = { ...dbOnlyFields };

    if (configType === 'build_op') {
      setIfDefined(opts, 'op', ConfigService.readOpDevtoolsSetting<string>('compileAndDeploy.buildConfig.operatorNameToCompile'));
      setIfDefined(opts, 'target_file', ConfigService.readOpDevtoolsSetting<string>('compileAndDeploy.buildConfig.deployCommandOrRunCommand'));
      setIfDefined(opts, 'script', readNonEmptyOpDevtoolsSetting('compileAndDeploy.buildConfig.compileCommand'));
      setIfDefined(opts, 'cpu_debug_script', readNonEmptyOpDevtoolsSetting('compileAndDeploy.buildConfig.cpuDebugCompileCommand'));
      setIfDefined(opts, 'npu_debug_script', readNonEmptyOpDevtoolsSetting('compileAndDeploy.buildConfig.npuDebugCompileCommand'));

      return opts;
    }

    if (configType === 'build_example') {
      setIfDefined(opts, 'script', readNonEmptyOpDevtoolsSetting('compileAndDeploy.exampleBuildConfig.runCommand'));
      setIfDefined(
        opts,
        'execution_mode',
        normalizeExecutionMode(readNonEmptyOpDevtoolsSetting('compileAndDeploy.exampleBuildConfig.executionMode')),
      );
      // Example-filename match patterns (RegExp; default to the build.sh contract); let a
      // project with a different example naming convention override per-operator mode
      // detection.
      setIfDefined(
        opts,
        'eager_example_pattern',
        readNonEmptyOpDevtoolsSetting('compileAndDeploy.exampleBuildConfig.eagerExamplePattern'),
      );
      setIfDefined(
        opts,
        'graph_example_pattern',
        readNonEmptyOpDevtoolsSetting('compileAndDeploy.exampleBuildConfig.graphExamplePattern'),
      );

      return opts;
    }

    if (configType === 'simulate') {
      setIfDefined(opts, 'script', readNonEmptyOpDevtoolsSetting('compileAndDeploy.buildConfig.simulationCompileCommand'));
      setIfDefined(opts, 'simulatorType', ConfigService.readOpDevtoolsSetting<string>('performanceTuning.simulation.simulatorType'));
      setIfDefined(opts, 'PMSampling', ConfigService.readOpDevtoolsSetting<boolean>('performanceTuning.simulation.memoryThroughputWaveform'));
      setIfDefined(opts, 'ResourceConflictRatio', ConfigService.readOpDevtoolsSetting<boolean>('performanceTuning.simulation.resourceConflictRatio'));
      const params = ConfigService.readOpDevtoolsSetting<unknown>('performanceTuning.simulation.parameters');
      const advance = mapKeyValueObjectToAdvanceParams(params)
        ?? (Array.isArray(params) ? params : undefined);

      if (advance !== undefined) {
        opts.advance_param = advance;
      }

      return opts;
    }

    if (configType === 'ut_test') {
      setIfDefined(opts, 'script', readNonEmptyOpDevtoolsSetting('compileAndDeploy.buildConfig.utTestCompileCommand'));

      return opts;
    }

    if (configType === 'on_board') {
      setIfDefined(opts, 'script', readNonEmptyOpDevtoolsSetting('compileAndDeploy.buildConfig.onBoardCompileCommand'));
      readLegacyFieldsFromDottedPairs(
        ON_BOARD_METRIC_LEGACY_TO_DOTTED,
        (key) => ConfigService.readOpDevtoolsSetting(key),
        opts,
        setIfDefined,
      );

      const isA5Profiler = isAscendA5ProfilerCannSoc(resolveEffectiveCannSoc());
      const pcSampling = ConfigService.readOpDevtoolsSetting<boolean>('performanceTuning.onBoard.pcSampling');

      if (pcSampling !== undefined && isA5Profiler) {
        opts.PCSampling = pcSampling;
      }

      const cacheHeatmap = ConfigService.readOpDevtoolsSetting<boolean>('performanceTuning.onBoard.cacheHeatmap');

      if (cacheHeatmap !== undefined && !isA5Profiler) {
        opts.MemoryDetail = cacheHeatmap;
      }

      const onBoardParams = ConfigService.readOpDevtoolsSetting<unknown>('performanceTuning.onBoard.parameters');
      const onBoardAdvance = mapKeyValueObjectToAdvanceParams(onBoardParams)
        ?? (Array.isArray(onBoardParams) ? onBoardParams : undefined);

      if (onBoardAdvance !== undefined) {
        opts.advance_param = onBoardAdvance;
      }

      setIfDefined(
        opts,
        'operatorMetrics',
        ConfigService.readOpDevtoolsSetting<boolean>('performanceTuning.onBoard.operatorMetrics'),
      );

      return opts;
    }

    if (configType === 'sanitizer') {
      const configuredToolType = ConfigService.readOpDevtoolsSetting<string>('sanitizer.toolType');

      setIfDefined(opts, 'script', readNonEmptyOpDevtoolsSetting('compileAndDeploy.buildConfig.sanitizerCompileCommand'));

      if (ConfigService.getDefaultSanitizerToolType() === 'mssanitizer') {
        opts.toolType = 'mssanitizer';
      }
      else {
        opts.toolType = configuredToolType === 'mssanitizer' || configuredToolType === 'npu-sanitizer'
          ? configuredToolType
          : ConfigService.getDefaultSanitizerToolType();
      }

      setIfDefined(opts, 'logLevel', ConfigService.readOpDevtoolsSetting<string>('sanitizer.reportLogLevel'));
      setIfDefined(opts, 'maxDebuglogSize', ConfigService.readOpDevtoolsSetting<number>('sanitizer.maxSingleLogFileSize'));

      const scope = ConfigService.readOpDevtoolsSetting<string>('sanitizer.detectionScope');

      if (scope !== undefined) {
        const useBlock = mapSanitizerScopeToUseBlock(scope);

        if (useBlock !== undefined) {
          opts.useBlock = useBlock;
        }
      }

      setIfDefined(opts, 'blockId', ConfigService.readOpDevtoolsSetting<number>('sanitizer.blockId'));

      const tool: Record<string, unknown> = {};
      const sanitizerToolMap: Array<[string, string]> = [
        [
          'memory',
          'memcheck',
        ],
        [
          'sync',
          'synccheck',
        ],
        [
          'race',
          'racecheck',
        ],
        [
          'uninitialized',
          'initcheck',
        ],
        [
          'soc',
          'soccheck',
        ],
        [
          'over',
          'overcheck',
        ],
      ];

      for (const [
        settingKey,
        toolKey,
      ] of sanitizerToolMap) {
        const value = ConfigService.readOpDevtoolsSetting<boolean>(`sanitizer.${settingKey}`);

        if (value !== undefined) {
          tool[toolKey] = value;
        }
      }

      if (Object.keys(tool).length > 0) {
        opts.tool = tool;
      }

      const memcheckOption: Record<string, unknown> = {};
      const memcheckOptionMap: Array<[string, string]> = [
        [
          'memoryLeak',
          'leak-check',
        ],
        [
          'allocUnused',
          'check-unused-memory',
        ],
      ];

      for (const [
        settingKey,
        optKey,
      ] of memcheckOptionMap) {
        const value = ConfigService.readOpDevtoolsSetting<boolean>(`sanitizer.${settingKey}`);

        if (value !== undefined) {
          memcheckOption[optKey] = value;
        }
      }

      if (Object.keys(memcheckOption).length > 0) {
        opts.memcheckOption = memcheckOption;
      }

      return opts;
    }

    return opts;
  }

  /**
   * Attach workspace-sourced `user_options` to config rows (operate tree / commands run post-migration).
   * Legacy DB supplies row identity and db-only fields (e.g. fileMapList) only.
   */
  static applyWorkspaceSettingsToConfigs(configs: BuildConfig[]): BuildConfig[] {
    return configs.map((config) => {
      const configType = (config.config_type
        ?? (config as { config_type?: string }).config_type) as string;
      const dbOnly = extractDbOnlyUserOptionFields(config.user_options as Record<string, unknown> | undefined);
      const user_options = ConfigService.buildUserOptionsFromWorkspaceSettings(configType, dbOnly);
      const script = user_options.script as string | undefined;
      let target_file: string | undefined;

      if (configType === 'build_op') {
        target_file = (user_options.target_file as string | undefined)
          ?? ConfigService.readBuildOpDeployTargetFromWorkspace();
      }
      else if (configType === 'sanitizer') {
        // The sanitizer Python target (e.g. Triton `python3 <file>`) is synced into the persisted
        // user_options by syncSanitizerPythonTargetFromActiveEditor. The workspace-settings rebuild
        // above does not reproduce it, so surface it here for the top-level target_file that command
        // builders (e.g. TritonCommandStrategy.getProfilerTargetFile) read.
        const dbUserOptions = config.user_options as Record<string, unknown> | undefined;

        target_file = dbUserOptions?.target_file as string | undefined;
      }

      return {
        ...config,
        user_options,
        script,
        target_file,
      };
    });
  }

  /** Config row for command generation: DB identity + workspace settings only after migration. */
  static getRuntimeConfigById(configId: number): BuildConfig | undefined {
    const raw = getConfigById(configId) as Record<string, unknown> | undefined;

    if (!raw) {
      return undefined;
    }

    const config = {
      ...raw,
      user_options: raw.user_options
        ? (raw.user_options as Record<string, unknown>)
        : undefined,
    } as BuildConfig;

    const [resolved] = ConfigService.applyWorkspaceSettingsToConfigs([config]);

    return resolved;
  }

  /** build_op deploy/run target from workspace settings (post-migration path). */
  static readBuildOpDeployTargetFromWorkspace(): string | undefined {
    return ConfigService.readOpDevtoolsSetting<string>('compileAndDeploy.buildConfig.deployCommandOrRunCommand');
  }

  /**
   * One-time legacy DB → settings.json migration when the flag is absent.
   * Safe to call from project open, sidebar refresh, or right after legacy config creation.
   * Concurrent callers share one in-flight migration (single-flight).
   */
  async maybeMigrateLegacySettingsToWorkspace(): Promise<void> {
    if (ConfigService.isSettingsMigratedFromLegacy()) {
      return;
    }

    await legacySettingsMigrationFlight.run(async () => {
      try {
        await this.migrateLegacySettingsToWorkspace();
      }
      catch (error) {
        console.warn('[maybeMigrateLegacySettingsToWorkspace] failed:', error);
      }
    });
  }

  /**
   * Copy all in-scope legacy `user_options` into workspace settings.json and set the migration flag.
   * Caller must invoke only after legacy rows exist (see plan doc for hook sites).
   */
  async migrateLegacySettingsToWorkspace(): Promise<void> {
    if (ConfigService.isSettingsMigratedFromLegacy()) {
      return;
    }

    const projectId = ProjectManager.getInstance().projectId;

    if (!projectId) {
      return;
    }

    const buildOpRows = getConfig(Number(projectId), 'build_op');

    if (buildOpRows.length === 0) {
      return;
    }

    const pendingWrites = await ConfigService.buildLegacySettingsMigrationWrites();
    const cfg = getOpDevtoolsWorkspaceConfiguration();
    const filteredWrites = ConfigService.filterPendingWritesByCurrentFile(pendingWrites, cfg);
    const seedKeys = Object.keys(filteredWrites)
      .filter((key) => key !== SETTINGS_MIGRATED_FROM_LEGACY_KEY);

    if (seedKeys.length === 0) {
      return;
    }

    filteredWrites[SETTINGS_MIGRATED_FROM_LEGACY_KEY] = true;
    const wrote = await ConfigService.writeOpDevtoolsDottedSettings(filteredWrites);

    if (!wrote) {
      return;
    }
  }

  private static async buildLegacySettingsMigrationWrites(): Promise<OpDevtoolsDottedWrites> {
    const projectId = Number(ProjectManager.getInstance().projectId);
    const configs = ConfigService.loadBuildConfigsFromDb(projectId);
    const buildOp = configs.find((c) => c.config_type === 'build_op');
    const buildExample = configs.find((c) => c.config_type === 'build_example');
    const simulate = configs.find((c) => c.config_type === 'simulate');
    const onBoard = configs.find((c) => c.config_type === 'on_board');
    const utTest = configs.find((c) => (c as { config_type?: string }).config_type === 'ut_test');
    const sanitizerRows = getConfig(projectId, CONFIG_TYPES.SANITIZER);
    const sanitizerOpts = (sanitizerRows[0]?.user_options || {}) as Record<string, unknown>;
    const projectSH = await projectService.getProjectSH();

    const buildOpOpts = (buildOp?.user_options || {}) as Record<string, unknown>;
    const buildExampleOpts = (buildExample?.user_options || {}) as Record<string, unknown>;
    const simulateOpts = (simulate?.user_options || {}) as Record<string, unknown>;
    const onBoardOpts = (onBoard?.user_options || {}) as Record<string, unknown>;
    const utTestOpts = (utTest?.user_options || {}) as Record<string, unknown>;

    const cfg = getOpDevtoolsWorkspaceConfiguration();
    const fileKeys = ConfigService.getWorkspaceSettingsFileKeySet();
    const pendingWrites: OpDevtoolsDottedWrites = {};
    const queue = (key: string, value: unknown) => {
      ConfigService.queueSettingIfMissingInFile(pendingWrites, fileKeys, cfg, key, value);
    };
    const queueNonEmptyString = (key: string, value: unknown) => {
      if (typeof value === 'string' && value.trim()) {
        queue(key, value.trim());
      }
    };

    queue('compileAndDeploy.buildConfig.operatorNameToCompile', buildOpOpts.op);
    queue('compileAndDeploy.buildConfig.deployCommandOrRunCommand', buildOpOpts.target_file);
    queueNonEmptyString('compileAndDeploy.buildConfig.compileCommand', buildOpOpts.script);
    queueNonEmptyString('compileAndDeploy.buildConfig.cpuDebugCompileCommand', buildOpOpts.cpu_debug_script);
    queueNonEmptyString('compileAndDeploy.buildConfig.npuDebugCompileCommand', buildOpOpts.npu_debug_script);
    queueNonEmptyString('compileAndDeploy.buildConfig.onBoardCompileCommand', onBoardOpts.script);
    queueNonEmptyString('compileAndDeploy.buildConfig.simulationCompileCommand', simulateOpts.script);
    queueNonEmptyString('compileAndDeploy.buildConfig.utTestCompileCommand', utTestOpts.script);

    if (buildExample) {
      queue(
        'compileAndDeploy.exampleBuildConfig.executionMode',
        normalizeExecutionMode(buildExampleOpts.execution_mode) ?? 'eager',
      );
      queueNonEmptyString('compileAndDeploy.exampleBuildConfig.runCommand', buildExampleOpts.script);
    }

    ConfigService.queueLegacyDottedWritesBatch(
      pendingWrites,
      fileKeys,
      cfg,
      sanitizerUserOptionsToDottedWrites(sanitizerOpts),
    );
    queue('sanitizer.showQuickOptions', true);

    if (typeof sanitizerOpts.useBlock !== 'boolean') {
      queue('sanitizer.detectionScope', 'global');
    }

    queue('sanitizer.blockId', sanitizerOpts.blockId ?? null);

    queue('performanceTuning.simulation.showQuickOptions', true);
    ConfigService.queueLegacyDottedWritesBatch(
      pendingWrites,
      fileKeys,
      cfg,
      simulateUserOptionsToDottedWrites(simulateOpts),
    );

    queue('performanceTuning.onBoard.showQuickOptions', true);
    ConfigService.queueLegacyDottedWritesBatch(
      pendingWrites,
      fileKeys,
      cfg,
      onBoardUserOptionsToDottedWrites(onBoardOpts),
    );
    const metricKeys = [
      'ArithmeticUtilization',
      'L2Cache',
      'Memory',
      'MemoryL0',
      'MemoryUB',
      'PipeUtilization',
      'ResourceConflictRatio',
    ] as const;
    const allMetricEnabled = metricKeys.every((key) => onBoardOpts[key] === true);

    queue('performanceTuning.onBoard.operatorMetrics', allMetricEnabled);

    queue('environment.environmentScript', projectSH);

    return pendingWrites;
  }

  private static loadBuildConfigsFromDb(projectId: number): BuildConfig[] {
    const types = [
      'build_op',
      'build_example',
      'simulate',
      'on_board',
      'ut_test',
    ] as const;
    const configs: BuildConfig[] = [];

    for (const configType of types) {
      for (const row of getConfig(projectId, configType)) {
        configs.push({
          ...row,
          user_options: row.user_options
            ? (row.user_options as Record<string, unknown>)
            : undefined,
        } as BuildConfig);
      }
    }

    return configs;
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
   * Save configuration (simulation/boarding) — settings.json only (no legacy DB).
   */
  async saveConfig(params: SaveConfigParams): Promise<void> {
    const row = (params.data as Record<string, unknown>[])[0];
    const opts = ((row?.user_options || {}) as Record<string, unknown>);

    if (params.type === CONFIG_TYPES.ON_BOARD) {
      await ConfigService.writeOpDevtoolsDottedSettings(onBoardUserOptionsToDottedWrites(opts));
    }

    if (params.type === CONFIG_TYPES.SIMULATE) {
      await ConfigService.writeOpDevtoolsDottedSettings(simulateUserOptionsToDottedWrites(opts));
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
    const checkPath = resolveWorkspaceRoot();

    if (!checkPath) {
      console.log('checkDevtoolConfig: no available path, return false');

      return false;
    }

    console.log('checkDevtoolConfig: using path:', checkPath);

    const devtoolConfigPath = getDevtoolConfigPath(checkPath);

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
    return ConfigService.applyWorkspaceSettingsToConfigs(this.loadSanitizerConfigsFromDb());
  }

  /**
   * Save anomaly detection form configuration
   */
  async saveSanitizerForm(params: SaveSanitizerFormParams): Promise<void> {
    try {
      const formOpts = params.data as Record<string, unknown>;

      await ConfigService.writeOpDevtoolsDottedSettings(sanitizerUserOptionsToDottedWrites(formOpts));

      if (params.showMessage) {
        vscode.window.showInformationMessage(t('config.saveSanitizerConfigSuccess'));
      }
    }
    catch {
      vscode.window.showErrorMessage(t('config.saveSanitizerConfigFailed'));
    }
  }
}

export const configService = new ConfigService();
