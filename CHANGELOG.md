# 更新日志

## 1.5.5 — 2026-10-22

本版本面向 Ascend950PR&950DT系列产品 引入新一代异常检测工具 npu-check 与仿真采集工具 npu-emulate，性能调优设置与数据采集配置按「分析类型 → 工具」层级重构，DumpTensor 结果与性能提示迁移为原生视图，并包含 CANNWork 智能分析联动及多项体验改进与修复。

- **异常检测支持 npu-check 工具（Ascend950PR&950DT系列产品）** — Ascend950PR&950DT系列产品环境异常检测可切换至新工具 `npu-check`（原 npu-sanitizer）。报告默认输出到 `npu-check-log` 目录（文件名 `npu-check_<时间戳>.log`，报告标题直接使用文件名），结果按问题分组平铺展示；编译阶段自动追加 `-gline-tables-only` 以获取调用栈，报告跳转规则改为从调用栈 #0 帧起定位第一处位于工程目录内的代码。`npu-check` 暂不支持芯片状态检测与溢出检测，竞争检测与未初始化检测将在后续版本开放；mssanitizer 流程及其报告目录不受影响。
- **仿真采集工具定名 npu-emulate** — 仿真采集工具正式定名 `npu-emulate`：Ascend950PR&950DT系列产品环境默认经 `npu-emulate collect --output <结果目录>/result.npu-rep` 采集并产出 `.npu-rep` 报告（可通过 `ascendCToolkit.performanceTuning.simulation.tool` 固定为 msprof），其他系列产品仍使用 msprof；仿真分析编译命令行的 `--simulator` 标志按产品系列与所选仿真工具动态调整，非 Ascend950PR&950DT系列产品环境选择新工具时会被拦截并提示。
- **性能调优设置按层级拆分** — 设置树以「性能分析 → 上板分析/仿真分析 → 工具」3 级层级展示；npu-compute 上板分析的各 section 拆分为独立 boolean 设置项（唯一真相源）并默认全选；`ascendCToolkit.performanceTuning.onBoard.tool` / `simulation.tool` 枚举设置支持在 VS Code 设置界面直接切换 npu-compute/npu-emulate 与 msprof。
- **数据采集配置弹窗（Ascend950PR&950DT系列产品）** — 新增数据采集配置弹窗：支持采集类型（上板/仿真）切换、Common 参数面板与 Metrics section/set 选择，并按当前工具支持情况禁选不可用指标（如 Pipeline、ArithmeticUtilization、ResourceConflictRatio 与 detailed、hccl、roofline）；配置按采集类型持久化到工作区设置，下次打开自动回显。
- **性能提示以原生诊断呈现** — 性能调优产生的 performance hints 作为 VS Code 原生诊断（问题面板）展示，不再仅存在于报告中。
- **.npu-rep 报告直接查看** — `.npu-rep` 文件支持使用内置性能报告查看器直接打开，资源管理器右键菜单新增「打开性能报告」入口；报告查看器已处于活动状态时隐藏工具栏重复按钮。
- **报告语言随 IDE 同步** — 性能报告界面语言跟随 VS Code 显示语言（中/英文）切换。
- **CANNWork 智能分析联动** — 报告智能分析对接更名后的 CANNWork 插件（`cannwork.setInputText`），未安装或版本过低时给出明确安装提示；分析请求携带报告来源标识，区分上板与仿真报告；仿真分析统计报告支持一键调起 CANNWork 分析并在调用后自动提交。
- **DumpTensor 结果树原生化（GC-87）** — DumpTensor 结果由 Webview 面板替换为侧边栏原生结果树，与异常检测、性能结果树并列；保留打开 `.txt`、双文件对比、导入 `.bin`、下载报告目录、复制路径、标记/按标记过滤、按时间排序等操作，运行后自动刷新并聚焦新结果。
- **Ascend C 语言支持（GC-84）** — 注册 `ascend-c` 语言及 `.asc` 文件关联与 tmLanguage 语法高亮；当前图标主题缺少对应语言图标时回退显示内置语言图标。
- **操作树体验改进（GC-80 / GC-86）** — 因互斥选择被禁用的算子行悬停显示原因提示；快速连续点击时算子选中状态不再丢失。
- **自动识别 examples 目录算子（GC-82）** — 自动识别工程根 `examples/` 目录下的算子。
- **命令输出通道追加显示（GC-73）** — 每类操作使用独立输出通道并追加写入历史输出，不再覆盖。
- **插件主视图移至主活动栏（GC-71）** — 插件主视图容器从辅助侧栏迁移至主活动栏。
- **标准自定义工程支持创建其它类型算子（[#83](https://gitcode.com/opdevtools/plugin_release/issues/83)）** — 支持在标准自定义算子工程中创建其它类型算子，创建后自动选中新算子。
- **其它修复与改进** — NPU 与远程脚本均不可用时 ST 测试入口正确置灰；MindStudio Debug 内置插件在版本变化时自动升级；扩展安装包体积优化（移除 source map、重编码演示视频、截图转 WebP）；许可证更新为 CANN Open Software License V2.0。

## 1.5.3 — 2026-08-31

本版本将上板/仿真分析的编译与 `.run` 安装包部署合并为携带 `--force` 的单条命令，新增NPU_ARCH覆盖设置与可配置执行超时，并改进构建目标选择、报告自动打开和设置读写健壮性。

- **上板/仿真分析编译部署携带 `--force`** — 标准自定义工程的上板分析与仿真分析将编译与 `.run` 安装包部署合并为单条命令，部署时按安装器支持情况自动追加 `--force`（与异常检测、DumpTensor行为一致），确保示例构建前算子已安装；执行顺序为「编译+部署 → 示例构建 → msprof」。
- **NPU_ARCH覆盖设置（GC-29 / GC-37）** — 新增 `op-devtools.environment.npuArch` 工作区设置。解析链为：工作区设置 → 系统环境变量 `NPU_ARCH` → 按解析出的SoC推导，统一供命令环境导出、脚本占位符与 `cmake -DCMAKE_ASC_ARCHITECTURES` 使用。重新打开工程时保持 `NPU_ARCH` 生效，避免手工执行 `bash build.sh` 触发CMakeLists的 `NPU_ARCH` FATAL_ERROR；主机检测到的SoC会固化到工程settings.json供下次打开直接使用，显式用户设置与仿真推导值不会被持久化。
- **settings.json读写健壮性（GC-29 / GC-37）** — 工作区设置值为 `null` 时按未设置处理，不再当作字符串 `"null"`；引入共享的空安全设置读取器并串行化settings.json写入；容忍文件中的BOM并原子写入，避免并发编辑导致文件损坏。
- **调优实际构建出的example（GC-38）** — 上板/仿真分析选择本次构建实际产出的example目标执行，不再固定回退到eager目标；构建目标候选列表剔除悬空符号链接。
- **可配置执行超时** — 新增 `op-devtools.execution.commandTimeoutSeconds` 设置（默认1800秒，`0` 表示不限制）。超时后终止整个进程组（Windows下逐级升级终止方式），失败提示会明确指出超时原因。
- **CANN include路径运行时解析与按需推荐C/C++ 扩展** — C/C++ `includePath` / `browse.path` 改为在运行时按实际CANN安装解析写入；仅当环境中没有任何C/C++ 语言支持扩展时才提示安装Microsoft C/C++（按语言贡献识别，兼容Huawei / CodeArts C/C++），不再通过extensionPack无条件捆绑 `ms-vscode.cpptools`（Remote SSH推荐保留）。
- **自动打开本次生成的报告** — 性能调优或异常检测运行结束后，自动打开该次运行刚生成的报告，无需再到结果列表中手动查找；报告自动打开的每个await边界均有异常防护（GC-54）。
- **WebIDE刷新不再自动打开插件面板（[#75](https://gitcode.com/opdevtools/plugin_release/issues/75)）** — 启动时不再自动聚焦操作树侧栏，避免每次刷新WebIDE都弹出插件面板，尊重刻意关闭该面板的用户。
- **切换工作区后清理缓存** — 切换工作区时清理运行时缓存，避免旧缓存导致的配置读取错误。
- **发布信息更新** — Ascend商店包发布者由 `hicann` 迁移至 `cann-pub`，扩展标识与显示名称同步更新。

## 1.4.5 — 2026-08-10

本版本新增CPU主机上的远程NPU算子开发能力，覆盖产物回传、调试、ST测试，以及按远程环境状态适配的操作入口。

- **远程算子执行与产物回传 ([#60](https://gitcode.com/opdevtools/plugin_release/issues/60))** — 本机未检测到NPU时，可通过已配置的 `remote_tool.sh` 探测远端NPU/SOC，并在远端执行支持的算子流程；生成产物会回传到本地工作区以供后续使用。
- **远程异常检测、上板调优与DumpTensor ([#61](https://gitcode.com/opdevtools/plugin_release/issues/61)、[#62](https://gitcode.com/opdevtools/plugin_release/issues/62)、[#63](https://gitcode.com/opdevtools/plugin_release/issues/63))** — 支持在远端NPU执行异常检测、上板调优和DumpTensor；诊断日志、性能分析结果及DumpTensor数据会回传，使现有本地可视化流程继续可用。
- **远程NPU调试 ([#65](https://gitcode.com/opdevtools/plugin_release/issues/65))** — 新增 `msdebug-mi-remote` 启动配置，自动适配远程调试目标，并通过 `remote_tool.sh` 启动远程调试适配器；内置MindStudio Debug升级至1.0.10。
- **远程ST测试与报告历史 ([#72](https://gitcode.com/opdevtools/plugin_release/issues/72))** — 标准自定义算子ST测试支持远程执行和结果回传，以便查看报告；修复历史报告可视化，并在远程执行时输出远程连接信息。
- **远程环境感知的操作可用性** — 操作树及相关选项面板同时识别本地NPU与已配置的远程工具；CPU主机用户会获得配置 `remote_tool.sh` 的引导，避免对支持的流程过早拦截。
- **标准自定义工程能力识别与安装包部署 ([#66](https://gitcode.com/opdevtools/plugin_release/issues/66))** — 标准自定义工程能力改为依据公开的 `build.sh --help` 接口识别；部署 `.run` 安装包前先检测安装器是否支持 `--force`，仅在支持时传入该参数。

本文列出 **Ascend C Toolkits** 的重要变更。完整提交历史见 [GitCode](https://gitcode.com/mlh0101/mstt) 仓库。

## 1.4.0 — 2026-07-24

发布：新增标准自定义算子ST（TTK）测试能力，并包含性能结果刷新、调试构建、工作区设置作用域、C++ 导航与CANN模板等多项改进。

- **标准自定义算子ST / TTK测试 ([#45](https://gitcode.com/opdevtools/plugin_release/issues/45))** — 在操作树提供ST测试入口：检测/安装TTK（`ops-test-kit`），按模式（kernel / aclnn / e2e）运行 `python -m ttk`，支持可配置参数与命令预览；解析结果CSV并可视化；提供原生运行历史树视图。
- **性能调优结果刷新 ([#51](https://gitcode.com/opdevtools/plugin_release/issues/51))** — Performance Results支持手动刷新；安全同步已从文件系统删除的结果条目。
- **调试构建 `--build-type=Debug` ([#46](https://gitcode.com/opdevtools/plugin_release/issues/46))** — CPU/NPU调试编译为 `build.sh` 追加 `--build-type=Debug`（避免重复），生成host调试信息；默认CPU调试命令在 `--simulator` 前加入 `--cpudebug`；CANN模板在 `--simulator` / `--cpudebug` 后继续解析后续参数（如 `--build-type`）。
- **忽略用户作用域op-devtools设置 ([#41](https://gitcode.com/opdevtools/plugin_release/issues/41))** — 运行时仅读取Workspace / Workspace Folder作用域配置（如Deploy/Run Command），忽略User / Remote User，与解析器及重置配置行为一致。
- **零配置CANN C++ 导航** — 通过 `configurationDefaults` 预置 `*.asc`/`*.cce` → `cpp` 关联及 `ASCEND_HOME_PATH` 下的C/C++ `includePath` / `browse.path`，便于开箱跳转与补全。
- **恢复本地standard-custom工程初始化** — 欢迎页创建与工作区检测在本地打开时正确注册standard-custom工程，避免漏登或误判。
- **CANN工程模板适配CPU调试与仿真** — 更新 `hello_world` / `addn_custom` / `torch_library` 等模板的 `build.sh` 与CMake，对齐CPU调试与仿真场景。

## 1.3.9 — 2026-07-17

本版本优化新建算子工程默认名称格式及多项修复。

- **默认算子工程名称前缀** — 由 `op_` 改为 `op`。
- **欢迎页** — 仅弹一次。
- **SOC配置弹窗** — 支持回车快速确认。
- **genop** — 使用相对路径。
- **版本号** — 1.3.9。

## 1.3.8 — 2026-07-10

本版本包含非NPU环境下NPU专属操作置灰，以及操作菜单NPU标签。

- **非NPU环境下NPU专属操作置灰 ([#50](https://gitcode.com/opdevtools/plugin_release/issues/50))** — 激活后异步探测扩展主机是否具备Ascend NPU（`asys info -r=status`，随后 `npu-smi info`）。任一工具返回非空输出（含stdout/stderr）即视为可用，包括驱动/设备忙等错误（如dcmi初始化失败）；仅当两者均不可用（bash `command not found`、PowerShell cmdlet未识别或空输出）时视为无NPU。探测完成前保持乐观可用；完成后设置 `opDevtools.npuHardwareAvailable` 并刷新操作树。置灰项：运行、NPU调试、异常检测、上板调优、UT测试、Dump tensor；编译部署、CPU调试、仿真分析与齿轮设置仍可用。资源管理器Run/Sanitizer/On-board菜单按上下文禁用；任务入口与异常检测/上板快速选项面板的「立即开始」同步拦截并提示 `web.operate.npuHardwareRequired`。
- **操作菜单NPU标签** — 在Actions操作树中为需NPU的行（运行、异常检测、UT测试、Dump tensor、NPU调试、上板调优）显示 `「NPU」` 描述，与编译、CPU调试、仿真等可在非NPU主机使用的操作区分。

## 1.3.7 — 2026-07-09

本版本包含Insight自动安装、调试可靠性改进、子算子与配置体验、操作面板聚焦及配套扩展推荐。

- **Insight自动安装** — 激活时在后台非阻塞初始化Insight。路径解析优先级：工作区 `op-devtools.environment.insightPath` → `INSIGHT_HOME_PATH`（含 `.env`/`.arts`）→ 内置默认路径。`InsightService` 处理版本映射（含历史的 `insight-version.json`）、下载（wget/curl/PowerShell，不可用时回退Node.js HTTP）、解压校验（检查 `index.html`）、备份/恢复及失败时的手动下载指引。性能数据查看器使用解析后的Insight路径。
- **生成 `.env` 中的msdebug库路径** — 在插件生成的 `<ide>/.env` 中将CANN `tools/msdebug/lib` 拼入 `LD_LIBRARY_PATH`；工程创建时写入，并在每次NPU/CPU调试启动前尽力回填（侧栏、F5与Run面板）。修复dump环境缺少LLDB库目录导致msdebug-mi适配器无法启动的问题。
- **调试构建失败或二进制缺失时中止启动** — 当解析出的msdebug目标可执行文件不在磁盘上时（调试构建失败或被抢占）阻止调试启动，显示明确错误而非附着到不存在的二进制。
- **创建算子时复用当前窗口 ([#34](https://gitcode.com/opdevtools/plugin_release/issues/34))** — 修复独立算子与打开工程流程：「当前窗口」发出 `{ forceReuseWindow: true }`，「新窗口」发出 `{ forceNewWindow: true }`，不再使用会defer到VS Code默认行为并意外打开新窗口的 `{ forceNewWindow: false }`。
- **README与打包帮助链接 ([#35](https://gitcode.com/opdevtools/plugin_release/issues/35))** — 刷新README用户指引（中/英）；更新CANN模板README与首页侧栏Webview中的帮助/文档链接。
- **推荐配套扩展 ([#27](https://gitcode.com/opdevtools/plugin_release/issues/27))** — 新增 `extensionPack` 项Remote - SSH与C/C++（`ms-vscode-remote.remote-ssh`、`ms-vscode.cpptools`），引导VS Code提示安装所需配套扩展。
- **嵌套工作区重置配置 ([#41](https://gitcode.com/opdevtools/plugin_release/issues/41))** — 当有效工程根与VS Code工作区文件夹根不一致时（例如在子文件夹打开工作区），重置项目配置会同时清理两者。移除所有相关根下的遗留配置、算子记录、`.arts` devtool配置与工作区设置后重载窗口。
- **忽略重复编译操作 ([#42](https://gitcode.com/opdevtools/plugin_release/issues/42))** — `OperatorCompileRunGate` 在同一Build/Run已排队或运行中时丢弃重复请求，避免重复触发编译。
- **`.asc` 内核文件高亮 ([#25](https://gitcode.com/opdevtools/plugin_release/issues/25))** — 在工作区 `<ide>/settings.json` 中为 `*.asc` → `cpp` 写入 `files.associations`（与现有 `*.cce` 映射并存），使Ascend内核断点可用；用户已配置的关联保持不变。
- **聚焦操作面板而非切换侧栏 ([#33](https://gitcode.com/opdevtools/plugin_release/issues/33))** — 编辑器标题栏图标通过 `workbench.view.extension.*` 或 `workbench.action.focusAuxiliaryBar` 聚焦插件操作面板（辅助侧栏），不再切换主侧栏并关闭资源管理器/调试等视图。
- **子算子创建使用工作区工程类型 ([#13](https://gitcode.com/opdevtools/plugin_release/issues/13))** — 根据当前工作区工程类型（`standard-custom` 与遗留存储的 `ascend`）识别子算子创建，而非硬编码假设；按工作区根解析父集合，使嵌套standard-custom算子正确脚手架。

## 1.3.6 — 2026-07-01

本版本包含新建工程UI刷新、编译/运行队列协调、异常检测默认选项、SoC告警改进与CANN模板清理。

- **新建工程与欢迎页UI（GC-40）** — 用Seti文件树动态预览替代静态模板PNG；统一欢迎页与新建工程标签布局；修复标签重构后Create表单校验；`pyasc_temple` 重命名为 `pyasc_template` 并接通生成器；移除未使用的打开工程面板及遗留预览PNG资源。
- **编译/运行队列协调（GC-24）** — 经 `OperatorCompileRunGate` 串行化构建、运行样例与运行，Run等待进行中的编译而非与共享执行器竞态；协调算子操作队列与编译/运行（跨队列抢占、**全部停止**清空双队列、Run排队时侧栏显示编译spinner）；调试流程共用同一门控；编译/运行实际启动时可靠取消异常检测。
- **异常检测默认选项（GC-36）** — 工作区设置、生成配置与快速选项面板默认启用memcheck、racecheck、initcheck、check-unused-memory、leak-check（共享 `DEFAULT_SANITIZER_DETECTION_OPTIONS`）。
- **SoC版本未配置告警（GC-43 / [plugin_release #43](https://gitcode.com/opdevtools/plugin_release/issues/43)）** — 仅在算子命令运行时SoC未解析时显示简短可操作告警，工程打开或被动环境读取时不提示。抑制逻辑与解析器一致，仅工作区显式配置生效，用户作用域设置不会隐藏告警；**打开SoC设置…** 跳转工作区 `environment.socVersion`。每次算子运行均重复提示直至SoC已配置。修正 `socVersion` 设置示例：`ascend10b` → `ascend910c`。
- **CANN CMake模板清理** — 从AscendC内核模板移除多余的 `target_link_libraries`（tiling_api/register/platform/m），由ASC工具链提供。

## 1.3.5 — 2026-06-26


- **仿真分析 `--aic-metrics` 按SOC平台门控** — `msprof op simulator` 仅接受当前 `--soc-version` 平台支持的指标。Atlas A3系列产品（`ascend910_93`，即 `Ascend910C`）不支持 `ResourceConflictRatio`，而默认仿真配置会传递 `--aic-metrics=ResourceConflictRatio,PMSampling`，导致执行报错 `Unexpected argument --aic-metrics=ResourceConflictRatio, maybe in wrong soc platform`。可选指标仅在解析出的CANN SOC标识命中 `SIMULATOR_OPTIONAL_METRIC_SOCS` 允许列表（`shared/msprof-simulator-metrics.ts`）时传递；命令生成与仿真选项面板共用该统一来源。Atlas A2/A3系列产品仍仅传递必选的 `PipeUtilization`；`PipeUtilization` 与 `ResourceConflictRatio` 互斥规则不变。**Ascend950PR&950DT系列产品（`ascend950`）** 经 §8.1 CLI验证已加入允许列表，`ResourceConflictRatio` 与 `PMSampling` 在Ascend950PR&950DT系列产品仿真快速选项中可见；默认仿真命令由 `--aic-metrics=PipeUtilization` 变为 `--aic-metrics=ResourceConflictRatio`。详见 `docs/simulator-options-spec.md`。
- **修复standard-custom「运行样例」缺少算子名/平台** — `build.sh --run_example` 从**位置参数** `<算子> <模式> <pkg_mode>` 读取样例名与模式，而非从 `--ops`。缺失时脚本打印空的 `name:` / `mode:` 并回退到usage。现 `CannCommandStrategy.buildExampleCommand` 与 `AscendCommandStrategy` 一致地追加 `<算子> <模式> cust`，并在 `compileOption` 未带 `--soc` 时补全 `--soc`（经 `{soc_version}` 占位符）。
- **按算子自动选择run_example模式** — 通过扫描算子 `examples/` 目录（对齐build.sh布局，跳过 `experimental/`）检测样例模式（`eager` 与 `graph`）。全局 `executionMode` 设置仅在两种模式均存在时作为决胜项。文件名匹配默认 `^test_aclnn_.*\.cpp$` / `^test_geir_.*\.cpp$`，可通过 `eagerExamplePattern` / `graphExamplePattern` 覆盖。仅当运行脚本使用 `--run_example` 接口时才追加位置参数。
- **NPU调试launch.json自动适配** — 调试启动前，`launch.json` 目标在**所选算子自身**的 `build/` 目录下解析（而非工作区根 `build/`），使用插件默认名称（`test_aclnn_<算子>`、`<算子>`、graph二进制及build_example目标）。多算子选择取第一个；替换遗留的根 `build/` 占位符；无法解析目标时向用户告警。
- **异常检测Ascend950PR&950DT系列产品CMake模板修复** — CANN工程模板在生成时按SOC修补异常检测编译/链接标志：Ascend950PR&950DT系列产品仅 `-g`；其他系列产品保留 `--cce-enable-sanitizer` 与链接标志。仅SOC相关后缀使用占位符，共享选项（`-O2`、`--cce-fatobj-link`）保持字面量。
- **MindStudio Debug VSIX 1.0.9** — 内置调试扩展由1.0.8升级至1.0.9。

## 1.3.3 — 2026-06-15

本版本包含仿真分析修复、体验改进、部署修正与文档更新。

- **重置项目配置** — 命令注册到侧栏；清理工作区设置前提供中英文确认提示；重置后自动重载窗口；修复重复「取消」按钮。
- **欢迎页** — 重新设计欢迎面板布局与文案；欢迎页Webview标签图标从扩展品牌资源正确加载。
- **从Actions视图打开欢迎页** — Actions树新增侧栏命令分组与菜单项，可随时重新打开欢迎页。
- **命令面板** — 用户可见命令按产品名称分组（`%config.title%`）；仅用于侧栏/操作树的UI命令不再出现在命令面板中。
- **`.run` 部署** — 在 **Atlas A2系列产品** 与 **Ascend950PR&950DT系列产品** SOC（`ascend910b`、`ascend950` 等）重装 `.run` 包时追加 `--force`；Atlas A3系列产品（`ascend910_93`）行为不变。
- 仿真分析向 `msprof op simulator --soc-version` 传递**仿真器目录名**（如 `Ascend910B3`、`Ascend910C`、`Ascend950PR_9589`），不再传递CANN SOC标识 — 恢复1.3.2之前行为，与msopprof / CANN `tools/simulator` 目录一致。
- 仿真分析不再同时传递 `PipeUtilization` 与 `ResourceConflictRatio`；启用资源冲突比时仅传递 `ResourceConflictRatio`（及可选的 `PMSampling`），符合msprof互斥规则。
- 在 `docs/ascend-env-spec.md` §8.1补充 `--soc-version` 与SOC标识、spawn环境的规范说明；同步修订性能分析与Atlas A3系列产品/Ascend950PR&950DT系列产品环境文档。

## 1.3.2 — 2026-06-08

本版本强化Ascend950PR&950DT系列产品/Atlas A3系列产品芯片环境解析与命令行注入、标准自定义算子就地创建与genop脚手架、SOC设置与仿真/调试一致性，并改进设置迁移与稳定性。

- 在标准自定义算子集合内新建子算子时，直接在指定路径完成创建，不再提示「在当前窗口打开」，避免误识别为独立工程。
- 新建标准自定义算子时优先执行工程自带的 `build.sh --genop`；新增可配置项 **genOpCommand**（默认 `bash build.sh --genop={path}/{operatorname}`），失败或无输出时回退到插件模板。
- 标准自定义构建、调试、调优等流程统一通过脚本模板中的 `--ops={operatorNames}` 占位符注入算子名（兼容未迁移的旧脚本）。
- 集中Ascend系列检测：芯片名规范化、Atlas A3系列产品 `Ascend910_93xx` 识别、Atlas A2系列产品 Pro/Premium/901的 `dav-1001` 等。
- Atlas A3系列产品统一为CANN SOC `ascend910_93`（检测、告警示例与文档）；`Ascend910A` 归入910B族。
- 「SOC未检测到」告警中的 **SOC设置** 与齿轮 **项目配置** 一致，打开**工作区**作用域设置（避免在用户作用域填写却被解析器忽略）。
- 仿真分析向 `msprof op simulator --soc-version` 传递CANN SOC标识（如 `ascend910_93`），不再误用仿真器目录名（如 `Ascend910C`）。**已在1.3.3废止** — Atlas A2系列产品/Ascend950PR&950DT系列产品现场工具链不接受SOC标识作为 `--soc-version`；见 `docs/ascend-env-spec.md` §8.1。
- Ascend950PR&950DT系列产品/Atlas A3系列产品环境变量改为在**命令字符串**中显式 `export`（可审计、顺序可控）；标准自定义工程在生成CMake时写入 `SOC_VERSION`/`NPU_ARCH` 占位符及 `SUPPORT_*` 默认值，减少错误的环境注入。
- CANN与 `add_custom` 工程模板CMake占位符与Ascend950PR&950DT系列产品构建说明更新。
- NPU调试启动前自动将 `launch.json` 中的调试目标适配为 `build/<算子名>`（占位或缺失路径时更新；用户已配置的有效目标保留）。
- 一次性旧版设置迁移；运行时以VS Code工作区设置为准；监视主配置变更。
- 修复性能分析服务在VS Code中因默认日志路径权限导致的 **Error:OTHER**（显式 `--logPath`）。
- 恢复Dump tensor流程中的 `show_kernel_debug_data` 调用。
- 文档整合：`ascend-env-spec`、用户问题索引、集成指南等（无功能变更）。

## 1.3.1 — 2026-05-28

本版本面向Ascend950PR&950DT系列产品环境适配、标准自定义算子工作流修复、启动与安装包体积优化、输出面板体验改进及缺陷修复。

- 标准自定义工程构建时，扩展根据解析后的SoC注入芯片相关环境变量，生成的CMake不再固定为Atlas A3系列产品默认值。
- CANN工程模板支持Ascend950PR&950DT系列产品构建与仿真；**SoC版本**、**NPU架构** 可通过CMake参数（`-DSOC_VERSION=`、`-DNPU_ARCH=`）传入，未在命令行指定时也可通过环境变量作为后备。从扩展侧栏发起构建时会自动注入芯片环境变量。
- 当SoC配置或检测为Ascend950PR&950DT系列产品（`ascend950`）时，上板**性能调优**快捷选项显示 **PC采样**，替代 **Cache热力图**。
- **SoC版本**、**仿真器类型** 设置默认为空；运行时按工作区设置、全局环境变量（如 `SOC_VERSION`）或主机Ascend工具链检测依次解析。未设置仿真器类型时，仿真构建选用与解析SoC匹配的默认值。相关设置项说明已更新。
- SoC版本无法自动检测时（如 `asys` / `npu-smi` 不可用）显示警告通知。
- 编译后安装生成的 `.run` 包时自动追加 **`--force`**（Ascend Build部署及标准自定义上板/仿真调优前置步骤）。
- 标准自定义工程中，对选中的experimental算子自动追加 **`--experimental`**（Build、Run、UT测试、上板调优、仿真调优、Dump tensor及NPU调试预编译）。
- 标准自定义上板与仿真调优在 `msprof` 前自动部署已构建的 `.run` 包（默认插件流程无需手动部署）。
- NPU调试使用侧栏当前选中的算子。
- 将自动打开工程、调试扩展安装及侧栏刷新延后至激活完成后执行，加快扩展启动。
- 缩小扩展安装包体积（更精简的VSIX打包）。
- 未打开工作区时，新建工程在当前窗口打开，不再额外弹窗询问。
- 工具输出按命令类型分组到独立通道（如 `Op Dev Tools: compile`），同类型命令复用同一通道。
- 修复性能分析Insight视图中 **Detail**、**Cache** 页签打开报告时无内容的问题。
- 改进同步Op Devtools工作区设置时对VS Code `settings.json` 的写入方式（点分键写入，避免覆盖同步期间的用户编辑）。

## 2026-05-15

- 侧栏、Webview面板、Insight视图全面适配VS Code颜色主题（浅色、深色、高对比度），扩展运行过程中切换主题时同步生效。
- 扩展界面与提示文案随VS Code显示语言切换，支持 **英语** 与 **简体中文（zh-cn）**。
- 支持将 **异常检测（Sanitizer）** 与 **性能调优（Profiling）** 选项存为工作区默认，配合 **不再提示** 减少启动后重复配置。
- 侧栏操作与识别到的算子工程类型对齐；原先在独立面板中打开的工作流统一到侧栏。
- 编译、调试等任务支持排队执行；**全部停止** 可终止进行中任务；新手引导与快捷选项面板的 **不再提示** 按工作区记忆。
- 异常检测结果采用树形分组并支持跳转源码；修复启动后结果列表不完整或陈旧的问题。
- 性能调优结果视图改版以便快速浏览；修复工程路径与已保存选项未正确应用或匹配的问题。
- **Op Devtools** 设置项与VS Code其他扩展一致，支持 **用户** / **工作区** 作用域。欢迎引导演示视频由GIF改为MP4。

## 2026-04-20

- 标准自定义算子仿真分析适配芯片配置（适配Ascend950PR&950DT系列产品环境）。
- 支持工程配置中芯片类型自动根据环境生成（适配Ascend950PR&950DT系列产品环境）。

## 2026-03-27

- 基于printf / dumptensor的数据落盘能力，提供落盘数据可视化，以及dumptensor数据的精度对比能力。
- 支持标准自定义算子的单元测试（UT）能力。
- 支持在工程配置中配置芯片类型。

## 2026-03-13

- 首页添加用户使用向导，方便新手使用。
- 环境变量配置与工程配置合并。
- 「文件」菜单支持新建算子工程。
- 「停止」功能优化，简化用户开启新任务的操作。

## 2026-02-06

- 异常检测跳转至代码处时，鼠标悬停可提示错误信息。
- 去掉pyasc配置项；用户点击运行时执行当前激活编辑器中的Python文件（若无激活文件则不允许执行、调优等操作）。
- 调试功能按钮支持防呆处理。
- 调试、异常检测、性能调优等操作前的编译命令行支持编辑。

## 2026-01-22

- 支持打开存量工程。
- 支持pyasc算子与标准自定义算子的新建、编译、调试、异常检测和调优。

## 2026-01-15

- 支持三种 `<<<>>>` 场景的算子新建。
- 异常检测、性能调优体验优化。
- 异常检测与性能调优结果支持下载与复制路径。

## 2026-01-09

- Bug修复。

## 2025-12-30

- 支持新建工程（当前支持创建 `<<<>>>` 场景工程）。
- 支持 `<<<>>>` 工程的编译、调试、调优。
- 集成到CodeArts IDE。
