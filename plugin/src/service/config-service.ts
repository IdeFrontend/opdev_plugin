import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import {
  RemotePathSearchParams,
  RemotePathSearchResult,
} from '@shared/api-types';
import { getFiles } from '@plugin/domain/services/system';
import {
  getOpDevtoolsWorkspaceConfiguration,
  getAscendEnvScriptWithWorkspaceOverride,
  getConfiguredValue,
  mapKeyValueObjectToAdvanceParams,
  mapSanitizerScopeToUseBlock,
} from '@plugin/helpers/operator-project-workspace-config';
import { isAscendA5ProfilerCannSoc } from '@shared/msprof-onboard-env';
import {
  defaultSanitizerToolTypeForSoc,
  SanitizerToolType,
} from '@shared/cann-env-constants';
import { resolveEffectiveCannSoc } from '@plugin/domain/utils/ascend-util';
import {
  ON_BOARD_METRIC_LEGACY_TO_DOTTED,
  SIMULATE_METRIC_LEGACY_TO_DOTTED,
  collectDottedEntriesFromLegacyPairs,
} from '@plugin/helpers/workspace-user-options-dotted-map';
import {
  getDevtoolConfigPath, getIdeSettingsFilePath, getLegacyUserDataDir, getLegacyWorkspaceConfigsFile,
} from '@plugin/helpers/ide-config-dir';
import { resolveWorkspaceRoot } from '@plugin/helpers/resolve-workspace-root';
import {
  guardedPersistIdeSettingsFile, tryParseSettingsJsonc,
} from '@plugin/helpers/ide-settings-persist';
import {
  readWorkspaceCache, type FileMapEntry,
} from '@plugin/helpers/workspace-cache';
import {
  normalizeProjectPath, projectPathsEqual,
} from '@plugin/domain/models/project-model';
import {
  sanitizerTargetKeyForOp,
  type OpRecord,
} from '@plugin/domain/models/op-record';
import { OperatorProjectType } from '@plugin/domain/models/operator-project-type';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import { isStandardCustomProjectType } from '@shared/project-type-view-id';
import { SETTINGS_PREFIX } from '@shared/flavor';

const CONFIG_TYPES = {
  SANITIZER: 'sanitizer',
  ON_BOARD: 'on_board',
  SIMULATE: 'simulate',
} as const;

const OP_DEVTOOLS_PREFIX = `${SETTINGS_PREFIX}.`;

/** Sanitizer defaults seeded for fresh projects: tool set, memcheck
 * sub-options, warn log, 1 KiB cap. */
export const DEFAULT_SANITIZER_DETECTION_OPTIONS = {
  tool: {
    memcheck: true,
    racecheck: true,
    initcheck: true,
    synccheck: false,
  },
  memcheckOption: {
    'check-unused-memory': true,
    'leak-check': true,
    'check-device-heap': false,
    'check-cann-heap': false,
  },
  logLevel: 'warn',
  maxDebuglogSize: 1024,
  useBlock: false,
  blockId: null,
} as const;

/** Relative dotted keys under `op-devtools` (e.g. `sanitizer.memory`). */
export type OpDevtoolsDottedWrites = Record<string, unknown>;

/**
 * Typed per-section DAO shapes returned by the factories ({@link ConfigService.getBuildOpConfig}
 * et al.) — the settings-native form of the `user_options`-shaped runtime rows. Consumers
 * read one concrete DAO per section; the string row form and any section-key dispatch
 * survive only in the one-time import.
 */

export type AdvanceParam = { name: string;
  value: string };

export interface BuildOpConfig {
  script: string;
  cpuDebugScript: string;
  npuDebugScript: string;
  targetFile: string | null;
  /**
   * Operator the build_op config was saved for
   * (`compileAndDeploy.buildConfig.operatorNameToCompile`); the resolution
   * fallback when the sidebar has no selection.
   */
  op?: string;
}

export interface BuildExampleConfig {
  script: string;
  executionMode: 'eager' | 'graph';
  eagerExamplePattern: string | undefined;
  graphExamplePattern: string | undefined;
  targetFile: string | null;
}

export interface UtTestConfig {
  script: string;
}

export interface SimulateConfig {
  script: string;
  simulatorType: string;
  memoryThroughputWaveform: boolean;
  resourceConflictRatio: boolean;
  advanceParam: AdvanceParam[];
  fileMapList: FileMapEntry[];
}

export interface OnBoardConfig {
  script: string;
  occupancy: boolean;
  roofline: boolean;
  source: boolean;
  arithmeticUtilization: boolean;
  l2Cache: boolean;
  memory: boolean;
  memoryL0: boolean;
  memoryUB: boolean;
  pipeUtilization: boolean;
  resourceConflictRatio: boolean;
  kernelScale: boolean;
  memoryDetail: boolean;
  pcSampling: boolean;
  operatorMetrics: boolean;
  advanceParam: AdvanceParam[];
  fileMapList: FileMapEntry[];
}

export interface SanitizerConfig {
  script: string;
  // Sanitizer command selection: A2/A3 SOC forces mssanitizer; every other
  // SOC honors the persisted sanitizer.toolType setting and otherwise defaults
  // to npu-sanitizer (getDefaultSanitizerToolType).
  toolType: 'mssanitizer' | 'npu-sanitizer';
  // Partial sanitizer settings leave unset fields ABSENT (no defaults merged).
  // Only the fully-unset case falls back to the full defaults
  // (getSanitizerConfig fresh branch).
  tool?: { memcheck?: boolean;
    synccheck?: boolean;
    racecheck?: boolean;
    initcheck?: boolean;
    soccheck?: boolean;
    overcheck?: boolean };
  memcheckOption?: { 'leak-check'?: boolean;
    'check-unused-memory'?: boolean };
  logLevel?: 'info' | 'warn' | 'error';
  maxDebuglogSize?: number;
  useBlock?: boolean;
  blockId?: number | null;
  targetFile: string | null;
  fileMapList: FileMapEntry[];
}

