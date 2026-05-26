# ----------------------------------------------------------------------------------------------------------
# Copyright (c) 2026 Huawei Technologies Co., Ltd.
# This program is free software, you can redistribute it and/or modify it under the terms and conditions of
# CANN Open Software License Agreement Version 2.0 (the "License").
# Please refer to the License for details. You may not use this file except in compliance with the License.
# THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
# INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
# See LICENSE in the root of the software repository for the full text of the License.
# ----------------------------------------------------------------------------------------------------------

cmake_minimum_required(VERSION 3.16)

find_package(ASC REQUIRED HINTS $ENV{ASCEND_INSTALL_PATH}/compiler/tikcpp/ascendc_kernel_cmake)

project(kernel_samples LANGUAGES ASC CXX)
# 定义独立的选项
option(ENABLE_DEBUG "Enable debug build" OFF)
option(ENABLE_MS_SANITIZER "Enable memory sanitizer" OFF)
option(ENABLE_SIMULATOR "Enable msopprof simulator" OFF)
option(ENABLE_ON_BOARD "Enable msopprof on board" OFF)

# SIMULATOR_TYPE: directory name under tools/simulator/ (e.g. Ascend910B3). Not the CANN SOC slug.
if((NOT DEFINED SIMULATOR_TYPE OR "${SIMULATOR_TYPE}" STREQUAL "") AND DEFINED ENV{SIMULATOR_TYPE} AND NOT "$ENV{SIMULATOR_TYPE}" STREQUAL "")
    set(SIMULATOR_TYPE "$ENV{SIMULATOR_TYPE}" CACHE STRING "Simulator device directory for ENABLE_SIMULATOR (e.g. Ascend910B3, Ascend950PR_9589)." FORCE)
endif()
if(NOT DEFINED SIMULATOR_TYPE)
    set(SIMULATOR_TYPE "" CACHE STRING "Simulator device directory for ENABLE_SIMULATOR.")
endif()

if(ENABLE_SIMULATOR)
    if("${SIMULATOR_TYPE}" STREQUAL "")
        message(FATAL_ERROR "SIMULATOR_TYPE is required for simulator builds. Use: bash build.sh --simulator <name> or export SIMULATOR_TYPE, or pass -DSIMULATOR_TYPE=<name> to cmake.")
    endif()
endif()

# SOC_VERSION: CANN SOC slug (e.g. ascend910b) from the extension; optional in cmake today.
if((NOT DEFINED SOC_VERSION OR "${SOC_VERSION}" STREQUAL "") AND DEFINED ENV{SOC_VERSION} AND NOT "$ENV{SOC_VERSION}" STREQUAL "")
    set(SOC_VERSION "$ENV{SOC_VERSION}" CACHE STRING "CANN SOC slug (e.g. ascend910b)." FORCE)
endif()
if(NOT DEFINED SOC_VERSION)
    set(SOC_VERSION "" CACHE STRING "CANN SOC slug (optional in this template).")
endif()

# Prefer non-empty $ENV{NPU_ARCH} when the cache entry is missing or still empty (explicit -DNPU_ARCH=value wins once non-empty).
if((NOT DEFINED NPU_ARCH OR "${NPU_ARCH}" STREQUAL "") AND DEFINED ENV{NPU_ARCH} AND NOT "$ENV{NPU_ARCH}" STREQUAL "")
    set(NPU_ARCH "$ENV{NPU_ARCH}" CACHE STRING "AscendC --npu-arch. Set via cmake -DNPU_ARCH=... or export NPU_ARCH (e.g. dav-2201, dav-3510). Verify in your CANN release." FORCE)
endif()
if(NOT DEFINED NPU_ARCH)
    set(NPU_ARCH "" CACHE STRING "AscendC --npu-arch. Set via cmake -DNPU_ARCH=... or export NPU_ARCH (e.g. dav-2201, dav-3510). Verify in your CANN release.")
endif()

if("${NPU_ARCH}" STREQUAL "")
    message(FATAL_ERROR "NPU_ARCH is required for AscendC builds. Pass -DNPU_ARCH=<arch> to cmake or export NPU_ARCH (see your CANN documentation for the correct value, e.g. dav-2201, dav-3510).")
endif()

message(STATUS "SIMULATOR_TYPE='${SIMULATOR_TYPE}' SOC_VERSION='${SOC_VERSION}' NPU_ARCH='${NPU_ARCH}'")

add_executable(addn_custom
    addn_custom.asc
)

target_link_libraries(addn_custom PRIVATE
    tiling_api
    register
    platform
    m
)


# 根据选项设置编译标志
set(compile_options)
if(ENABLE_DEBUG)
    list(APPEND compile_options -Xaicore-start -O0 -Xaicore-end -g)
elseif(ENABLE_MS_SANITIZER)
    list(APPEND compile_options -O2 -g --cce-enable-sanitizer)
    target_link_options(addn_custom PRIVATE
        --cce-fatobj-link
        --cce-enable-sanitizer
    )
elseif(ENABLE_SIMULATOR)
    list(APPEND compile_options -O2 -g)
    target_link_libraries(addn_custom PRIVATE
        runtime_camodel
        npu_drv
    )
    target_link_directories(addn_custom PUBLIC "${ASCEND_HOME_PATH}/tools/simulator/${SIMULATOR_TYPE}/lib")
elseif(ENABLE_ON_BOARD)
    list(APPEND compile_options -O2 -g)
else()
    list(APPEND compile_options -O2)
endif()

target_compile_options(addn_custom PRIVATE
    $<$<COMPILE_LANGUAGE:ASC>:--npu-arch=${NPU_ARCH}>
    ${compile_options}
)