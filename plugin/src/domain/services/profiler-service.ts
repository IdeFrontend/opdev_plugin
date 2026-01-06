import { ConfigRecord } from '../models/config-model';
import { OpRecord } from '../models/model';
import {
  Command, getAdvanceCmd,
} from '../utils/command-utils';

/**
 * msprof 命令生成策略接口
 */
export interface ProfilerCommandStrategy {
  generate(
    config: ConfigRecord,
    operator: OpRecord,
    targetFile: string,
  ): string;
}

/**
 * 仿真 Profiler 策略
 */
export class SimulatorStrategy implements ProfilerCommandStrategy {
  generate(
    config: ConfigRecord,
    operator: OpRecord,
    targetFile: string,
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

    // 构建 msprof op simulator 命令
    const msprof = new Command('msprof');
    const simulator = msprof.sub('op')
      .sub('simulator', { separators: { 'aic-metrics': ',' } });

    simulator.addOptions({
      'soc-version': userOptions?.simulatorType as string | undefined,
      output: `${operator.op_path}/.vscode/opprof`,
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
 * 上板 Profiler 策略
 */
export class OnBoardStrategy implements ProfilerCommandStrategy {
  generate(
    config: ConfigRecord,
    operator: OpRecord,
    targetFile: string,
  ): string {
    const userOptions = (config.user_options as Record<string, unknown> | null | undefined) || {};
    const metrics = this.getOnBoardMetrics(userOptions as Record<string, boolean>);
    const advance_cmd = getAdvanceCmd(userOptions.advance_param);

    // 构建 msprof op 命令
    const msprof = new Command('msprof');
    const op = msprof.sub('op', { separators: { 'aic-metrics': ',' } });

    op.addOptions({
      output: `${operator.op_path}/.vscode/opprof`,
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
   * 获取上板图形参数指标
   */
  private getOnBoardMetrics(obj: Record<string, boolean>): string[] {
    const basicMetrics = [
      'Occupancy',
      'Roofline',
      'Source',
      'MemoryDetail',
      'KernelScale',
    ];

    const result: string[] = basicMetrics.filter((k) => obj[k]);

    if (result.includes('Roofline') || result.includes('MemoryDetail')) {
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
 * Profiler 工厂
 */
export class ProfilerFactory {
  static getStrategy(type: 'simulator' | 'onboard'): ProfilerCommandStrategy {
    if (type === 'simulator') {
      return new SimulatorStrategy();
    }

    return new OnBoardStrategy();
  }
}
