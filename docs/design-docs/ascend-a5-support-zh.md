# Ascend950PR&950DT 系列产品支持

本文档是 Mind Studio / 算子 VS Code 扩展的 **Ascend950PR&950DT 专项指南**。它列出规范字符串、插件当前在 Ascend950PR&950DT 系列硬件上的行为、如何验证行为，以及已知缺口。

**权威环境解析**（优先级、spawn 环境、占位符、生命周期）见 **`design-docs/ascend-env-spec.md`**。关于「SOC / 仿真器 / NPU 架构如何选定」请先阅读该文档；本文件只覆盖该契约之上的 **Ascend950PR&950DT 特有取值与行为**。

**Atlas A3 系列与 Ascend950PR&950DT 系列的行为划分**（详细矩阵）：**`design-docs/review-a3-a5-environment-support.md`**。

Ascend950PR&950DT 系列**没有独立的产品模式**。对它的支持意味着：插件针对 Ascend950PR&950DT 系列（`ascend950`）目标，一致地使用正确的 **CANN SOC 标识**、**仿真器目录**、**`NPU_ARCH`**、**主机检测**子串以及**上板性能分析器**指标矩阵。

---

## 1. 规范的 Ascend950PR&950DT 系列字符串

共享常量：`shared/cann-env-constants.ts`。检测与映射：`plugin/src/domain/utils/ascend-util.ts`。

| 概念 | 常量 / 取值 | 用途 |
|---------|------------------|----------|
| CANN SOC 标识 | `ascend950`（`CANN_SOC_ASCEND_950`） | `SOC_VERSION`（非仿真构建）、`{soc_version}`、`build.sh --soc=` |
| NPU 架构 | `dav-3510`（`NPU_ARCH_DAV_3510`） | Spawn `NPU_ARCH`、cmake `-DNPU_ARCH=` |
| 默认仿真器目录 | `Ascend950PR_9589`（`SIMULATOR_ASCEND_950PR_9589`） | 仿真构建时的 spawn `SOC_VERSION`、`{simulator_type}`、`msprof op simulator --soc-version` |
| Ascend950PR&950DT 系列性能分析器 SOC 检查 | `isAscendA5ProfilerCannSoc()` → 仅对归一化后的 `ascend950` 为 true | 上板 `msprof op` aic-metrics 矩阵（`shared/msprof-onboard-env.ts`） |

**三个名字（不要混淆）：**

| 名字 | Ascend950PR&950DT 示例 | 作用 |
|------|------------|------|
| `SOC_VERSION` | `ascend950` | CANN 打包 / Ascend `build.sh --soc=` |
| `SIMULATOR_TYPE` | `Ascend950PR_9589` | `$ASCEND_HOME_PATH/tools/simulator/<name>/lib` 下的目录 |
| `NPU_ARCH` | `dav-3510` | AscendC `--npu-arch` |

当工作区把 **`performanceTuning.simulation.simulatorType`** 设为 `Ascend950PR_9589`（[`workspace-settings.md`](./workspace-settings-zh.md)）时，`resolveAscendEnv` 会为该次仿真运行**推导**出 `SOC_VERSION=ascend950` 和 `NPU_ARCH=dav-3510`，使 SOC 与仿真器不会不一致（见 [`ascend-env-spec.md`](./ascend-env-spec-zh.md) §7）。

---

## 2. 实现状态（当前代码树）

### 2.1 已实现

| 领域 | 行为 |
|------|----------|
| **单一解析器** | `ascend-util.ts` 中的 `resolveAscendEnv` / `resolveAscendEnvForOperatorCommand`；spawn 环境、`{soc_version}` / `{simulator_type}`、性能分析器和构建路径在每个命令上共享同一次解析。 |
| **主机检测** | 惰性 `asys` / `npu-smi`；按 [`ascend-env-spec.md`](./ascend-env-spec-zh.md) §1 进行 Chip Name → 系列 → 标识映射（`Ascend950*` → Ascend950PR&950DT 系列 / `ascend950`）。 |
| **由 SOC 推导 NPU 架构** | `getNpuArchForCannSoc('ascend950')` → `dav-3510`；检测到 Pro/Premium/901 芯片时 → Atlas A2 系列标识 + `dav-1001`。 |
| **SOC ↔ 仿真器对照表** | `ascend950` ↔ `Ascend950PR_9589`；反向通过 `simulatorTypeToCannSoc`（仅系列档案表）。 |
| **模板 / 新算子** | `ascend.plugin.ts`、`abstract-operator-plugin.ts` 使用 `{soc_version}` / `{simulator_type}` 占位符，而非硬编码的 910B 字符串。 |
| **上板性能分析器（Ascend950PR&950DT 系列）** | `OnBoardStrategy`：基础指标中 `MemoryDetail` 被 `PCSampling` 取代；Roofline/PCSampling 启用 `Default` 指标包（`profiler-service.ts`）。 |
| **仿真性能分析器** | `SimulatorStrategy`：`--soc-version=Ascend950PR_9589`（仿真器**目录**，而非 `ascend950` 标识）——见 [`ascend-env-spec.md`](./ascend-env-spec-zh.md) §8.1。 |
| **新项目 opprof 默认值** | 当生效 SOC 为 `ascend950` 时，项目创建写入 `MemoryDetail: false`、`PCSampling: true` 种子（`config-service.ts`）。 |
| **上板配置存储** | 选项持久化为 `performanceTuning.onBoard.*` 工作区设置；`pcSampling` 与 `cacheHeatmap` 在读取时由 `config-service.ts` 中的 `isAscendA5ProfilerCannSoc(resolveEffectiveCannSoc())` 按 SOC 门控。 |
| **i18n / package.nls** | Ascend950PR&950DT 系列上 PC 采样与缓存热图的用户可见文案（`shared/i18n`、`package.nls*.json`）。 |
| **单元测试** | `operator-spawn-env.spec.ts`（Ascend950PR&950DT 系列仿真 → `ascend950` + `dav-3510`）、`aclnn-cmake-generation.spec.ts`（生成时的 `SUPPORT_*`）、`operator-script-placeholders.spec.ts`、`profiler-simulator-resolution.spec.ts`、`pyasc-plugin.spec.ts`。 |

