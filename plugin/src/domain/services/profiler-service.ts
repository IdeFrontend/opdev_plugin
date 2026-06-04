import { ConfigRecord } from '@plugin/domain/models/config-model';
import { OpRecord } from '@plugin/domain/models/model';
import {
  Command, getAdvanceCmd,
} from '@plugin/domain/utils/command-utils';
import { joinIdeConfigRelative } from '@plugin/helpers/ide-config-dir';
import {
  isAscendA5ProfilerCannSoc,
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
 * Simulation Profiler Strategy
 */
export class SimulatorStrategy implements ProfilerCommandStrategy {
  generate(
    config: ConfigRecord,
    operator: OpRecord,
    targetFile: string,
    _context?: ProfilerGenerateContext,
  ): string {
    const metrics = ['PipeUtilization'];
    const userOptions = config.user_options as Record<string, unknown> | null | undefined;

    if (userOptions?.ResourceConflictRatio) {
      metrics.push('ResourceConflictRatio');
    }

    if (userOptions?.PMSampling) {
      metrics.push('PMSampling');
    }

    const advance_cmd = getAdvanceCmd(userOptions?.advance_param);

    // msprof op simulator --soc-version expects the CANN SOC (e.g. ascend910_93),
    // NOT the simulator device-directory name (Ascend910C). The device name is
    // still used for the build (build.sh --simulator) via the spawn env.
    const msprofSocVersionArg = resolveAscendEnv({ isSimulator: true }).socVersion;

    // Build the msprof op simulator command
    const msprof = new Command('msprof');
    const simulator = msprof.sub('op')
      .sub('simulator', { separators: { 'aic-metrics': ',' } });

    simulator.addOptions({
      'soc-version': msprofSocVersionArg,
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
