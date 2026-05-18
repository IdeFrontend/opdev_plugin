#!/bin/bash

# 默认值
cmake_args=""

# 显示帮助信息函数
show_help() {
    cat << EOF
用法: $0 [选项]

选项(只支持一次调用其中一个选项):
    --debug         启用调试模式构建
    --mssanitizer   启用MSSanitizer构建
    --simulator [SIMULATOR_TYPE]  启用仿真调优模式构建；仿真设备目录名可作为第二参数传入，或事先 export SIMULATOR_TYPE（如 Ascend910B3、Ascend950PR_9589）。cmake 读取 SIMULATOR_TYPE、NPU_ARCH；SOC_VERSION 为 CANN SOC slug（如 ascend910b）。
    --onboard       启用上板调优模式构建
    -h, --help      显示此帮助信息

注意: AscendC 编译需要 NPU_ARCH（export NPU_ARCH=… 或 cmake -DNPU_ARCH=…，值以 CANN 文档为准）。从本扩展启动的任务通常会由宿主注入该环境变量。

示例:
    export NPU_ARCH=dav-2201   # 示例；请按你的芯片/CANN 版本填写
    $0
    $0 --debug
    $0 --simulator Ascend910B3
    SIMULATOR_TYPE=Ascend950PR_9589 NPU_ARCH=dav-3510 SOC_VERSION=ascend950 $0 --simulator
EOF
    exit 0
}

# 解析命令行参数
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            ;;
        --debug)
            cmake_args="-DENABLE_DEBUG=ON"
            break
            ;;
        --mssanitizer)
            cmake_args="-DENABLE_MS_SANITIZER=ON"
            break
            ;;
        --simulator)
            cmake_args="-DENABLE_SIMULATOR=ON -DASCEND_HOME_PATH=${ASCEND_HOME_PATH}"
            if [[ $# -gt 1 ]] && [[ $2 != --* ]]; then
                cmake_args="$cmake_args -DSIMULATOR_TYPE=$2"
                break
            elif [[ -n "${SIMULATOR_TYPE:-}" ]]; then
                cmake_args="$cmake_args -DSIMULATOR_TYPE=${SIMULATOR_TYPE}"
                break
            else
                echo "错误: 仿真构建需要 SIMULATOR_TYPE：使用「$0 --simulator <设备目录名>」，或先 export SIMULATOR_TYPE（例如 Ascend910B3、Ascend950PR_9589）。" >&2
                exit 1
            fi
            ;;
        --onboard | --prof_onboard)
            cmake_args="-DENABLE_ON_BOARD=ON"
            break
            ;;
        *)
            break
            ;;
    esac
done


# 设置 CMAKE_PREFIX_PATH
export CMAKE_PREFIX_PATH=${ASCEND_TOOLKIT_HOME}/compiler/tikcpp/ascendc_kernel_cmake:$CMAKE_PREFIX_PATH
# 创建并进入构建目录
rm -rf ./build
mkdir -p build
cd build
# 配置和编译
cmake .. ${cmake_args}
make -j VERBOSE=1