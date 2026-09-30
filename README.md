# 一站式算子开发插件使用操作文档
本文档将引导你从零开始，完成算子的创建、开发、验证到性能分析的完整流程。
## **前置准备**
- 从CANN社区的任意仓进入->点“CANNLab”，即可进入CANN社区一站式开发平台（CANNLab）：
例如：https://gitcode.com/cann/ops-math
![image.png](https://raw.gitcode.com/user-images/assets/8992929/11976041-4b73-41bc-bbe3-5455261ad99a/image.png 'image.png')
- 进入开发者空间->选择WebIDE
![image.png](https://raw.gitcode.com/user-images/assets/8992929/90e0b788-6db7-4548-9071-a0dbd003b059/image.png 'image.png')
- 连接workspace后：选择IDE右侧工具栏中的Ascend C算子开发插件
![image.png](https://raw.gitcode.com/user-images/assets/8992929/e6844a92-bf5c-410d-b26b-4f465b0cecdd/image.png 'image.png')
### 第一步：创建算子工程
 
 -  新建算子工程
    可以通过点击插件工具栏 -> "+"按钮
    
![image.png](https://raw.gitcode.com/user-images/assets/8992929/b4983d57-2139-44a9-8798-ff37172f21bd/image.png 'image.png')
 
 或者通过在资源管理器中右键点击创建
 
![image.png](https://raw.gitcode.com/user-images/assets/8992929/8bc60f92-35a9-43f3-8262-e39e1489d544/image.png 'image.png')
注：
    
   在标准自定义算子工程目录下，只支持创建标准自定义算子：
    
  ![image.png](https://raw.gitcode.com/user-images/assets/8992929/1fb054d6-1117-4bd3-840e-b46276239efa/image.png 'image.png')
  
 注：算子标记功能
    针对标准自定义算子，插件会帮助用户自动识别当前工程下都有哪些算子。为了防止工具自动识别错漏，插件提供了让用户自己标记的功能：
        右键点击目录，可标记为算子工程集合，会把文件夹下的目录都标记为算子目录；
        或者右键标记为算子工程目录，会把当前目录标记为单个算子目录
 
 ![image.png](https://raw.gitcode.com/user-images/assets/8992929/ecae509a-3a27-498a-b615-e27c07e2e452/image.png 'image.png')
    
   如果要创建算子直调工程(<<<>>>)、pyasc算子工程，则需关闭当前ops-math项目，然后创建算子：
    
  ![image.png](https://raw.gitcode.com/user-images/assets/8992929/1775ea01-74c8-4753-877c-f5a930f44b1c/image.png 'image.png')
    
-  填写工程配置
    配置项说明：
    算子工程名称：在指定位置创建同名目录，并在其中生成算子文件
    算子工程位置：保存算子工程的目录（必须已存在）
    环境变量配置脚本：设置编译运行环境的脚本路径，当前云开发环境已经设置好了CANN包的env，可使用默认值/etc/profile即可。
    点击在当前窗口中打开，完成创建后，工作区将自动打开新建的算子工程。
### 第二步：算子开发（以上面创建的<<<>>>算子为例）
- 编写算子代码
 	 在生成的算子代码工程中编写你的 Ascend C 代码，完成算子开发，插件提供了预防高亮和代码跳转等功能。
     
![image.png](https://raw.gitcode.com/user-images/assets/8992929/ae976073-69c8-4548-b161-22f180818875/image.png 'image.png')
- 编译算子
    点击操作面板中的“编译部署算子”按钮：
    
![image.png](https://raw.gitcode.com/user-images/assets/8992929/95218808-fab2-48a8-9cf7-b00ee1eb9810/image.png 'image.png')
编译成功后，会在 build 目录下生成与算子工程名称一致的可执行文件。
- 运行算子
    点击操作面板中的“运行”按钮，可以运行编译出来的算子可执行文件（对于标准自定义算子来说，会先编译算子的example，然后再执行example的可执行文件）：
    
![image.png](https://raw.gitcode.com/user-images/assets/8992929/62403e1f-5b5e-44ec-87d4-f2526bb72eb1/image.png 'image.png')
### 第三步：调试算子
-    NPU调试：点击操作面板中的“NPU调试”按钮，插件会自动拉起所需编译过程，可在有NPU的环境中进行上板打断点单步调试，并查看相关变量等信息：
![image.png](https://raw.gitcode.com/user-images/assets/8992929/912a5ebc-7b47-4a94-b5c7-e8bd10ea1eea/image.png 'image.png')
-   CPU调试：点击“CPU调试”按钮，可在CPU环境中进行孪生调试，以解决缺少NPU资源的调试场景：
![image.png](https://raw.gitcode.com/user-images/assets/8992929/4fdcff6b-2b2c-4769-923d-26ba7e8c3ad5/image.png 'image.png')
### 第四步：异常检测（优先）
删除老的huawei-op-devtools或者ascend-c-toolkit插件。并按如下地址下载并安装插件： https://gitcode.com/opdevtools/plugin_release/releases/download/1.5.4-beta/ascend-c-toolkit-1.5.4-beta7.vsix

**msSanitizer 工具**

使用 msSanitizer 工具检测算子潜在问题（内存、竞争、未初始化、同步等），需在有NPU的环境中执行。
- 点击操作面板中的“异常检测”按钮，插件会提示用户选择所需检测内容，如果每次检测的内容不需改变，可以选择“不再显示”按钮：
   
![image.png](https://raw.gitcode.com/user-images/assets/8992929/e37aa9b3-8a23-4a7c-b83c-c54fdeae0c8a/image.png 'image.png')
- 点击“立即开始”后，插件自动拉起所需编译过程，并进行检测，点击面板中的“异常检测结果”菜单中的执行记录，可查看异常检测报告，支持查看详情和代码行跳转：
![image.png](https://raw.gitcode.com/user-images/assets/8992929/35309cad-c7ad-421f-85ea-a5f11d080cb2/image.png)
   根据检测结果修复代码中的问题。

**npu-check 工具（优先）**

适用环境：A5

工具文档：https://gitcode.com/cann/asc-tools/blob/experimental/npu_tools/npu_check/npu_check.md

在A5环境，可以使用 npu-check 工具检测算子潜在问题（内存、同步）。
- 点击操作面板中的“异常检测”按钮，在“异常检测快速选项”页面选择工具“npu-check”，工具目前提供两个检测选项“内存检测”和“同步检测”。
![img.png](assets/pic-npu-check1.png)
- 勾选所需工具后点击“立即开始”，插件自动拉起所需编译过程，并进行检测，点击面板中的“异常检测结果”菜单中的执行记录，可查看异常检测报告，支持查看详情和代码行跳转：
![img.png](assets/pic-npu-check2.png)
- 可以点击“异常检测”功能右侧“齿轮”按钮，配置功能的默认选项
![img.png](assets/pic-npu-check3.png)
![img_1.png](assets/pic-npu-check4.png)

### 第五步：性能分析
删除老的huawei-op-devtools或者ascend-c-toolkit插件。并按如下地址下载并安装插件： https://gitcode.com/opdevtools/plugin_release/releases/download/1.5.4-beta/ascend-c-toolkit-1.5.4-beta7.vsix

适用于实际运行环境，定位内存和性能瓶颈。
- 可以点击"上板分析"/"仿真分析" 功能右侧"齿轮"按钮，在工程配置中选择默认使用的上板/仿真工具（npu-compute(上板)/npu-emulate(仿真)/ msprof(上板、仿真)）：
    ![img.png](assets/pic-npu-compute3.png)
    ![img.png](assets/pic-npu-emulate3.png)
> 注：npu-compute/npu-emulate 仅在 A5（ascend950）环境下生效；未配置上板工具时，A5 默认使用 npu-compute/npu-emulate，其它环境始终使用 msprof。

#### npu-compute(上板)/npu-emulate(仿真)（优先, npu-emulate暂不支持）

适用环境：A5

工具文档：https://gitcode.com/cann/asc-tools/blob/experimental/docs/06_npu_compute.md

在A5环境，可以使用 npu-compute 工具采集算子在 NPU 上运行时的 Kernel 性能数据（基于 Kernel 重放与 PMU 硬件计数）。
在A5环境，可以使用 npu-emulate 工具在无实体 NPU 卡的情况下进行芯片级仿真，获取算子的精度结果与指令级性能数据（仿真二进制与上板运行二进制兼容）。


**使用方式：**
-   创建或者打开一个算子工程（如下图，可选addn）：
  ![image.png](https://raw.gitcode.com/user-images/assets/8992929/1775ea01-74c8-4753-877c-f5a930f44b1c/image.png 'image.png')
- 点击操作面板中的“性能调优”下的“上板分析”按钮，会弹出“数据采集配置”页面：
    ![img.png](assets/pic-npu-compute1.png)
  - Collection type 选择“上板”/“仿真”（从“上板分析”/“仿真分析”入口进入时默认已选中）；
  - Common 区域可配置报告输出文件（Output File，后缀 .npu-rep）、是否强制覆盖已有报告（Force Overwrite）；Target Processes、Replay Mode、Application Replay Buffer、Application Replay Mode 当前版本提供固定选项；
  - Metrics 区域支持按 set（单选预设组合）或 section（多选单项指标）选择采集内容，并可在过滤框中输入关键字快速检索；置灰的选项为当前版本暂不支持的指标：（set 参数暂不支持，通过section实现）
    ![img.png](assets/pic-npu-compute1b.png)
  - Command Line 文本框会根据上述选择自动同步生成工具参数（每个指标展开为一个 `--section` 参数），也支持手动编辑，最终执行时以该文本框内容为准。
- 点击“确认”后，插件会先自动拉起所需编译过程，再调用 npu-compute 进行数据采集；采集结束后自动打开性能分析报告，也可点击面板中的“能调优结果可视化”菜单，在执行记录中重新打开查看：
    ![img.png](assets/pic-npu-compute2.png)

- 演示场景
  - 教学样例工程，或与样例工程类似的自有算子工程：通过插件创建算子，并 执行算子调优，自动打开可视化报告
    ![img.png](assets/tool.gif)
  - 已有.npu-rep文件，想通过插件进行可视化：IDE资源管理器中右键报告.npu-rep文件，选择 Open Profiling Report打开报告
    ![img.png](assets/manual.gif)
  - 用户自有工程利用插件可视化：如果工程框架与插件自动生成的配置不匹配，则需打开vscode设置 -> 修改上板编译命令、编译产物路径 -> 点击上板分析选择分析选项 -> 插件自动生成并打开报告
    ![img.png](assets/self.png)

##### 可视化报告功能特性：

[点击查看性能分析报告文档](./profiling-report.md)

- 指令流水图
    支持缩小
    ![报告缩放查看演示](assets/report-zoom.gif)
    点击查看详情
    ![报告详情查看演示](assets/report-detail.gif)
- 报告统计信息
    ![报告统计信息](assets/statistical-report.png)
- 计算负载分析
    ![计算负载分析](assets/compute-load-analysis.png)
    支持点击CANNBOT联动分析报告
    可点击详情查看详细数据
    ![计算负载分析详情1](assets/compute-load-analysis-detail1.png)
    ![计算负载分析详情2](assets/compute-load-analysis-detail2.png)
    ![计算负载分析详情3](assets/compute-load-analysis-detail3.png)
- 内存负载分析
    ![内存负载分析](assets/memory-load-analysis.png)
    支持全屏查看、放大缩小
    支持点击CANNBOT联动分析报告
    可点击详情查看详细数据（查看勾选的检测项详细数据：L2Cache、MemoryL1、MemoryL0、MemoryUB）
    ![内存负载分析详情1](assets/memory-load-analysis-detail1.png)
    ![内存负载分析详情2](assets/memory-load-analysis-detail2.png)
    ![内存负载分析详情3](assets/memory-load-analysis-detail3.png)
    ![内存负载分析详情4](assets/memory-load-analysis-detail4.png)
- Roofline瓶颈分析（在建）
- 与CANNBOT之间联动分析性能报告
    可以点击报告中CANNBot图标，将报告信息发送至CANNBot进行智能分析：
    ![img.png](assets/gif-cannbot.gif)

#### msprof 工具
- 点击操作面板中的“性能调优”下的“上板分析”按钮，工程配置中可配置需要收集的数据指标，默认全部收集，如果每次收集的内容不需改变，可以选择“不再显示”按钮：
    
    ![image.png](https://raw.gitcode.com/user-images/assets/8992929/4a30db23-e224-433e-9658-58b6f81978f7/image.png 'image.png')
  
- 点击面板中的“性能调优结果可视化”菜单，可查看并分析性能调优相关数据：
    
    ![image.png](https://raw.gitcode.com/user-images/assets/8992929/3da7e8bc-01b3-4a24-b195-641a579ec74e/image.png 'image.png')

## 本地部署
### 安装步骤
#### 第一步、安装并启动CANN镜像
> 如果环境已经能够正常编译运行算子，则这一步可忽略；
镜像下载地址：https://digital.hicann.cn/#/Image-library
容器镜像下载命令参考
   - `docker pull cann_0214 -d swr.cn-north-4.myhuaweicloud.com/ci_cann/cann-pod-python3.12:1.0.0`
     - 镜像名：cann_0214；
     - 镜像ID：swr.cn-north-4.myhuaweicloud.com/ci_cann/cann-pod-python3.12:1.0.0
启动容器命令参考（需要根据镜像版本修改指令中镜像名和镜像ID）：
   - `docker run -itd --network=bridge --cap-add=SYS_PTRACE --security-opt seccomp=unconfined -p 0.0.0.0:8886:8888 -p 0.0.0.0:8866:22 --device=/dev/davinci4 --device=/dev/davinci_manager --device=/dev/devmm_svm --device=/dev/drv_debug --device=/dev/hisi_hdc -v /usr/local/Ascend/driver:/usr/local/Ascend/driver -v /etc/ascend_install.info:/etc/ascend_install.info -v /usr/local/bin/npu-smi:/usr/local/bin/npu-smi --name <镜像名> -d <镜像ID> /start_docker.sh`
   
![](./assets/pic1.png)
![](./assets/pic2.png)
#### 第二步、设置环境变量
> 如果环境使用的第一步中下载的容器镜像，则这一步可忽略；
将cann包的环境变量设置脚本，CMAKE_PREFIX_PATH和LD_LIBRARY_PATH变量，写入到/etc/profile中，参考如下：
```
source /home/developer/Ascend/cann/set_env.sh
export CMAKE_PREFIX_PATH=${ASCEND_TOOLKIT_HOME}/compiler/tikcpp/ascend_kernel_cmake:$CMAKE_PREFIX_PATH
export LD_LIBRARY_PATH=${ASCEND_HOME_PATH}/tools/simulator/Ascend910B1/lib:/home/developer/Ascend/cann-9.0.0/tools/msdebug/lib:/usr/local/Ascend/driver/lib64/driver:/usr/local/Ascend/driver/lib64:$LD_LIBRARY_PATH
```
#### 第三步、在Windows本地的VSCode的插件市场中下载RemoteDev插件，并配置与远端开发环境进行SSH链接
> - 打开vscode，在插件市场中搜索并安装ssh-remote插件
![](./assets/pic4.png)
#### 第四步、下载算子一站式开发插件
使用RemoteDev插件打开远端开发环境，并在新打开的VSCode窗口中的插件市场中安装算子一站式开发Ascend C Toolkits插件。
- 从插件市场中搜索Ascend C Toolkits并安装插件
- 或者从下面的链接中获取最新版本的插件到远端开发环境中，[插件下载地址](https://gitcode.com/opdevtools/plugin_release/releases)，再通过本地的方式安装插件：
![](./assets/pic5.png)
#### 第五步、接下来就可以使用一站式算子开发插件进行算子开发，与云化场景一致。
## 备注
1. 提单链接：https://gitcode.com/opdevtools/plugin_release/issues
2. 安装插件完成后已默认支持本地语法： 语法高亮及代码跳转： 安装插件完成后会自动支持

## FAQ
### Question1：默认安装的 Ascend C Toolkits 1.5.2 版本为什么无法自动更新？

**问题说明**  
部分用户在旧版本镜像中默认安装的 Ascend C Toolkits 1.5.2 与发布仓最新提供的 1.5.2 实际并非同一构建版本，导致插件无法识别新版本并触发自动更新。

**原因**  
Ascend C Toolkits 1.5.2 首版本及此前版本的插件标识符临时使用 `cann-pub.ascend-c-toolkit`。按照规格要求，自 1.5.2 新版本起，插件标识符统一调整为 `cann-pub.asc-c-toolkit`。
由于插件自动更新依赖标识符匹配，使用旧标识符安装的版本无法自动检测并更新到采用新标识符的版本。

新版本标识符：
![img.png](assets/pic-tag.png)

**解决方法**  
**卸载旧版插件后**，从[发布仓](https://gitcode.com/opdevtools/plugin_release/releases)**重新下载**并**安装最新版本**即可。若当前环境仍使用旧镜像，建议**更新镜像**或**重新创建环境**。

### Question2：插件重复安装引发的问题

**问题1**  
“Huawei OP DevTools”、“Ascend C Toolkits”、“Ascend C Toolkit”三种插件重复安装，导致右键菜单中选项重复  
![img.png](assets/pic-install-repeat1.png)
![img_1.png](assets/pic-install-repeat2.png)

**问题2**  
“Huawei OP DevTools”、“Ascend C Toolkits”两种插件重复安装，导致打开性能分析报告报错
![img_2.png](assets/pic-install-repeat3.png)

**解决方法**  
请检查插件列表中是否同时存在：“Huawei OP DevTools”、“Ascend C Toolkits”、“Ascend C Toolkit”这三种插件，正常情况下**只安装“Ascend C Toolkits”即可**，其他两种是旧版插件已下线，可以卸载，**卸载完毕后重新刷新页面即可恢复**

### Question3：打开性能调优结果，在性能分析报告中点击“CANNBot 分析”按钮后报错：调用“CANNBot 分析”功能失败
**问题描述**  
问题现象截图如下：  
![img.png](assets/pic-cannbot1.png)

**原因**  
“CANNBot 分析”功能依赖CANNWORK插件，因此在使用前需要确保安装CANNWORK并完成登录

**解决方案**  
请先在"扩展"中搜索并安装 "CANNWork"最新版本，版本必须大于等于2.0.0  
![img_2.png](assets/pic-cannbot2.png)

### Question4：工具支持范围

目前工具支持范围仅包含 vscode，wecode暂未纳入支持范围


### Question5：插件图标显示异常

目前工具高版本vscode插件图片无法加载（通用问题），可降低vscode版本至1.111.x