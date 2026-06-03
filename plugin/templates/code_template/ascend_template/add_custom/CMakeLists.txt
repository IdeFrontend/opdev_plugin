# ----------------------------------------------------------------------------
# Copyright (c) 2025 Huawei Technologies Co., Ltd.
# This program is free software, you can redistribute it and/or modify it under the terms and conditions of
# CANN Open Software License Agreement Version 2.0 (the "License").
# Please refer to the License for details. You may not use this file except in compliance with the License.
# THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
# INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
# See LICENSE in the root of the software repository for the full text of the License.
# ----------------------------------------------------------------------------

# SUPPORT_COMPUTE_UNIT / SUPPORT_TILING_DIR are CANN-version + chip-specific
# values. We expose the same env -> cache pattern used for SIMULATOR_TYPE /
# SOC_VERSION / NPU_ARCH in the cann templates, so the host (op-devtools
# extension or the user) can inject the right values for the target chip
# without editing this file when CANN or hardware changes.
#
# Order of precedence:
#   1. explicit `-DSUPPORT_COMPUTE_UNIT=...` on the cmake command line wins
#      once it is non-empty (it lands in the cache directly).
#   2. otherwise, if `$ENV{SUPPORT_COMPUTE_UNIT}` is non-empty, it is
#      promoted into the cache via FORCE so that re-runs pick it up.
#   3. otherwise, the conservative default below is used.
if((NOT DEFINED SUPPORT_COMPUTE_UNIT OR "${SUPPORT_COMPUTE_UNIT}" STREQUAL "")
   AND DEFINED ENV{SUPPORT_COMPUTE_UNIT} AND NOT "$ENV{SUPPORT_COMPUTE_UNIT}" STREQUAL "")
    set(SUPPORT_COMPUTE_UNIT "$ENV{SUPPORT_COMPUTE_UNIT}" CACHE STRING
        "ACLNN compute unit (match your CANN ACLNN sample for the target chip)." FORCE)
endif()
if(NOT DEFINED SUPPORT_COMPUTE_UNIT OR "${SUPPORT_COMPUTE_UNIT}" STREQUAL "")
    set(SUPPORT_COMPUTE_UNIT "ascend910_95" CACHE STRING
        "ACLNN compute unit (match your CANN ACLNN sample for the target chip; Atlas A5 / Ascend 950 may use a different value in newer CANN).")
endif()

if((NOT DEFINED SUPPORT_TILING_DIR OR "${SUPPORT_TILING_DIR}" STREQUAL "")
   AND DEFINED ENV{SUPPORT_TILING_DIR} AND NOT "$ENV{SUPPORT_TILING_DIR}" STREQUAL "")
    set(SUPPORT_TILING_DIR "$ENV{SUPPORT_TILING_DIR}" CACHE STRING
        "Tiling subdirectory under op_host for SUPPORT_COMPUTE_UNIT." FORCE)
endif()
if(NOT DEFINED SUPPORT_TILING_DIR OR "${SUPPORT_TILING_DIR}" STREQUAL "")
    set(SUPPORT_TILING_DIR "arch35" CACHE STRING
        "Tiling subdirectory under op_host for SUPPORT_COMPUTE_UNIT.")
endif()

message(STATUS "SUPPORT_COMPUTE_UNIT='${SUPPORT_COMPUTE_UNIT}' SUPPORT_TILING_DIR='${SUPPORT_TILING_DIR}'")

add_all_modules_sources(OPTYPE add_custom ACLNNTYPE aclnn_exclude COMPUTE_UNIT ${SUPPORT_COMPUTE_UNIT} TILING_DIR ${SUPPORT_TILING_DIR} DISABLE_IN_OPP TRUE)
