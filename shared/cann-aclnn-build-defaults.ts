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
 * ACLNN standard-custom build parameters for ascend_template/add_custom CMakeLists.
 * Values are injected into CMakeLists.txt at project generation (see resolveAclnnCmakeDefaultsForGeneration).
 *
 * CANN naming (Huawei ascend add_custom template + op_host SocVersion API):
 * - Packaging / build slug: `ascend950` (SOC_VERSION, build.sh --soc=).
 * - ACLNN compute unit differs by chip generation (see mapping below).
 * - Tiling subtree under op_host pairs with the compute unit.
 *
 * Platform mapping (baked into CMakeLists.txt at project generation):
 * - A2/A3 (910B-class): `ascend910_95` + `arch22`
 * - A5 / 950-class: `ascend950` + `arch35`
 */

/** ACLNN compute unit for Ascend A2/A3 class (SocVersion::ASCEND910_95 in template op_host). */
export const SUPPORT_COMPUTE_UNIT_ASCEND_910_95 = 'ascend910_95' as const;

/** ACLNN compute unit for Ascend A5 / 950 class. */
export const SUPPORT_COMPUTE_UNIT_ASCEND_950 = 'ascend950' as const;

/** Tiling subdirectory for Ascend A2/A3 class. */
export const SUPPORT_TILING_DIR_ARCH22 = 'arch22' as const;

/** Tiling subdirectory for Ascend A5 / 950 class (arch35 ↔ dav-3510 class). */
export const SUPPORT_TILING_DIR_ARCH35 = 'arch35' as const;
