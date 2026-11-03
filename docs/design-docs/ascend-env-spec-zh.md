# Ascend / CANN 环境解析 — 权威规范

状态：已实现于 `shared/ascend-series-registry.ts`、
`plugin/src/domain/utils/ascend-util.ts`、`plugin/src/domain/utils/global-env-snapshot.ts`、
`plugin/src/domain/utils/ascend-detection-env.ts`。

工作区设置键：[`workspace-settings-zh.md`](./workspace-settings-zh.md)。Ascend950PR&950DT 系列操作：[`ascend-a5-support-zh.md`](./ascend-a5-support-zh.md)。

> 若实现与本文档不一致，修改实现。

---

## 1. 速查 — 芯片 → 系列 → 默认值

匹配使用**规范化**后的芯片 id（§3）。**顺序：** 先精确匹配（§4.1），再前缀匹配（§4.2）。

| 规则 | 模式 / 名称（规范化后） | 产品系列 | 默认 `socVersion` |
|------|------------------------------|--------|----------------------|
| 前缀 | `Ascend950*` | Ascend950PR&950DT 系列 | `ascend950` |
| 前缀 | `Ascend910_*` | Atlas A3 系列 | `ascend910_93` |
| 前缀 | `Ascend910A*`、`Ascend910B*` | Atlas A2 系列 | `ascend910b` |
| 精确 | `Ascend901A/B`、`Ascend910PremiumA`、`Ascend910ProA/B` | Atlas A2 系列 | `ascend910b` |

前缀顺序：`Ascend950` → `Ascend910_` → `Ascend910A` → `Ascend910B`。

| 产品系列 | `socVersion` | `simulatorType` | 默认 `npuArch` |
|--------|--------------|-----------------|-------------------|
| Atlas A2 系列 | `ascend910b` | `Ascend910B3` | `dav-2201` |
| Atlas A3 系列 | `ascend910_93` | `Ascend910_9362` | `dav-2201` |
| Ascend950PR&950DT 系列 | `ascend950` | `Ascend950PR_9589` | `dav-3510` |

**Atlas A2 系列 Pro / Premium / 901 芯片：** 仍属于 Atlas A2 系列（`ascend910b`、`Ascend910B3`）；只有 `NPU_ARCH` 是 **`dav-1001`**（而非 `dav-2201`）。仅设置工作区 `socVersion=ascend910b` 不会得到 `dav-1001` — 需要检测到/缓存的 §4.1 芯片（§5）。

常量：[`shared/cann-env-constants.ts`](../shared/cann-env-constants.ts)。

---

## 2. 插件拥有的变量

| 名称 | 含义 | 落到哪里 |
|------|---------|----------------|
| `SOC_VERSION` | 非仿真运行时的 CANN SOC **slug**；**仿真类**运行时 spawn 值为**仿真器目录名** | spawn 环境（§8）+ `{soc_version}`（**始终是 slug**）+ 适用时的 `--soc=` |
| `simulatorType` | `tools/simulator/<dir>/lib` 下的仿真器目录 | `{simulator_type}`、`--simulator`、**`msprof op simulator --soc-version`**（§8.1）；**不是** `process.env.SIMULATOR_TYPE` |
| `NPU_ARCH` | AscendC `--npu-arch` | spawn 环境；§6 |
| `SUPPORT_COMPUTE_UNIT` / `SUPPORT_TILING_DIR` | ACLNN cmake 字面量 | 算子生成时固化（§9） |

只有 cmake 会读取这些变量的类型才会在 spawn 中导出 `SOC_VERSION` + `NPU_ARCH`（`ascend-c`、`torch-library`、`op_type=cann`）。Standard-custom / pyasc / triton 只使用占位符（`OperatorPluginRegistry.filterSpawnEnv()`）。

### 2.1 零配置 C/C++ 导航

