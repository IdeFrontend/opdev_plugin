# 仿真器选项规范（`msprof op simulator`）

OP DevTools 中**仿真**快捷选项、工作区设置以及 `msprof op simulator` 命令生成的权威契约。

**相关文档：** [`performance-zh.md`](./performance-zh.md)、[`ascend-env-spec-zh.md`](./ascend-env-spec-zh.md) §8.1、[`review-a3-a5-environment-support-zh.md`](./review-a3-a5-environment-support-zh.md) §4.1。

**代码：** [`shared/msprof-simulator-metrics.ts`](../shared/msprof-simulator-metrics.ts)、[`plugin/src/domain/services/profiler-service.ts`](../plugin/src/domain/services/profiler-service.ts)（`getSimulationAicMetrics`、`SimulatorStrategy`）、[`web/src/views/panels/options-simulator/`](../web/src/views/panels/options-simulator/)。

---

## 1. 范围

**范围内：** 影响 `msprof op simulator` 指标采集（`--aic-metrics`）的选项、仿真器平台选择（`--soc-version`），以及仿真快捷选项 webview。

**范围外：** 上板 `msprof op` 选项、sanitizer / mssanitizer、模型级 `msprof --application=…` 采集、Insight 展示。

---

## 2. 文档权威性

| 层级 | 作用 |
| ----- | ---- |
| **msopprof CLI**（CANN 工具包 `msprof op simulator`） | 校验 `--soc-version` 与 `--aic-metrics`；会报 `maybe in wrong soc platform` 之类错误 |
| **msprof analysis 仓库**（开源解析） | 定义指标组名称和导出字段语义——**不是**仿真器白名单 |
| **§8 手动 CLI 验证** | **UI 门槛**——某指标只有在对应 `(metric, cannSoc)` 上真实跑通 `msprof op simulator` 后才显示 |

**不要**仅凭 msprof analysis 的芯片映射推断仿真器支持情况（Atlas A3 系列的 analysis 包含 `ResourceConflictRatio`；但 msopprof 在 `ascend910_93` 上拒绝它——GC-22）。

---

## 3. 支持状态

| 状态 | UI | 白名单 |
| ----- | -- | ---------- |
| **confirmed** | 显示控件（或隐含的基础文案） | slug 在 `SIMULATOR_OPTIONAL_METRIC_SOCS` 中 |
| **unverified** | 隐藏 | slug 不在集合中 |
| **rejected** | 永不显示 | slug 永不加入（例如 Atlas A3 系列 + `ResourceConflictRatio`） |

晋升路径：`unverified` → `confirmed`，仅在 §8 CLI 验证通过并有 PR 证据后。

---

## 4. 环境标识符（Ascend950PR&950DT 系列示例）

| 标识符 | 取值 | 用途 |
| ---------- | ----- | -------- |
| 仿真器目录 | `Ascend950PR_9589` | `msprof op simulator --soc-version` |
| CANN SOC slug | `ascend950` | 白名单键、`resolveAscendEnv({ isSimulator: true }).socVersion` |
| 对 `--soc-version` 无效 | `ascend950`（slug） | msopprof 会提前拒绝 |

Atlas A2 / Atlas A3 系列默认值及解析优先级见 [`ascend-env-spec-zh.md`](./ascend-env-spec-zh.md) §8.1。

---

## 5. 指标注册表（仿真器 UI）

| 指标 | 快捷选项分区 | 默认 | 说明 |
| ------ | ---------------------- | ------- | ----- |
| `PipeUtilization` | Instruction pipeline（仅文案） | 总是采集 | 无可选替代项启用时的基础项 |
| `ResourceConflictRatio` | Code hotspot 复选框 | **开** | 与 `PipeUtilization` 互斥 |
| `PMSampling` | Instruction pipeline 复选框 | **关** | 启用时追加在基础选择之后 |
| 上板指标（`Occupancy`、`Roofline`、`PCSampling`、…） | — | — | **范围外**——不同的 CLI（`msprof op`） |

工作区映射：[`workspace-settings-zh.md`](./workspace-settings-zh.md) —— `simulation.resourceConflictRatio`、`simulation.memoryThroughputWaveform`。

---

## 6. 命令规则

1. **基础项：** 除非 `ResourceConflictRatio` 同时被用户启用**且**在 `cannSoc` 白名单中，否则输出 `PipeUtilization`。
2. **互斥：** 绝不同时输出 `PipeUtilization` 和 `ResourceConflictRatio`。
3. **追加：** `PMSampling` 在用户启用**且**在白名单中时可追加（例如 `ResourceConflictRatio,PMSampling`）。
4. **过期的工作区取值**：当 slug 不在白名单中时不得输出指标（GC-22 安全防护）。

