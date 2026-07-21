#!/bin/bash

# 默认值
cmake_args=()
build_type=""

set_build_type() {
    local value=$1
    if [[ -n $build_type ]]; then
        echo "error: --build-type may only be specified once" >&2
        exit 1
    fi
    if [[ -z $value || $value == -* ]]; then
        echo "error: --build-type requires a non-empty, non-option value" >&2
        exit 1
    fi
    build_type=$value
}

# 显示帮助信息函数
show_help() {
    cat << EOF
用法: $0 [选项]

选项(可组合使用):
    --debug         启用调试模式构建
    --mssanitizer   启用MSSanitizer构建
    --simulator [SOC_VERSION]  启用仿真调优模式构建；设备目录名可作为第二参数传入，或事先 export SOC_VERSION（如 Ascend910B3、Ascend950PR_9589）
    --onboard       启用上板调优模式构建
    --build-type Debug|Release  设置 CMAKE_BUILD_TYPE
    -h, --help      显示此帮助信息

示例:
    $0
    $0 --debug --build-type Debug
    $0 --simulator Ascend910B3
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
            cmake_args+=("-DENABLE_DEBUG=ON")
            shift
            ;;
        --mssanitizer)
            cmake_args+=("-DENABLE_MS_SANITIZER=ON")
            shift
            ;;
        --simulator)
            cmake_args+=("-DENABLE_SIMULATOR=ON" "-DASCEND_HOME_PATH=${ASCEND_HOME_PATH}")
            if [[ $# -gt 1 ]] && [[ -n $2 ]] && [[ $2 != -* ]]; then
                cmake_args+=("-DSOC_VERSION=$2")
                shift 2
            else
                cmake_args+=("-DSOC_VERSION=$SOC_VERSION")
                shift
            fi
            ;;
        --build-type=*)
            set_build_type "${1#*=}"
            shift
            ;;
        --build-type)
            set_build_type "${2-}"
            shift 2
            ;;
        --onboard | --prof_onboard)
            cmake_args+=("-DENABLE_ON_BOARD=ON")
            shift
            ;;
        --)
            shift
            break
            ;;
        *)
            shift
            ;;
    esac
done

if [[ -n $build_type ]]; then
    cmake_args+=("-DCMAKE_BUILD_TYPE=$build_type")
fi


# 设置 CMAKE_PREFIX_PATH
export CMAKE_PREFIX_PATH=${ASCEND_TOOLKIT_HOME}/compiler/tikcpp/ascendc_kernel_cmake:$CMAKE_PREFIX_PATH
# 创建并进入构建目录
rm -rf ./build
mkdir -p build
cd build
# 配置和编译
cmake .. "${cmake_args[@]}"
make -j VERBOSE=1
