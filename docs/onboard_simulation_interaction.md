# 插件「上板分析 / 仿真分析」交互说明

> 适用范围：Ascend C Toolkits插件Operate侧边栏的**性能调优**功能——仿真分析（simulation）与上板分析（onboard）。
> 仿真工具为 `npu-emulate`，其 `collect` 子命令已在Ascend 950环境启用并作为默认仿真工具；可通过设置切换为msprof。Ascend 950环境的npu-compute / npu-emulate工具说明见第五、六节。

**术语约定：**

- 命令行模板：插件为不同算子类型生成工程命令。支持标准自定义算子工程和PyAsc工程。

**相关文档：**

- [simulator-options-spec.md](./simulator-options-spec.md)：仿真快捷选项与各soc_series支持的指标范围说明（英文）
- [run-integration.md](./run-integration.md)：「运行算子」功能，与性能分析共用执行栈
- [ascend-env-spec.md](./ascend-env-spec.md)：soc_series解析与spawn环境
- [workspace-settings.md](./workspace-settings.md)：`op-devtools.performanceTuning.*` 全部配置项
- npu-compute与npu-emulate的完整工具手册未随本仓库分发，本文第五、六节收录了其关键命令与参数说明

---

## 一、功能概览

插件本身不携带运行时，只负责**编排**：按工程类型完成前置编译/部署 → 组装分析命令 → 在算子环境中执行 → 在VS Code树视图（性能结果树）中展示报告。

| 分层 | 职责 |
|------|------|
| CLI工具 | Ascend 950环境默认使用 `npu-compute`（上板）/ `npu-emulate`（仿真）；其他环境以及Ascend 950切换工具后使用msprof：仿真 `msprof op simulator`、上板 `msprof op`（均在算子环境中运行） |
| 插件 | 可选的前置编译/示例编译/部署（依工程类型）、命令组装、Shell执行 |
| 配置 | workspace设置（`op-devtools.performanceTuning.*`）；`.vscode/cache.json` 的 `fileMapLists` 记录外部报告路径 |
| 结果UI | 树视图 `opdevtoolsPerformanceResultsTree`（报告 → 文件夹/文件叶子节点） |
| 查看器 | CSV编辑器、Insight查看器（bin/json）、profiling-report查看器（rep/ncrep/npu-rep） |

### 工作台布局与数据流

```mermaid
flowchart LR
  subgraph Sidebar["Operate 侧边栏"]
    FlowTree["操作树<br/>性能调优 → 仿真分析 / 上板分析"]
    ResultsTree["性能结果树<br/>报告列表 + 文件"]
  end
  subgraph Panels["可选配置面板"]
    SimOpts["仿真选项 webview<br/>options-simulator"]
    BoardOpts["上板选项 webview<br/>options-on-board"]
  end
  subgraph Runtime["算子环境"]
    CliTool["分析命令<br/>npu-compute / npu-emulate（Ascend 950 默认）<br/>msprof op（全环境通用）"]
    Opprof["workspaceRoot / ideConfig / opprof / runId"]
  end

  SimOpts --> FlowTree
  BoardOpts --> FlowTree
  FlowTree -->|组装并执行命令| CliTool
  CliTool -->|写出报告| Opprof
  Opprof -->|扫描发现| ResultsTree
```

---

## 二、入口与msprof分析流程（全环境通用）

> **工具如何选择**：Ascend 950环境默认（推荐）使用npu-compute（上板）/ npu-emulate（仿真），详见第五节；msprof全环境可用，是Ascend 910C、Ascend 910B等其他环境唯一支持的分析工具，Ascend 950环境也可通过工具开关切换为msprof，流程见本节。

### 1. 入口

Operate侧边栏 → **性能调优（Performance tuning）** 分组（`nodeId === 'power'`）下两个节点：

