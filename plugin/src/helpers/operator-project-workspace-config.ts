import * as vscode from 'vscode';

import type { BuildConfig } from '@shared/api-types';
import { isAscendA5ProfilerCannSoc } from '@shared/msprof-onboard-env';
import { resolveEffectiveCannSoc } from '@plugin/domain/utils/ascend-util';

const SECTION = 'op-devtools';
const DEFAULT_ENVIRONMENT_SCRIPT = '/etc/profile';
export const ENVIRONMENT_SCRIPT_SETTING = 'environment.environmentScript';

export function getFirstWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  return vscode.workspace.workspaceFolders?.[0];
}

export function getFirstWorkspaceFolderPath(): string | undefined {
  return getFirstWorkspaceFolder()?.uri.fsPath;
}

function getOpDevtoolsWorkspaceConfiguration(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(SECTION, getFirstWorkspaceFolder()?.uri);
}

/** Workspace override only; `undefined` when the setting was never explicitly set. */
function getExplicitEnvironmentScript(): string | undefined {
  return getConfiguredValue<string>(getOpDevtoolsWorkspaceConfiguration(), [
    ENVIRONMENT_SCRIPT_SETTING,
  ]);
}

type InspectValue<T> =
  | {
    workspaceFolderValue?: T;
    workspaceValue?: T;
    globalValue?: T;
  }
  | undefined;

function pickFromInspect<T>(
  inspection: InspectValue<T>,
  fallback: T,
): T {
  if (!inspection) {
    return fallback;
  }
  if (inspection.workspaceFolderValue !== undefined) {
    return inspection.workspaceFolderValue;
  }
  if (inspection.workspaceValue !== undefined) {
    return inspection.workspaceValue;
  }
  if (inspection.globalValue !== undefined) {
    return inspection.globalValue;
  }
  return fallback;
}

function isExplicitlySet<T>(
  inspection: InspectValue<T>,
): boolean {
  if (!inspection) {
    return false;
  }
  return inspection.workspaceFolderValue !== undefined
    || inspection.workspaceValue !== undefined;
}

function getConfiguredValue<T>(
  cfg: vscode.WorkspaceConfiguration,
  settingRelativePaths: string[],
): T | undefined {
  for (const relativePath of settingRelativePaths) {
    const inspection = cfg.inspect<T>(relativePath);
    if (isExplicitlySet(inspection)) {
      return pickFromInspect<T>(inspection, undefined as unknown as T);
    }
  }
  return undefined;
}

function withUserOptions(
  config: BuildConfig,
  updater: (opts: Record<string, unknown>) => void,
): BuildConfig {
  const options = {
    ...((config.user_options || {}) as Record<string, unknown>),
  };
  updater(options);
  return {
    ...config,
    user_options: options,
  };
}

function mapSanitizerScopeToUseBlock(scope: string): boolean | undefined {
  if (scope === 'global' || scope === 'Global') {
    return false;
  }
  if (scope === 'singleBlock' || scope === 'Single block') {
    return true;
  }
  return undefined;
}

function mapKeyValueObjectToAdvanceParams(
  value: unknown,
): Array<Record<string, unknown>> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return Object.entries(value as Record<string, unknown>)
    .map(([name, rawValue]) => ({
      name,
      value: rawValue === undefined || rawValue === null ? '' : String(rawValue),
    }));
}

