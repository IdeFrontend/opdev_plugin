# 设置 CMAKE_PREFIX_PATH
export CMAKE_PREFIX_PATH=${ASCEND_TOOLKIT_HOME}/compiler/tikcpp/ascendc_kernel_cmake:$CMAKE_PREFIX_PATH
# 创建并进入构建目录
mkdir -p build
cd build
# 配置和编译
cmake ..
make -j
# 运行演示程序
./demo
