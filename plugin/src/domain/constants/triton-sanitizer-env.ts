/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
/** Spawn env for Triton msSanitizer runs (Phase 1: all required vars always enabled). */
export const TRITON_SANITIZER_SPAWN_ENV: Readonly<Record<string, string>> = {
  TRITON_ENABLE_SANITIZER: '1',
  TRITON_ALWAYS_COMPILE: '1',
  PYTORCH_NO_NPU_MEMORY_CACHING: '1',
};
