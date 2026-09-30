/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { CANN_SOC_ASCEND_950 } from './cann-env-constants';

/**
 * Single source of truth for OPTIONAL `msprof op simulator` aic-metrics, shared by
 * the command builder (plugin `SimulatorStrategy`) and the simulator-options
 * webview so the UI never offers a metric the command would silently drop.
 *
 * Background (GC-22 / plugin_release #32): the simulator (CANN msopprof) validates
 * `--aic-metrics` against the platform selected by `--soc-version` and accepts only
 * a narrow, platform-dependent set; unknown metrics fail with
 * `[ERROR] Unexpected argument ... maybe in wrong soc platform` (this broke A3 /
 * `ascend910_93`). `PipeUtilization` is the mandatory base metric and is always
 * emitted, so it is NOT listed here — only genuinely optional metrics are gated.
 *
 * Add a lowercase, trimmed CANN SOC slug to a set below only once the metric is
 * verified on that platform's real simulator via manual `msprof op simulator` CLI
 * (see docs/simulator-options-spec.md §8). Slugs are added per-SOC independently.
 *
 * A5 (`ascend950`): `ResourceConflictRatio` and `PMSampling` confirmed §8.1 (2026-06-26).
 * Never add `ascend910_93` for `ResourceConflictRatio` (GC-22 rejection).
 */
export type SimulatorOptionalMetric = 'ResourceConflictRatio' | 'PMSampling';

export type SimulatorOptionalMetricAllowList =
  Readonly<Record<SimulatorOptionalMetric, ReadonlySet<string>>>;

export const SIMULATOR_OPTIONAL_METRIC_SOCS: SimulatorOptionalMetricAllowList = {
  ResourceConflictRatio: new Set([CANN_SOC_ASCEND_950]),
  PMSampling: new Set([CANN_SOC_ASCEND_950]),
};

/** Whether the simulator on `cannSoc` is allow-listed to accept `metric`. */
export function isSimulatorOptionalMetricSupported(
  metric: SimulatorOptionalMetric,
  cannSoc: string | null | undefined,
  allowList: SimulatorOptionalMetricAllowList = SIMULATOR_OPTIONAL_METRIC_SOCS,
): boolean {
  return allowList[metric].has((cannSoc || '').trim()
    .toLowerCase());
}
