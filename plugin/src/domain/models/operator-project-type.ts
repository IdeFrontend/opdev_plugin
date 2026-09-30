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
 * Operator project type enum.
 * Extracted here (from operator-project-detector.ts) so that plugin files
 * can import it without creating circular dependencies.
 */
export enum OperatorProjectType {
  STANDARD_CUSTOM = 'standard-custom',
  ASCEND_C = 'ascend-c',
  TORCH_LIBRARY = 'torch-library',
  PYASC = 'pyasc',
  TRITON = 'triton',
  /** Reserved — set by higher-level scan logic, never emitted by detectOperatorProject(). */
  MULTI_PROJECT = 'multi-project',
}
