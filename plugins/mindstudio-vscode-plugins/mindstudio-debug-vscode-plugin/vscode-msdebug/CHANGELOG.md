# Change Log

All notable changes to the "MindStudio Debug VSCode Plugin" extension will be documented in this file.

## [v1.0.5] - 2025-05-14

### Added

- 支持NPU coredump文件可视化调试功能
- 新增支持DCACHE类型内存的查看内存

## [v1.0.3] - 2025-04-02

### Added

- launch.json新增enableLog参数开关可以开启debug console的打印日志存储，适用于收集超大行数的console日志和问题定位
- launch.json新增复杂环境变量脚本执行后的.env文件配置
- 新增打印卡占用报错日志
- 内存查询适配L1、FB的内存类型和int32_t和uint32_t的变量类型

### Fixed

- 适配最新版本CANN版本的报错提示

## [v1.0.2] - 2024-11-27

### Changed

- launch.json的environmentScripts参数配置方式发生变化：兼容原有配置`export key=value`类型脚本的前提下，新增支持配置.env(按资料说明手动生成)环境变量文件方式

### Added

- 支持可直接配置set_env.sh变量脚本的方式，无需进行手动转换
- 支持cce算子调试（资料）
- 内存查看支持910B和310P
- 内存查看支持signed char和signed int类型tensor
- 资料新增软件包一致性校验步骤

### Fixed

- 资料刷新了launch.json参数详解、断点调试等章节
- 安全加固

## [v1.0.1] - 2024-10-17

### Added

- 加载lanuch.json中environmentScript参数时，新增export字段校验
- 查看内存功能支持多种数据类型

### Fixed

- 修复run命令执行时访问thread信息导致启动慢
- 优化查看内存功能

## [v1.0.0] - 2024-09-18

### Changed

- 查看变量内存方式从变量栏和watch栏中右键变量方式，改成在代码编辑区右键变量点击Read Memory菜单跳转到内存查看页面
- 查看内存页面优化成自定义界面，不再依赖Hex-editor插件

### Added

- 查看内存页面新增支持显示内存位置、内存地址、内存大小、数据个数、数据类型和列数，hover内存值时支持查看内存值和地址值，从变量右键跳转查看内存查看页面时，支持切换数据类型和列数改变内存展示效果
- 新增支持从右下角的Read Memory菜单项跳转到内存查看页面，支持手动输入内存位置、内存地址、内存大小来进行自定义内存位置的内存查看

## [v0.0.5] - 2024-08-13

### Added

- 新增CANN和HDK版本信息的加载打印
- ReadMe增加CANN包下载链接

### Changed

- 切核功能更新，面板升级成按钮切换方式

### Fixed

- 隐藏切核和寄存器的默认打印
- 消除切核信息的换行符
- 修复特殊类型tensor的变量查看报错

## [v0.0.4] - 2024-07-25

### Changed

- 更改软件名称
- 更改copyright，NOTICE内容
- 更新ChangeLog内容

## [v0.0.3] - 2024-07-23

### Fixed

- 修复调试时多核同时步进问题，保持单核调试

## [v0.0.2] - 2024-07-22

### Added

- 支持msdebugMiPath缺省配置
- 支持日志过滤仅打印debug console日志

### Changed

- 更改协议为MIT

## [v0.0.1] - 2024-07-08

### Added

- 支持单步调试、变量查询、寄存器查询、内存查询、日志打印等通用功能
- 支持切核功能，多核切换代码高亮自动跳转
- 支持读取配置文件中的环境变量信息
- 支持算子二进制的可选参数配置

### Fixed

- 修复鼠标悬浮变量上退出问题
- 修复内存查询数据量过大卡死问题

## [Unreleased] - 2024-01-19

- Initial release