### 2.4 项目类型说明（模板）

| 类型 | 模板状态（Atlas A2 / Atlas A3 / Ascend950PR&950DT） |
|------|------------------------|
| **CANN**（`cann_template/*`） | 环境驱动的 `build.sh` / cmake —— 参考实现 |
| **Ascend**（`ascend_template/add_custom`） | 生成的 `CMakeLists.txt` 中固化 `SUPPORT_*` 字面量；构建时使用 `{soc_version}` 占位符（无 `SOC_VERSION` / `NPU_ARCH` spawn 导出） |
| **PyAsc**（`cann_template/pyasc_template`） | 纯 Python；配置使用 `python3 ./<op>.py`；性能分析器使用解析器 |
| **Triton**（`triton_template/triton_vector_add`） | 纯 Python；通过 Operate 面板进行仿真/上板 msprof（PyAsc 风格的 `python3` 入口）；需要 CANN 环境 + `torch_npu` + `triton` |

### 2.2 不由 `resolveAscendEnv` 驱动的部分

| 项 | 说明 |
|------|--------|
| **`DEFAULT_FALLBACK_CANN_SOC`** | 当设置、环境和检测全部失败时为空字符串（解析器中不会静默默认 `ascend910b`）。 |
| **`SUPPORT_COMPUTE_UNIT` / `SUPPORT_TILING_DIR`** | 通过 `resolveAclnnCmakeDefaultsForGeneration` 固化进生成的 `CMakeLists.txt`：Atlas A3 系列 → `ascend910_95` + `arch22`；Ascend950PR&950DT 系列 → `ascend950` + `arch35`（[`cann-aclnn-build-defaults.ts`](../shared/cann-aclnn-build-defaults.ts)，矩阵见 [`review-a3-a5-environment-support.md`](./review-a3-a5-environment-support-zh.md)）。 |

### 2.3 剩余缺口 / 运维注意事项

- 如果主机上的 `Chip Name` 字符串尚未被覆盖，请在 [`ascend-env-spec.md`](./ascend-env-spec-zh.md) §4 中**扩展芯片规则**；并在 Ascend950PR&950DT 系列物理主机上验证。
- **仿真器目录名**必须存在于你的 CANN `tools/simulator` 下；CANN 升级可能会重命名目录——请相应更新常量或工作区设置。
- **已持久化的上板 / 仿真选项** —— `performanceTuning.onBoard.*` 和 `performanceTuning.simulation.*` 设置跨会话保留；上板读取在读取时按 SOC 门控，而仿真选项在被编辑前保持原配置。
- **多 NPU 主机** —— 检测按有序子串规则扫描完整探测文本；异构机器需要显式设置工作区 SOC 或仿真器。
- **性能分析器仿真** —— `SimulatorStrategy` 把解析出的**仿真器目录**传给 `msprof op simulator --soc-version`，而非 CANN 标识（[`ascend-env-spec.md`](./ascend-env-spec-zh.md) §8.1）。

---

## 3. 主机检测（芯片 → 系列）

规则见 [`ascend-env-spec.md`](./ascend-env-spec-zh.md) §4（`shared/ascend-series-registry.ts`）。提取 `Chip Name`，归一化（去除空格），前缀 `Ascend950*` → Ascend950PR&950DT 系列。

| Chip Name（示例） | CANN 标识 |
|----------------------|-----------|
| `Ascend950PR_9589`、`Ascend 950PR_9589` | `ascend950` |

检测运行时的日志行（Huawei Op Devtools 通道，作用域 `op-devtools/ascend-env`）：