当扩展宿主可见 `ASCEND_HOME_PATH` 时，打包清单将 `.asc` 和 `.cce` 文件关联到 C++，并向 Microsoft C/C++ 提供以下默认 include 路径（清单也为 `.asc` 贡献了 `ascend-c` 语言 — 见 `docs/user-issues/ascend-c-language.md` — 但默认关联保持为 `cpp`，以便 C/C++ IntelliSense 生效）：

```text
${workspaceFolder}/**
${env:ASCEND_HOME_PATH}/include
${env:ASCEND_HOME_PATH}/include/aclnn
${env:ASCEND_HOME_PATH}/compiler/tikcpp
${env:ASCEND_HOME_PATH}/compiler/tikcpp/tikcfw
${env:ASCEND_HOME_PATH}/compiler/tikcpp/tikcfw/interface
${env:ASCEND_HOME_PATH}/compiler/tikcpp/tikcfw/impl
${env:ASCEND_HOME_PATH}/tools/tikicpulib/lib/include
```

它们覆盖工作区源码、公开 CANN 头文件（如 `acl/acl.h`）以及 AscendC 头文件（如 `kernel_operator.h`）。浏览数据库仅递归索引 `${workspaceFolder}`、`${env:ASCEND_HOME_PATH}/include`、`${env:ASCEND_HOME_PATH}/compiler/tikcpp/tikcfw` 和 `${env:ASCEND_HOME_PATH}/tools/tikicpulib/lib/include`；不会继承更宽泛的 `compiler/tikcpp` include 根。

这些值仅为默认值。用户或工作区显式的 `files.associations` / `C_Cpp` 设置及 `c_cpp_properties.json` 保持更高优先级，OP DevTools 不会改写它们。Huawei 和 CodeArts 的 C/C++ 提供方不通过 Microsoft 专属设置配置。

Microsoft C/C++ 不再列入 `extensionPack`，因为那会在已安装 Huawei 或 CodeArts C/C++ 提供方的情况下仍然安装它。取而代之的是，激活后引导会检查是否有任何已安装的非内置扩展贡献 `c` / `cpp` 语言（[`cpp-extension-support.ts`](../plugin/src/helpers/cpp-extension-support.ts)），仅当没有时才提议安装 `ms-vscode.cpptools`。内置扩展被排除，因为每个 VS Code 构建都附带 `vscode.cpp`，它仅为语法高亮贡献这些语言 id。拒绝安装会记录在全局状态中。若受限网络下 Marketplace 不可用，可手动安装相应的 VSIX；该失败不会阻塞 OP DevTools 激活。

### 2.2 无 `ASCEND_HOME_PATH` 主机的回退

清单中的 `${env:ASCEND_HOME_PATH}` 是相对扩展宿主环境展开的，而不是相对所配置的 CANN 环境脚本。因此，从桌面启动器启动的 IDE，或登录 shell 从未 source 过 `set_env.sh` 的 Remote-SSH 主机，会把这些条目解析成光秃秃的 `/include` 风格路径，完全得不到 CANN 导航。

当扩展宿主缺少 `ASCEND_HOME_PATH` 时，激活后引导会 source `resolveCannSetEnvScriptWithoutScan()` 找到的 CANN 环境脚本，从中读取 `ASCEND_HOME_PATH`，并把同样的根路径以绝对路径形式写入工作区设置（[`cann-cpp-include-paths.ts`](../plugin/src/domain/utils/cann-cpp-include-paths.ts)）。脚本查找覆盖 `environment.environmentScript` 设置、`ASCEND_ENV_SCRIPT` 启动快照以及常见安装路径；刻意不使用 `resolveCannSetEnvScriptForDetection()` 的 `find /` 回退，因为其 `execSync` 会阻塞扩展宿主长达 30 秒。当变量已可见、找不到环境脚本，或 `C_Cpp.default.includePath` / `C_Cpp.default.browse.path` 持有非本辅助生成的值时，不会写入新值。当 CANN 安装位置迁移时，由它生成的值会被刷新，包括变量可见的主机。所有这些都运行在 `activate()` 返回之后，并使用异步 `exec`，因此激活时间不受影响。

