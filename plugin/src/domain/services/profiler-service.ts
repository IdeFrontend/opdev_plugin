import { ConfigRecord } from '@plugin/domain/models/config-model';
import { OpRecord } from '@plugin/domain/models/model';
import {
  Command, getAdvanceCmd,
} from '@plugin/domain/utils/command-utils';
import { joinIdeConfigRelative } from '@plugin/helpers/ide-config-dir';
import {
  isAscendA5ProfilerCannSoc,
  normalizeCannSoc,
  resolveAscendEnv,
} from '@plugin/domain/utils/ascend-util';

/** Optional context for building msprof commands (on-board SOC capability matrix). */
export type ProfilerGenerateContext = {
  /** CANN-style project SOC (e.g. ascend950); drives A3 vs A5 on-board aic-metrics. */
  onboardCannSoc?: string | null;
};

/**
 * msprof command generates policy interface
 */
export interface ProfilerCommandStrategy {
  generate(
    config: ConfigRecord,
    operator: OpRecord,
    targetFile: string,
    context?: ProfilerGenerateContext,
  ): string;
}

/**
 * Optional `msprof op simulator` aic-metrics, keyed by metric name → the set of
 * resolved CANN SOC slugs whose simulator is confirmed to accept that metric.
 *
 * `PipeUtilization` is intentionally absent: it is the mandatory simulator base
 * metric, always emitted by {@link getSimulationAicMetrics} unless replaced by a
 * mutually-exclusive `ResourceConflictRatio` that is allow-listed for the SOC.
 *
 * Conservative policy (GC-22 / plugin_release #32): unlike on-board `msprof op`,
 * the simulator (CANN msopprof) validates `--aic-metrics` against the platform
 * selected by `--soc-version` and accepts only a narrow, platform-dependent set.
 * Unknown metrics are rejected with "[ERROR] Unexpected argument ... maybe in
 * wrong soc platform" — which broke A3 (`ascend910_93`) out of the box. So a
 * metric is requested only where the simulator is *positively* known to accept
 * it. The CANN simulator reference lists only `PipeUtilization` (mandatory) and
 * `ResourceConflictRatio` (optional) and does NOT list `PMSampling` as a
 * simulator metric, so both sets start empty. Add the lowercase, normalized CANN
 * SOC slug (see {@link normalizeCannSoc}) to a set below once a metric is verified
 * to work for the simulator on that platform.
 */
const SIMULATOR_OPTIONAL_METRIC_SOCS: {
  ResourceConflictRatio: ReadonlySet<string>;
  PMSampling: ReadonlySet<string>;
} = {
  ResourceConflictRatio: new Set<string>(),
  PMSampling: new Set<string>(),
};

/**
 * Build simulation aic-metrics for `msprof op simulator` on the resolved SOC.
 *
 * Two rules combine:
 *  - SOC gating (GC-22): optional metrics are requested only where the simulator
 *    is confirmed to accept them, so msprof never rejects the command (e.g. A3 /
 *    `ascend910_93` rejects `ResourceConflictRatio`).
 *  - msprof mutual exclusion: `PipeUtilization` and `ResourceConflictRatio` are
 *    never emitted together. `ResourceConflictRatio` is used only when it is both
 *    requested and allow-listed for this SOC; otherwise the mandatory
 *    `PipeUtilization` base metric is emitted.
 *
 * @param allowedMetricSocs per-SOC allow-list of optional metrics; defaults to
 *   {@link SIMULATOR_OPTIONAL_METRIC_SOCS} and is injectable so the gating and
 *   mutual-exclusion branches stay unit-testable without a non-empty production list.
 */
export function getSimulationAicMetrics(
  userOptions: Record<string, unknown> | null | undefined,
  cannSoc: string,
  allowedMetricSocs: {
    ResourceConflictRatio: ReadonlySet<string>;
    PMSampling: ReadonlySet<string>;
  } = SIMULATOR_OPTIONAL_METRIC_SOCS,
): string[] {
  const soc = normalizeCannSoc(cannSoc);

  const useResourceConflictRatio = Boolean(userOptions?.ResourceConflictRatio)
    && allowedMetricSocs.ResourceConflictRatio.has(soc);

  // Mutual exclusion: ResourceConflictRatio replaces the mandatory PipeUtilization base.
  const metrics = useResourceConflictRatio
    ? ['ResourceConflictRatio']
    : ['PipeUtilization'];

  if (userOptions?.PMSampling && allowedMetricSocs.PMSampling.has(soc)) {
    metrics.push('PMSampling');
  }

  return metrics;
}

