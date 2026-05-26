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
import { getDevtoolConfigPath, getIdeSettingsFilePath } from '@plugin/helpers/ide-config-dir';
import { homeMethods } from '@plugin/controller/home-controller';
import { buildService } from '@plugin/service/build-service';
import { projectService } from '@plugin/service/project-service';

const CONFIG_TYPES = {
  SANITIZER: 'sanitizer',
  ON_BOARD: 'on_board',
  SIMULATE: 'simulate',
} as const;

const OP_DEVTOOLS_PREFIX = 'op-devtools.';

/** Relative dotted keys under `op-devtools` (e.g. `sanitizer.memory`). */
export type OpDevtoolsDottedWrites = Record<string, unknown>;

function resolveWorkspaceRoot(workspaceRoot?: string): string | undefined {
  if (workspaceRoot) {
    return workspaceRoot;
  }
  const projectInfo = ProjectManager.getInstance().getProjectInfo();
  if (projectInfo?.path) {
    return projectInfo.path;
  }
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function toFullDottedKey(relativeKey: string): string {
  return relativeKey.startsWith(OP_DEVTOOLS_PREFIX)
    ? relativeKey
    : `${OP_DEVTOOLS_PREFIX}${relativeKey}`;
}

function flattenNestedOpDevtools(
  nested: Record<string, unknown>,
  prefix: string,
  out: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(nested)) {
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
  const raw = fs.readFileSync(filePath, 'utf8').trim();
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
    const nested = parsed['op-devtools'];
    if (isLegacyNestedOpDevtoolsRoot(nested)) {
      const { 'op-devtools': _removed, ...rest } = parsed;
      flattenNestedOpDevtools(nested, 'op-devtools', rest);
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

function buildDottedOnlySettingsFileContent(filePath: string): Record<string, unknown> {
  const raw = parseRawSettingsJson(filePath);
  const flat = readSettingsJsonFile(filePath);
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'op-devtools' || key.startsWith('op-devtools.')) {
      continue;
    }
    output[key] = value;
  }
  for (const [key, value] of Object.entries(flat)) {
    if (key.startsWith('op-devtools.')) {
      output[key] = value;
    }
  }
  return output;
}

export class ConfigService {
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
    const needsNestedMigration = isLegacyNestedOpDevtoolsRoot(
      parseRawSettingsJson(filePath)['op-devtools'],
    );

    if (!needsNestedMigration && !hasUpdates) {
      return false;
    }

    try {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });

      const output = buildDottedOnlySettingsFileContent(filePath);
      for (const [relativeKey, value] of Object.entries(updates)) {
        const fullKey = toFullDottedKey(relativeKey);
        if (value === undefined) {
          delete output[fullKey];
        }
        else {
          output[fullKey] = value;
        }
      }

      await fs.promises.writeFile(
        filePath,
        `${JSON.stringify(output, null, 2)}\n`,
        'utf8',
      );
      return true;
    }
    catch (error) {
      console.warn('[writeOpDevtoolsDottedSettings] failed:', error);
      return false;
    }
  }

  /** Drop seed entries for keys that appeared in settings.json after the initial fileKeys snapshot. */
  private static filterPendingWritesByCurrentFile(
    pendingWrites: OpDevtoolsDottedWrites,
    cfg: vscode.WorkspaceConfiguration,
    workspaceRoot?: string,
  ): OpDevtoolsDottedWrites {
    const fileKeys = ConfigService.getWorkspaceSettingsFileKeySet(workspaceRoot);
    const filtered: OpDevtoolsDottedWrites = {};
    for (const [relativeKey, value] of Object.entries(pendingWrites)) {
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
        || inspection.globalValue !== undefined
      );
    if (explicitlySet) {
      return;
    }
    if (fileKeys.has(toFullDottedKey(relativeKey))) {
      return;
    }
    pendingWrites[relativeKey] = value;
  }

  /**
   * Seed workspace settings.json with devtool DB values for keys not yet present in the file.
   * Called after project open so sanitizer / on-board / simulation keys exist in settings UI.
   */
  async syncOperatorProjectWorkspaceSettings(): Promise<void> {
    try {
      const buildConfigs = await buildService.getBuildConfigsList();
      const multiResult = await homeMethods.checkMultipleOperators();
      const buildOp = buildConfigs.find((c) => c.config_type === 'build_op');
      const buildExample = buildConfigs.find((c) => c.config_type === 'build_example');
      const simulate = buildConfigs.find((c) => c.config_type === 'simulate');
      const onBoard = buildConfigs.find((c) => c.config_type === 'on_board');
      const utTest = buildConfigs.find((c) => (c as { config_type?: string }).config_type === 'ut_test');
      const sanitizer = (await this.getSanitizerConfigsList())[0];
      const projectSH = await projectService.getProjectSH();

      const buildOpOpts = (buildOp?.user_options || {}) as Record<string, unknown>;
      const buildExampleOpts = (buildExample?.user_options || {}) as Record<string, unknown>;
      const simulateOpts = (simulate?.user_options || {}) as Record<string, unknown>;
      const onBoardOpts = (onBoard?.user_options || {}) as Record<string, unknown>;
      const utTestOpts = (utTest?.user_options || {}) as Record<string, unknown>;
      const sanitizerOpts = (sanitizer?.user_options || {}) as Record<string, unknown>;
      const cfg = vscode.workspace.getConfiguration('op-devtools');
      const fileKeys = ConfigService.getWorkspaceSettingsFileKeySet();
      const pendingWrites: OpDevtoolsDottedWrites = {};
      const queue = (key: string, value: unknown) => {
        ConfigService.queueSettingIfMissingInFile(pendingWrites, fileKeys, cfg, key, value);
      };

      queue('compileAndDeploy.buildConfig.operatorNameToCompile', buildOpOpts.op);
      queue('compileAndDeploy.buildConfig.deployCommandOrRunCommand', buildOpOpts.target_file);
      queue('compileAndDeploy.buildConfig.compileCommand', buildOpOpts.script);
      queue('compileAndDeploy.buildConfig.cpuDebugCompileCommand', buildOpOpts.cpu_debug_script);
      queue('compileAndDeploy.buildConfig.npuDebugCompileCommand', buildOpOpts.npu_debug_script);
      queue('compileAndDeploy.buildConfig.sanitizerCompileCommand', sanitizerOpts.script);
      queue('compileAndDeploy.buildConfig.onBoardCompileCommand', onBoardOpts.script);
      queue('compileAndDeploy.buildConfig.simulationCompileCommand', simulateOpts.script);
      queue('compileAndDeploy.buildConfig.utTestCompileCommand', utTestOpts.script);

      if (multiResult.isStandardCustom && multiResult.hasMultiple) {
        queue('compileAndDeploy.exampleBuildConfig.executionMode', buildExampleOpts.execution_mode);
        queue('compileAndDeploy.exampleBuildConfig.runCommand', buildExampleOpts.script);
      }

      queue('sanitizer.showQuickOptions', true);
      queue('sanitizer.reportLogLevel', sanitizerOpts.logLevel);
      queue('sanitizer.maxSingleLogFileSize', sanitizerOpts.maxDebuglogSize);
      const sanitizerTool = (sanitizerOpts.tool || {}) as Record<string, unknown>;
      const sanitizerMemcheckOption = (sanitizerOpts.memcheckOption || {}) as Record<string, unknown>;
      queue('sanitizer.memory', sanitizerTool.memcheck);
      queue('sanitizer.race', sanitizerTool.racecheck);
      queue('sanitizer.uninitialized', sanitizerTool.initcheck);
      queue('sanitizer.memoryLeak', sanitizerMemcheckOption['leak-check']);
      queue('sanitizer.allocUnused', sanitizerMemcheckOption['check-unused-memory']);
      const useBlock = sanitizerOpts.useBlock;
      if (typeof useBlock === 'boolean') {
        queue('sanitizer.detectionScope', useBlock ? 'singleBlock' : 'global');
      }
      else {
        queue('sanitizer.detectionScope', 'global');
      }
      queue('sanitizer.blockId', sanitizerOpts.blockId ?? null);

      queue('performanceTuning.simulation.showQuickOptions', true);
      queue('performanceTuning.simulation.memoryThroughputWaveform', simulateOpts.PMSampling);
      queue('performanceTuning.simulation.resourceConflictRatio', simulateOpts.ResourceConflictRatio);
      queue(
        'performanceTuning.simulation.parameters',
        ConfigService.toKeyValueMapFromAdvanceParam(simulateOpts.advance_param),
      );

      queue('performanceTuning.onBoard.showQuickOptions', true);
      queue('performanceTuning.onBoard.interCoreLoad', onBoardOpts.Occupancy);
      queue('performanceTuning.onBoard.roofline', onBoardOpts.Roofline);
      queue('performanceTuning.onBoard.operatorCodeHotspot', onBoardOpts.Source);
      // Seed both A5 and legacy on-board metric toggles so shared workspace settings work
      // when switching projects/SOC; runtime applies only the relevant key (see
      // mergeBuildConfigsWithOperatorProjectWorkspace + environment.socVersion).
      queue('performanceTuning.onBoard.pcSampling', onBoardOpts.PCSampling);
      queue('performanceTuning.onBoard.cacheHeatmap', onBoardOpts.MemoryDetail);

      queue(
        'performanceTuning.onBoard.cubeAndVectorInstructionTimeAndRatio',
        onBoardOpts.ArithmeticUtilization,
      );
      queue('performanceTuning.onBoard.l2CacheHitRate', onBoardOpts.L2Cache);
      queue('performanceTuning.onBoard.memoryReadWriteBandwidth', onBoardOpts.Memory);
      queue('performanceTuning.onBoard.l0ReadWriteBandwidth', onBoardOpts.MemoryL0);
      queue('performanceTuning.onBoard.ubReadWriteBandwidth', onBoardOpts.MemoryUB);
      queue(
        'performanceTuning.onBoard.computeAndMoveUnitTimeRatio',
        onBoardOpts.PipeUtilization,
      );
      queue(
        'performanceTuning.onBoard.resourceConflictRatio',
        onBoardOpts.ResourceConflictRatio,
      );
      queue(
        'performanceTuning.onBoard.enableKernelCodeSegmentProfiling',
        onBoardOpts.KernelScale,
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
      queue(
        'performanceTuning.onBoard.parameters',
        ConfigService.toKeyValueMapFromAdvanceParam(onBoardOpts.advance_param),
      );

      queue('environment.environmentScript', projectSH);

      /* Commented out until problems with settings sync for new projects are solved
        const projectSocVersion = (await projectService.getProjectSocVersion()).trim();
        queue('environment.socVersion', projectSocVersion);
        queue('performanceTuning.simulation.simulatorType', simulateOpts.simulatorType);
      */
      const filteredWrites = ConfigService.filterPendingWritesByCurrentFile(
        pendingWrites,
        cfg,
      );
      if (Object.keys(filteredWrites).length > 0) {
        await ConfigService.writeOpDevtoolsDottedSettings(filteredWrites);
      }
    }
    catch (error) {
      console.warn('[syncOperatorProjectWorkspaceSettings] failed:', error);
    }
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
      const updates: OpDevtoolsDottedWrites = {};

      assignIfDefined(updates, 'compileAndDeploy.buildConfig.sanitizerCompileCommand', opts.script);
      assignIfDefined(updates, 'sanitizer.reportLogLevel', opts.logLevel);
      assignIfDefined(updates, 'sanitizer.maxSingleLogFileSize', opts.maxDebuglogSize);
      assignIfDefined(updates, 'sanitizer.memory', tool.memcheck);
      assignIfDefined(updates, 'sanitizer.race', tool.racecheck);
      assignIfDefined(updates, 'sanitizer.uninitialized', tool.initcheck);
      assignIfDefined(updates, 'sanitizer.memoryLeak', mem['leak-check']);
      assignIfDefined(updates, 'sanitizer.allocUnused', mem['check-unused-memory']);
      if (typeof opts.useBlock === 'boolean') {
        updates['sanitizer.detectionScope'] = opts.useBlock ? 'singleBlock' : 'global';
      }
      assignIfDefined(updates, 'sanitizer.blockId', opts.blockId);

      await ConfigService.writeOpDevtoolsDottedSettings(updates);
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
      const updates: OpDevtoolsDottedWrites = {};

      assignIfDefined(updates, 'compileAndDeploy.buildConfig.onBoardCompileCommand', onBoardOpts.script);
      assignIfDefined(updates, 'performanceTuning.onBoard.interCoreLoad', onBoardOpts.Occupancy);
      assignIfDefined(updates, 'performanceTuning.onBoard.roofline', onBoardOpts.Roofline);
      assignIfDefined(updates, 'performanceTuning.onBoard.operatorCodeHotspot', onBoardOpts.Source);
      assignIfDefined(updates, 'performanceTuning.onBoard.pcSampling', onBoardOpts.PCSampling);
      assignIfDefined(updates, 'performanceTuning.onBoard.cacheHeatmap', onBoardOpts.MemoryDetail);

      assignIfDefined(
        updates,
        'performanceTuning.onBoard.cubeAndVectorInstructionTimeAndRatio',
        onBoardOpts.ArithmeticUtilization,
      );
      assignIfDefined(updates, 'performanceTuning.onBoard.l2CacheHitRate', onBoardOpts.L2Cache);
      assignIfDefined(updates, 'performanceTuning.onBoard.memoryReadWriteBandwidth', onBoardOpts.Memory);
      assignIfDefined(updates, 'performanceTuning.onBoard.l0ReadWriteBandwidth', onBoardOpts.MemoryL0);
      assignIfDefined(updates, 'performanceTuning.onBoard.ubReadWriteBandwidth', onBoardOpts.MemoryUB);
      assignIfDefined(
        updates,
        'performanceTuning.onBoard.computeAndMoveUnitTimeRatio',
        onBoardOpts.PipeUtilization,
      );
      assignIfDefined(
        updates,
        'performanceTuning.onBoard.resourceConflictRatio',
        onBoardOpts.ResourceConflictRatio,
      );
      assignIfDefined(
        updates,
        'performanceTuning.onBoard.enableKernelCodeSegmentProfiling',
        onBoardOpts.KernelScale,
      );
      updates['performanceTuning.onBoard.parameters'] = ConfigService.toKeyValueMapFromAdvanceParam(
        onBoardOpts.advance_param,
      );

      await ConfigService.writeOpDevtoolsDottedSettings(updates);
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
      const updates: OpDevtoolsDottedWrites = {};

      assignIfDefined(updates, 'compileAndDeploy.buildConfig.simulationCompileCommand', simulateOpts.script);
      assignIfDefined(updates, 'performanceTuning.simulation.memoryThroughputWaveform', simulateOpts.PMSampling);
      assignIfDefined(
        updates,
        'performanceTuning.simulation.resourceConflictRatio',
        simulateOpts.ResourceConflictRatio,
      );
      updates['performanceTuning.simulation.parameters'] = ConfigService.toKeyValueMapFromAdvanceParam(
        simulateOpts.advance_param,
      );

      await ConfigService.writeOpDevtoolsDottedSettings(updates);
    }
    catch (error) {
      console.warn('[pushSimulateUserOptionsToWorkspaceSettings] failed:', error);
    }
  }
}

export const configService = new ConfigService();