| 操作 | 树节点 | 队列类型 | 入口方法 |
|------|--------|----------|----------|
| 仿真分析 | `simulation` | `simulation` | `taskMethods.startSimulate` → `BuildService.startSimulate` |
| 上板分析 | `onboard` | `onboard` | `taskMethods.startOnBoard` → `BuildService.startOnBoard` |

- 经 `dispatchSimulator` / `dispatchOnBoard`（`task-method-dispatch.ts`）派发到**算子串行队列**。
- 对应命令：`sidebar.simulation`、`sidebar.onboard`（命令前缀以flavor.json的 `commandPrefix` 为准）。
- 齿轮图标可打开workspace设置或快捷选项面板。

### 2. 执行步骤

1. **点击节点**：若 `simulation.showQuickOptions` / `onBoard.showQuickOptions` 未设为 `false`，先弹出**选项webview**（仿真 `options-simulator`、上板 `options-on-board`），配置通过 `getSimulateOptions/saveSimulateOptions`（上板同理）读写，持久化到workspace设置 `op-devtools.*`，确认后调用 `startSimulate`/`startOnBoard` 并关闭编辑器。
2. **前置编译/部署**（依工程插件的 `buildBehavior.requiresBuildBeforeAnalysis`）：
   - AscendC工程：先编译算子工程（标准自定义算子还要编译示例并部署 `.run` 包）；
   - PyAsc / Triton：无编译步骤，但要求当前活动编辑器为 `.py` 文件（PyAsc会把 `python3 <相对路径>` 写入deploy目标）。仿真活动文件检查失败会**抛错**，上板则**提前返回**（二者行为不对称）。
3. **命令生成**：命令门面 `getSimulateCommand` / `getOnBoardCommand` → `CommandStrategyFactory.getStrategy(op_type)`（按算子类型选择命令行模板）→ `ProfilerFactory` 生成msprof命令，拼接CANN环境source与 `cd` 命令。
4. **执行**：仿真 `msprof op simulator`、上板 `msprof op`，输出统一落到 **`<workspaceRoot>/<ideDir>/opprof/<runId>`**（所有算子共用这一个根目录，每次运行建一个子目录）。
5. **输出通道**：仿真写 `Ascend C Toolkits: simulate`，上板写 `Ascend C Toolkits: onboard`；**前置编译步骤的全部输出也写入同一通道**（不写 `compile` 通道），通道内容跨运行追加。
6. **成功后**：成功提示 + `flashPerformanceRunData`（`refreshPerformanceReports({ focusIfNew: true })`）刷新性能结果树，可自动聚焦并展开最新报告。

### 交互时序图

下面的时序图说明msprof流程中各模块的分工和执行顺序。

```mermaid
sequenceDiagram
  participant U as 用户
  participant P as 插件（操作树/队列/编译/命令组装）
  participant T as msprof（算子环境）
  participant R as 性能结果树

  U->>P: 点击 仿真分析 / 上板分析
  P->>U: 弹出选项 webview（可跳过）
  U->>P: 确认配置
  P->>P: 前置编译/部署（按工程类型）
  P->>T: 执行 msprof op [simulator]
  T-->>P: 报告写入 opprof/<runId>
  P->>R: 刷新并聚焦最新报告
```

### 3. 结果树浏览

- 性能结果树是**独立视图** `opdevtoolsPerformanceResultsTree`，报告行只出现在这里，不在 `power` 节点下。
- 数据来源：扫描opprof根目录的子目录 + `cache.json` 中“添加可视化”的外部路径（键为 `simulate_<path>` / `onboard_<path>`）。
- 无报告时显示单个空占位行。
- **标题栏操作**：添加可视化、按时间排序、仅看标记、刷新结果（排序只在内存中完成，不重新扫描磁盘）。
- **报告行操作**：复制（拼接报告下所有文件内容到剪贴板）、下载（打zip）、标记/取消标记。
- 无文件系统watcher/轮询，手动刷新以一次完整快照替换当前列表，磁盘上已删除的报告/文件会从树中消失。

### 4. 文件打开方式

