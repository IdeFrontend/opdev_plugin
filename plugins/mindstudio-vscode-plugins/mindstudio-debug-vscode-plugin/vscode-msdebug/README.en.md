# MindStudio Debug VSCode Plugin

### 介绍
MindStudio Debug VSCode Plugin基于[msdebug上板调试算子工具](https://www.hiascend.com/document/detail/zh/mindstudio/70RC1/mscommandtoolug/mscommandug/atlasopdev_16_0005.html)提供VSCode可视化调试昇腾算子功能。
附：[算子开发编程语言Ascend C简介](https://www.hiascend.com/document/detail/zh/canncommercial/81RC1/developmentguide/opdevg/Ascendcopdevg/atlas_ascendc_10_0001.html)

### 特性
* 断点调试（设置/删除/禁用/启用断点）
* 单步执行调试(逐行执行/内部执行/跳出函数)/继续/暂停/重启
* 查看变量/寄存器/堆栈/断点信息，监视器支持执行表达式
* 内存查询
* 核切换
* NPU coredump文件可视化调试

### 规格要求

* VSCode-huawei (v1.81.3版本及以上)
* VSCode-huawei已安装远程登录插件
* 支持平台: Linux
* 调试AscendC算子程序时，Linux环境已安装CANN工具包（含算子调试器）
* 仅支持调试AscendC算子，且算子经过调试模式重新编译后才能调试
* 当前支持的[CANN包](https://www.hiascend.com/zh/developer/download/community/result?module=cann)`最低版本`：
  * 社区版： 8.0.RC3.alpha001
  * 商用版： 8.0.RC3

### 约束
* 参考CANN工具包的约束要求

### 功能

#### 软件包下载和完整性校验
1. 从插件市场直接在线安装
2. 若软件包从插件市场下载后计划后续本地安装，安装前建议进行完整性校验：
```bash
sha256sum Ascend.MindStudio-Debug-VSCode-Plugin-{version}.vsix # 验证vsix包，若校验码一致，则vsix包在下载中没有受损
```

最新软件包下载地址：[MindStudio-Debug-VSCode-Plugin Releases](https://gitcode.com/Ascend/mstt/tree/vscode_plugin/plugins/mindstudio-vscode-plugins/mindstudio-debug-vscode-plugin/releases)

|历史版本|发布日期|下载链接|校验码|
|:--:|:--:|:--:|:--:|
| 1.0.5 | 2025.04.03 | [Ascend.MindStudio-Debug-VSCode-Plugin-1.0.5.vsix](https://marketplace.rnd.huawei.com/detail?identifier=MindStudio-Debug-VSCode-Plugin) | b895ae941dfd468548b307b96fcfc7a0245f1e8f99515afeb8d3bc4f62360fa6 |
| 1.0.3 | 2025.04.03 | [Ascend.MindStudio-Debug-VSCode-Plugin-1.0.3.vsix](https://marketplace.rnd.huawei.com/detail?identifier=MindStudio-Debug-VSCode-Plugin) | 0902cd170c9327704afa6aba8c4f75631877b96763f068c10d1da0e0a6abc408 |
| 1.0.2 | 2024.11.28 | [Ascend.MindStudio-Debug-VSCode-Plugin-1.0.2.vsix](https://marketplace.rnd.huawei.com/detail?identifier=MindStudio-Debug-VSCode-Plugin) | 4a4efdc34212330cbe147f45737156866d8f0ecdc1cc2560303163f8a2c7b694 |
| 1.0.1 | 2024.10.17 | [Ascend.MindStudio-Debug-VSCode-Plugin-1.0.1.vsix](https://marketplace.rnd.huawei.com/detail?identifier=MindStudio-Debug-VSCode-Plugin) | 5550029e1c2e1af79ec295805efdb7633a472ea0d496ce1bc224f696e02af0f2 |
| 1.0.0 | 2024.09.19 | [Ascend.MindStudio-Debug-VSCode-Plugin-1.0.0.vsix](https://marketplace.rnd.huawei.com/detail?identifier=MindStudio-Debug-VSCode-Plugin) | 3c25b4dbc126203977308931fa16bfaf8712a707f0217165b1a2a0b4d6e98c4c |
| 0.0.5 | 2024.08.14 | [Ascend.MindStudio-Debug-VSCode-Plugin-0.0.5.vsix](https://marketplace.rnd.huawei.com/detail?identifier=MindStudio-Debug-VSCode-Plugin) | 5943435b4bbdcce744abd181f49a5c56a55a2282ecd772f354eddae6fd873365 |
| 0.0.4 | 2024.07.27 | [Ascend.MindStudio-Debug-VSCode-Plugin-0.0.4.vsix](https://marketplace.rnd.huawei.com/detail?identifier=MindStudio-Debug-VSCode-Plugin) | 579ba2a77488941c5cb9b1a1c2c4ec4e95f95a8765a0f443a7bb3e3dceea1b69 |




#### 快速使用


1.  打开VSCode-huawei IDE界面，安装远程登录插件(如RemoteDev)
2.  IDE界面远程SSH登录算子开发环境，打开`已编译`的算子工程文件(本插件不具备编译功能)
3.  安装`MindStudio Debug VSCode Plugin`插件

* （推荐）IDE界面插件市场在线安装

* IDE界面离线本地安装
```
 - 插件.vsix文件上传linux环境
 - 展开IDE界面左侧边栏的插件菜单
 - 点击右上角...图标，选择Install from VSIX...选项，选择本地的插件文件进行安装
```

* 后台命令行离线本地安装
```
 - 插件.vsix文件上传linux环境
 - 后台输入命令安装插件文件: code --install-extension /xx_dir/MindStudio-Debug-VSCode-Plugin-1.0.6.vsix
```
4.  点开debug侧边工具栏，若未生成.vscode/launch.json文件，则根据提示点击生成launch.json文件(弹窗中调试器选择MSDebug)
- 需要注意vscode`当前打开目录`的选择，因为当前目录会影响launch.json文件中`cwd`参数的值。若msdebug的调试参数文件和打断点的源码文件不直接在同一个目录下（比如源码在src目录下，测试用例在test目录下），则建议切换当前目录为共同的父目录下，再创建.vscode/launch.json文件。如果算子可执行文件必须以 `./${excutable_opp}`在当前目录执行（如build_output目录），则`cwd`参数需要设成可执行文件所在父目录的绝对路径。
5.  在`.vscode/launch.json`中添加调试配置(格式参考下面推荐配置)
6. <div id="999">(可选)配置launch.json的environmentScripts参数时，若用户需要配置复杂逻辑的环境变量执行脚本（脚本包含除了export key=value以外的逻辑），需要执行以下步骤：</div>
 - 用户登录linux终端（如打开vscode IDE的终端栏），先执行设置环境变量的相关脚本，例如`source /xx/set_env1.sh; source /yy/set_env2.sh`等
 - 接着输入 `env> ${path_to_project}/.vscode/.env`命令并执行，手动导出环境变量信息到`.env`配置文件中，供后续插件读取
 - 最后将生成的`.env`文件路径：`/xx/xx/.vscode/.env`（绝对路径格式），配置到launch.json的environmentScripts参数中，配置方式参考后面章节
7.  debug侧边工具栏中，选择已配置的调试器，点击`debug`或按`F5`启动调试

- **launch方式推荐配置（可复制）**
```
{
    "configurations": [
        {
            "name": "xx-debug",
            "type": "msdebug-mi",
            "request": "launch",
            "cwd": "${workspaceFolder}",
            "target": "/xxx/xx/xx_operator",
            "targetArgs": [
                "arg1",
                "arg2"
            ],
            "msdebugMiPath": "/xx/x/msdebug-mi",
            "environmentScripts": [
                "/xxx/xx/Ascend/ascend-toolkit/set_env.sh",
                "/xxx/xx/xx-user-bussiness/set_env.sh",
                "/xx/xxx/project/.vscode/.env"            // 命令行执行环境变量设置的命令(export xx=xx)和脚本(source /xx/set_env.sh)之后，输入命令env > .vscode/.env生成环境变量配置文件
            ],
            "environment": [
                {
                    "name": "LD_LIBRARY_PATH",
                    "value": "/xx/x/lib:${LD_LIBRARY_PATH}"
                },
                {
                    // 可选：通过配置LAUNCH_KERNEL_PATH环境变量，指定算子加载路径，导入调试信息
                    "name": "LAUNCH_KERNEL_PATH",
                    "value": "/xx/x/my_kernel.o"
                }
            ]
        }
    ]
}
```
* `name` 调试插件的名称
* `type` 固定值`"msdebug-mi"`
* `request` 固定值`"launch"`
* `cwd` 调试器启动的工作目录。注意：当target和targetArgs参数不为绝对路径时，cwd参数在target和targetArgs参数上生效。`${workspaceFolder}`为vscode IDE的当前打开目录。
* `target` (必要配置项)被调试的可执行文件的路径。target可设为算子可执行文件或者python等可执行命令，后者需要配置绝对路径
* `targetArgs` 可选配置，被调试的算子可执行文件的参数列表。举例`"targetArgs": ["arg1","arg2"]`，底层msdebug-mi调试命令调用效果等价于: `# msdebug ${target} ${arg1} ${arg2}`，若不配置target和targetArgs的绝对路径，则默认加上cwd的路径前缀。
* `printMiInput` 可选配置，打印msdebug-mi的输入命令日志。默认为false建议不配置，避免生成大量冗余日志
* `printMiOutput` 可选配置，打印msdebug-mi的命令输出信息日志。默认为false建议不配置，避免生成大量冗余日志
* `skipEnvCheck` 可选配置，插件初始化加载时是否跳过环境校验。默认为false建议不配置
* `enableLog` 可选配置，是否归档debug console生成的日志打印，用于问题定位，日志位置为vscode-server目录下的msdebuglogs/msdebug.log。默认为false建议不配置
* `msdebugMiPath` 可选配置，调试器路径，不配置默认为$ASCEND_TOOLKIT_HOME/tools/msdebug/bin/msdebug-mi
* `environmentScripts` 可选配置，为包含msdebug启动所需的环境变量的脚本数组(默认支持配置内容仅含export key=value的脚本文件，而含复杂逻辑脚本的environmentScripts配置方法参考[快速使用-第6点](#999))，依次加载数组中各脚本中的环境变量。若有重复设置可能会产生值覆盖。
* `environment` 可选配置，为包含自定义环境变量的对象数组，在加载完`environmentScripts`脚本中的环境变量后依次加载`environment`中的环境变量，格式需满足:`[{"name": "xxx", "value":"yyy"}]`。若和environmentScripts配置的脚本中有重复设置的环境变量可能会产生值覆盖。

#### 断点调试（设置/删除/禁用/启用断点）
* 可以在算子程序行号显示处添加、删除、禁用、开启或关闭断点，也可以在左侧边栏中的底部断点工具栏执行相同操作。
* 支持调试cce文件类型，需要设置vscode系统配置：（1）`Ctrl + Shift + P`打开命令窗口，输入`open workspace settings`，打开工作区配置 （2）搜索`Files:Associations`，添加键值对`[*.cce, cpp]`新增对`.cce`文件类型的支持。

#### 单步执行调试(逐行执行/内部执行/跳出函数)/继续/暂停/重启
* 可以单击顶部调试工具栏上的图标控制程序，包括单步执行、步入、步出、继续、暂停、重启或停止程序的操作。

#### 查看变量/寄存器/堆栈/断点信息，监视器支持执行表达式
* 启动调试后，程序会停止在断点，当进程处于停止状态时，可以在IDE界面左侧查看当前线程的变量、堆栈、监视器和断点信息。其中监视器支持执行表达式。

#### 内存查询
* 变量右键内存查询
* 调试停在断点时，光标移到代码编辑区的变量上，`右键并点击Read Memory菜单`跳转到内存查看页面，支持切换数据类型和列数改变内存展示效果
* 自定义内存查看
* `点击右下角Read Memory菜单项`也可跳转到内存查看页面。支持手动输入内存位置、内存地址、内存大小来进行自定义内存位置的内存查看

#### 核切换
*  左下角展开KERNEL FOCUS工具栏，可查看核状态，高亮行是当前所在核；点击其他行数据进行切核

#### NPU coredump文件可视化调试
* [NPU coredump调试官网特性说明](https://www.hiascend.com/document/detail/zh/canncommercial/82RC1/devaids/optool/atlasopdev_16_0149.html)
* launch.json增量配置（可以和原先msdebug-mi配置共存）
```
{
    "configurations": [
        {
            "name": "xx-debug",
            "type": "msdebug-mi",
            ...
        },
        // 以下为coredump调试配置
        {
            "name": "xx-debug",
            "type": "msdebug-coredump",     // 注意区别
            "request": "launch",
            "cwd": "${workspaceFolder}",
            "msdebugMiPath": "/xx/x/msdebug-mi", 
            "environmentScripts": [
                xxx         // 和msdebug-mi调试参数设置一致即可
            ],
            "environment": [
                xxx         // 和msdebug-mi调试参数设置一致即可
            ]
        }
    ]
}
```
* launch.json参数说明
  * 原先type=msdebug-mi配置参数继承：name、type（值不同）、requtest、cwd、msdebugMiPath、printMiInput、printMiOutput、environment、environmentScripts、enableLog、skipEnvCheck.
  * 新增`dumpfilePath`参数：必要配置项，coredump文件路径（和`cwd`配置共同组合成coredump文件的绝对路径，也可单独设成绝对路径）。建议设置前`检查下coredump文件是否具备执行权限！！`
* 使用方法：
  - 配置launch.json后，选择`msdebug-coredump`方式启动调试
  - 启动后加载`coredump info`界面，可以查看coredump信息 (不慎关闭也可通过右下角`read coredump`按钮重新打开页面)
  - 左下角展开切核菜单，进行NPU核切换
  - `coredump ino`界面点击每一行最左`memory`按钮，弹窗显示该地址对应的内存值（若内存地址含invalid则查看无效）
  - 点击右下角的`read memory`按钮跳转内存查看页面，可以自定义查询内存值。
  - 点击右下角的`read register`按钮跳转寄存器查看页面，可以查看寄存器值。
  - 结束调试


## Disclaimer
All downloading and use of the software and its accompaniments are deemed to have carefully read and fully agreed to the following terms:
* The software is an experimental product intended solely for personal learning and communication. It is strictly prohibited from being used fr any illegal or malicious purposes.
* If any third party commercial behavior and illegal uses are found, the software author has the right to revoke the right to use.
* The risk of using this software will be entirely borne by the user, and the software author will not bear any responsibility.
* For issues not covered in this statement, please refer to relevant national laws and regulations.
* The copyright of this software statement and its right to modify, update and final interpretation belong to the software author.