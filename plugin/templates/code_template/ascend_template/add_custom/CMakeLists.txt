# ----------------------------------------------------------------------------
# Copyright (c) 2026 Huawei Technologies Co., Ltd.
# This program is free software, you can redistribute it and/or modify it under the terms and conditions of
# CANN Open Software License Agreement Version 2.0 (the "License").
# Please refer to the License for details. You may not use this file except in compliance with the License.
# THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
# INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
# See LICENSE in the root of the software repository for the full text of the License.
# ----------------------------------------------------------------------------

# SUPPORT_COMPUTE_UNIT and SUPPORT_TILING_DIR must match your Ascend chip and
# CANN toolkit. When you build from Operator Development Tools, the extension
# sets them for you via environment variables (like SOC_VERSION). You can also
# export them in your shell or pass -DSUPPORT_COMPUTE_UNIT=... on the cmake
# command line if you build outside the extension.
#
# Order of precedence:
#   1. explicit `-DSUPPORT_COMPUTE_UNIT=...` on the cmake command line wins
#      once it is non-empty (it lands in the cache directly).
#   2. otherwise, if `$ENV{SUPPORT_COMPUTE_UNIT}` is non-empty, it is
#      promoted into the cache via FORCE so that re-runs pick it up.
if((NOT DEFINED SUPPORT_COMPUTE_UNIT OR "${SUPPORT_COMPUTE_UNIT}" STREQUAL "")
   AND DEFINED ENV{SUPPORT_COMPUTE_UNIT} AND NOT "$ENV{SUPPORT_COMPUTE_UNIT}" STREQUAL "")
    set(SUPPORT_COMPUTE_UNIT "$ENV{SUPPORT_COMPUTE_UNIT}" CACHE STRING
        "ACLNN compute unit (match your CANN ACLNN sample for the target chip)." FORCE)
endif()
if(NOT DEFINED SUPPORT_COMPUTE_UNIT)
    set(SUPPORT_COMPUTE_UNIT "" CACHE STRING
        "ACLNN compute unit (match your CANN ACLNN sample for the target chip).")
endif()
if("${SUPPORT_COMPUTE_UNIT}" STREQUAL "")
    message(FATAL_ERROR "SUPPORT_COMPUTE_UNIT is required. Pass -DSUPPORT_COMPUTE_UNIT=<unit> to cmake, export SUPPORT_COMPUTE_UNIT, or build via Operator Development Tools.")
endif()

if((NOT DEFINED SUPPORT_TILING_DIR OR "${SUPPORT_TILING_DIR}" STREQUAL "")
   AND DEFINED ENV{SUPPORT_TILING_DIR} AND NOT "$ENV{SUPPORT_TILING_DIR}" STREQUAL "")
    set(SUPPORT_TILING_DIR "$ENV{SUPPORT_TILING_DIR}" CACHE STRING
        "Tiling subdirectory under op_host for SUPPORT_COMPUTE_UNIT." FORCE)
endif()
if(NOT DEFINED SUPPORT_TILING_DIR)
    set(SUPPORT_TILING_DIR "" CACHE STRING
        "Tiling subdirectory under op_host for SUPPORT_COMPUTE_UNIT.")
endif()
if("${SUPPORT_TILING_DIR}" STREQUAL "")
    message(FATAL_ERROR "SUPPORT_TILING_DIR is required. Pass -DSUPPORT_TILING_DIR=<dir> to cmake, export SUPPORT_TILING_DIR, or build via Operator Development Tools.")
endif()

message(STATUS "SUPPORT_COMPUTE_UNIT='${SUPPORT_COMPUTE_UNIT}' SUPPORT_TILING_DIR='${SUPPORT_TILING_DIR}'")

add_all_modules_sources(OPTYPE add_custom ACLNNTYPE aclnn_exclude COMPUTE_UNIT ${SUPPORT_COMPUTE_UNIT} TILING_DIR ${SUPPORT_TILING_DIR} DISABLE_IN_OPP TRUE)
