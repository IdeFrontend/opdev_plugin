import { CANN_SOC_ASCEND_950 } from './cann-env-constants';

/**
 * CANN SOC strings for which on-board `msprof op` uses the Ascend A5 / Atlas A5
 * aic-metrics matrix (no MemoryDetail; PCSampling available).
 */
export function isAscendA5ProfilerCannSoc(cannSoc: string | null | undefined): boolean {
  return (cannSoc || '').trim().toLowerCase() === CANN_SOC_ASCEND_950;
}
