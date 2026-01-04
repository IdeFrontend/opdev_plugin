import { ConfigRecord } from '../models/configModel';
import { OpRecord } from '../models/model';
import { objectToCommandString, getAdvanceCmd } from '../utils/command-utils';

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
    if (config.user_options?.ResourceConflictRatio) {
      metrics.push('ResourceConflictRatio');
    }
    if (config.user_options?.PMSampling) {
      metrics.push('PMSampling');
    }

    const advance_cmd = getAdvanceCmd(config.user_options?.advance_param);

    const cmdArgs = objectToCommandString(
      {
        'soc-version': config.user_options?.simulatorType,
        output: `${operator.op_path}/.vscode/opprof`,
        'aic-metrics': metrics,
      },
      {
        separators: {
          'aic-metrics': ',',
        },
      },
    );

    const parts = ['msprof op simulator', cmdArgs, advance_cmd, targetFile];
    return parts.filter(Boolean).join(' ');
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
    const metrics = this.getOnBoardMetrics(config.user_options || {});
    const advance_cmd = getAdvanceCmd(config.user_options?.advance_param);

    const cmdArgs = objectToCommandString(
      {
        output: `${operator.op_path}/.vscode/opprof`,
        'aic-metrics': metrics.length > 0 ? metrics : undefined,
      },
      {
        separators: {
          'aic-metrics': ',',
        },
      },
    );

    const parts = ['msprof op', cmdArgs, advance_cmd, targetFile];
    return parts.filter(Boolean).join(' ');
  }

  /**
   * 获取上板图形参数指标
   */
  private getOnBoardMetrics(obj: any): string[] {
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
    } else {
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
