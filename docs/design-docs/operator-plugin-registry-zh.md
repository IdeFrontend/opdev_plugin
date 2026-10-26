# 算子插件注册表——当前实现与缺口

`plugin/src` 如何通过 **`OperatorPluginRegistry`**（`domain/plugins/`）路由算子类型与项目结构行为。

**相关：** [`operator-behavior-specification-zh.md`](./operator-behavior-specification-zh.md)（用户可见动作）、[`new-project-generation-specification-zh.md`](./new-project-generation-specification-zh.md)、[`build-integration-zh.md`](./build-integration-zh.md)、[`ascend-env-spec-zh.md`](./ascend-env-spec-zh.md)。

---

## 两个维度

| 维度 | 类型 | 注册表 API | 示例 |
|------|------|--------------|----------|
| **运行时 `op_type`** | `ascend`、`cann`、`pyasc`、`triton` | `registerOpPlugin` → `getOpPlugin(opType)` | 命令策略、路径、生成器、`buildBehavior` |
| **检测 `OperatorProjectType`** | `standard-custom`、`ascend-c`、`torch-library`、`pyasc`、`triton`、… | `registerDetector` → `detectProject(dir)` | 侧边栏能力、目录菜单 |

`viewIdToProjectType` / 存储的 `project_type` 可能与 `op_type` 不同（例如 STANDARD_CUSTOM 为脚手架存储 `ascend`）。见行为规范。

**Triton：** 仅当 `op-devtools.operatorSupport.triton` 为 true 时注册（`domain/plugins/index.ts`）。

---

## 注册表当前实现所管辖的内容

在 `extension.ts` 激活时通过 `registerOperatorPlugins()` 注册：

| 插件 / 检测器 | `op_type` | 检测 | 说明 |
|-------------------|-----------|-------------|--------|
| `StandardCustomDetector` | — | `standard-custom` | 检测器顺序中的第一个 |
| `TorchLibraryDetector` | — | `torch-library` | |
| `TritonPlugin`（可选） | `triton` | `triton` | 功能开关 |
| `PyAscPlugin` | `pyasc` | `pyasc` | |
| `AscendPlugin` | `ascend` | `ascend-c` | |
| `CannPlugin` | `cann` | — | 无检测器 |

**经注册表路由的事项：**

| 关注点 | 实现 |
|---------|----------------|
| 默认路径 | `OperatorPluginRegistry.getDefaultPaths(op)` → `{ targetOpFile, targetExampleFile }` |
| 项目生成器 | `OpGeneratorFactory.getGenerator` → `getProjectGenerator` |
| 项目检测 | `OperatorProjectDetector` → `OperatorPluginRegistry.detectProject` |
| 初始配置脚本（大部分） | `ProjectService.createOpsByPrototype` → `ConfigService.ensureOpDevtoolsSettingsSeeded` → `getInitialConfigScripts` / `getDefaultPaths` |
| 编译/运行/仿真/上板预检 | `BuildService` → `opPlugin.buildBehavior` |
| 动作树能力 | `OperatorPluginRegistry.getBuildBehaviorByProjectType` |

---

## 仍在注册表之外的内容

| 位置 | 残留内容 | 对新增类型的影响 |
|----------|--------------|----------------------|
| **`CommandStrategyFactory`** | `ascend` / `cann` / `pyasc` / `triton` 策略类 | 仍需策略类 + 工厂映射条目 |
| **`folder-context-menu-service.ts`** | 用于标记为算子、模板、告警的大型 `switch (detection.projectType)` | 新增**项目类型**时需改动菜单路径 |
| **`config-service.ts`** | 分区默认值（sanitizer、上板、仿真、…）在 `ensureOpDevtoolsSettingsSeeded` 中由插件的 `getInitialConfigScripts` / `getDefaultPaths` 组装；`ut_test` 使用插件的 `scripts.utTestScript` | 默认值随插件迁移；分区 DAO 保持设置原生 |
| **`command.ts`** | 所有命令经 `CommandStrategyFactory.getStrategy(op_type)` | 在策略归插件所有之前预期如此 |

当前新增**一个 `op_type`**：实现 `*.plugin.ts`（`IOperatorPlugin` + 可选 `IProjectDetector`），在 `index.ts` 中注册，新增 **`command-strategy/<type>-strategy.ts`** + 工厂注册，并补充测试。

在已有 `op_type` 下新增**项目类型**：通常只需检测器 + `folder-context-menu-service` 分支 + `buildBehavior` 标志。

---

## `IOperatorPlugin` 接口面（摘要）

生产中使用的关键钩子：

- `getDefaultPaths(op)` —— 部署/运行目标、脚本路径  
- `getInitialConfigScripts(record, workspaceRoot)` —— 脚本包（`script`、调试脚本、`utTestScript`、example、sanitizer、上板、仿真），由 `ConfigService.ensureOpDevtoolsSettingsSeeded` 消费  
- `createProjectGenerator(...)` —— 模板解压 / 脚手架  
- `buildBehavior` —— `requiresBuildBeforeAnalysis`、`requiresActiveFileCheck`、`supportsSanitizer`、`supportsSimulate`、`supportsOnBoard`、CPU/NPU 调试标志  
- `getSpawnEnvExportKeys()` —— 该 op_type 可导出 `SOC_VERSION` / `NPU_ARCH` 中的哪些；由 `OperatorPluginRegistry.filterSpawnEnv()` 过滤（project_type 可强制全部不导出）  
- `patchGeneratedProject(opPath, params)` —— 解压后的模板修补（`AscendPlugin` → cmake 中的 ACLNN `SUPPORT_*`）  
- `detectProject(dir)` —— 当插件同时实现 `IProjectDetector` 时

接口：`domain/plugins/operator-plugin.interface.ts`、`project-detector.interface.ts`、`abstract-operator-plugin.ts`。

---

## 命令策略（并行体系）

运行时 shell 命令由 **`CommandStrategyFactory`**（`domain/services/command-strategy/`）构建，而非由插件注册表直接构建。插件通过 `ConfigService` 上按分区的类型化 DAO 工厂（`getBuildOpConfig()` / `getBuildExampleConfig()` / `getUtTestConfig()` / `getSimulateConfig(projectPath)` / `getOnBoardConfig(projectPath)` / `getSanitizerConfig(projectPath, op)`）和 `buildBehavior` 间接影响命令。

注册表本身**不**分发命令——`CommandStrategyFactory` 负责分发；两套体系共享 `buildBehavior` 和设置原生的分区 DAO。

---

## 检测顺序

`domain/plugins/index.ts` 中的顺序很重要：

1. `StandardCustomDetector`  
2. `TorchLibraryDetector`  
3. `TritonPlugin`（若启用）  
4. `PyAscPlugin`  
5. `AscendPlugin`  

首个命中者生效。

---

## 源文件

| 路径 | 作用 |
|------|------|
| `domain/plugins/index.ts` | 注册 |
| `domain/plugins/operator-plugin.registry.ts` | 注册表 |
| `domain/plugins/*.plugin.ts`、`*.detector.ts` | 按类型的行为 |
| `domain/services/operator-project-detector.ts` | 轻量检测封装 |
| `domain/services/command-strategy/factory.ts` | 策略分发 |
| `service/build-service.ts` | `buildBehavior` 消费方 |
| `service/folder-context-menu-service.ts` | 残留的项目类型分支 |

---

## 测试

- 插件注册表 / 检测：在 `plugin/src/__tests__` 中搜索 `OperatorPluginRegistry`、`StandardCustom`、`Triton`。  
- 命令：`command-strategy` 相关规格、`operator-spawn-env.spec.ts`。
