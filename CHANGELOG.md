# 更新日志

本文列出 **Huawei OP DevTools（华为算子一站式开发工具）** 的重要变更。完整提交历史见 [GitCode](https://gitcode.com/mlh0101/mstt) 仓库。

## 1.3.6 — 2026-07-01

本版本包含新建工程 UI 刷新、编译/运行队列协调、异常检测默认选项、SoC 告警改进与 CANN 模板清理。

- **新建工程与欢迎页 UI（GC-40）** — 用 Seti 文件树动态预览替代静态模板 PNG；统一欢迎页与新建工程标签布局；修复标签重构后 Create 表单校验；`pyasc_temple` 重命名为 `pyasc_template` 并接通生成器；移除未使用的打开工程面板及遗留预览 PNG 资源。
- **编译/运行队列协调（GC-24）** — 经 `OperatorCompileRunGate` 串行化构建、运行样例与运行，Run 等待进行中的编译而非与共享执行器竞态；协调算子操作队列与编译/运行（跨队列抢占、**全部停止**清空双队列、Run 排队时侧栏显示编译 spinner）；调试流程共用同一门控；编译/运行实际启动时可靠取消异常检测。
- **异常检测默认选项（GC-36）** — 工作区设置、生成配置与快速选项面板默认启用 memcheck、racecheck、initcheck、check-unused-memory、leak-check（共享 `DEFAULT_SANITIZER_DETECTION_OPTIONS`）。
- **SoC 版本未配置告警（GC-43 / [plugin_release #43](https://gitcode.com/opdevtools/plugin_release/issues/43)）** — 仅在算子命令运行时 SoC 未解析时显示简短可操作告警，工程打开或被动环境读取时不提示。抑制逻辑与解析器一致，仅工作区显式配置生效，用户作用域设置不会隐藏告警；**打开 SoC 设置…** 跳转工作区 `environment.socVersion`。每次算子运行均重复提示直至 SoC 已配置。修正 `socVersion` 设置示例：`ascend10b` → `ascend910c`。
- **CANN CMake 模板清理** — 从 AscendC 内核模板移除多余的 `target_link_libraries`（tiling_api/register/platform/m），由 ASC 工具链提供。

## 1.3.5 — 2026-06-26

本版本包含 Triton 仿真分析与异常检测支持、仿真分析修复、NPU 调试与异常检测改进。

- **Triton 仿真分析与异常检测** — Triton 工程可在插件内运行**仿真分析**（`msprof`）与**异常检测**（`mssanitizer`）。异常检测快速选项新增检测范围、Block ID 与日志配置；活动 `.py` 目标从编辑器同步至运行时配置；`--log-file` 路径经 shell 引号转义。
- **仿真分析 `--aic-metrics` 按 SOC 平台门控** — `msprof op simulator` 仅接受当前 `--soc-version` 平台支持的指标。A3（`ascend910_93`，即 `Ascend910C`）不支持 `ResourceConflictRatio`，而默认仿真配置会传递 `--aic-metrics=ResourceConflictRatio,PMSampling`，导致执行报错 `Unexpected argument --aic-metrics=ResourceConflictRatio, maybe in wrong soc platform`。可选指标仅在解析出的 CANN SOC 标识命中 `SIMULATOR_OPTIONAL_METRIC_SOCS` 允许列表（`shared/msprof-simulator-metrics.ts`）时传递；命令生成与仿真选项面板共用该统一来源。A2/A3 仍仅传递必选的 `PipeUtilization`；`PipeUtilization` 与 `ResourceConflictRatio` 互斥规则不变。**A5（`ascend950`）** 经 §8.1 CLI 验证已加入允许列表，`ResourceConflictRatio` 与 `PMSampling` 在 A5 仿真快速选项中可见；默认仿真命令由 `--aic-metrics=PipeUtilization` 变为 `--aic-metrics=ResourceConflictRatio`。详见 `docs/simulator-options-spec.md`。
- **修复 standard-custom「运行样例」缺少算子名/平台** — `build.sh --run_example` 从**位置参数** `<算子> <模式> <pkg_mode>` 读取样例名与模式，而非从 `--ops`。缺失时脚本打印空的 `name:` / `mode:` 并回退到 usage。现 `CannCommandStrategy.buildExampleCommand` 与 `AscendCommandStrategy` 一致地追加 `<算子> <模式> cust`，并在 `compileOption` 未带 `--soc` 时补全 `--soc`（经 `{soc_version}` 占位符）。
- **按算子自动选择 run_example 模式** — 通过扫描算子 `examples/` 目录（对齐 build.sh 布局，跳过 `experimental/`）检测样例模式（`eager` 与 `graph`）。全局 `executionMode` 设置仅在两种模式均存在时作为决胜项。文件名匹配默认 `^test_aclnn_.*\.cpp$` / `^test_geir_.*\.cpp$`，可通过 `eagerExamplePattern` / `graphExamplePattern` 覆盖。仅当运行脚本使用 `--run_example` 接口时才追加位置参数。
- **NPU 调试 launch.json 自动适配** — 调试启动前，`launch.json` 目标在**所选算子自身**的 `build/` 目录下解析（而非工作区根 `build/`），使用插件默认名称（`test_aclnn_<算子>`、`<算子>`、graph 二进制及 build_example 目标）。多算子选择取第一个；替换遗留的根 `build/` 占位符；无法解析目标时向用户告警。
- **异常检测 A5 CMake 模板修复** — CANN 工程模板在生成时按 SOC 修补异常检测编译/链接标志：A5 仅 `-g`；非 A5 保留 `--cce-enable-sanitizer` 与链接标志。仅 SOC 相关后缀使用占位符，共享选项（`-O2`、`--cce-fatobj-link`）保持字面量。
- **MindStudio Debug VSIX 1.0.9** — 内置调试扩展由 1.0.8 升级至 1.0.9。

## 1.3.3 — 2026-06-15

本版本包含仿真分析修复、体验改进、部署修正与文档更新。

- **重置项目配置** — 命令注册到侧栏；清理工作区设置前提供中英文确认提示；重置后自动重载窗口；修复重复「取消」按钮。
- **欢迎页** — 重新设计欢迎面板布局与文案；欢迎页 Webview 标签图标从扩展品牌资源正确加载。
- **从 Actions 视图打开欢迎页** — Actions 树新增侧栏命令分组与菜单项，可随时重新打开欢迎页。
- **命令面板** — 用户可见命令按产品名称分组（`%config.title%`）；仅用于侧栏/操作树的 UI 命令不再出现在命令面板中。
- **`.run` 部署** — 在 **A2** 与 **A5** SOC（`ascend910b`、`ascend950` 等）重装 `.run` 包时追加 `--force`；A3（`ascend910_93`）行为不变。
- 仿真分析向 `msprof op simulator --soc-version` 传递**仿真器目录名**（如 `Ascend910B3`、`Ascend910C`、`Ascend950PR_9589`），不再传递 CANN SOC 标识 — 恢复 1.3.2 之前行为，与 msopprof / CANN `tools/simulator` 目录一致。
- 仿真分析不再同时传递 `PipeUtilization` 与 `ResourceConflictRatio`；启用资源冲突比时仅传递 `ResourceConflictRatio`（及可选的 `PMSampling`），符合 msprof 互斥规则。
- 在 `docs/ascend-env-spec.md` §8.1 补充 `--soc-version` 与 SOC 标识、spawn 环境的规范说明；同步修订性能分析与 A3/A5 环境文档。

## 1.3.2 — 2026-06-08

本版本强化 A5/A3 芯片环境解析与命令行注入、标准自定义算子就地创建与 genop 脚手架、SOC 设置与仿真/调试一致性，并改进设置迁移与稳定性。

- 在标准自定义算子集合内新建子算子时，直接在指定路径完成创建，不再提示「在当前窗口打开」，避免误识别为独立工程。
- 新建标准自定义算子时优先执行工程自带的 `build.sh --genop`；新增可配置项 **genOpCommand**（默认 `bash build.sh --genop={path}/{operatorname}`），失败或无输出时回退到插件模板。
- 标准自定义构建、调试、调优等流程统一通过脚本模板中的 `--ops={operatorNames}` 占位符注入算子名（兼容未迁移的旧脚本）。
- 集中 Ascend 系列检测：芯片名规范化、A3 `Ascend910_93xx` 识别、A2 Pro/Premium/901 的 `dav-1001` 等。
- Atlas A3 统一为 CANN SOC `ascend910_93`（检测、告警示例与文档）；`Ascend910A` 归入 910B 族。
- 「SOC 未检测到」告警中的 **SOC 设置** 与齿轮 **项目配置** 一致，打开**工作区**作用域设置（避免在用户作用域填写却被解析器忽略）。
- 仿真分析向 `msprof op simulator --soc-version` 传递 CANN SOC 标识（如 `ascend910_93`），不再误用仿真器目录名（如 `Ascend910C`）。**已在 1.3.3 废止** — A2/A5 现场工具链不接受 SOC 标识作为 `--soc-version`；见 `docs/ascend-env-spec.md` §8.1。
- A5/A3 环境变量改为在**命令字符串**中显式 `export`（可审计、顺序可控）；标准自定义工程在生成 CMake 时写入 `SOC_VERSION`/`NPU_ARCH` 占位符及 `SUPPORT_*` 默认值，减少错误的环境注入。
- CANN 与 `add_custom` 工程模板 CMake 占位符与 A5 构建说明更新。
- NPU 调试启动前自动将 `launch.json` 中的调试目标适配为 `build/<算子名>`（占位或缺失路径时更新；用户已配置的有效目标保留）。
- 一次性旧版设置迁移；运行时以 VS Code 工作区设置为准；监视主配置变更。
- 修复性能分析服务在 VS Code 中因默认日志路径权限导致的 **Error:OTHER**（显式 `--logPath`）。
- 恢复 Dump tensor 流程中的 `show_kernel_debug_data` 调用。
- 文档整合：`ascend-env-spec`、用户问题索引、集成指南等（无功能变更）。

## 1.3.1 — 2026-05-28

本版本面向 A5 环境适配、标准自定义算子工作流修复、启动与安装包体积优化、输出面板体验改进及缺陷修复。

- 标准自定义工程构建时，扩展根据解析后的 SoC 注入芯片相关环境变量，生成的 CMake 不再固定为 A3 默认值。
- CANN 工程模板支持 A5 构建与仿真；**SoC 版本**、**NPU 架构** 可通过 CMake 参数（`-DSOC_VERSION=`、`-DNPU_ARCH=`）传入，未在命令行指定时也可通过环境变量作为后备。从扩展侧栏发起构建时会自动注入芯片环境变量。
- 当 SoC 配置或检测为 Atlas A5（`ascend950`）时，上板**性能调优**快捷选项显示 **PC 采样**，替代 **Cache 热力图**。
- **SoC 版本**、**仿真器类型** 设置默认为空；运行时按工作区设置、全局环境变量（如 `SOC_VERSION`）或主机 Ascend 工具链检测依次解析。未设置仿真器类型时，仿真构建选用与解析 SoC 匹配的默认值。相关设置项说明已更新。
- SoC 版本无法自动检测时（如 `asys` / `npu-smi` 不可用）显示警告通知。
- 编译后安装生成的 `.run` 包时自动追加 **`--force`**（Ascend Build 部署及标准自定义上板/仿真调优前置步骤）。
- 标准自定义工程中，对选中的 experimental 算子自动追加 **`--experimental`**（Build、Run、UT 测试、上板调优、仿真调优、Dump tensor 及 NPU 调试预编译）。
- 标准自定义上板与仿真调优在 `msprof` 前自动部署已构建的 `.run` 包（默认插件流程无需手动部署）。
- NPU 调试使用侧栏当前选中的算子。
- 将自动打开工程、调试扩展安装及侧栏刷新延后至激活完成后执行，加快扩展启动。
- 缩小扩展安装包体积（更精简的 VSIX 打包）。
- 未打开工作区时，新建工程在当前窗口打开，不再额外弹窗询问。
- 工具输出按命令类型分组到独立通道（如 `Op Dev Tools: compile`），同类型命令复用同一通道。
- 修复性能分析 Insight 视图中 **Detail**、**Cache** 页签打开报告时无内容的问题。
- 改进同步 Op Devtools 工作区设置时对 VS Code `settings.json` 的写入方式（点分键写入，避免覆盖同步期间的用户编辑）。

## 2026-05-15

- 侧栏、Webview 面板、Insight 视图全面适配 VS Code 颜色主题（浅色、深色、高对比度），扩展运行过程中切换主题时同步生效。
- 扩展界面与提示文案随 VS Code 显示语言切换，支持 **英语** 与 **简体中文（zh-cn）**。
- 支持将 **异常检测（Sanitizer）** 与 **性能调优（Profiling）** 选项存为工作区默认，配合 **不再提示** 减少启动后重复配置。
- 侧栏操作与识别到的算子工程类型对齐；原先在独立面板中打开的工作流统一到侧栏。
- 编译、调试等任务支持排队执行；**全部停止** 可终止进行中任务；新手引导与快捷选项面板的 **不再提示** 按工作区记忆。
- 异常检测结果采用树形分组并支持跳转源码；修复启动后结果列表不完整或陈旧的问题。
- 性能调优结果视图改版以便快速浏览；修复工程路径与已保存选项未正确应用或匹配的问题。
- **Op Devtools** 设置项与 VS Code 其他扩展一致，支持 **用户** / **工作区** 作用域。欢迎引导演示视频由 GIF 改为 MP4。

## 2026-04-20

- 标准自定义算子仿真分析适配芯片配置（适配 A5 环境）。
- 支持工程配置中芯片类型自动根据环境生成（适配 A5 环境）。

## 2026-03-27

- 基于 printf / dumptensor 的数据落盘能力，提供落盘数据可视化，以及 dumptensor 数据的精度对比能力。
- 支持标准自定义算子的单元测试（UT）能力。
- 支持在工程配置中配置芯片类型。

## 2026-03-13

- 首页添加用户使用向导，方便新手使用。
- 环境变量配置与工程配置合并。
- 「文件」菜单支持新建算子工程。
- 「停止」功能优化，简化用户开启新任务的操作。

## 2026-02-06

- 异常检测跳转至代码处时，鼠标悬停可提示错误信息。
- 去掉 pyasc 配置项；用户点击运行时执行当前激活编辑器中的 Python 文件（若无激活文件则不允许执行、调优等操作）。
- 调试功能按钮支持防呆处理。
- 调试、异常检测、性能调优等操作前的编译命令行支持编辑。

## 2026-01-22

- 支持打开存量工程。
- 支持 pyasc 算子与标准自定义算子的新建、编译、调试、异常检测和调优。

## 2026-01-15

- 支持三种 `<<<>>>` 场景的算子新建。
- 异常检测、性能调优体验优化。
- 异常检测与性能调优结果支持下载与复制路径。

## 2026-01-09

- Bug 修复。

## 2025-12-30

- 支持新建工程（当前支持创建 `<<<>>>` 场景工程）。
- 支持 `<<<>>>` 工程的编译、调试、调优。
- 集成到 CodeArts IDE。