Ascend950PR&950DT 系列命令示例（默认开启）：

```bash
msprof op simulator \
  --soc-version=Ascend950PR_9589 \
  --output=<workspaceRoot>/.vscode/opprof \
  --aic-metrics=ResourceConflictRatio \
  <target>
```

启用内存吞吐时：`--aic-metrics=ResourceConflictRatio,PMSampling`。

---

## 7. §8 验证流程

在将 slug 加入白名单前，需在装有匹配 CANN 工具包的主机上运行：

```bash
# Baseline
msprof op simulator --soc-version=Ascend950PR_9589 \
  --output=/tmp/opprof_test --aic-metrics=PipeUtilization <target>

# Candidate metric (must exit 0 to promote)
msprof op simulator --soc-version=Ascend950PR_9589 \
  --output=/tmp/opprof_test --aic-metrics=ResourceConflictRatio <target>

msprof op simulator --soc-version=Ascend950PR_9589 \
  --output=/tmp/opprof_test --aic-metrics=PMSampling <target>

# Atlas A3 series negative control (must fail for ResourceConflictRatio)
msprof op simulator --soc-version=Ascend910C \
  --output=/tmp/opprof_test --aic-metrics=ResourceConflictRatio <target>
```

在白名单 PR 中记录 CANN 版本、目标算子以及通过/失败结果。

在单指标 PASS 之后，还需验证 UI 可能输出的**组合** `--aic-metrics` 取值（例如 `ResourceConflictRatio,PMSampling`、`PipeUtilization,PMSampling`），然后才能将组合路径视为 confirmed。

---

## 8. §8.1 已记录结果——Ascend950PR&950DT 系列（`ascend950`）

手动 `msprof op simulator` 验证（2026-06-26 上报）：

| 指标 / 组合 | 结果 | 白名单 slug |
| -------------- | ------ | --------------- |
| `ResourceConflictRatio` | **PASS** | `ascend950` |
| `PMSampling` | **PASS** | `ascend950` |
| `ResourceConflictRatio,PMSampling` | **尚未运行** | — |
| `PipeUtilization,PMSampling` | **尚未运行** | — |

| 字段 | 取值 |
| ----- | ----- |
| CANN 工具包版本 | *验证者未记录——下次 §8 运行时补充* |
| `--soc-version` | `Ascend950PR_9589` |
| 目标算子 | *未记录* |

实现：两个指标仅为 `ascend950` 加入 `SIMULATOR_OPTIONAL_METRIC_SOCS`。单指标 PASS 足以完成初始 UI 晋升；上方组合行属于后续验证项。

---

## 9. 按 SOC 划分的能力矩阵

| 环境 | `cannSoc` | `--soc-version` | PipeUtilization | ResourceConflictRatio | PMSampling |
| ----------- | --------- | --------------- | --------------- | --------------------- | ---------- |
| **Ascend950PR&950DT 系列** | `ascend950` | `Ascend950PR_9589` | confirmed（基础项） | **confirmed**（§8.1） | **confirmed**（§8.1） |
| **Atlas A3 系列** | `ascend910_93` | `Ascend910C` | confirmed（基础项） | **rejected**（GC-22） | unverified |
| **Atlas A2 系列** | `ascend910b` | `Ascend910B3` | confirmed（基础项） | unverified | unverified |

**永不加入白名单：** `ascend910_93` 的 `ResourceConflictRatio`。

---

## 10. UI ↔ 命令不变式

`getSimulatorSupportedMetrics()[metric] === true` ⟺ slug ∈ `SIMULATOR_OPTIONAL_METRIC_SOCS[metric]` ⟺ 当用户选项为 true 时 `getSimulationAicMetrics` 会包含 `metric`。

两条路径都使用 `resolveAscendEnv({ isSimulator: true }).socVersion` 和 [`isSimulatorOptionalMetricSupported`](../shared/msprof-simulator-metrics.ts)。

---

## 11. Ascend950PR&950DT 系列预期的快捷选项（白名单生效后）

| UI 元素 | 在 Ascend950PR&950DT 系列上显示 |
| ---------- | ----------- |
| Instruction pipeline + 描述 | 是 |
| 内存吞吐波形复选框 | 是（默认关） |
| 资源冲突率复选框 | 是（默认开） |
| `optionalUnsupported` 提示 | 否（已移除；Atlas A2 / Atlas A3 系列改用分区文案） |
| 默认 `--aic-metrics` | `ResourceConflictRatio` |

Atlas A2 / Atlas A3 系列：可选复选框保持隐藏，直到各自的 §8 验证通过并加入其 slug。