| 扩展名 | 处理 |
|--------|------|
| `csv` | `viewService.openCsvFile`（CSV编辑器） |
| `bin` / `json` | `viewService.openInsight`（Insight数据查看器面板） |
| `rep` / `ncrep` | `viewService.openProfilingReport`（profiling-report面板） |

扫描仅纳入小写扩展名：`csv`、`bin`、`json`、`rep`、`ncrep`、`npu-rep`；空目录分支会被裁剪。

### 报告的发现与打开方式

```mermaid
flowchart TD
  Refresh["手动刷新 / flashPerformanceRunData"] --> Scan["扫描 opprof 根目录子目录"]
  Refresh --> Cache["读取 cache.json 的 fileMapLists<br/>(simulate / on_board 外部路径)"]
  Scan --> Merge["合并快照 + 标记(marked_performance_records)<br/>内存排序（默认时间倒序）"]
  Cache --> Merge
  Merge --> Tree["性能结果树：报告行 → 文件夹 → 文件叶子"]
  Tree --> Click{"点击文件扩展名"}
  Click -->|csv| Csv["CSV 编辑器<br/>openCsvFile"]
  Click -->|bin / json| Insight["Insight 数据查看器<br/>openInsight"]
  Click -->|rep / ncrep / npu-rep| Panel["profiling-report 面板<br/>openProfilingReport"]
```

---

## 三、仿真与上板的关键差异

| 维度 | 仿真分析 | 上板分析 |
|------|----------|----------|
| CLI | `msprof op simulator --soc-version=<仿真器目录> --output=.../opprof --aic-metrics=... <target>` | `msprof op --output=.../opprof --aic-metrics=... <target>`（不带 `--soc-version`） |
| 环境 | 必须传**仿真器目录名**（`$ASCEND_HOME_PATH/tools/simulator/` 下与当前环境对应的目录名，以实际安装的CANN版本为准），**不是** CANN slug（如 `ascend950`） | 真实NPU硬件；soc_series取自 `resolveAscendEnv({ isSimulator: false })`；需通过NPU环境检查 |
| 基础指标 | `PipeUtilization`（默认始终采集） | 依soc_series矩阵选择；Ascend 950使用 `PCSampling`（其他环境使用 `MemoryDetail`） |
| 可选指标 | `ResourceConflictRatio`（默认开，与基础项**互斥**，开启后替换 `PipeUtilization`）；`PMSampling`（可追加，如 `ResourceConflictRatio,PMSampling`） | 见上板指标矩阵（`isAscendA5ProfilerCannSoc()` 区分Ascend 950与其他环境） |
| 指标准入 | 可选指标必须经真机CLI验证后加入 `SIMULATOR_OPTIONAL_METRIC_SOCS` 白名单才在UI放行；陈旧workspace值在非白名单soc_series上不会产生该指标 | 上板指标随soc_series矩阵切换 |
| 配置DAO | `ConfigService.getSimulateConfig(projectPath)` | `ConfigService.getOnBoardConfig(projectPath)` |
| 目标二进制 | ascend策略取 `exampleBuildConfig.targetFile`（回退默认 `build/test_aclnn_<op>`）；cann/pyasc/triton策略取deploy键 `deployCommandOrRunCommand`（回退 `build_out/*.run` 等） | 同左（统一调用 `strategy.getProfilerTargetFile`） |

### soc_series白名单机制（GC-22）

msopprof会按 `--soc-version` 校验 `--aic-metrics`，平台不支持的指标直接报错 `Unexpected argument … maybe in wrong soc platform`。因此：

| 环境 | soc_version（CANN slug） | PipeUtilization | ResourceConflictRatio | PMSampling |
|------|--------------------------|-----------------|-----------------------|------------|
| Ascend 950 | `ascend950` | 支持（基础） | **已验证支持** | **已验证支持** |
| Ascend 910C | `ascend910_93` | 支持（基础） | **明确禁用** | 未验证 |
| Ascend 910B | `ascend910b` | 支持（基础） | 未验证 | 未验证 |

