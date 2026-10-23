/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
/**
 * Canonical CANN / Ascend environment strings (SOC slugs, simulator dirs,
 * NPU arch). Shared by the plugin resolver, profiler helpers, and tests.
 */

/** CANN SOC slug for the Ascend 910B class (Ascend910B/B1/B2C/B3/B4). */
export const CANN_SOC_ASCEND_910B = 'ascend910b' as const;

/** CANN SOC slug for the current Atlas A3 class (Ascend910_93xx / 910C). */
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

/** AscendC `--npu-arch` for A2 Pro / Premium / 901 exact chip names. */
export const NPU_ARCH_DAV_1001 = 'dav-1001' as const;

/** Default `--npu-arch` for known non-A5 SOCs (empty SOC leaves NPU_ARCH unset). */
export const DEFAULT_NPU_ARCH = NPU_ARCH_DAV_2201;

/**
 * Simulator directory for 910B / A2 class (`tools/simulator/<name>/lib`).
 * Also the value for `msprof op simulator --soc-version` on A2 (see docs/ascend-env-spec.md §8.1).
 */
export const SIMULATOR_ASCEND_910B3 = 'Ascend910B3' as const;

/**
 * Fallback simulator device name when the CANN SOC is empty or unmapped.
 * Used for CANN `build.sh --simulator` spawn env, not for `{soc_version}` (slug).
 */
export const DEFAULT_FALLBACK_SIMULATOR_DEVICE_NAME = '';

export const SIMULATOR_ASCEND_910C = 'Ascend910_9362' as const;

export const SIMULATOR_ASCEND_910 = 'Ascend910' as const;

export const SIMULATOR_ASCEND_310P = 'Ascend310P' as const;

export const SIMULATOR_ASCEND_950PR_9589 = 'Ascend950PR_9589' as const;

export function isAscendA2A3CannSoc(socVersion: string | undefined): boolean {
  const normalized = (socVersion || '').toLowerCase();

  return normalized === CANN_SOC_ASCEND_910B || normalized === CANN_SOC_ASCEND_910_93;
}

/** Sanitizer 命令名（mssanitizer / npu-check）。 */
export type SanitizerToolType = 'mssanitizer' | 'npu-check';

/**
 * 支持 npu-check 的算子工程类型（<<<>>> 内核调用符直调 + 标准自定义算子工程）：
 * - 'ascend-c'        结构探测值（CMakeLists + .asc）
 * - 'cann'            <<<>>> 新建工程写入的存储值（helloworld / addn / torch_library 模板）
 * - 'torch-library'   torch library 形态的规范探测值
 * - 'standard-custom' 标准自定义算子工程的结构探测值（无工程记录/设置时的兜底取值）
 * - 'ascend'          标准自定义算子工程的存储值（工程记录 / 工作区 projectType 设置）
 */
const NPU_CHECK_PROJECT_TYPES: ReadonlySet<string> = new Set([
  'ascend-c',
  'cann',
  'torch-library',
  'standard-custom',
  'ascend',
]);

/**
 * npu-check 是否支持该工程类型：仅在 <<<>>> 与标准自定义算子工程中可用，
 * 其他类型（pyasc、triton 等）不支持。
 */
export function isNpuCheckProjectTypeSupported(projectType: string | null | undefined): boolean {
  const normalized = (projectType ?? '').trim()
    .toLowerCase();

  return NPU_CHECK_PROJECT_TYPES.has(normalized);
}

/**
 * 根据 CANN SOC 版本返回默认 sanitizer toolType。
 * A2/A3 SOC → mssanitizer；其余 → npu-check。
 * 单一真相源，供 plugin ConfigService 和 webview app.vue 复用。
 */
export function defaultSanitizerToolTypeForSoc(socVersion: string | undefined): SanitizerToolType {
  return isAscendA2A3CannSoc(socVersion)
    ? 'mssanitizer'
    : 'npu-check';
}

/**
 * 综合 SOC 与工程类型解析默认 sanitizer toolType：
 * A2/A3 SOC 或不支持的算子工程 → mssanitizer；其余 → npu-check。
 * 供 plugin ConfigService 和 webview app.vue 复用。
 */
export function resolveSanitizerToolType(
  socVersion: string | undefined,
  projectType: string | null | undefined,
): SanitizerToolType {
  return isAscendA2A3CannSoc(socVersion) || !isNpuCheckProjectTypeSupported(projectType)
    ? 'mssanitizer'
    : 'npu-check';
}