对于 Remote-SSH 或容器场景，`ASCEND_HOME_PATH` 及其目标目录必须存在于远程/容器的扩展宿主环境中，或那里必须能访问到 CANN 环境脚本。本地工作站上同名路径不会被使用。

---

## 3. 芯片名称规范化

```
normalize(chip) = chip.trim().replace(/\s+/g, '')
```

示例：`Ascend 910_9362 V1` → `Ascend910_9362V1`（Atlas A3 系列）；`Ascend 910 ProA` → `Ascend910ProA`（Atlas A2 系列 + `dav-1001`）。匹配使用规范化 id；日志与芯片缓存存储**原始**探测文本。

---

## 4. 芯片规则

### 4.1 从探测中提取

每次会话一次：先 `asys info -r=status`，再 `npu-smi info`，在 source 了 CANN `set_env.sh` 的 bash 中执行（§7.2 步骤 3）；两者都失败时，远程工具系列映射（`getRemoteToolSeriesSync`）可提供 slug。

1. 匹配 `Chip Name` / `芯片名称` 行 — 取 `:` 之后到行尾的值。
2. 回退：`Ascend` + 数字/型号的标记（`Ascend\s*\d[\dA-Za-z_]*`）。

去重、保序；使用**第一个**匹配 §4.2–4.3 的芯片。

### 4.2 精确匹配（优先）

| 规范化芯片 | 产品系列 | `npuArch` |
|-----------------|--------|-----------|
| `Ascend901A`、`Ascend901B`、`Ascend910PremiumA`、`Ascend910ProA`、`Ascend910ProB` | Atlas A2 系列 | `dav-1001` |

### 4.3 前缀匹配

| 前缀 | 产品系列 |
|--------|--------|
| `Ascend950` | Ascend950PR&950DT 系列 |
| `Ascend910_` | Atlas A3 系列 |
| `Ascend910A`、`Ascend910B` | Atlas A2 系列 |

无匹配 → 检测不产出 slug。非 `Ascend*` 标签（例如没有芯片名称的 Atlas 标签主机）→ 由用户设置 `environment.socVersion`。

### 4.4 Slug → 系列（覆盖 / 仿真器反查）

| Slug | 产品系列 |
|------|--------|
| `ascend910b`、`ascend910`、`ascend310p` | Atlas A2 系列 |
| `ascend910_93` | Atlas A3 系列 |
| `ascend950` | Ascend950PR&950DT 系列 |

仿真器 → slug：仅反转 §1 的默认仿真器名称（`simulatorTypeToCannSoc`）。未知 → 警告，回退到 §7。

### 4.5 ACLNN 与 profiler（按解析出 slug 的系列）

| 产品系列 | `SUPPORT_COMPUTE_UNIT` | `SUPPORT_TILING_DIR` | 上板 profiler |
|--------|------------------------|----------------------|-------------------|
| Atlas A2 / Atlas A3 系列 | `ascend910_95` | `arch22` | `MemoryDetail` 等 |
| Ascend950PR&950DT 系列 | `ascend950` | `arch35` | `PCSampling` 等（`isAscendA5ProfilerCannSoc` ↔ `ascend950`） |

---

## 5. 会话芯片缓存

主机检测成功后，缓存**原始**芯片名称直至扩展重启。用于后续解析使用工作区/全局 slug 时 §6 中的 `dav-1001`。测试钩子会重置缓存；工作区 SOC 变更时不清除。

---

## 6. `npuArch`