export function mergeBuildConfigsWithOperatorProjectWorkspace(configs: BuildConfig[]): BuildConfig[] {
  const cfg = vscode.workspace.getConfiguration(SECTION);

  return configs.map((config) => {
    if (config.config_type === 'build_op') {
      return withUserOptions(config, (opts) => {
        const op = getConfiguredValue<string>(cfg, [
          'compileAndDeploy.buildConfig.operatorNameToCompile',
          'operatorProject.build.op',
          'operatorProject.buildOp.op',
        ]);
        if (op !== undefined) {
          opts.op = op;
        }

        const targetFile = getConfiguredValue<string>(cfg, [
          'compileAndDeploy.buildConfig.deployCommandOrRunCommand',
          'operatorProject.build.targetFile',
          'operatorProject.buildOp.targetFile',
        ]);
        if (targetFile !== undefined) {
          opts.target_file = targetFile;
        }

        const script = getConfiguredValue<string>(cfg, [
          'compileAndDeploy.buildConfig.compileCommand',
          'operatorProject.build.script',
          'operatorProject.buildOp.script',
        ]);
        if (script !== undefined) {
          opts.script = script;
        }

        const cpuDebugScript = getConfiguredValue<string>(cfg, [
          'compileAndDeploy.buildConfig.cpuDebugCompileCommand',
          'operatorProject.build.cpuDebugScript',
          'operatorProject.buildOp.cpuDebugScript',
        ]);
        if (cpuDebugScript !== undefined) {
          opts.cpu_debug_script = cpuDebugScript;
        }

        const npuDebugScript = getConfiguredValue<string>(cfg, [
          'compileAndDeploy.buildConfig.npuDebugCompileCommand',
          'operatorProject.build.npuDebugScript',
          'operatorProject.buildOp.npuDebugScript',
        ]);
        if (npuDebugScript !== undefined) {
          opts.npu_debug_script = npuDebugScript;
        }
      });
    }

    if (config.config_type === 'build_example') {
      return withUserOptions(config, (opts) => {
        const script = getConfiguredValue<string>(cfg, [
          'compileAndDeploy.exampleBuildConfig.runCommand',
          'operatorProject.build.example.script',
          'operatorProject.buildExample.script',
        ]);
        if (script !== undefined) {
          opts.script = script;
        }

        const executionMode = getConfiguredValue<string>(cfg, [
          'compileAndDeploy.exampleBuildConfig.executionMode',
          'operatorProject.build.example.executionMode',
          'operatorProject.buildExample.executionMode',
        ]);
        if (executionMode !== undefined) {
          opts.execution_mode = executionMode;
        }
      });
    }

    if (config.config_type === 'simulate') {
      return withUserOptions(config, (opts) => {
        const script = getConfiguredValue<string>(cfg, [
          'compileAndDeploy.buildConfig.simulationCompileCommand',
          'operatorProject.build.simulationScript',
          'operatorProject.simulate.script',
        ]);
        if (script !== undefined) {
          opts.script = script;
        }

        const simulatorType = getConfiguredValue<string>(cfg, [
          'performanceTuning.simulation.simulatorType',
          'operatorProject.performance.simulation.simulatorType',
          'operatorProject.simulate.simulatorType',
        ]);
        if (simulatorType !== undefined) {
          opts.simulatorType = simulatorType;
        }

        const memoryThroughputWaveform = getConfiguredValue<boolean>(cfg, [
          'performanceTuning.simulation.memoryThroughputWaveform',
        ]);
        if (memoryThroughputWaveform !== undefined) {
          opts.PMSampling = memoryThroughputWaveform;
        }

        const resourceConflictRatio = getConfiguredValue<boolean>(cfg, [
          'performanceTuning.simulation.resourceConflictRatio',
        ]);
        if (resourceConflictRatio !== undefined) {
          opts.ResourceConflictRatio = resourceConflictRatio;
        }

        const advancedParamsValue = getConfiguredValue<unknown>(cfg, [
          'performanceTuning.simulation.parameters',
          'operatorProject.performance.simulation.advancedParams',
        ]);
        const advancedParams = mapKeyValueObjectToAdvanceParams(advancedParamsValue)
          || (Array.isArray(advancedParamsValue) ? advancedParamsValue : undefined);
        if (advancedParams !== undefined) {
          opts.advance_param = advancedParams;
        }
      });
    }

    if ((config as { config_type?: string }).config_type === 'ut_test') {
      return withUserOptions(config, (opts) => {
        const script = getConfiguredValue<string>(cfg, [
          'compileAndDeploy.buildConfig.utTestCompileCommand',
        ]);
        if (script !== undefined) {
          opts.script = script;
        }
      });
    }

    if (config.config_type === 'on_board') {
      return withUserOptions(config, (opts) => {
        const script = getConfiguredValue<string>(cfg, [
          'compileAndDeploy.buildConfig.onBoardCompileCommand',
          'operatorProject.build.onBoardScript',
          'operatorProject.onBoard.script',
        ]);
        if (script !== undefined) {
          opts.script = script;
        }

        const enableKernelProf = getConfiguredValue<boolean>(cfg, [
          'performanceTuning.onBoard.enableKernelCodeSegmentProfiling',
          'performanceTuning.onBoard.enableKernelProf',
          'operatorProject.performance.onBoard.enableKernelProf',
        ]);
        if (enableKernelProf !== undefined) {
          opts.KernelScale = enableKernelProf;
        }

        const interCoreLoad = getConfiguredValue<boolean>(cfg, [
          'performanceTuning.onBoard.interCoreLoad',
        ]);
        if (interCoreLoad !== undefined) {
          opts.Occupancy = interCoreLoad;
        }

        const roofline = getConfiguredValue<boolean>(cfg, [
          'performanceTuning.onBoard.roofline',
        ]);
        if (roofline !== undefined) {
          opts.Roofline = roofline;
        }

        const operatorCodeHotspot = getConfiguredValue<boolean>(cfg, [
          'performanceTuning.onBoard.operatorCodeHotspot',
        ]);
        if (operatorCodeHotspot !== undefined) {
          opts.Source = operatorCodeHotspot;
        }

        const effectiveSoc = resolveEffectiveCannSoc();
        const isA5Profiler = isAscendA5ProfilerCannSoc(effectiveSoc);

        const pcSampling = getConfiguredValue<boolean>(cfg, [
          'performanceTuning.onBoard.pcSampling',
        ]);
        if (pcSampling !== undefined && isA5Profiler) {
          opts.PCSampling = pcSampling;
        }

        const cacheHeatmap = getConfiguredValue<boolean>(cfg, [
          'performanceTuning.onBoard.cacheHeatmap',
        ]);
        if (cacheHeatmap !== undefined && !isA5Profiler) {
          opts.MemoryDetail = cacheHeatmap;
        }

        const cubeAndVectorInstructionTimeAndRatio = getConfiguredValue<boolean>(cfg, [
          'performanceTuning.onBoard.cubeAndVectorInstructionTimeAndRatio',
        ]);
        if (cubeAndVectorInstructionTimeAndRatio !== undefined) {
          opts.ArithmeticUtilization = cubeAndVectorInstructionTimeAndRatio;
        }

        const l2CacheHitRate = getConfiguredValue<boolean>(cfg, [
          'performanceTuning.onBoard.l2CacheHitRate',
        ]);
        if (l2CacheHitRate !== undefined) {
          opts.L2Cache = l2CacheHitRate;
        }

        const memoryReadWriteBandwidth = getConfiguredValue<boolean>(cfg, [
          'performanceTuning.onBoard.memoryReadWriteBandwidth',
        ]);
        if (memoryReadWriteBandwidth !== undefined) {
          opts.Memory = memoryReadWriteBandwidth;
        }

        const l0ReadWriteBandwidth = getConfiguredValue<boolean>(cfg, [
          'performanceTuning.onBoard.l0ReadWriteBandwidth',
        ]);
        if (l0ReadWriteBandwidth !== undefined) {
          opts.MemoryL0 = l0ReadWriteBandwidth;
        }

        const ubReadWriteBandwidth = getConfiguredValue<boolean>(cfg, [
          'performanceTuning.onBoard.ubReadWriteBandwidth',
        ]);
        if (ubReadWriteBandwidth !== undefined) {
          opts.MemoryUB = ubReadWriteBandwidth;
        }

        const computeAndMoveUnitTimeRatio = getConfiguredValue<boolean>(cfg, [
          'performanceTuning.onBoard.computeAndMoveUnitTimeRatio',
        ]);
        if (computeAndMoveUnitTimeRatio !== undefined) {
          opts.PipeUtilization = computeAndMoveUnitTimeRatio;
        }

        const resourceConflictRatio = getConfiguredValue<boolean>(cfg, [
          'performanceTuning.onBoard.resourceConflictRatio',
        ]);
        if (resourceConflictRatio !== undefined) {
          opts.ResourceConflictRatio = resourceConflictRatio;
        }

        const advancedParamsValue = getConfiguredValue<unknown>(cfg, [
          'performanceTuning.onBoard.parameters',
          'operatorProject.performance.onBoard.advancedParams',
        ]);
        const advancedParams = mapKeyValueObjectToAdvanceParams(advancedParamsValue)
          || (Array.isArray(advancedParamsValue) ? advancedParamsValue : undefined);
        if (advancedParams !== undefined) {
          opts.advance_param = advancedParams;
        }
      });
    }

    return config;
  });
}

