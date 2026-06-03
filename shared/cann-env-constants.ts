/**
 * Canonical CANN / Ascend environment strings (SOC slugs, simulator dirs,
 * NPU arch). Shared by the plugin resolver, profiler helpers, and tests.
 */

/** CANN SOC slug for Ascend 910B / Atlas A3 class. */
export const CANN_SOC_ASCEND_910B = 'ascend910b' as const;

/** CANN SOC slug for Ascend 910C (910.93) class. */
export const CANN_SOC_ASCEND_910_93 = 'ascend910_93' as const;

/** CANN SOC slug for Ascend 910A class. */
export const CANN_SOC_ASCEND_910 = 'ascend910' as const;

/** CANN SOC slug for Ascend 310P class. */
export const CANN_SOC_ASCEND_310P = 'ascend310p' as const;

/** CANN SOC slug for Ascend 950 / Atlas A5 class. */
export const CANN_SOC_ASCEND_950 = 'ascend950' as const;

/**
 * Last-resort CANN SOC when settings, env, and host detection all fail.
 */
export const DEFAULT_FALLBACK_CANN_SOC = '';

/** AscendC `--npu-arch` for 910B-class and unknown SOCs. */
export const NPU_ARCH_DAV_2201 = 'dav-2201' as const;

/** AscendC `--npu-arch` for Ascend 950 / Atlas A5 class. */
export const NPU_ARCH_DAV_3510 = 'dav-3510' as const;

/** Default `--npu-arch` when SOC is empty or non-A5. */
export const DEFAULT_NPU_ARCH = NPU_ARCH_DAV_2201;

/** Simulator directory for 910B / A3 class (`tools/simulator/<name>/lib`). */
export const SIMULATOR_ASCEND_910B3 = 'Ascend910B3' as const;

/**
 * Simulator device name used when the CANN SOC is empty or unmapped
 * (msprof `--soc-version`, CANN `build.sh --simulator`).
 */
export const DEFAULT_FALLBACK_SIMULATOR_DEVICE_NAME = '';

export const SIMULATOR_ASCEND_910C = 'Ascend910C' as const;
export const SIMULATOR_ASCEND_910 = 'Ascend910' as const;
export const SIMULATOR_ASCEND_310P = 'Ascend310P' as const;
export const SIMULATOR_ASCEND_950PR_9589 = 'Ascend950PR_9589' as const;
