/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import type {
  SimulateConfig, OnBoardConfig,
} from '@plugin/service/config-service';
import { OpRecord } from '@plugin/domain/models/op-record';
import {
  Command, getAdvanceCmd,
} from '@plugin/domain/utils/command-utils';
import { joinIdeConfigRelative } from '@plugin/helpers/ide-config-dir';
import { getFirstWorkspaceFolderPath } from '@plugin/helpers/operator-project-workspace-config';
import {
  isAscendA5ProfilerCannSoc,
  resolveAscendEnv,
} from '@plugin/domain/utils/ascend-util';
import {
  SIMULATOR_OPTIONAL_METRIC_SOCS,
  isSimulatorOptionalMetricSupported,
  type SimulatorOptionalMetricAllowList,
} from '@shared/msprof-simulator-metrics';

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
    config: SimulateConfig | OnBoardConfig,
    operator: OpRecord,
    targetFile: string,
    context?: ProfilerGenerateContext,
  ): string;
}

/**
 * Build simulation aic-metrics for `msprof op simulator` on the resolved SOC.
 *
 * Two rules combine:
 *  - SOC gating (GC-22): optional metrics are requested only where the simulator is
 *    confirmed to accept them, so msprof never rejects the command (e.g. A3 /
 *    `ascend910_93` rejects `ResourceConflictRatio`). The per-SOC allow-list is the
 *    shared {@link SIMULATOR_OPTIONAL_METRIC_SOCS}, evaluated through
 *    {@link isSimulatorOptionalMetricSupported} — the same helper + list the
 *    simulator-options webview consults (via the `getSimulatorSupportedMetrics`
 *    RPC, resolved with the identical `isSimulator: true` SOC), so the UI never
 *    offers a metric this builder would drop.
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
  allowedMetricSocs: SimulatorOptionalMetricAllowList = SIMULATOR_OPTIONAL_METRIC_SOCS,
): string[] {
  const useResourceConflictRatio = Boolean(userOptions?.ResourceConflictRatio)
    && isSimulatorOptionalMetricSupported('ResourceConflictRatio', cannSoc, allowedMetricSocs);

  // Mutual exclusion: ResourceConflictRatio replaces the mandatory PipeUtilization base.
  const metrics = useResourceConflictRatio
    ? ['ResourceConflictRatio']
    : ['PipeUtilization'];

  if (userOptions?.PMSampling
    && isSimulatorOptionalMetricSupported('PMSampling', cannSoc, allowedMetricSocs)) {
    metrics.push('PMSampling');
  }

  return metrics;
}

/**
 * Simulation Profiler Strategy
 */
export class SimulatorStrategy implements ProfilerCommandStrategy {
  generate(
    config: SimulateConfig,
    operator: OpRecord,
    targetFile: string,
    _context?: ProfilerGenerateContext,
  ): string {
    const advance_cmd = getAdvanceCmd(config.advanceParam);

    const simEnv = resolveAscendEnv({ isSimulator: true });

    // msprof op simulator --soc-version: simulator directory under
    // $ASCEND_HOME_PATH/tools/simulator — see docs/ascend-env-spec.md §8.1.
    const msprofSimulatorArg = simEnv.simulatorType ?? '';

    // Gate aic-metrics by the resolved CANN SOC slug (NOT the simulator directory):
    // msopprof rejects metrics it does not support for the selected platform (GC-22).
    const metrics = getSimulationAicMetrics({
      ResourceConflictRatio: config.resourceConflictRatio,
      PMSampling: config.memoryThroughputWaveform,
    }, simEnv.socVersion);

    // Build the msprof op simulator command
    const msprof = new Command('msprof');
    const simulator = msprof.sub('op')
      .sub('simulator', { separators: { 'aic-metrics': ',' } });

    simulator.addOptions({
      'soc-version': msprofSimulatorArg || undefined,
      // Root-level opprof (per the workspace-root report rule): every
      // operator writes into <root>/<ideDir>/opprof/<runId>.
      output: `${getFirstWorkspaceFolderPath() ?? operator.op_path}/${joinIdeConfigRelative('opprof')}`,
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
    config: OnBoardConfig,
    operator: OpRecord,
    targetFile: string,
    context?: ProfilerGenerateContext,
  ): string {
    const cannSoc = context?.onboardCannSoc;
    const metrics = this.getOnBoardMetrics({
      Occupancy: config.occupancy,
      Roofline: config.roofline,
      Source: config.source,
      MemoryDetail: config.memoryDetail,
      PCSampling: config.pcSampling,
      KernelScale: config.kernelScale,
      ArithmeticUtilization: config.arithmeticUtilization,
      L2Cache: config.l2Cache,
      Memory: config.memory,
      MemoryL0: config.memoryL0,
      MemoryUB: config.memoryUB,
      PipeUtilization: config.pipeUtilization,
      ResourceConflictRatio: config.resourceConflictRatio,
    }, cannSoc);
    const advance_cmd = getAdvanceCmd(config.advanceParam);

    // Build msprof op command
    const msprof = new Command('msprof');
    const op = msprof.sub('op', { separators: { 'aic-metrics': ',' } });

    op.addOptions({
      // Root-level opprof (per the workspace-root report rule): every
      // operator writes into <root>/<ideDir>/opprof/<runId>.
      output: `${getFirstWorkspaceFolderPath() ?? operator.op_path}/${joinIdeConfigRelative('opprof')}`,
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
