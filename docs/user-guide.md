# Ascend C Toolkits 使用操作文档

本文档介绍如何使用 Ascend C Toolkits 插件完成算子的创建、开发、调试、异常检测与性能分析。

## 功能简介

| 功能 | 说明 |
|------|------|
| 算子工程管理 | 创建、打开标准自定义算子工程、算子直调工程、PyAsc 算子工程、Triton 算子工程等。 |
| 算子代码开发 | 提供 Ascend C 语法高亮、代码跳转等编辑能力，安装插件后默认启用，无需额外配置。 |
| 编译部署与运行 | 一键完成算子编译、部署与运行。 |
| 算子调试 | 支持 CPU 孪生调试和 NPU 上板调试。 |
| 异常检测 | 集成 msSanitizer、npu-check 工具，检测算子的内存、竞争、同步等潜在问题。 |
| 性能调优 | 集成 msprof、npu-compute、npu-emulate 工具，完成上板和仿真性能数据采集与可视化分析。 |

## 环境准备

使用插件前，需要先准备好算子开发环境。支持云上环境和本地环境两种方式，任选其一。

### 方式一：使用 CANNLab 云上环境（推荐）

[CANNLab](https://gitcode.com/org/cann/cannlab/environment) 是 CANN 社区的一站式算子开发平台。

1. 进入[CANNLab](https://gitcode.com/org/cann/cannlab/environment)平台，进入开发者空间并选择 WebIDE。

   ![CANNLab 入口](assets/pic-cannlab-entry.png)

2. 连接 workspace 后，在 IDE 右侧工具栏中选择 Ascend C Toolkits 插件。

   ![插件入口](assets/pic-plugin-entry.png)

### 方式二：本地部署

适用于在本地搭建算子开发环境的场景，整体分为安装 CANN 容器镜像、配置环境变量、安装插件三个步骤。

#### 步骤一：安装并启动 CANN 镜像

> 如果当前环境已经能够正常编译运行算子，可跳过本步骤。

镜像下载地址：[CANN 镜像库](https://digital.hicann.cn/#/Image-library)。

容器镜像下载命令参考：

```shell
docker pull swr.cn-north-4.myhuaweicloud.com/ci_cann/cann-pod-python3.12:1.0.0
docker tag swr.cn-north-4.myhuaweicloud.com/ci_cann/cann-pod-python3.12:1.0.0 cann_0214
```

容器启动命令参考：

```shell
docker run -itd --network=bridge --cap-add=SYS_PTRACE --security-opt seccomp=unconfined -p 0.0.0.0:<宿主机端口1>:8888 -p 0.0.0.0:<宿主机端口2>:22 --device=/dev/davinci<N> --device=/dev/davinci_manager --device=/dev/devmm_svm --device=/dev/drv_debug --device=/dev/hisi_hdc -v /usr/local/Ascend/driver:/usr/local/Ascend/driver -v /etc/ascend_install.info:/etc/ascend_install.info -v /usr/local/bin/npu-smi:/usr/local/bin/npu-smi --name <容器名> <镜像下载地址> /start_docker.sh
```

其中各参数含义如下：

- `<容器名>`：容器名称，可自行指定。
- `<镜像下载地址>`：容器镜像的完整下载地址。
- `<N>`：NPU 设备号，需根据宿主机实际可用设备填写，可通过 `ls /dev/davinci*` 或 `npu-smi info` 查询（如 `davinci0`）。
- `<宿主机端口1>`、`<宿主机端口2>`：宿主机映射端口，可自行指定，需避免与本机已占用端口冲突（如分别填 `8886`、`8866`）。

![容器启动效果](assets/pic1.png)

![容器启动效果](assets/pic2.png)

#### 步骤二：配置环境变量

> 如果使用步骤一中下载的容器镜像，可跳过本步骤。

将 CANN 包的环境变量设置脚本，以及 CMAKE_PREFIX_PATH 和 LD_LIBRARY_PATH 变量写入 /etc/profile，参考如下：

```shell
source /home/developer/Ascend/cann/set_env.sh
export CMAKE_PREFIX_PATH=${ASCEND_TOOLKIT_HOME}/compiler/tikcpp/ascend_kernel_cmake:$CMAKE_PREFIX_PATH
export LD_LIBRARY_PATH=${ASCEND_HOME_PATH}/tools/simulator/Ascend910B1/lib:/home/developer/Ascend/cann-9.0.0/tools/msdebug/lib:/usr/local/Ascend/driver/lib64/driver:/usr/local/Ascend/driver/lib64:$LD_LIBRARY_PATH
```

#### 步骤三：安装 Remote - SSH 插件并连接远端环境

打开本地 VS Code，在插件市场中搜索并安装 Remote - SSH 插件，并配置与远端开发环境的 SSH 连接。

![安装 Remote - SSH 插件](assets/pic4.png)

#### 步骤四：安装 Ascend C Toolkits 插件

使用 Remote - SSH 打开远端开发环境，并在新打开的 VS Code 窗口中安装 Ascend C Toolkits 插件，支持以下两种方式：

- 在插件市场中搜索 “Ascend C Toolkits” 并安装。
- 从[插件发布仓](https://gitcode.com/opdevtools/plugin_release/releases)下载最新版本的插件安装包，再通过本地方式安装。

![安装插件](assets/pic5.png)

完成安装后即可进行算子开发，后续操作与云上环境一致。

## 算子开发流程

下面以标准自定义算子为例，介绍完整的算子开发流程。标准自定义算子工程指与 ops-math 等标准算子仓工程框架一致的算子工程，其中包含算子实现代码和 example 测试代码。

### 第一步：创建算子工程

插件支持在已打开的工程中创建算子，也支持单独新建其他类型的算子工程。

#### 在已有工程中创建算子

1. 点击插件工具栏中的 “+” 按钮，或者在资源管理器中右键选择创建算子。

   ![通过工具栏创建](assets/pic-new-project-plus.png)

   ![通过右键菜单创建](assets/pic-new-project-context.png)

2. 在标准自定义算子工程的工程目录下，只支持创建标准自定义算子。

   ![仅支持创建标准自定义算子](assets/pic-standard-custom-only.png)

3. 算子标记功能：插件会根据工程目录结构，自动识别当前工程下包含的算子。当工程目录结构与默认约定不一致时，自动识别结果可能存在遗漏，此时可以右键目录手动标记：

   - 右键选择“标记为算子工程集合”，会将所选目录下的所有子目录标记为算子目录。
   - 右键选择“标记为算子工程”，会将当前目录标记为单个算子目录。

   ![手动标记算子目录](assets/pic-operator-mark.png)

#### 新建其他类型的工程

如果要创建算子直调工程、PyAsc 算子工程等其他类型的工程，需先关闭当前打开的 ops-math 工程，然后通过插件新建工程。

![新建其他类型的工程](assets/pic-create-other-project.png)

#### 填写工程配置

创建工程时需要填写以下配置项：

- 算子工程名称：插件会在指定位置创建同名目录，并在其中生成算子文件。
- 算子工程位置：保存算子工程的目录，该目录必须已经存在。
- 环境变量配置脚本：设置编译运行环境的脚本路径。云开发环境已完成 CANN 包环境变量的设置，使用默认值 /etc/profile 即可。

选择“在当前窗口中打开”，完成创建后，工作区将自动打开新建的算子工程。

### 第二步：开发算子

#### 编写算子代码

在生成的算子代码工程中编写 Ascend C 代码，完成算子开发。插件提供语法高亮和代码跳转等功能。

![编写算子代码](assets/pic-write-code.png)

#### 编译算子

点击操作面板中的“编译部署算子”按钮。

![编译算子](assets/pic-build.png)

编译成功后，会在 build 目录下生成与算子工程名称一致的可执行文件。

#### 运行算子

点击操作面板中的“运行”按钮，运行编译生成的算子可执行文件。对于标准自定义算子，插件会先编译算子的 example，再运行 example 的可执行文件。

![运行算子](assets/pic-run.png)

### 第三步：调试算子

操作面板中先提供 CPU 调试，再提供 NPU 调试，二者适用于不同的场景：

- CPU 调试：点击操作面板中的“CPU 调试”按钮，在 CPU 环境中进行孪生调试，适用于没有 NPU 资源的场景。

  ![CPU 调试](assets/pic-cpu-debug.png)

- NPU 调试：点击操作面板中的“NPU 调试”按钮，插件会自动拉起所需的编译过程，在带 NPU 的环境中进行上板打断点单步调试，并支持查看相关变量等信息。

  ![NPU 调试](assets/pic-npu-debug.png)

### 第四步：异常检测

> 版本要求：本功能需要使用 Ascend C Toolkits 1.5.4 及以上版本。如果环境中还安装有旧版插件（如 Ascend C Toolkit），请先卸载，再从[插件发布仓](https://gitcode.com/opdevtools/plugin_release/releases/download/1.5.4-beta/ascend-c-toolkit-1.5.4-beta7.vsix)下载并安装 1.5.4 及以上版本。

#### 使用 msSanitizer 检测

msSanitizer 用于检测算子的潜在问题（内存、竞争、未初始化、同步等），需要在带 NPU 的环境中执行。

1. 点击操作面板中的“异常检测”按钮，插件会提示选择需要检测的内容。如果每次检测的内容不变，可以勾选“不再显示”。

   ![选择检测内容](assets/pic-sanitizer-options.png)

2. 点击“立即开始”，插件会自动拉起所需的编译过程并进行检测。
3. 检测完成后，点击操作面板中“异常检测结果”下的执行记录，即可查看异常检测报告，支持查看详情和代码行跳转。

   ![查看检测报告](assets/pic-sanitizer-result.png)

4. 根据检测结果修复代码中的问题。

#### 使用 npu-check 检测

适用环境：Ascend 950。

工具文档：[npu-check 用户手册](https://gitcode.com/cann/asc-tools/blob/experimental/npu_tools/npu_check/npu_check.md)。

在 Ascend 950 环境中，可以使用 npu-check 工具检测算子的潜在问题（内存、同步）。

1. 点击操作面板中的“异常检测”按钮，在“异常检测快速选项”页面选择工具“npu-check”。该工具目前提供“内存检测”和“同步检测”两个检测选项。

   ![选择 npu-check](assets/pic-npu-check1.png)

2. 勾选所需的检测选项后点击“立即开始”，插件会自动拉起所需的编译过程并进行检测。检测完成后，点击操作面板中“异常检测结果”下的执行记录，即可查看异常检测报告，支持查看详情和代码行跳转。

   ![查看 npu-check 报告](assets/pic-npu-check2.png)

3. 点击“异常检测”功能右侧的“齿轮”按钮，可以配置该功能的默认选项。

   ![配置默认选项](assets/pic-npu-check3.png)

   ![配置默认选项](assets/pic-npu-check4.png)

### 第五步：性能分析

性能分析适用于实际运行环境，用于定位内存和性能瓶颈。

#### 配置默认分析工具

点击“上板分析”或“仿真分析”功能右侧的“齿轮”按钮，在工程配置中选择默认使用的分析工具，可选工具包括 npu-compute（上板分析）、npu-emulate（仿真分析）和 msprof（上板分析、仿真分析均支持）。

![配置上板分析工具](assets/pic-npu-compute3.png)

![配置仿真分析工具](assets/pic-npu-emulate3.png)

> 说明：npu-compute 和 npu-emulate 目前仅随 Ascend 950 环境的 CANN 包发布，因此仅在该环境下生效。未配置时，Ascend 950 环境默认使用 npu-compute 和 npu-emulate，其他环境默认使用 msprof。

#### 使用 npu-compute 和 npu-emulate 采集性能数据

适用环境：Ascend 950。

工具文档：[npu-compute 使用文档](https://gitcode.com/cann/asc-tools/blob/experimental/docs/06_npu_compute.md)。

在 Ascend 950 环境中，可以通过 npu-compute 工具采集算子在 NPU 上运行时的 Kernel 性能数据（基于 Kernel 重放和 PMU 硬件计数器），也可以通过 npu-emulate 工具在无实体 NPU 卡的情况下进行芯片级仿真，获取算子的精度结果与指令级性能数据（仿真运行的二进制与上板运行的二进制兼容）。

1. 创建或者打开一个算子工程（如下图，以 addn 工程为例）。

   ![打开算子工程](assets/pic-create-other-project.png)

2. 点击操作面板中“性能调优”下的“上板分析”或“仿真分析”按钮，弹出“数据采集配置”页面。

   ![数据采集配置](assets/pic-npu-compute1.png)

   - Collection type 选择“上板”或“仿真”（从“上板分析”或“仿真分析”入口进入时默认已选中）。
   - Common 区域可配置报告输出文件（Output File，后缀为 .npu-rep）和是否强制覆盖已有报告（Force Overwrite）；Target Processes、Replay Mode、Application Replay Buffer、Application Replay Mode 在当前版本提供固定选项。
   - Metrics 区域支持按 set（单选预设组合）或 section（多选单项指标）选择采集内容，并支持在过滤框中输入关键字快速检索。

   ![选择采集指标](assets/pic-npu-compute1b.png)

   - Command Line 文本框会根据上述选择自动生成工具参数（每个指标展开为一个 --section 参数），也支持手动编辑，最终执行时以该文本框中的内容为准。

3. 点击“确认”，插件会先自动拉起所需的编译过程，再调用 npu-compute 或 npu-emulate 进行数据采集。采集结束后会自动打开性能分析报告；也可以点击操作面板中的“性能调优结果可视化”菜单，在执行记录中重新打开报告。

   ![性能分析报告](assets/pic-npu-compute2.png)

#### 查看性能分析报告

- 通过插件创建的算子工程：工程框架与插件自动生成的分析配置一致，执行性能分析后会自动打开可视化报告。

  ![自动打开报告演示](assets/tool.gif)

- 已有 .npu-rep 报告文件：在 IDE 资源管理器中右键该报告文件，选择 Open Profiling Report 打开。

  ![手动打开报告演示](assets/manual.gif)

- 用户自有算子工程：如果工程框架与插件自动生成的配置不匹配（例如编译命令、编译产物路径不同），需要先在 VS Code 设置中修改上板编译命令和编译产物路径，然后执行上板分析，插件会自动生成并打开报告。

  ![自有工程配置演示](assets/self.png)

##### 可视化报告功能特性

详细功能说明请参见《[性能分析报告功能说明](../profiling-report.md)》。

- 指令流水图：支持放大、缩小查看；单击流水图中的指令节点，即可在详情区查看对应指令的详细信息。

  ![报告缩放查看演示](assets/report-zoom.gif)

  ![报告详情查看演示](assets/report-detail.gif)

- 报告统计信息。

  ![报告统计信息](assets/statistical-report.png)

- 计算负载分析：支持与 CANNBot 联动分析报告，并可查看检测项的详细数据。

  ![计算负载分析](assets/compute-load-analysis.png)

  ![计算负载分析详情](assets/compute-load-analysis-detail1.png)

  ![计算负载分析详情](assets/compute-load-analysis-detail2.png)

  ![计算负载分析详情](assets/compute-load-analysis-detail3.png)

- 内存负载分析：支持全屏查看、放大缩小，支持与 CANNBot 联动分析报告；可在报告中勾选 L2Cache、MemoryL1、MemoryL0、MemoryUB 等检测项，查看对应的详细数据。

  ![内存负载分析](assets/memory-load-analysis.png)

  ![内存负载分析详情](assets/memory-load-analysis-detail1.png)

  ![内存负载分析详情](assets/memory-load-analysis-detail2.png)

  ![内存负载分析详情](assets/memory-load-analysis-detail3.png)

  ![内存负载分析详情](assets/memory-load-analysis-detail4.png)

- Roofline 瓶颈分析：开发中。

- 与 CANNBot 联动分析：点击报告中的 CANNBot 图标，可以将报告信息发送至 CANNBot 进行智能分析。

  ![CANNBot 联动演示](assets/gif-cannbot.gif)

#### 使用 msprof 采集性能数据

1. 点击操作面板中“性能调优”下的“上板分析”按钮，在工程配置中选择需要收集的数据指标，默认全部收集。如果每次收集的内容不变，可以选择“不再显示”。

   ![msprof 采集配置](assets/pic-msprof-config.png)

2. 点击操作面板中的“性能调优结果可视化”菜单，查看和分析性能数据。

   ![msprof 报告查看](assets/pic-msprof-view.png)

## 常见问题

### 插件重复安装导致右键菜单选项重复或报告打开失败

“Huawei OP DevTools”、“Ascend C Toolkits”、“Ascend C Toolkit”三个插件重复安装时，会导致右键菜单中出现重复的选项，或者打开性能分析报告时报错。

![重复安装示例](assets/pic-install-repeat1.png)

![重复安装示例](assets/pic-install-repeat2.png)

![重复安装示例](assets/pic-install-repeat3.png)

解决方法：检查插件列表，正常情况下只需安装 “Ascend C Toolkits” 即可。“Huawei OP DevTools”、“Ascend C Toolkit” 为其他发布形态或旧版插件，不应同时安装；如发现重复安装，可将其卸载，卸载完成后刷新页面即可恢复。

### 点击“CANNBot 分析”按钮报错：调用“CANNBot 分析”功能失败

问题现象：

![CANNBot 报错](assets/pic-cannbot1.png)

原因：“CANNBot 分析”功能由 CANNWork 插件提供，使用前需要安装 CANNWork 插件并完成登录。

解决方法：在“扩展”中搜索并安装 CANNWork 插件的最新版本（版本号需大于等于 2.0.0）。

![安装 CANNWork](assets/pic-cannbot2.png)

### 插件图标显示异常

高版本 VS Code 中插件图片可能无法加载（通用问题），可将 VS Code 版本降至 1.111.x。

## 意见反馈

使用过程中如有问题或建议，欢迎提交 issue 反馈：[插件发布仓 Issues](https://gitcode.com/opdevtools/plugin_release/issues)。