export function mergeSanitizerConfigsWithOperatorProjectWorkspace(configs: BuildConfig[]): BuildConfig[] {
  if (configs.length === 0) {
    return configs;
  }
  const cfg = vscode.workspace.getConfiguration(SECTION);
  const first = configs[0];

  const mergedFirst = withUserOptions(first, (opts) => {
    const script = getConfiguredValue<string>(cfg, [
      'compileAndDeploy.buildConfig.sanitizerCompileCommand',
      'operatorProject.build.sanitizerScript',
      'operatorProject.sanitizer.script',
      'operatorProject.sanitizerScript',
    ]);
    if (script !== undefined) {
      opts.script = script;
    }

    const logLevel = getConfiguredValue<string>(cfg, [
      'sanitizer.reportLogLevel',
      'operatorProject.sanitizer.logLevel',
    ]);
    if (logLevel !== undefined) {
      opts.logLevel = logLevel;
    }

    const maxLogSize = getConfiguredValue<number>(cfg, [
      'sanitizer.maxSingleLogFileSize',
      'operatorProject.sanitizer.maxLogSize',
    ]);
    if (maxLogSize !== undefined) {
      opts.maxDebuglogSize = maxLogSize;
    }

    const scope = getConfiguredValue<string>(cfg, [
      'sanitizer.detectionScope',
      'operatorProject.sanitizer.scope',
    ]);
    if (scope !== undefined) {
      const useBlock = mapSanitizerScopeToUseBlock(scope);
      if (useBlock !== undefined) {
        opts.useBlock = useBlock;
      }
    }

    const blockId = getConfiguredValue<number>(cfg, [
      'sanitizer.blockId',
      'operatorProject.sanitizer.blockId',
    ]);
    if (blockId !== undefined) {
      opts.blockId = blockId;
    }

    const memory = getConfiguredValue<boolean>(cfg, [
      'sanitizer.memory',
    ]);
    if (memory !== undefined) {
      const tool = ((opts.tool as Record<string, unknown>) || {});
      opts.tool = { ...tool, memcheck: memory };
    }

    const race = getConfiguredValue<boolean>(cfg, [
      'sanitizer.race',
    ]);
    if (race !== undefined) {
      const tool = ((opts.tool as Record<string, unknown>) || {});
      opts.tool = { ...tool, racecheck: race };
    }

    const uninitialized = getConfiguredValue<boolean>(cfg, [
      'sanitizer.uninitialized',
    ]);
    if (uninitialized !== undefined) {
      const tool = ((opts.tool as Record<string, unknown>) || {});
      opts.tool = { ...tool, initcheck: uninitialized };
    }

    const memoryLeak = getConfiguredValue<boolean>(cfg, [
      'sanitizer.memoryLeak',
    ]);
    if (memoryLeak !== undefined) {
      const memcheckOption = ((opts.memcheckOption as Record<string, unknown>) || {});
      opts.memcheckOption = { ...memcheckOption, 'leak-check': memoryLeak };
    }

    const allocUnused = getConfiguredValue<boolean>(cfg, [
      'sanitizer.allocUnused',
    ]);
    if (allocUnused !== undefined) {
      const memcheckOption = ((opts.memcheckOption as Record<string, unknown>) || {});
      opts.memcheckOption = { ...memcheckOption, 'check-unused-memory': allocUnused };
    }
  });

  return [mergedFirst, ...configs.slice(1)];
}

