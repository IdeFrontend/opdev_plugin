# ----------------------------------------------------------------------------
# Copyright (c) 2026 Huawei Technologies Co., Ltd.
# This program is free software, you can redistribute it and/or modify it under the terms and conditions of
# CANN Open Software License Agreement Version 2.0 (the "License").
# Please refer to the License for details. You may not use this file except in compliance with the License.
# THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
# INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
# See LICENSE in the root of the software repository for the full text of the License.
# ----------------------------------------------------------------------------

# SUPPORT_COMPUTE_UNIT 与 SUPPORT_TILING_DIR 须与目标 Ascend 芯片及 CANN 工具链匹配。
# 构建前必须通过环境变量设置（例如 export SUPPORT_COMPUTE_UNIT=…、export SUPPORT_TILING_DIR=…）；
# 使用 Operator Development Tools 扩展构建时，扩展会在 spawn 环境中自动注入上述变量。
# 若未定义或为空，cmake 将报错退出。

if(NOT DEFINED ENV{SUPPORT_COMPUTE_UNIT} OR "$ENV{SUPPORT_COMPUTE_UNIT}" STREQUAL "")
    message(FATAL_ERROR "SUPPORT_COMPUTE_UNIT is required. Export SUPPORT_COMPUTE_UNIT or build via Operator Development Tools.")
endif()
set(SUPPORT_COMPUTE_UNIT "$ENV{SUPPORT_COMPUTE_UNIT}")

if(NOT DEFINED ENV{SUPPORT_TILING_DIR} OR "$ENV{SUPPORT_TILING_DIR}" STREQUAL "")
    message(FATAL_ERROR "SUPPORT_TILING_DIR is required. Export SUPPORT_TILING_DIR or build via Operator Development Tools.")
endif()
set(SUPPORT_TILING_DIR "$ENV{SUPPORT_TILING_DIR}")

message(STATUS "SUPPORT_COMPUTE_UNIT='${SUPPORT_COMPUTE_UNIT}' SUPPORT_TILING_DIR='${SUPPORT_TILING_DIR}'")

add_all_modules_sources(OPTYPE add_custom ACLNNTYPE aclnn_exclude COMPUTE_UNIT ${SUPPORT_COMPUTE_UNIT} TILING_DIR ${SUPPORT_TILING_DIR} DISABLE_IN_OPP TRUE)