1. 工作区 `environment.npuArch` — 显式值原样胜出（`null` 视为未设置）。
2. 全局快照 `NPU_ARCH` — 除非 SOC 是从仿真器类型派生的，否则使用。
3. 缓存芯片命中 §4.2 且解析出的 slug 属于 Atlas A2 系列 → `dav-1001`（slug 仍为 `ascend910b`）。
4. 解析出 slug 的 §1 系列默认值。
5. 空 slug → `''`（不静默回退到 910 系默认值）。

仿真器目录不映射到 `npuArch`。

---

## 7. 解析（`resolveAscendEnv`）

```ts
{
  socVersion: string,
  npuArch: string,
  simulatorType: string | undefined,
  source: {
    socVersion: 'workspace-setting' | 'global-env' | 'detected' |
                'derived-from-simulator' | 'default',
    simulatorType: 'workspace-setting' | 'global-env' | 'default-from-soc' | 'n/a',
    npuArch: 'derived-from-soc',
  },
}
```

入口：`resolveAscendEnv()`、`resolveAscendEnvForOperatorCommand()` → `buildOperatorSpawnEnvFromResolution()`。

### 7.1 `simulatorType`（仅仿真运行）

1. 工作区 `performanceTuning.simulation.simulatorType`（显式；schema 默认值**不**算）。
2. 全局快照 `SIMULATOR_TYPE`。
3. 解析出 slug 所属系列的 §1 默认值。

只有 (1) 会通过 §4.4 反查触发 **SOC 来自仿真器**。

### 7.2 `socVersion`

- 仿真 + 工作区显式仿真器 → 来自 §4.4 的 slug。
- 否则：
  1. 工作区 `environment.socVersion`（显式）。
  2. 全局快照 `SOC_VERSION`。
  3. 主机检测 — §4.1–4.3 → §1 `socVersion`。`set_env.sh` 的查找顺序：`environment.environmentScript` → `ASCEND_ENV_SCRIPT` → `find … set_env.sh`。项目的 `ascend_env_script` **不**用于检测。
  4. `DEFAULT_FALLBACK_CANN_SOC`（`''`）。

解析器从不查询项目记录；工作区设置、环境快照和主机检测是它仅有的来源。