/**
 * Env script path only when the user explicitly set `environment.environmentScript`.
 * Does not return schema defaults such as `/etc/profile` — use for host-side CANN
 * tool discovery (`asys`, `npu-smi`).
 */
export function getConfiguredEnvironmentScriptPath(): string | undefined {
  const explicit = getExplicitEnvironmentScript();

  if (explicit === undefined) {
    return undefined;
  }

  const trimmed = String(explicit).trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Effective env script path from workspace `environment.environmentScript`.
 * Uses the first workspace folder scope when present so folder-level settings apply.
 */
export function getEnvironmentScriptPathFromWorkspace(): string {
  const explicit = getExplicitEnvironmentScript();

  if (explicit !== undefined && String(explicit).trim() !== '') {
    return String(explicit).trim();
  }

  const cfg = getOpDevtoolsWorkspaceConfiguration();
  const primary = cfg.get<string>(ENVIRONMENT_SCRIPT_SETTING, DEFAULT_ENVIRONMENT_SCRIPT)
    ?? DEFAULT_ENVIRONMENT_SCRIPT;

  if (typeof primary === 'string' && primary.trim()) {
    return primary.trim();
  }

  return DEFAULT_ENVIRONMENT_SCRIPT;
}

/** Workspace override for msprof / cann simulator directory name (e.g. Ascend910B3). */
export function getWorkspaceSimulatorType(): string {
  const cfg = getOpDevtoolsWorkspaceConfiguration();
  const explicit = getConfiguredValue<string>(cfg, [
    'performanceTuning.simulation.simulatorType',
    'operatorProject.performance.simulation.simulatorType',
    'operatorProject.simulate.simulatorType',
  ]);
  if (explicit !== undefined && String(explicit).trim() !== '') {
    return String(explicit).trim();
  }
  return '';
}

export function getEnvironmentSocVersionFromWorkspace(): string {
  const cfg = getOpDevtoolsWorkspaceConfiguration();
  const explicit = getConfiguredValue<string>(cfg, [
    'environment.socVersion',
    'operatorProject.env.socVersion',
  ]);
  if (explicit !== undefined && String(explicit).trim() !== '') {
    return String(explicit).trim();
  }
  const primary = cfg.get<string>('environment.socVersion', '') ?? '';
  if (typeof primary === 'string' && primary.trim()) {
    return primary.trim();
  }
  const legacy = cfg.get<string>('operatorProject.env.socVersion', '') ?? '';
  if (typeof legacy === 'string' && legacy.trim()) {
    return legacy.trim();
  }
  return '';
}

export function getAscendEnvScriptWithWorkspaceOverride(
  storedScript: string | null | undefined,
): string {
  const explicit = getExplicitEnvironmentScript();

  return explicit !== undefined ? String(explicit).trim() : (storedScript || '');
}

export function getSocVersionWithWorkspaceOverride(
  storedSocVersion: string | null | undefined,
): string {
  const cfg = getOpDevtoolsWorkspaceConfiguration();
  const socVersion = getConfiguredValue<string>(cfg, [
    'environment.socVersion',
    'operatorProject.env.socVersion',
  ]);
  return socVersion !== undefined ? socVersion : (storedSocVersion || '');
}