仿真命令的 `--soc-version` 不填写上表中的soc_version值，而需填写 `$ASCEND_HOME_PATH/tools/simulator/` 下与环境对应的仿真器目录名，具体名称以实际安装的CANN版本为准。

指标从“未验证”升级为“支持”必须有真实 `msprof op simulator` 跑通记录（退出码0）并随PR留存CANN版本、目标算子等信息。

---

## 四、目标二进制与工程类型

| 工程上下文 | 存储的 `project_type` | 算子行 `op_type` | 说明 |
|------------|----------------------|------------------|------|
| CANN | `cann` | `cann` | 示例编译后，将 `deployCommandOrRunCommand` 设为可执行产物；从 `<op>/build` 目录运行 |
| 标准自定义 | `ascend` | `cann`（集合扫描算子）/ `ascend`（插件创建） | 需示例编译 + `.run` 包部署；多选算子时Run/分析受限 |
| Ascend C / Torch library（检测型） | 打开工程后存为 `cann` | 多为 `cann` | 使用CANN策略 |
| PyAsc | `pyasc` | `pyasc` | 活动 `.py` 门禁；`python3 <file>` 包裹msprof |
| Triton | `triton`（需 `op-devtools.operatorSupport.triton`） | `triton` | 同PyAsc模型；执行前探测Python依赖；插件能力位不含仿真/上板时树中隐藏 |

注意区分两个字段：**`project_type`** 决定配置行（`build_op` / `build_example`）与UI门禁；**`op_type`** 决定Shell命令行模板。生成命令时始终以算子记录的 `op_type` 为准。

---

## 五、Ascend 950环境的性能分析工具（npu-compute与npu-emulate）

> 以下内容基于 `ascend-c-toolkit` 分支。该分支已提供npu-compute（上板）和npu-emulate（仿真）的工具开关、「数据采集配置」弹窗、命令拼装和报告展示，在Ascend 950（ascend950）环境中默认启用；也可以通过工具开关改用msprof。

### 工具选择逻辑

```mermaid
flowchart TD
  Click["点击 上板分析 / 仿真分析"] --> IsA5{"解析 soc_series<br/>是否为 Ascend 950（ascend950）？"}
  IsA5 -->|否| Old["使用 msprof：msprof op [simulator]"]
  IsA5 -->|是| ToolCfg{"工具开关设置<br/>onBoard.tool / simulation.tool"}
  ToolCfg -->|msprof| Old
  ToolCfg -->|npu-compute / npu-emulate（Ascend 950 默认）| Dialog["弹出「数据采集配置」弹窗<br/>预选对应 Collection type"]
  Dialog --> Confirm{"用户确认"}
  Confirm -->|取消| Stop["结束，不执行"]
  Confirm -->|确认| Compile["先按现有逻辑编译 + 部署"]
  Compile --> NewTool{"Collection type"}
  NewTool -->|上板| NC["npu-compute --section ... --export result.npu-rep"]
  NewTool -->|仿真| NS["npu-emulate collect --output result.npu-rep <产物>"]
  NC --> Report["报告落入 opprof/<runId>（.npu-rep）"]
  NS --> Report
  Old --> Report
  Report --> AutoOpen["openProfilingReport 自动打开 + 刷新结果树"]
```

**设计要点**（上板与仿真均支持）：