> **如何查询你的硬件对应的 SoC version / CANN SOC slug：** 参见昇腾官方指南 — [AI Core 算子编译（`#note-reference`）](https://asc.gitcode.com/guide/programming_guide/compilation_and_execution/operator_compilation/ai_core_operator_compilation.html#note-reference)。

### 7.3 `npuArch`

在 `socVersion` 确定后应用 §6。生成时 SOC 为空仍会静默解析 `SUPPORT_*`（不通知用户）。

### 7.4 SOC 缺失通知

当算子命令运行时（`resolveAscendEnvForOperatorCommand`）且 SOC 解析为空 `default`，显示一条简短警告，提供内联设置 `environment.socVersion` 的选项（写入工作区设置并重新解析）或打开工作区设置。在 SOC 配置好之前（工作区显式值、环境变量或主机检测），**每次**算子运行都会重复提示。被动的 `resolveAscendEnv` 调用（项目打开、选项 webview、profiler 命令组装）**不**显示。抑制判断使用与 §7.2 步骤 1 相同的显式工作区检查 — 用户作用域的设置不会抑制该警告。

---

### 7.5 重新打开的项目与手动终端构建

`context.environmentVariableCollection` 把 `NPU_ARCH` 带入集成终端，使手工输入的 `bash build.sh` 与插件导出的值一致。激活后引导仅从设置 / 全局快照预置它（`allowHostDetection: false` — 主机探测是记忆化的，绝不能在中第一条命令之前缓存失败）；`executeOperatorCommand` 在每次非仿真运行后刷新它。`detected` 来源的 SOC 会写入工作区 `environment.socVersion`（`persistDetectedSocVersion`），使下一个窗口无需探测即可解析；当解析出的架构是芯片专属的（与该 slug 的系列默认值不同，如 `dav-1001`），`environment.npuArch` 会一并固定。显式设置、空值和仿真器派生的 slug 绝不被持久化。

## 8. 算子命令

**Spawn：** `executeOperatorCommand` 前置 `export SOC_VERSION=… && export NPU_ARCH=…`（`shell-env-exports.ts`）；不通过 `CommandExecutor` 的 `options.env`。当设置了环境脚本时，导出在 `. ${ascend_env_script} &&` 之前。

**占位符 / CLI**（每条命令同一解析）：`{soc_version}` → slug；`{simulator_type}` → 仿真器目录；ascend 构建 → `--simulator <dir> --soc=<slug>`。

### 8.1 `msprof op simulator --soc-version`（权威约定）

**消费方：** CANN **msopprof** CLI（`msprof op simulator`）。这**不是**开源的 [msprof](https://gitcode.com/Ascend/msprof) 分析仓库（仅解析；没有 `op simulator` 子命令）。

**要求的值：** **仿真器目录名** — 随 CANN 工具包发布的 `$ASCEND_HOME_PATH/tools/simulator/` 子目录（每个目录包含仿真器运行时库，通常在 `lib/` 下）。

**会被拒绝的值：** **CANN SOC slug**（`ascend910b`、`ascend910_93`、`ascend950` 等）。msopprof 会提前失败：

```text
--soc-version is invalid, please specify a simulator in $ASCEND_HOME_PATH/tools/simulator
```

传 slug 还可能引出误导性的指标错误（`Unexpected argument … maybe in wrong soc platform`），因为 msopprof 会按 `--soc-version` 选定的平台校验 `--aic-metrics`。

#### 默认目录名（插件）

| 产品系列 | `simulatorType`（用于 `--soc-version`） | CANN slug（`socVersion`；**不**用于 `--soc-version`） |
|--------|---------------------------------------|--------------------------------------------------------|
| Atlas A2 系列 | `Ascend910B3` | `ascend910b` |
| Atlas A3 系列 | `Ascend910_9362` | `ascend910_93` |
| Ascend950PR&950DT 系列 | `Ascend950PR_9589` | `ascend950` |

常量：[`shared/cann-env-constants.ts`](../shared/cann-env-constants.ts)。CANN 升级可能重命名目录 — 请在主机上列出已安装仿真器，必要时通过工作区设置覆盖。

#### 插件解析

`plugin/src/domain/services/profiler-service.ts` 中的 `SimulatorStrategy` 设置：

```ts
resolveAscendEnv({ isSimulator: true }).simulatorType
```

仿真运行时 `simulatorType` 的优先级：§7.1（工作区 `performanceTuning.simulation.simulatorType` → 全局 `SIMULATOR_TYPE` 快照 → 解析出系列的 §1 默认值）。

生成的片段示例（Atlas A2 系列，默认仿真指标）。可选的
`--aic-metrics` 值受 SOC 门控（GC-22 / plugin_release #32）：在
发布的空允许列表下，只会输出强制的 `PipeUtilization` 基础项 —
见 [`performance-zh.md`](./performance-zh.md) 「仿真指标」：

```bash
msprof op simulator --soc-version=Ascend910B3 \
  --output=<workspaceRoot>/.vscode/opprof \
  --aic-metrics=PipeUtilization \
  python3 ./<op>.py
```

#### 各标识符的使用位置（不要混淆）

| 上下文 | 标识符 | 示例（Atlas A3 系列） |
|---------|------------|--------------|
| `msprof op simulator --soc-version` | **仿真器目录** | `Ascend910_9362` |
| **仿真类**构建的 spawn `export SOC_VERSION=…` | **仿真器目录** | `Ascend910_9362` |
| `{simulator_type}` 脚本占位符 | **仿真器目录** | `Ascend910_9362` |
| `build.sh --simulator` | **仿真器目录** | `Ascend910_9362` |
| `{soc_version}` 脚本占位符 | **CANN slug** | `ascend910_93` |
| `build.sh --soc=` / 打包 | **CANN slug** | `ascend910_93` |
| **非仿真**构建的 spawn `export SOC_VERSION=…` | **CANN slug** | `ascend910_93` |
| 上板 `msprof op` 指标矩阵 | **CANN slug**（经 `onboardCannSoc`） | `ascend910_93` |

上板性能分析**不**接受 `--soc-version`；只有仿真使用。

#### 在主机上验证

```bash
ls "$ASCEND_HOME_PATH/tools/simulator"
```

传给 `--soc-version` 的名称必须匹配该列表中的一项（区分大小写）。若 §1 的默认值缺失，在工作区设置中设置 **`op-devtools.performanceTuning.simulation.simulatorType`**（[`workspace-settings-zh.md`](./workspace-settings-zh.md)）。

#### 华为文档说明

一些 CANN/msopprof 指南提到通过 `python3 -c "import acl; print(acl.get_soc_name())"` 获取 `--soc-version`，它返回的是 **slug**，而示例使用的是目录风格名称（`Ascend910B3`、`Ascend910_9362`）。插件遵循在 Atlas A2 / Atlas A3 / Ascend950PR&950DT 系列现场工具包上验证过的**目录名**约定：`--soc-version` 传 slug 会被拒绝或使平台识别错误，从而影响指标校验。仿真指标与互斥规则见 [`performance-zh.md`](./performance-zh.md)。

---

## 9. 模板

- **CANN：** cmake `$ENV{SOC_VERSION}` / `$ENV{NPU_ARCH}`；仿真运行使用仿真器目录作为 spawn 的 `SOC_VERSION`。
- **Ascend `add_custom`：** `__MSTT_SUPPORT_*__` 在项目生成时通过 `resolveAclnnCmakeDefaultsForGeneration()` 替换 — 输入：工作区 `environment.socVersion` 覆盖，否则项目存储的 `soc_version`，否则 §7 链条；值来自 §4.5。

---

## 10. 全局环境快照

`global-env-snapshot.ts` 在激活时冻结 `SOC_VERSION`、`SIMULATOR_TYPE`、`NPU_ARCH`、`ASCEND_ENV_SCRIPT`。插件**绝不**把它们写回 `process.env`。

---

## 11. 插件不做的事

- 为 ascend 变量修改宿主 `process.env`。
- 在激活时 source 环境脚本。
- 导出可变的模块级 `soc_version` / `npu_arch`。

---

## 12. 日志

| 时机 | 范围 |
|------|--------|
| 激活 | `op-devtools/ascend-env` — 全局快照 |
| 检测 | `detected series=A2 soc=ascend910b npu_arch=dav-1001 chip=… (via=npu-smi)` |
| 每次解析 | `Ascend Environment Resolved: soc=… source=…` |
| 算子运行 | `op-devtools/command` — 日志命令中的完整导出链 |

---

## 13. 测试

`ascend-series-registry.spec.ts`、`ascend-soc-detection-rules.spec.ts`、`operator-spawn-env.spec.ts`、`shell-env-exports.spec.ts`、`operator-command-executor.spec.ts`、`operator-script-placeholders.spec.ts`、`profiler-simulator-resolution.spec.ts`（§8.1 `--soc-version` = 仿真器目录）。

---

## 14. 代码地图

| 部分 | 路径 |
|-------|------|
| 注册表 | `shared/ascend-series-registry.ts` |
| 解析器 | `plugin/src/domain/utils/ascend-util.ts` |
| 探测 | `plugin/src/domain/utils/ascend-detection-env.ts` |
| 快照 | `plugin/src/domain/utils/global-env-snapshot.ts` |
| Spawn | `operator-command-executor.ts`、`shell-env-exports.ts`、`operator-script-placeholders.ts` |
| 仿真 profiler CLI | `profiler-service.ts`（`SimulatorStrategy`，§8.1） |