function toFullDottedKey(relativeKey: string): string {
  return relativeKey.startsWith(OP_DEVTOOLS_PREFIX)
    ? relativeKey
    : `${OP_DEVTOOLS_PREFIX}${relativeKey}`;
}

/**
 * Narrowed read of one `op-devtools` key: workspace-folder → workspace scope,
 * `null` counts as unset. User/global values must NOT leak into the workspace
 * config — the workspace settings file is the source of truth.
 */
function readWorkspaceScopedSetting<T>(relativeKey: string): T | undefined {
  return getConfiguredValue<T>(getOpDevtoolsWorkspaceConfiguration(), [relativeKey]);
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

  // A BOM is legal in settings.json and makes JSON.parse throw, which would
  // leave every op-devtools write on that workspace failing for good.
  const raw = fs.readFileSync(filePath, 'utf8');
  const noBom = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
  const trimmed = noBom.trim();

  if (!trimmed) {
    return {};
  }

  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  }
  catch {
    // Same tolerance as the writer: // comments and trailing commas are legal
    // in hand-edited settings.json — a strict reader would disagree with the
    // JSONC-tolerant writer about the file's contents (an invisible
    // settingsVersion marker would re-run the import on every launch).
    return tryParseSettingsJsonc(trimmed) ?? {};
  }
}