```
detected series=A5 soc=ascend950 npu_arch=dav-3510 chip=Ascend950PR_9589 (via=npu-smi)
detected series=A5 soc=ascend950 npu_arch=dav-3510 chip=Ascend950PR_9589 (via=asys)
```

每个命令的解析（同一通道）：

```
Ascend Environment Resolved: soc=ascend950 (source=workspace-setting), simulator=Ascend950PR_9589 (source=workspace-setting), npu_arch=dav-3510 (source=derived-from-soc), support_compute_unit=ascend950, support_tiling_dir=arch35 [isSimulator=true]
```

---

## 4. 上板性能分析器：Atlas A3 系列 vs Ascend950PR&950DT 系列

由 `isAscendA5ProfilerCannSoc(cannSoc)` 控制（精确匹配归一化标识 `ascend950`）。

| | Atlas A3 系列 / 非 950 类（`ascend910_93`、`ascend910b` 等） | Ascend950PR&950DT 系列（`ascend950`） |
|---|-----------------------------------|------------------------------|
| 缓存类指标 | 基础集中有 `MemoryDetail` | 不在基础集中 |
| PC 采样指标 | 不在基础集中 | 基础集中有 `PCSampling` |
| 何时「默认采集所有算子」 | 勾选 Roofline 或 MemoryDetail 时 | 勾选 Roofline 或 PCSampling 时 |
| 镜像的工作区设置 | `performanceTuning.onBoard.cacheHeatmap` | `performanceTuning.onBoard.pcSampling` |

上板命令构建在 `ascend-strategy.ts` / `cann-strategy.ts` / `python-operator-strategy-shared.ts` 中传入来自 `resolveAscendEnv({ isSimulator: false })` 的 `onboardCannSoc`。

---

## 5. 验证清单（Ascend950PR&950DT 系列硬件或代理机）

| 步骤 | 操作 |
|------|--------|
| 主机身份 | 运行 `npu-smi info`（可选：source CANN 后运行 `asys info -r=status`）。记录精确的芯片/产品字符串。 |
| CANN 工具包 | 对照**你的** CANN 算子指南和 `ls $ASCEND_HOME_PATH/tools/simulator` 确认 `ascend950` 和仿真器目录名。 |
| 工作区 | 将 `environment.socVersion` 设为 `ascend950`，**或**将 `simulation.simulatorType` 设为 `Ascend950PR_9589`（[`workspace-settings.md`](./workspace-settings-zh.md)）。 |
| 构建 / 仿真 | 运行编译 + 仿真；在输出通道检查 `Ascend Environment Resolved` 以及 spawn `env` 中的 `SOC_VERSION`、`NPU_ARCH` 和适用时的 `SIMULATOR_TYPE`。 |
| 上板 opprof | Ascend950PR&950DT 系列上的新算子应默认 `PCSampling: true`、`MemoryDetail: false`；运行上板分析并确认生成命令中的 `msprof op` aic-metrics。 |
| 占位符 | 含 `{soc_version}` / `{simulator_type}` 的脚本在解析后应显示 `ascend950` / `Ascend950PR_9589`，而非固化在内的 910B 字面量。 |
| 测试（CI） | `pnpm test`（或项目测试脚本）——`operator-spawn-env.spec.ts`、`operator-script-placeholders.spec.ts`。 |

---

## 6. 主要代码位置

| 领域 | 路径 |
|------|------|
| SOC 规则、解析器、spawn 环境 | `plugin/src/domain/utils/ascend-util.ts` |
| 全局环境快照 | `plugin/src/domain/utils/global-env-snapshot.ts` |
| Ascend950PR&950DT 系列性能分析器 SOC 辅助 | `shared/msprof-onboard-env.ts` |
| 共享常量 | `shared/cann-env-constants.ts`、`shared/cann-aclnn-build-defaults.ts` |
| 占位符 | `plugin/src/domain/utils/operator-script-placeholders.ts` |
| Spawn 入口 | `plugin/src/service/operator-command-executor.ts` |
| 上板 / 仿真性能分析器策略 | `plugin/src/domain/services/profiler-service.ts` |
| 策略（onboardCannSoc） | `plugin/src/domain/services/command-strategy/ascend-strategy.ts`、`cann-strategy.ts` |
| 新算子上板默认值 | `plugin/src/service/config-service.ts` |
| 工作区 SOC / 仿真器辅助 | `plugin/src/helpers/operator-project-workspace-config.ts` |
| 上板选项（webview + 设置 DAO） | `plugin/src/extension.ts`、`plugin/src/service/config-service.ts` |
| 环境规范（全平台） | `design-docs/ascend-env-spec.md` |

---

*最近对照 `plugin/src`、`shared`、`web` 和 `plugin/templates/code_template` 验证（2026-05）。CANN `SOC_VERSION` 和仿真器目录名必须与你发布的工具包匹配；请在目标硬件上验证。*
