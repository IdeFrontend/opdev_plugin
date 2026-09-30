/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import {
  resolveAscendEnv,
  resolveEffectiveCannSoc,
} from '@plugin/domain/utils/ascend-util';
import {
  isNpuHardwareProbeAvailable,
  startNpuHardwareProbe,
  startRemoteNpuHardwareProbe,
} from '@plugin/domain/utils/npu-hardware-probe';
import {
  isSimulatorOptionalMetricSupported,
  type SimulatorOptionalMetric,
} from '@shared/msprof-simulator-metrics';

export const scriptMethods = {
  /**
   * Get the effective SoC version for the current project environment.
   * @returns project environment values
   */
  async getProjectEnv(): Promise<{ socVersion: string }> {
    return { socVersion: resolveEffectiveCannSoc() };
  },

  async getNpuHardwareAvailable(): Promise<boolean> {
    return isNpuHardwareProbeAvailable();
  },

  async getOnBoardExecutionAvailable(): Promise<boolean> {
    try {
      if (await startNpuHardwareProbe()) {
        return true;
      }
    }
    catch {
      // Probe failure is treated as no local NPU; remote fallback can still allow execution.
    }

    try {
      return await startRemoteNpuHardwareProbe();
    }
    catch {
      return false;
    }
  },

  /**
   * Optional `msprof op simulator` aic-metrics supported on the SOC this project's
   * simulator runs resolve to. Computed with the SAME `resolveAscendEnv({ isSimulator:
   * true })` SOC and the SAME allow-list (`isSimulatorOptionalMetricSupported`) that
   * `SimulatorStrategy` gates the command on — so the simulator-options webview hides a
   * checkbox iff the command would drop that metric (GC-22). Do not
   * use `getProjectEnv().socVersion` for this: that is the non-simulator SOC and can
   * differ when a workspace `simulation.simulatorType` override is set.
   */
  async getSimulatorSupportedMetrics(): Promise<Record<SimulatorOptionalMetric, boolean>> {
    const cannSoc = resolveAscendEnv({ isSimulator: true }).socVersion;

    return {
      ResourceConflictRatio: isSimulatorOptionalMetricSupported('ResourceConflictRatio', cannSoc),
      PMSampling: isSimulatorOptionalMetricSupported('PMSampling', cannSoc),
    };
  },
};
