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
 * CANN SOC strings for which on-board `msprof op` uses the Ascend A5 / Atlas A5
 * aic-metrics matrix (no MemoryDetail; PCSampling available).
 */
export function isAscendA5ProfilerCannSoc(cannSoc: string | null | undefined): boolean {
  return (cannSoc || '').trim()
    .toLowerCase() === CANN_SOC_ASCEND_950;
}