function isLegacyNestedOpDevtoolsRoot(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function readSettingsJsonFile(filePath: string): Record<string, unknown> {
  try {
    const parsed = parseRawSettingsJson(filePath);

    if (Object.keys(parsed).length === 0) {
      return {};
    }

    return flattenOpDevtoolsRoot(parsed);
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

/** Pure `current`-based variant of the old `buildDottedOnlySettingsFileContent(filePath)`. */
function buildDottedOnlySettingsFromParsed(current: Record<string, unknown>): Record<string, unknown> {
  const { output } = stripOpDevtoolsKeysFromRaw(current);
  const flat = flattenOpDevtoolsRoot(current);

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

/** Flatten a nested `op-devtools` root into dotted keys (dotted keys win). */
function flattenOpDevtoolsRoot(parsed: Record<string, unknown>): Record<string, unknown> {
  const nested = parsed[SETTINGS_PREFIX];

  if (isLegacyNestedOpDevtoolsRoot(nested)) {
    const rest = { ...parsed };

    delete rest[SETTINGS_PREFIX];
    flattenNestedOpDevtools(nested, SETTINGS_PREFIX, rest);

    return rest;
  }

  return parsed;
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

    return guardedPersistIdeSettingsFile(filePath, (current) => {
      const {
        output, removedAny,
      } = stripOpDevtoolsKeysFromRaw(current);

      if (!removedAny) {
        return null;
      }

      return Object.keys(output).length === 0
        ? { deleteFile: true }
        : { next: output };
    });
  }

  /**
   * Batch-write `op-devtools` settings as dotted keys in one `settings.json` update.
   * Also rewrites nested `"op-devtools": { ... }` to dotted keys when present,
   * even when `updates` is empty (existing dotted keys win over nested values).
   * Intentionally uses direct file I/O (not `cfg.update` per key) for performance.
   * Goes through the shared guarded persist: concurrent callers are serialized
   * (no "last writer wins" interleaving) and a byte-identical write is skipped.
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

    const written = await guardedPersistIdeSettingsFile(filePath, (current) => {
      const needsNestedMigration = isLegacyNestedOpDevtoolsRoot(current[SETTINGS_PREFIX]);

      if (!needsNestedMigration && !hasUpdates) {
        return null;
      }

      const output = buildDottedOnlySettingsFromParsed(current);

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

      return { next: output };
    });

    // Sync VS Code configuration cache so that reads via Configuration API
    // (inspect()) immediately reflect the new values. Direct file writes are
    // picked up by VS Code's file watcher asynchronously, which causes stale
    // reads when a subsequent command reads the config right after save
    // (e.g. runSanitizer reading sanitizer.toolType after saveSanitizerOptions —
    // without this sync, toolType falls back to the default npu-sanitizer on
    // A5 instead of the user-selected mssanitizer).
    if (written && hasUpdates) {
      await ConfigService.syncConfigurationCache(updates);
    }

    return written;
  }

  /**
   * Materialize the default per-operator build settings for `projectPath`
   * (the open-flow seeding previously done by `completeProjectConfigs` +
   * `maybeMigrate`). The per-op_type defaults come from the operator plugin
   * (`getInitialConfigScripts` + `getDefaultPaths`), are mapped through the
   * row mapper, and persisted as dotted workspace settings.
   *
   * The seed is per-key create-if-missing: every section is built and run
   * through {@link filterPendingWritesByCurrentFile}, which drops keys already
   * present in settings.json — a single pre-filled key never skips the rest
   * of the set. The shared guarded persist makes an identical write a no-op
   * (content-diff).
   *
   * `templateName` special-cases torch_library_template —
   * `build_op.target_file` = 'python ../run.py' instead of the generic
   * `build/<op>`.
   *
   * Workspace-level target keys are seeded ONLY for single-operator
   * projects (scan opsList ≤ 1). For a multi-operator workspace the keys
   * stay empty so the runtime per-op fallback `getDefaultPaths(op)` covers
   * each sub-operator — otherwise the root operator's target would shadow
   * every sub-operator's.
   *
   * The seed operator is built path-keyed (no registry gate): `opName`
   * names the operator and `opPath` locates it (both default to `projectPath`
   * itself — a fresh project is its own root operator). `opType` is the
   * canonical project/operator type; standard-custom and ascend-c map to the
   * 'ascend' toolchain, unknown types fall back to the cann plugin (as in
   * the `getConfigSeedOps` seed).
   */
  static async ensureOpDevtoolsSettingsSeeded(
    projectPath: string,
    ascendEnvScript = '',
    opType?: string,
    opPath: string = projectPath,
    templateName?: string,
  ): Promise<void> {
    try {
      const resolvedOpType = opType
        ?? (readSettingsJsonFile(getIdeSettingsFilePath(projectPath))[toFullDottedKey('projectType')] as string | undefined)
        ?? 'ascend';
      const op: OpRecord = {
        op_name: path.basename(opPath),
        op_type: isStandardCustomProjectType(resolvedOpType)
          || resolvedOpType === OperatorProjectType.ASCEND_C
          ? 'ascend'
          : resolvedOpType,
        op_path: opPath,
      };
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? op.op_path;
      const plugin = OperatorPluginRegistry.getOpPlugin(op.op_type);
      const scripts = plugin.getInitialConfigScripts(op, workspaceRoot);
      const paths = plugin.getDefaultPaths(op);
      const isA5Profiler = isAscendA5ProfilerCannSoc(resolveEffectiveCannSoc());

      // Targets are ROOT-level for every project shape: a standard-custom
      // collection builds through ONE root operator, so the workspace-level
      // target keys are seeded from the root record's default paths.

      // torch_library_template is special-cased with 'python ../run.py'.
      const buildOpTargetFile = templateName === 'torch_library_template'
        ? 'python ../run.py'
        : paths.targetOpFile;

      const projectConfigs: LegacyConfigRow[] = [
        {
          id: 0,
          config_type: 'build_op',
          user_options: {
            // The seeded build_op row carries the operator name, which lands
            // in `operatorNameToCompile`.
            op: op.op_name,
            script: scripts.buildScript,
            target_file: buildOpTargetFile,
            cpu_debug_script: scripts.cpuDebugScript,
            npu_debug_script: scripts.npuDebugScript,
          },
        },
        {
          id: 0,
          config_type: 'build_example',
          user_options: {
            script: scripts.exampleScript,
            target_file: paths.targetExampleFile,
            execution_mode: 'eager',
          },
        },
        {
          id: 0,
          config_type: 'ut_test',
          user_options: {
            script: scripts.utTestScript,
            target_file: paths.targetOpFile,
          },
        },
        {
          id: 0,
          config_type: 'on_board',
          user_options: {
            script: scripts.onBoardScript,
            Occupancy: true,
            Roofline: true,
            Source: true,
            ArithmeticUtilization: true,
            L2Cache: true,
            Memory: true,
            MemoryL0: true,
            MemoryUB: true,
            PipeUtilization: true,
            ResourceConflictRatio: true,
            KernelScale: false,
            MemoryDetail: !isA5Profiler,
            PCSampling: isA5Profiler,
            advance_param: [],
          },
        },
        {
          id: 0,
          config_type: 'simulate',
          user_options: {
            script: scripts.simulateScript,
            ResourceConflictRatio: true,
            PMSampling: false,
            advance_param: [],
          },
        },
      ];

      const sanitizerRows: LegacyConfigRow[] = [
        {
          id: 0,
          config_type: 'sanitizer',
          user_options: {
            script: scripts.sanitizerScript,
            tool: {
              memcheck: true,
              racecheck: true,
              initcheck: true,
            },
            memcheckOption: {
              'leak-check': true,
              'check-unused-memory': true,
            },
            logLevel: 'warn',
            maxDebuglogSize: 1024,
            useBlock: false,
            blockId: null,
          },
        },
      ];

      const writes = buildLegacySettingsMigrationWritesFromRows(
        projectConfigs,
        sanitizerRows,
        ascendEnvScript,
      );
      // Per-key create-if-missing — keys already present in settings.json
      // (or explicitly set in the configuration layer) are dropped, everything
      // else is seeded. Replaces the old one-key-skip-all gate.
      // Scoped to THIS folder: the ambient configuration resolves to
      // workspaceFolders[0], which would make multi-root seeding drop folder
      // 1's keys for every other folder.
      const cfg = getOpDevtoolsWorkspaceConfiguration(vscode.Uri.file(projectPath));
      const filteredWrites = ConfigService.filterPendingWritesByCurrentFile(writes, cfg, projectPath);

      await this.writeOpDevtoolsDottedSettings(filteredWrites, projectPath);
    }
    catch (error) {
      console.warn(`[ensureOpDevtoolsSettingsSeeded] failed: ${error instanceof Error ? error.message : String(error)}`);
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
   * Drop seed/import entries for keys that appeared in settings.json after the initial snapshot,
   * or are explicitly set in the VS Code configuration layer.
   */
  static filterPendingWritesByCurrentFile(
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

  /** Queue every dotted key from a row→settings batch (same contract as single `queue` calls). */
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

  /** Persist build_op deploy/run target to workspace settings only. */
  static async writeBuildOpDeployTarget(deployTarget: string): Promise<void> {
    await ConfigService.writeOpDevtoolsDottedSettings({ 'compileAndDeploy.buildConfig.deployCommandOrRunCommand': deployTarget });
  }

  /** Direct read of one `op-devtools` key via VS Code configuration API (backed by settings.json). */
  static readOpDevtoolsSetting<T>(relativeKey: string): T | undefined {
    return readWorkspaceScopedSetting<T>(relativeKey);
  }

  /** Default sanitizer command for the detected CANN SOC: A2/A3 → mssanitizer, others → npu-sanitizer. */
  static getDefaultSanitizerToolType(): SanitizerToolType {
    return defaultSanitizerToolTypeForSoc(resolveEffectiveCannSoc());
  }

  /**
   * Typed per-section DAO factories over the `user_options`-shaped runtime
   * rows: each reads its own dotted workspace settings directly (no stored DB
   * values, no section-key dispatch) and folds in the metadata still stored
   * only in the cache (fileMapList, sanitizer python target). Values are
   * byte-identical to the `get<Section>UserOptions` +
   * `get<Section>RuntimeConfig` reads the baseline encodes (golden compare).
   */

  /** build_op DAO from workspace settings (empty scripts → '', target = deploy/run target or null). */
  static getBuildOpConfig(): BuildOpConfig {
    return {
      script: readNonEmptyOpDevtoolsSetting('compileAndDeploy.buildConfig.compileCommand') ?? '',
      cpuDebugScript: readNonEmptyOpDevtoolsSetting('compileAndDeploy.buildConfig.cpuDebugCompileCommand') ?? '',
      npuDebugScript: readNonEmptyOpDevtoolsSetting('compileAndDeploy.buildConfig.npuDebugCompileCommand') ?? '',
      targetFile: ConfigService.readBuildOpDeployTargetFromWorkspace() ?? null,
      op: readNonEmptyOpDevtoolsSetting('compileAndDeploy.buildConfig.operatorNameToCompile'),
    };
  }

  /** build_example DAO from workspace settings (executionMode defaults to 'eager' like the seed). */
  static getBuildExampleConfig(): BuildExampleConfig {
    return {
      script: readNonEmptyOpDevtoolsSetting('compileAndDeploy.exampleBuildConfig.runCommand') ?? '',
      executionMode: normalizeExecutionMode(readNonEmptyOpDevtoolsSetting('compileAndDeploy.exampleBuildConfig.executionMode')) ?? 'eager',
      // Example-filename match patterns (RegExp; default to the build.sh contract); let a
      // project with a different example naming convention override per-operator mode
      // detection.
      eagerExamplePattern: readNonEmptyOpDevtoolsSetting('compileAndDeploy.exampleBuildConfig.eagerExamplePattern'),
      graphExamplePattern: readNonEmptyOpDevtoolsSetting('compileAndDeploy.exampleBuildConfig.graphExamplePattern'),
      targetFile: ConfigService.readBuildExampleTargetFromWorkspace() ?? null,
    };
  }

  /** ut_test DAO from workspace settings. */
  static getUtTestConfig(): UtTestConfig {
    return { script: readNonEmptyOpDevtoolsSetting('compileAndDeploy.buildConfig.utTestCompileCommand') ?? '' };
  }

  /** simulate DAO from workspace settings + cache (defaults fallback for fresh projects). */
  static getSimulateConfig(projectPath: string): SimulateConfig {
    const fileMapList = readWorkspaceCache(projectPath).fileMapLists?.simulate ?? [];
    const script = readNonEmptyOpDevtoolsSetting('compileAndDeploy.buildConfig.simulationCompileCommand');
    const simulatorType = ConfigService.readOpDevtoolsSetting<string>('performanceTuning.simulation.simulatorType');
    const memoryThroughputWaveform = ConfigService.readOpDevtoolsSetting<boolean>('performanceTuning.simulation.memoryThroughputWaveform');
    const resourceConflictRatio = ConfigService.readOpDevtoolsSetting<boolean>('performanceTuning.simulation.resourceConflictRatio');
    const params = ConfigService.readOpDevtoolsSetting<unknown>('performanceTuning.simulation.parameters');
    const advanceParam = (mapKeyValueObjectToAdvanceParams(params)
      ?? (Array.isArray(params) ? params : undefined)) as AdvanceParam[] | undefined;
    const anySetting = script !== undefined
      || simulatorType !== undefined
      || memoryThroughputWaveform !== undefined
      || resourceConflictRatio !== undefined
      || advanceParam !== undefined;

    // Fresh/imported projects have no simulation.* settings yet — these
    // defaults were seeded via generateStructure (model.ts:471-493); keep
    // that behavior (same rule as the sanitizer defaults fallback).
    if (!anySetting && fileMapList.length === 0) {
      return {
        script: '',
        simulatorType: '',
        memoryThroughputWaveform: false,
        // Not a documented simulator metric (shared/msprof-simulator-metrics.ts):
        // default off so it is never pre-enabled.
        resourceConflictRatio: true,
        advanceParam: [],
        fileMapList: [],
      };
    }

    return {
      script: script ?? '',
      simulatorType: simulatorType ?? '',
      memoryThroughputWaveform: memoryThroughputWaveform ?? false,
      resourceConflictRatio: resourceConflictRatio ?? false,
      advanceParam: advanceParam ?? [],
      fileMapList,
    };
  }

  /** on_board DAO from workspace settings + cache (SOC-gated PCSampling/MemoryDetail; defaults fallback for fresh projects). */
  static getOnBoardConfig(projectPath: string): OnBoardConfig {
    const fileMapList = readWorkspaceCache(projectPath).fileMapLists?.on_board ?? [];
    const isA5Profiler = isAscendA5ProfilerCannSoc(resolveEffectiveCannSoc());
    const script = readNonEmptyOpDevtoolsSetting('compileAndDeploy.buildConfig.onBoardCompileCommand');
    const occupancy = ConfigService.readOpDevtoolsSetting<boolean>('performanceTuning.onBoard.interCoreLoad');
    const roofline = ConfigService.readOpDevtoolsSetting<boolean>('performanceTuning.onBoard.roofline');
    const source = ConfigService.readOpDevtoolsSetting<boolean>('performanceTuning.onBoard.operatorCodeHotspot');
    const arithmeticUtilization = ConfigService.readOpDevtoolsSetting<boolean>('performanceTuning.onBoard.cubeAndVectorInstructionTimeAndRatio');
    const l2Cache = ConfigService.readOpDevtoolsSetting<boolean>('performanceTuning.onBoard.l2CacheHitRate');
    const memory = ConfigService.readOpDevtoolsSetting<boolean>('performanceTuning.onBoard.memoryReadWriteBandwidth');
    const memoryL0 = ConfigService.readOpDevtoolsSetting<boolean>('performanceTuning.onBoard.l0ReadWriteBandwidth');
    const memoryUB = ConfigService.readOpDevtoolsSetting<boolean>('performanceTuning.onBoard.ubReadWriteBandwidth');
    const pipeUtilization = ConfigService.readOpDevtoolsSetting<boolean>('performanceTuning.onBoard.computeAndMoveUnitTimeRatio');
    const resourceConflictRatio = ConfigService.readOpDevtoolsSetting<boolean>('performanceTuning.onBoard.resourceConflictRatio');
    const kernelScale = ConfigService.readOpDevtoolsSetting<boolean>('performanceTuning.onBoard.enableKernelCodeSegmentProfiling');
    const pcSampling = ConfigService.readOpDevtoolsSetting<boolean>('performanceTuning.onBoard.pcSampling');
    const cacheHeatmap = ConfigService.readOpDevtoolsSetting<boolean>('performanceTuning.onBoard.cacheHeatmap');
    const operatorMetrics = ConfigService.readOpDevtoolsSetting<boolean>('performanceTuning.onBoard.operatorMetrics');
    const params = ConfigService.readOpDevtoolsSetting<unknown>('performanceTuning.onBoard.parameters');
    const advanceParam = (mapKeyValueObjectToAdvanceParams(params)
      ?? (Array.isArray(params) ? params : undefined)) as AdvanceParam[] | undefined;
    // PCSampling/MemoryDetail are SOC-gated: surfaced only on A5 (pcSampling)
    // vs. non-A5 (cacheHeatmap) profilers.
    const resolvedPcSampling = pcSampling !== undefined && isA5Profiler ? pcSampling : undefined;
    const resolvedMemoryDetail = cacheHeatmap !== undefined && !isA5Profiler ? cacheHeatmap : undefined;
    const anySetting = script !== undefined
      || occupancy !== undefined
      || roofline !== undefined
      || source !== undefined
      || arithmeticUtilization !== undefined
      || l2Cache !== undefined
      || memory !== undefined
      || memoryL0 !== undefined
      || memoryUB !== undefined
      || pipeUtilization !== undefined
      || resourceConflictRatio !== undefined
      || kernelScale !== undefined
      || resolvedPcSampling !== undefined
      || resolvedMemoryDetail !== undefined
      || operatorMetrics !== undefined
      || advanceParam !== undefined;

    // Fresh/imported projects have no on_board.* settings yet — these
    // defaults were seeded via generateStructure (model.ts:436-470:
    // 11 metrics + MemoryDetail/PCSampling per SOC); keep that behavior
    // (same rule as the sanitizer defaults fallback).
    if (!anySetting && fileMapList.length === 0) {
      return {
        script: '',
        occupancy: true,
        roofline: true,
        source: true,
        arithmeticUtilization: true,
        l2Cache: true,
        memory: true,
        memoryL0: true,
        memoryUB: true,
        pipeUtilization: true,
        resourceConflictRatio: true,
        kernelScale: false,
        memoryDetail: !isA5Profiler,
        pcSampling: isA5Profiler,
        operatorMetrics: false,
        advanceParam: [],
        fileMapList: [],
      };
    }

    return {
      script: script ?? '',
      occupancy: occupancy ?? false,
      roofline: roofline ?? false,
      source: source ?? false,
      arithmeticUtilization: arithmeticUtilization ?? false,
      l2Cache: l2Cache ?? false,
      memory: memory ?? false,
      memoryL0: memoryL0 ?? false,
      memoryUB: memoryUB ?? false,
      pipeUtilization: pipeUtilization ?? false,
      resourceConflictRatio: resourceConflictRatio ?? false,
      kernelScale: kernelScale ?? false,
      memoryDetail: resolvedMemoryDetail ?? false,
      pcSampling: resolvedPcSampling ?? false,
      operatorMetrics: operatorMetrics ?? false,
      advanceParam: advanceParam ?? [],
      fileMapList,
    };
  }

  /** sanitizer DAO from workspace settings + cache (defaults fallback for fresh projects). */
  static getSanitizerConfig(projectPath: string, op: string = ''): SanitizerConfig {
    const cache = readWorkspaceCache(projectPath);
    const fileMapList = cache.fileMapLists?.sanitizer ?? [];
    // The creation seed ('python3 ./<name>.py') and the active-file sync
    // (syncSanitizerPythonTargetFromActiveEditor) both key by the canonical
    // operator name — resolved here even for an empty `op` via
    // sanitizerTargetKeyForOp, so a fresh creation reads its own seed back.
    // Truthy gate mirrors the `if (pythonTarget)` row check.
    const targetFile = cache.sanitizerPythonTarget?.[sanitizerTargetKeyForOp(projectPath, op)] || null;
    const script = readNonEmptyOpDevtoolsSetting('compileAndDeploy.buildConfig.sanitizerCompileCommand');
    const configuredToolType = ConfigService.readOpDevtoolsSetting<string>('sanitizer.toolType');
    const logLevel = ConfigService.readOpDevtoolsSetting<string>('sanitizer.reportLogLevel');
    const maxDebuglogSize = ConfigService.readOpDevtoolsSetting<number>('sanitizer.maxSingleLogFileSize');
    const scope = ConfigService.readOpDevtoolsSetting<string>('sanitizer.detectionScope');
    const useBlock = scope !== undefined ? mapSanitizerScopeToUseBlock(scope) : undefined;
    const blockId = ConfigService.readOpDevtoolsSetting<number>('sanitizer.blockId');
    const memcheck = ConfigService.readOpDevtoolsSetting<boolean>('sanitizer.memory');
    const synccheck = ConfigService.readOpDevtoolsSetting<boolean>('sanitizer.sync');
    const racecheck = ConfigService.readOpDevtoolsSetting<boolean>('sanitizer.race');
    const initcheck = ConfigService.readOpDevtoolsSetting<boolean>('sanitizer.uninitialized');
    const soccheck = ConfigService.readOpDevtoolsSetting<boolean>('sanitizer.soc');
    const overcheck = ConfigService.readOpDevtoolsSetting<boolean>('sanitizer.over');
    const memoryLeak = ConfigService.readOpDevtoolsSetting<boolean>('sanitizer.memoryLeak');
    const allocUnused = ConfigService.readOpDevtoolsSetting<boolean>('sanitizer.allocUnused');
    // A2/A3 SOC only ships mssanitizer — the persisted toolType is ignored
    // there; every other SOC honors a valid persisted value and falls back to
    // the SOC default otherwise.
    const toolType: SanitizerConfig['toolType'] = ConfigService.getDefaultSanitizerToolType() === 'mssanitizer'
      ? 'mssanitizer'
      : configuredToolType === 'mssanitizer' || configuredToolType === 'npu-sanitizer'
        ? configuredToolType
        : ConfigService.getDefaultSanitizerToolType();
    const anySetting = script !== undefined
      || configuredToolType !== undefined
      || logLevel !== undefined
      || maxDebuglogSize !== undefined
      || useBlock !== undefined
      || blockId !== undefined
      || memcheck !== undefined
      || synccheck !== undefined
      || racecheck !== undefined
      || initcheck !== undefined
      || soccheck !== undefined
      || overcheck !== undefined
      || memoryLeak !== undefined
      || allocUnused !== undefined;

    // Fresh/imported projects have no sanitizer.* settings yet — these defaults
    // were seeded via generateStructure; keep that behavior.
    if (!anySetting && fileMapList.length === 0 && targetFile === null) {
      return {
        script: '',
        toolType,
        tool: {
          memcheck: DEFAULT_SANITIZER_DETECTION_OPTIONS.tool.memcheck,
          racecheck: DEFAULT_SANITIZER_DETECTION_OPTIONS.tool.racecheck,
          initcheck: DEFAULT_SANITIZER_DETECTION_OPTIONS.tool.initcheck,
        },
        memcheckOption: {
          'leak-check': DEFAULT_SANITIZER_DETECTION_OPTIONS.memcheckOption['leak-check'],
          'check-unused-memory': DEFAULT_SANITIZER_DETECTION_OPTIONS.memcheckOption['check-unused-memory'],
        },
        logLevel: DEFAULT_SANITIZER_DETECTION_OPTIONS.logLevel,
        maxDebuglogSize: DEFAULT_SANITIZER_DETECTION_OPTIONS.maxDebuglogSize,
        useBlock: DEFAULT_SANITIZER_DETECTION_OPTIONS.useBlock,
        blockId: DEFAULT_SANITIZER_DETECTION_OPTIONS.blockId,
        targetFile: null,
        fileMapList: [],
      };
    }

    // Partial settings → carry ONLY the defined fields. No defaults are
    // merged into the DAO, so the strategies emit flags exclusively for values
    // the user actually set.
    const tool: SanitizerConfig['tool'] = {};
    const memcheckOption: SanitizerConfig['memcheckOption'] = {};

    if (memcheck !== undefined) {
      tool.memcheck = memcheck;
    }

    if (synccheck !== undefined) {
      tool.synccheck = synccheck;
    }

    if (racecheck !== undefined) {
      tool.racecheck = racecheck;
    }

    if (initcheck !== undefined) {
      tool.initcheck = initcheck;
    }

    if (soccheck !== undefined) {
      tool.soccheck = soccheck;
    }

    if (overcheck !== undefined) {
      tool.overcheck = overcheck;
    }

    if (memoryLeak !== undefined) {
      memcheckOption['leak-check'] = memoryLeak;
    }

    if (allocUnused !== undefined) {
      memcheckOption['check-unused-memory'] = allocUnused;
    }

    return {
      script: script ?? '',
      toolType,
      tool,
      memcheckOption,
      logLevel: logLevel as 'info' | 'warn' | 'error' | undefined,
      maxDebuglogSize,
      useBlock,
      blockId,
      targetFile,
      fileMapList,
    };
  }

  /** build_op deploy/run target from the workspace settings path. */
  static readBuildOpDeployTargetFromWorkspace(): string | undefined {
    return ConfigService.readOpDevtoolsSetting<string>('compileAndDeploy.buildConfig.deployCommandOrRunCommand');
  }

  /** build_example target from workspace settings (empty = fall back to the operator default). */
  static readBuildExampleTargetFromWorkspace(): string | undefined {
    return ConfigService.readOpDevtoolsSetting<string>('compileAndDeploy.exampleBuildConfig.targetFile');
  }

  /**
   * Whether the pre-build example step must run — the build_example DAO has a
   * non-empty script OR `compileAndDeploy.exampleBuildConfig.targetFile` is set
   * (executionMode is always present in the DAO, defaulting to 'eager', so it
   * carries no gate signal). The step runs whenever the build_example config
   * ROW exists, regardless of the values it holds; a row carrying only a
   * target_file still runs it. The settings are the row on this branch, so an
   * empty script with a set targetFile must keep the gate ON.
   *
   * Value-presence ≈ row-existence in every reachable flow (remote-audit 2026-08-17):
   * the ONLY writers of `exampleBuildConfig.*` are the creation/import seed
   * (setNonEmptyString — never empties keys) and the per-key create-if-missing
   * seeder; there is no options panel that saves build_example, so cleared keys
   * require hand-editing settings.json — the equivalent of deleting the row,
   * which gates the step off.
   */
  static hasBuildExampleConfig(): boolean {
    const config = ConfigService.getBuildExampleConfig();

    return config.script !== '' || Boolean(config.targetFile);
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

}

/**
 * Path-scoped store → settings.json seeding.
 *
 * Locates the persisted stores with plain `fs.existsSync` only — never through
 * the store APIs (JsonStorage/getConfig/postConfig would recreate empty files),
 * matches the project row by `project_path == root`, and writes only keys that
 * are missing from the current settings file. Idempotent by construction
 * (filter pass + content-diff guard re-apply on every call).
 *
 * @returns true when settings.json was written.
 */
export async function runLegacySettingsStep(root: string | undefined): Promise<boolean> {
  if (!root) {
    return false;
  }

  try {
    const sources = locateLegacySources(root);

    if (!sources) {
      return false;
    }

    const projectRow = findProjectRowForRoot(sources, root);

    if (!projectRow) {
      return false;
    }

    // Open seeds workspace settings from the project row on every open: the row's
    // environment fields land in settings even when the store carries no config
    // rows yet. A row-less store must not leave the SOC resolution chain without
    // its settings sources — the fallthrough (blocking find / + asys/npu-smi host
    // probes) would stall every operator action.
    const cfg = getOpDevtoolsWorkspaceConfiguration(vscode.Uri.file(root));
    const environmentSeed: OpDevtoolsDottedWrites = {};

    if (typeof projectRow.ascend_env_script === 'string' && projectRow.ascend_env_script.trim()) {
      environmentSeed['environment.environmentScript'] = projectRow.ascend_env_script.trim();
    }

    if (typeof projectRow.soc_version === 'string' && projectRow.soc_version.trim()) {
      environmentSeed['environment.socVersion'] = projectRow.soc_version.trim();
    }

    let wroteAnything = false;

    if (Object.keys(environmentSeed).length > 0) {
      const envWrites = ConfigService.filterPendingWritesByCurrentFile(environmentSeed, cfg, root);

      if (Object.keys(envWrites).length > 0) {
        wroteAnything = await ConfigService.writeOpDevtoolsDottedSettings(envWrites, root);
      }
    }

    const mergedConfigs = mergeLegacyConfigs(sources);
    const projectConfigs = dedupeLegacyRowsByTypeAndOp(mergedConfigs.filter((row) => row.project_id === projectRow.id));
    const buildOpRows = projectConfigs.filter((row) => row.config_type === 'build_op');

    if (buildOpRows.length === 0) {
      return wroteAnything;
    }

    const sanitizerRows = projectConfigs.filter((row) => row.config_type === CONFIG_TYPES.SANITIZER);
    const projectSH = getAscendEnvScriptWithWorkspaceOverride(projectRow.ascend_env_script ?? '');
    const pendingWrites = buildLegacySettingsMigrationWritesFromRows(
      projectConfigs,
      sanitizerRows,
      projectSH,
    );
    const filteredWrites = ConfigService.filterPendingWritesByCurrentFile(pendingWrites, cfg, root);

    if (Object.keys(filteredWrites).length === 0) {
      return false;
    }

    return ConfigService.writeOpDevtoolsDottedSettings(filteredWrites, root);
  }
  catch (error) {
    console.warn('[runLegacySettingsStep] failed:', root, error);

    return false;
  }
}

export type LegacyConfigRow = {
  id: number;
  config_type?: string;
  user_options?: Record<string, unknown>;
  project_id?: number;
};

export type LegacySources = {
  projectsFile: string;
  configsFile: string;
  opsFile: string;
  workspaceConfigsFile: string;
};

function existsAny(...filePaths: string[]): boolean {
  return filePaths.some((filePath) => fs.existsSync(filePath));
}

export function locateLegacySources(root: string): LegacySources | null {
  const sources: LegacySources = {
    projectsFile: path.join(getLegacyUserDataDir(), 'data', 'projects.json'),
    configsFile: path.join(getLegacyUserDataDir(), 'data', 'configs.json'),
    // The ops.json row op_type discriminates an imported standard-custom
    // sub-operator ('cann' rows) from a plugin-created one ('ascend',
    // viewIdToProjectType(2)) — the importer attaches it to the cache
    // scan-state entries.
    opsFile: path.join(getLegacyUserDataDir(), 'data', 'ops.json'),
    workspaceConfigsFile: getLegacyWorkspaceConfigsFile(root),
  };

  return existsAny(sources.projectsFile, sources.configsFile, sources.opsFile, sources.workspaceConfigsFile)
    ? sources
    : null;
}

function readJsonFile<T>(filePath: string): T | undefined {
  try {
    if (!fs.existsSync(filePath)) {
      return undefined;
    }

    const raw = fs.readFileSync(filePath, 'utf8')
      .trim();

    if (!raw) {
      return undefined;
    }

    return JSON.parse(raw) as T;
  }
  catch (error) {
    console.warn('[readJsonFile] failed:', filePath, error);

    return undefined;
  }
}

type LegacyProjectRowForRoot = {
  id: number;
  ascend_env_script?: string | null;
  soc_version?: string | null;
};

function findProjectRowForRoot(
  sources: LegacySources,
  root: string,
): LegacyProjectRowForRoot | undefined {
  const store = readJsonFile<{ projects?: Array<{ id: number;
    project_path?: string | null;
    ascend_env_script?: string | null;
    soc_version?: string | null;
    ops_list?: unknown[] | null;
    experimental_ops_list?: unknown[] | null }> }>(sources.projectsFile);

  if (!store?.projects?.length) {
    return undefined;
  }

  const row = store.projects.find((item) => Boolean(item.project_path) && projectPathsEqual(item.project_path as string, root));

  if (!row) {
    return undefined;
  }

  return {
    id: row.id,
    ascend_env_script: row.ascend_env_script,
    soc_version: row.soc_version,
  };
}

/**
 * Merge the host-global configs store with the workspace store: host-global
 * rows come FIRST in store order, then workspace rows are appended only when
 * their id does not collide with a host row (the host row wins). No
 * deduplication here — same config type for different projects must survive;
 * per-project selection and the `(config_type, op)` first-wins rule are
 * applied by the CONSUMERS after the project_id filter
 * (dedupeLegacyRowsByTypeAndOp).
 */
export function mergeLegacyConfigs(sources: LegacySources): LegacyConfigRow[] {
  const hostStore = readJsonFile<{ configs?: LegacyConfigRow[] }>(sources.configsFile);
  const workspaceStore = readJsonFile<{ configs?: LegacyConfigRow[] }>(sources.workspaceConfigsFile);
  const merged: LegacyConfigRow[] = [];

  for (const row of hostStore?.configs ?? []) {
    merged.push(row);
  }

  for (const row of workspaceStore?.configs ?? []) {
    if (!merged.some((existing) => existing.id === row.id)) {
      merged.push(row);
    }
  }

  return merged;
}

/**
 * First-wins dedup by `(config_type, op)` — reproduces the base `find()` on the
 * project-filtered rows (the row that came first in the merged store order).
 * Applies AFTER the project_id filter so rows of DIFFERENT projects with the
 * same operator name never collide.
 */
export function dedupeLegacyRowsByTypeAndOp(rows: LegacyConfigRow[]): LegacyConfigRow[] {
  const seen = new Set<string>();
  const deduped: LegacyConfigRow[] = [];

  for (const row of rows) {
    const key = `${row.config_type ?? ''}:${(row.user_options?.op as string | undefined) ?? ''}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(row);
  }

  return deduped;
}

/**
 * Raw (unfiltered) dotted writes from the persisted config rows — the pure
 * mapping of the queue-based import. The single
 * `filterPendingWritesByCurrentFile` pass downstream reproduces the per-key
 * queue semantics (explicit-in-cfg and already-in-file keys are dropped).
 */
export function buildLegacySettingsMigrationWritesFromRows(
  projectConfigs: LegacyConfigRow[],
  sanitizerRows: LegacyConfigRow[],
  projectSH: string,
): OpDevtoolsDottedWrites {
  const buildOp = projectConfigs.find((row) => row.config_type === 'build_op');
  const buildExample = projectConfigs.find((row) => row.config_type === 'build_example');
  const simulate = projectConfigs.find((row) => row.config_type === 'simulate');
  const onBoard = projectConfigs.find((row) => row.config_type === 'on_board');
  const utTest = projectConfigs.find((row) => row.config_type === 'ut_test');
  const sanitizerOpts = (sanitizerRows[0]?.user_options ?? {}) as Record<string, unknown>;
  const buildOpOpts = (buildOp?.user_options ?? {}) as Record<string, unknown>;
  const buildExampleOpts = (buildExample?.user_options ?? {}) as Record<string, unknown>;
  const simulateOpts = (simulate?.user_options ?? {}) as Record<string, unknown>;
  const onBoardOpts = (onBoard?.user_options ?? {}) as Record<string, unknown>;
  const utTestOpts = (utTest?.user_options ?? {}) as Record<string, unknown>;
  const writes: OpDevtoolsDottedWrites = {};

  const set = (key: string, value: unknown) => {
    if (value !== undefined) {
      writes[key] = value;
    }
  };
  const setNonEmptyString = (key: string, value: unknown) => {
    if (typeof value === 'string' && value.trim()) {
      set(key, value.trim());
    }
  };

  // The operator the build_op row was saved for; `build_op.op` lands in
  // `operatorNameToCompile`.
  set('compileAndDeploy.buildConfig.operatorNameToCompile', buildOpOpts.op);

  // Target keys are seeded verbatim: standard-custom collections carry the
  // ROOT build_out target in the rows (one root-keyed config set), and the
  // runtime commands are built against that same root record.
  set('compileAndDeploy.buildConfig.deployCommandOrRunCommand', buildOpOpts.target_file);

  setNonEmptyString('compileAndDeploy.buildConfig.compileCommand', buildOpOpts.script);
  setNonEmptyString('compileAndDeploy.buildConfig.cpuDebugCompileCommand', buildOpOpts.cpu_debug_script);
  setNonEmptyString('compileAndDeploy.buildConfig.npuDebugCompileCommand', buildOpOpts.npu_debug_script);
  setNonEmptyString('compileAndDeploy.buildConfig.onBoardCompileCommand', onBoardOpts.script);
  setNonEmptyString('compileAndDeploy.buildConfig.simulationCompileCommand', simulateOpts.script);
  setNonEmptyString('compileAndDeploy.buildConfig.utTestCompileCommand', utTestOpts.script);

  if (buildExample) {
    set(
      'compileAndDeploy.exampleBuildConfig.executionMode',
      normalizeExecutionMode(buildExampleOpts.execution_mode) ?? 'eager',
    );
    setNonEmptyString('compileAndDeploy.exampleBuildConfig.runCommand', buildExampleOpts.script);

    setNonEmptyString('compileAndDeploy.exampleBuildConfig.targetFile', buildExampleOpts.target_file);
  }

  for (const [
    key,
    value,
  ] of Object.entries(sanitizerUserOptionsToDottedWrites(sanitizerOpts))) {
    set(key, value);
  }

  set('sanitizer.showQuickOptions', true);

  if (typeof sanitizerOpts.useBlock !== 'boolean') {
    set('sanitizer.detectionScope', 'global');
  }

  set('sanitizer.blockId', sanitizerOpts.blockId ?? null);

  set('performanceTuning.simulation.showQuickOptions', true);

  for (const [
    key,
    value,
  ] of Object.entries(simulateUserOptionsToDottedWrites(simulateOpts))) {
    set(key, value);
  }

  set('performanceTuning.onBoard.showQuickOptions', true);

  for (const [
    key,
    value,
  ] of Object.entries(onBoardUserOptionsToDottedWrites(onBoardOpts))) {
    set(key, value);
  }

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

  set('performanceTuning.onBoard.operatorMetrics', allMetricEnabled);
  set('environment.environmentScript', projectSH);

  return writes;
}

export const configService = new ConfigService();