1. **两个工具开关**：`op-devtools.performanceTuning.onBoard.tool`（`npu-compute`/`msprof`）、`simulation.tool`（`npu-emulate`/`msprof`）；未配置时，Ascend 950默认使用npu-compute / npu-emulate，其他环境默认使用msprof；非Ascend 950环境只能使用msprof。
2. **统一「数据采集配置」弹窗**：
   - 顶部Collection type切换（仿真/上板），从哪个入口打开就预选对应项；
   - Common面板：Output File文件选择、Force Overwrite、Target Processes（固定All）、Replay Mode（固定Application）、Application Replay Buffer（固定File）、Application Replay Mode（固定Balanced）、command Line文本域；
   - Metrics面板：section/set下拉选择（非radio）、过滤输入、Name/Description表格；选择section与set时会校验二者是否一致；该面板仅在选择上板（npu-compute）时显示——仿真collect暂不支持任何指标参数。
   - **command Line文本域为最终执行命令的唯一依据**（结构化选择只用于自动同步文本，用户可再手改，插件不反解析用户shell文本）。
   - 约束：所有section均可选（Ascend 950的npu-compute已全部支持）；detailed、hccl、roofline三个set仍可见不可选（无展开定义）。
3. **执行流程**：确认后**先按现有逻辑编译**，再由所选工具执行；npu-compute把所选set展开为多个 `--section <id>`（不用逗号/空格拼接，不加 `--set`）；npu-emulate通过 `collect --output <opprofRunDir>/result.npu-rep <产物路径>` 一次完成仿真和报告导出；报告同样输出到opprof目录，**保留 `.npu-rep` 扩展名**；成功后调用 `openProfilingReport` 自动打开，并刷新结果树（不重复打开）。
4. **报告类型区分**：报告目录中含 `.rep` 或 `.npu-rep` 文件时，用ProfilingReportPanel打开；只含bin/json/csv文件时，用Insight或CSV打开。插件不需要判断报告来自哪个工具。

**`ascend-c-toolkit` 分支上的实现情况**：

- 上板分析：`package.json` 已提供 `performanceTuning.onBoard.tool` / `performanceTuning.simulation.tool` 两个开关；Ascend 950（ascend950）环境默认使用 `npu-compute`，点击上板分析会弹出「数据采集配置」面板（`web/src/views/panels/data-collection-config/`），实现见 `ConfigService.shouldUseNewOnBoardTool()`、`buildNpuComputeCommand()`。
- 仿真分析：Ascend 950（ascend950）环境默认使用 `npu-emulate`，点击仿真分析弹出同一个「数据采集配置」面板（Metrics面板隐藏）；确认后先编译，再执行 `npu-emulate collect --output <opprofRunDir>/result.npu-rep <产物路径>`，报告自动打开；实现见 `ConfigService.shouldUseNewSimulationTool()`、`buildNpuEmulateCommand()`。设置 `simulation.tool=msprof` 可改用第二、三节描述的msprof流程。

---

## 六、npu-compute与npu-emulate工具简介

### npu-compute（上板分析工具）

- **原理**：经 `libnpu-compute.so` 注入（环境变量 `ACL_API_INJECTION`）目标进程，基于ACLPTI做Kernel重放，多轮采集不同PMU计数事件，退出后打包为 `.npu-rep`。定位与msprof类似，偏向底层的PMU采集与Kernel重放。
- **前置条件**：CPU架构与包一致；glibc ≥ 2.34；libstdc++ 含 `GLIBCXX_3.4.29`（约gcc 11+）；已source匹配版本CANN。**切勿升级系统glibc**。
- **命令格式**：`npu-compute [选项] 目标程序 [程序参数]`
- **常用参数**：
  - `--section <id>`：采集指标，**多个必须重复写**（逗号/空格均不合法）；当前Ascend 950版本支持8个，且弹窗中全部可选（与 `shared/data-collection-config.ts` 的 `DATA_COLLECTION_SECTIONS` 一致）：`PipeUtilization`、`Pipeline`、`L2Cache`、`Memory`、`MemoryL0`、`MemoryUB`、`ArithmeticUtilization`、`ResourceConflictRatio`；
  - `--list-sections`：列出支持的section；
  - `--replay-mode kernel`：kernel重放模式；
  - `-o/--export`：报告输出路径（`.npu-rep` 结尾视为文件，已存在目录则自动命名，不给则当前目录生成 `report_<时间戳>_<随机>.npu-rep`）；
  - `-i/--import`：解包 `.npu-rep`。