/**
 * Simulation Profiler Strategy
 */
export class SimulatorStrategy implements ProfilerCommandStrategy {
  generate(
    config: ConfigRecord,
    operator: OpRecord,
    targetFile: string,
    _context?: ProfilerGenerateContext,
  ): string {
    const userOptions = config.user_options as Record<string, unknown> | null | undefined;
    const advance_cmd = getAdvanceCmd(userOptions?.advance_param);

    const simEnv = resolveAscendEnv({ isSimulator: true });

    // msprof op simulator --soc-version: simulator directory under
    // $ASCEND_HOME_PATH/tools/simulator — see docs/ascend-env-spec.md §8.1.
    const msprofSimulatorArg = simEnv.simulatorType ?? '';

    // Gate aic-metrics by the resolved CANN SOC slug (NOT the simulator directory):
    // msopprof rejects metrics it does not support for the selected platform (GC-22).
    const metrics = getSimulationAicMetrics(userOptions, simEnv.socVersion);

    // Build the msprof op simulator command
    const msprof = new Command('msprof');
    const simulator = msprof.sub('op')
      .sub('simulator', { separators: { 'aic-metrics': ',' } });

    simulator.addOptions({
      'soc-version': msprofSimulatorArg || undefined,
      output: `${operator.op_path}/${joinIdeConfigRelative('opprof')}`,
      'aic-metrics': metrics,
    });

    if (advance_cmd) {
      simulator.addArgument(advance_cmd);
    }

    if (targetFile) {
      simulator.addArgument(targetFile);
    }

    return msprof.toString();
  }
}

/**
 * Profiler strategy on board
 */
export class OnBoardStrategy implements ProfilerCommandStrategy {
  generate(
    config: ConfigRecord,
    operator: OpRecord,
    targetFile: string,
    context?: ProfilerGenerateContext,
  ): string {
    const userOptions = (config.user_options as Record<string, unknown> | null | undefined) || {};
    const cannSoc = context?.onboardCannSoc;
    const metrics = this.getOnBoardMetrics(userOptions as Record<string, boolean>, cannSoc);
    const advance_cmd = getAdvanceCmd(userOptions.advance_param);

    // Build msprof op command
    const msprof = new Command('msprof');
    const op = msprof.sub('op', { separators: { 'aic-metrics': ',' } });

    op.addOptions({
      output: `${operator.op_path}/${joinIdeConfigRelative('opprof')}`,
      'aic-metrics': metrics.length > 0 ? metrics : undefined,
    });

    if (advance_cmd) {
      op.addArgument(advance_cmd);
    }

    if (targetFile) {
      op.addArgument(targetFile);
    }

    return msprof.toString();
  }

  /**
   * Get graphic parameter indicators on the upper board
   */
  private getOnBoardMetrics(obj: Record<string, boolean>, cannSoc?: string | null): string[] {
    const isA5 = isAscendA5ProfilerCannSoc(cannSoc);
    const basicMetrics = isA5
      ? [
        'Occupancy',
        'Roofline',
        'Source',
        'PCSampling',
        'KernelScale',
      ]
      : [
        'Occupancy',
        'Roofline',
        'Source',
        'MemoryDetail',
        'KernelScale',
      ];

    const result: string[] = basicMetrics.filter((k) => obj[k]);

    const needsDefault = isA5
      ? result.includes('Roofline') || result.includes('PCSampling')
      : result.includes('Roofline') || result.includes('MemoryDetail');

    if (needsDefault) {
      result.push('Default');
    }
    else {
      const extendedMetrics = [
        'ArithmeticUtilization',
        'L2Cache',
        'Memory',
        'MemoryL0',
        'MemoryUB',
        'PipeUtilization',
        'ResourceConflictRatio',
      ];

      extendedMetrics.forEach((k) => {
        if (obj[k]) {
          result.push(k);
        }
      });
    }

    return result;
  }
}

/**
 * Profiler Factory
 */
export class ProfilerFactory {
  static getStrategy(type: 'simulator' | 'onboard'): ProfilerCommandStrategy {
    if (type === 'simulator') {
      return new SimulatorStrategy();
    }

    return new OnBoardStrategy();
  }
}
