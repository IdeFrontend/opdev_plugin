# ----------------------------------------------------------------------------------------------------------
# This program is free software, you can redistribute it and/or modify it.
# Copyright (c) 2025 Huawei Technologies Co., Ltd.
# This file is a part of the CANN Open Software.
# Licensed under CANN Open Software License Agreement Version 2.0 (the "License").
# Please refer to the License for details. You may not use this file except in compliance with the License.
# THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
# INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
# See LICENSE in the root of the software repository for the full text of the License.
# ----------------------------------------------------------------------------------------------------------

cmake_minimum_required(VERSION 3.16)
find_package(ASC REQUIRED)
project(kernel_samples LANGUAGES ASC CXX)

# 定义独立的选项
option(ENABLE_DEBUG "Enable debug build" OFF)
option(ENABLE_MS_SANITIZER "Enable memory sanitizer" OFF)
option(ENABLE_SIMULATOR "Enable msopprof simulator" OFF)
option(ENABLE_ON_BOARD "Enable msopprof on board" OFF)

if(NOT DEFINED SOC_VERSION)
    set(SOC_VERSION "Ascend910B1" CACHE STRING "SOC VERSION for simulator")
endif()

find_package(Python3 COMPONENTS Interpreter Development REQUIRED)
message("Python3_INCLUDE_DIRS is ${Python3_INCLUDE_DIRS}")

execute_process(
    COMMAND ${Python3_EXECUTABLE} -c "import torch; print(torch.utils.cmake_prefix_path)"
    OUTPUT_VARIABLE TORCH_CMAKE_PATH
    OUTPUT_STRIP_TRAILING_WHITESPACE
)
find_package(Torch REQUIRED HINTS ${TORCH_CMAKE_PATH}/Torch)

execute_process(
    COMMAND python3 -c "import os, torch_npu; print(os.path.dirname(torch_npu.__file__))"
    OUTPUT_VARIABLE TORCH_NPU_PATH
    OUTPUT_STRIP_TRAILING_WHITESPACE
)
set(TORCH_NPU_INCLUDE_DIRS ${TORCH_NPU_PATH}/include)
set(TORCH_NPU_LIBRARIES ${TORCH_NPU_PATH}/lib)

add_library(custom_ops SHARED
    torch_library.asc
)

target_include_directories(custom_ops PRIVATE
    ${Python3_INCLUDE_DIRS}
    ${TORCH_INCLUDE_DIRS}
    ${TORCH_NPU_INCLUDE_DIRS}
)

# 根据选项设置编译标志
set(compile_options)
if(ENABLE_DEBUG)
    list(APPEND compile_options -O0 -g)
elseif(ENABLE_MS_SANITIZER)
    list(APPEND compile_options -O2 -g --cce-enable-sanitizer)
    target_link_options(custom_ops PRIVATE
        --cce-fatobj-link
        --cce-enable-sanitizer
    )
elseif(ENABLE_SIMULATOR)
    list(APPEND compile_options -O2 -g)
    target_link_libraries(custom_ops PRIVATE
        runtime_camodel
        npu_drv
    )
    target_link_directories(custom_ops PUBLIC "${ASCEND_HOME_PATH}/tools/simulator/${SOC_VERSION}/lib")
elseif(ENABLE_ON_BOARD)
    list(APPEND compile_options -O2 -g)
else()
    list(APPEND compile_options -O2)
endif()

target_link_libraries(custom_ops PRIVATE
    torch_npu
)

target_link_directories(custom_ops PRIVATE
    ${TORCH_NPU_LIBRARIES}
)

target_compile_definitions(custom_ops PRIVATE
    _GLIBCXX_USE_CXX11_ABI=1
)

target_compile_options(custom_ops PRIVATE
    $<$<COMPILE_LANGUAGE:ASC>:--npu-arch=dav-2201>
    ${compile_options}
)