- **注意**：`HardwareInfo` 默认自动采集，不能作为section；不支持嵌套采集；信号会转发给目标程序；属实验原型，每进程只重放一次Kernel启动。

### npu-emulate（仿真分析工具）

- **定位**：SoC级芯片仿真，与板上二进制兼容；同一kernel可在仿真器与真实芯片运行。支持**精度仿真**（bit级结果）与**性能仿真**（指令流水图/IPC/roofline）。
- **限制**：仅支持Linux与CANN环境（Windows无法运行仿真）；处理器为Ascend 950；支持aarch64与x86_64架构。
- **插件使用的命令**：`npu-emulate collect --output <报告文件路径> <编译产物路径>`——运行编译产物完成SoC仿真，并直接导出 `.npu-rep` 报告；当前不支持指标/section类附加参数。
- **安装要点**：随CANN分发；使用仓库代码时须打wheel并 `pip install dist/*.whl --upgrade -t ${install_path}/python/site-packages/` **覆盖安装**，否则会被CANN自带版本优先加载。

---

## 七、关键代码文件

| 模块 | 路径 |
|------|------|
| 仿真/上板编排 | `plugin/src/service/build-service.ts`（`startSimulate` / `startOnBoard`） |
| 任务入口 | `plugin/src/controller/task-controller.ts` |
| 队列派发 | `plugin/src/helpers/task-method-dispatch.ts` |
| 命令门面 | `plugin/src/domain/services/command.ts`（`getSimulateCommand` / `getOnBoardCommand`） |
| msprof策略 | `plugin/src/domain/services/profiler-service.ts`（`SimulatorStrategy` / `OnBoardStrategy`） |
| 按op_type命令行模板 | `plugin/src/domain/services/command-strategy/*-strategy.ts` |
| 设置合并 / 各section DAO | `plugin/src/service/config-service.ts` |
| 报告磁盘扫描 | `plugin/src/core/performance/performance-run-data.ts` |
| 结果树UI与状态 | `plugin/src/class/operate-tree-provider.ts` |
| 复制/打包/diff | `plugin/src/controller/performance-data-controller.ts` |
| CSV / Insight / profiling打开 | `plugin/src/service/view-service.ts`、`plugin/src/class/profiling-report-panel.ts` |
| 选项webview | `web/src/views/panels/options-simulator/`、`web/src/views/panels/options-on-board/` |
| Ascend 950/仿真指标矩阵 | `shared/msprof-onboard-env.ts`、`shared/msprof-simulator-metrics.ts`、`plugin/src/domain/utils/ascend-util.ts` |

---

## 八、常见问题排查

- **仿真报 `maybe in wrong soc platform`**：`--aic-metrics` 与 `--soc-version` 平台不匹配。确认未在Ascend 910C环境启用 `ResourceConflictRatio`；确认 `--soc-version` 传的是仿真器目录名而非slug。
- **上板操作被环境拦截/提示切换NPU环境**：上板属于NPU必需操作，非NPU环境点击会弹“请切换至NPU环境”模态框；请在环境列表切换NPU环境后再执行。
- **运行后侧边栏没有报告**：确认命令成功退出且报告落在扫描根 `<workspaceRoot>/<ideDir>/opprof/`；点击结果树标题栏刷新；注意覆盖同名runId不会被识别为“新报告”。
- **PyAsc分析直接返回/报活动文件错误**：打开一个 `.py` 文件再执行，或使用文件夹右键菜单（会先更新deploy目标）。
- **找不到分析目标二进制**：检查workspace设置 `compileAndDeploy.buildConfig.deployCommandOrRunCommand`（运行/cann系）或 `exampleBuildConfig.targetFile`（ascend系性能分析）。
- **qemu段错误（signal 11）**：通常是x86_64主机运行aarch64二进制的架构不匹配，需在匹配硬件上运行或同环境重新编译。
