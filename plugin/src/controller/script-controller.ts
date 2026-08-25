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
