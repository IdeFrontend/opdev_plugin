# Build Tools Integration Architecture

This document describes how **operator compilation** (编译算子 / 编译示例) is integrated in the Huawei OP DevTools VS Code extension: entry points, config model, command generation, and execution.

**Related:** [`workspace-settings.md`](./workspace-settings.md) (compile scripts, deploy target), [`ascend-env-spec.md`](./ascend-env-spec.md) (spawn env), [`operator-treeview.md`](./operator-treeview.md) (Actions tree — build is **not** queued), [`run-integration.md`](./run-integration.md), [`debug-integration.md`](./debug-integration.md).

---

## Overview

The plugin does **not** ship a compiler. It:

- **Orchestrates** compilation using per-project **`configs.json` rows** (`build_op`, `build_example`). At command time, script fields and options come from workspace **`op-devtools.*`** via `ConfigService.getRuntimeConfigById` → `applyWorkspaceSettingsToConfigs` (see [Runtime config](#runtime-config-for-command-generation)). Row ids and DB-only fields (`fileMapList`, profiler `build_example.target_file`, …) stay in `configs.json`.
- **Builds** shell command strings with **command strategies** keyed by `operator.op_type` (`ascend`, `cann`, `pyasc`, `triton`).
- **Runs** commands through **`executeOperatorCommand`** (`operator-command-executor.ts`): one `resolveAscendEnvForOperatorCommand` pass, placeholder substitution, then `ProjectManager.getExecutor().execute(..., { env })` (same executor stack as run / sanitizer / simulate).
- **Exposes** compile via VS Code commands → `taskMethods.startBuild` / `startBuildExample` (Actions tree **Build** row, folder menus, debug pre-build). **`ops` API** (`getConfigData` / `saveConfig`) is for simulate / on-board / sanitizer **settings only**, not compile RPC.

Compilation is performed by the project script or toolchain named in the generated command.

**Extension host vs shell CANN environment** — At activation the extension only **logs** a frozen global env snapshot; it does not source env scripts or mutate `process.env`. Strategies prepend **`. ${project.ascend_env_script} && …`** when set; spawn env is built per command (`SOC_VERSION`, `NPU_ARCH`, `SUPPORT_*`). Contract: [`ascend-env-spec.md`](./ascend-env-spec.md); A5: [`ascend-a5-support.md`](./ascend-a5-support.md).

---

## Protocols

```mermaid
flowchart LR
  subgraph Plugin["This plugin"]
    Webview[Options webviews\nsimulator / on-board]
    OpsAPI[ops API\ngetConfigData, saveConfig]
    Commands[VS Code commands\nbuild / build example]
    TaskCtrl[Task controller]
    BuildSvc[BuildService]
    DomainCmd[domain/services/command\ngetBuildOpCommand\ngetBuildExampleCommand]
    Strategy[Command strategy\nascend / cann / pyasc / triton]
  end

  subgraph VSCode["VS Code"]
    Notifications[Notifications\nshowMessage]
  end

  subgraph Env["Execution environment"]
    Executor[ProjectManager.getExecutor()]
    Shell[Shell / script]
  end

  Webview -->|"request"| OpsAPI
  Commands --> TaskCtrl --> BuildSvc
  BuildSvc --> DomainCmd --> Strategy
  DomainCmd --> Strategy
  BuildSvc --> ExecOp["executeOperatorCommand\nascend env + placeholders"]
  ExecOp --> Executor
  Executor --> Shell
  BuildSvc --> Notifications
```

| Layer | Protocol | Role |
|-------|----------|------|
| **Webview → Plugin** | Custom request/response over ApiServer | Simulator / on-board panels call `ops/getConfigData`, `ops/saveConfig` (settings.json only). Compile / build-example are **not** exposed on `ops`; use VS Code commands → `taskMethods.startBuild` / `startBuildExample`. |
| **Plugin → VS Code** | VS Code Extension API | Show success/error messages; project/workspace context. |
| **Plugin → Environment** | Shell command (stdio) | `executeOperatorCommand` resolves ascend env, substitutes placeholders, then `CommandExecutor.execute` with merged `env` + optional per-run output channel (`Op Dev Tools: compile`, …). |

---

## High-Level Architecture

```mermaid
flowchart TB
  subgraph Entry["Entry points"]
    Tree["Operate tree / commands\nstartBuild / startBuildExample"]
    Config["Options panels\ngetConfigData, saveConfig"]
  end

  subgraph Plugin["Plugin (plugin/src)"]
    ApiSrv["ApiServer\nops + config routes"]
    TaskCtrl["TaskController\nstartBuild, startBuildExample"]
    BuildSvc["BuildService\nstartBuild, startBuildExample\ngetBuildConfigId, getBuildExampleConfigId\ngetBuildConfigsList"]
    DomainCmd["domain/services/command.ts\ngetBuildOpCommand, getBuildExampleCommand"]
    ConfigSvc["ConfigService.getRuntimeConfigById\n+ configuration getConfigById"]
    StrategyFactory["CommandStrategyFactory\nascend | cann | pyasc | triton"]
    ExecOp["executeOperatorCommand"]
  end

  subgraph Env["Execution environment"]
    PM["ProjectManager\ninitProject, getExecutor"]
    Executor["CommandExecutor\nexecute(cmd, { env })"]
  end

  Tree --> TaskCtrl --> BuildSvc
  Config --> ApiSrv --> ConfigCtrl["config-controller"] --> ConfigSvc
  BuildSvc --> DomainCmd
  DomainCmd --> ConfigSvc
  DomainCmd --> StrategyFactory
  BuildSvc --> ExecOp --> PM --> Executor
```

---

## Build Flow

### Operator build (编译算子)

```mermaid
sequenceDiagram
  participant User
  participant Cmd as VS Code command
  participant Task as TaskController
  participant Build as BuildService
  participant Domain as domain/command
  participant Strategy as Command strategy
  participant PM as ProjectManager
  participant ExecOp as executeOperatorCommand
  participant Exec as CommandExecutor

  User->>Cmd: Build (sidebar / command)
  Cmd->>Task: startBuild(params)
  Task->>Task: guardSupportedProjectType (registry)
  Task->>PM: initProject()
  Task->>Build: startBuild(params)
  Build->>Build: guardSupportedProjectTypeForCurrentProject
  Build->>Build: resolve configId (params or getBuildConfigId)
  alt no configId
    Build->>User: showErrorMessage(no build config)
    return
  end

  Build->>Domain: getBuildOpCommand(...)
  Domain->>Domain: getRuntimeConfigById → workspace merge
  Domain->>Strategy: buildOpCommand(...)
  Strategy-->>Build: buildCommand

  Build->>ExecOp: execute(buildCommand, spawnContext)
  ExecOp->>ExecOp: resolveAscendEnv + placeholders
  ExecOp->>Exec: execute(finalCommand, { env }, toolOutputLabel)
  Exec-->>Build: { code, output }

  alt code !== 0
    Build->>User: compile failed
  else code === 0
    Build->>User: compile success
    Build->>Build: notifyBuildSucceededForSidebar (standard-custom compile flags)
  end

  Task->>PM: clearExecutor()
```

### Example build (编译示例)

Flow is similar: `startBuildExample` → `getBuildExampleConfigId()` → `getBuildExampleCommand` → `executeOperatorCommand`. No `notifyBuildSucceededForSidebar`. PyAsc **throws** on `buildExampleCommand`; ascend/cann/triton implement it (triton uses Python example script).

---

## Config and Command Build

### Config types

| Type | Use | Resolved by |
|------|-----|-------------|
| **build_op** | Operator (kernel) compile | `getBuildConfigId()` — `startBuild`, sanitizer/simulate/on-board pre-build, debug pre-build |
| **build_example** | Example / test binary compile | `getBuildExampleConfigId()` — `startBuildExample`, profiling pre-steps |

**Storage:** extension global `configs.json` (per `project_id`), created/updated by `generateStructure` / `postConfig`. UI list: `getBuildConfigsList()`.

### Runtime config for command generation

`getBaseContext(configId)` in `domain/services/command.ts` calls **`ConfigService.getRuntimeConfigById`**, which:

1. Loads the row from `getConfigById` (id, `config_type`, DB-only `user_options`).
2. Merges **`buildUserOptionsFromWorkspaceSettings(configType, dbOnly)`** into `config.user_options` and top-level `script` / `target_file` for `build_op`.

| Field at runtime | Source |
|------------------|--------|
| `build_op.script`, debug scripts, flow compile scripts | `op-devtools.compileAndDeploy.buildConfig.*` ([`workspace-settings.md`](./workspace-settings.md)) |
| `build_op.target_file` (deploy / run package) | `compileAndDeploy.buildConfig.deployCommandOrRunCommand` |
| `build_example.script`, `execution_mode` | `exampleBuildConfig.*` |
| `build_example.target_file` (msprof / profiler binary) | **DB row only** (not workspace) |
| Sanitizer / simulate / on_board options | Matching `op-devtools.*` keys |

There is **no** fallback to legacy script strings stored only on the DB row after migration.

### `{operatorNames}` and `--ops` (compile scripts)

Ascend standard-custom defaults (see `AscendPlugin.getInitialConfigScripts()` → `configs.json` → migration) include `--ops={operatorNames}` in compile-related script fields (`compileCommand`, `cpuDebugCompileCommand`, `npuDebugCompileCommand`, `utTestCompileCommand`, `onBoardCompileCommand`, `simulationCompileCommand`, `sanitizerCompileCommand`).

At command time, **`applyOperatorNamesPlaceholder()`** in `plugin/src/domain/utils/operator-script-placeholders.ts` (used by ascend and cann `buildOpCommand` / `buildUtTestCommand`):

| Selection | Behavior |
|-----------|----------|
| Operators selected | `{operatorNames}` → comma-separated names (e.g. `--ops=add,sub`) |
| None selected | Token `--ops={operatorNames}` is **removed** (not left as `--ops=`) |
| Legacy settings without placeholder | Temporary fallback appends `--ops=<names>` for ascend pkg/custom/UT-style scripts only (`//FIXME` in source — remove when legacy settings are gone) |

PyAsc/Triton scripts are `python3 ./<op>.py` without `--ops`; cann plain `bash build.sh` flows are unchanged. Example run still uses positional operator args via `buildExampleCommand`, not `--ops` in settings.

### Command generation

- **Select strategy:** `CommandStrategyFactory.getStrategy(operator?.op_type)` → `ascend` | `cann` | `pyasc` | `triton` (default **`cann`** if unknown).
- **Build context:** `strategy.buildCommandContext(baseContext)` → `sourceCannCmd` (`. ${project.ascend_env_script} &&` when set), `cdCmd`, etc.
- **build_op:** `strategy.buildOpCommand({ …, scriptField })` uses merged `user_options[scriptField]` (default `script`) after `applyOperatorNamesPlaceholder()` (see below); ascend adds deploy via `getExecutableCommand(config.target_file)`; cann/triton append `compileOption` / `advance_cmd` as applicable.
- **build_example:** `strategy.buildExampleCommand` — ascend/cann shell; triton/pyasc per strategy (pyasc example path throws on kernel build, not on all example paths — see strategy files).

```mermaid
flowchart LR
  subgraph Input["Input"]
    ConfigId["configId"]
    CompileOpt["compileOption\n--debug | --mssanitizer"]
    OperatorNames["operatorNames"]
    ScriptField["scriptField"]
  end

  subgraph Resolve["Resolve"]
    WS["workspace settings\nop-devtools.*"]
    Config["Runtime config row\nscript, target_file\nmerged user_options"]
    Project["ProjectRecord\nascend_env_script, project_path"]
    Operator["OpRecord\nop_type, op_path"]
  end

  WS --> Config

  subgraph Strategy["Strategy by op_type"]
    Ascend["Ascend: script + applyOperatorNamesPlaceholder\n+ deploy target_file"]
    Cann["Cann: script + applyOperatorNamesPlaceholder\n+ compileOption"]
  end

  subgraph Out["Output"]
    Cmd["Shell command\nsource env; cd path; script args"]
  end

  ConfigId --> Resolve
  Resolve --> Strategy
  CompileOpt --> Strategy
  OperatorNames --> Strategy
  ScriptField --> Strategy
  Strategy --> Cmd
```

### Strategy behavior (compilation)

| Strategy | buildOpCommand | buildExampleCommand |
|----------|----------------|---------------------|
| **ascend** | `user_options[scriptField]` → `applyOperatorNamesPlaceholder` → `Command` + optional `compileOption` / `advance_cmd`; build_op adds `getExecutableCommand(config.target_file)` deploy. `--ops` comes from settings template or legacy fallback, not `Command.addOptions`. | Uses `config.script`, args: op (or operatorNames), execution_mode, pkg_mode; optional compileOption. |
| **cann** | Same placeholder helper on `user_options[scriptField]`; no legacy `--ops` fallback for plain `bash build.sh`. `compileOption`, `advance_cmd`. No separate deploy step. | Implements example build (script + args). |
| **pyasc** | **Not supported** (throws). PyAsc projects run Python; no kernel build in this sense. | **Not supported** (throws). |
| **triton** | Python `build_op` / `build_example` via configured script (`TritonCommandStrategy`). | Same as build_op path for examples. |

---

## Data Format (API)

### startBuild params (StartBuildParams)

| Field | Type | Description |
|-------|------|-------------|
| `configId` | string | Optional. Build config ID (build_op). If omitted, plugin uses default for current project. |
| `compileOption` | string | Optional. e.g. `--debug`, `--mssanitizer` for debug or sanitizer build. |
| `operatorNames` | string | Optional. Comma-separated operator names (e.g. for standard custom op). |
| `operatorType` | string | Optional. Hint for which kind of operator to build. |
| `projectId` | string \| number | Optional. Project ID; if set, ProjectManager is updated so build runs in that project context. |
| `scriptField` | string | Optional. Which config field to use as script: `script`, `cpu_debug_script`, `npu_debug_script`. |

### startBuildExample params (StartBuildExampleParams)

| Field | Type | Description |
|-------|------|-------------|
| `configId` | string | Optional. Example build config ID (build_example). |
| `compileOption` | string | Optional. |
| `operatorNames` | string | Optional. Comma-separated. |
| `operatorType` | string | Optional. |
| `projectId` | string \| number | Optional. Project ID. |

---

## Component Map (plugin/src)

```mermaid
flowchart TB
  subgraph API["API"]
    Routes["api-routes.ts\nops: getConfigData, saveConfig\n(task dispatch → startBuild in-plugin)"]
    TaskCtrl["controller/task-controller.ts\nstartBuild, startBuildExample"]
    ConfigCtrl["controller/config-controller.ts\ngetConfigData, saveConfig"]
  end

  subgraph Service["Service"]
    BuildSvc["service/build-service.ts\nstartBuild, startBuildExample\ngetBuildConfigId, getBuildExampleConfigId\ngetBuildConfigsList"]
  end

  subgraph Domain["Domain"]
    Cmd["domain/services/command.ts\ngetBuildOpCommand, getBuildExampleCommand"]
    ConfigSvc["domain/services/configuration"]
    Factory["domain/services/command-strategy/factory.ts\nCommandStrategyFactory"]
    Ascend["domain/services/command-strategy/ascend-strategy.ts"]
    Cann["domain/services/command-strategy/cann-strategy.ts"]
    PyAsc["domain/services/command-strategy/pyasc-strategy.ts"]
  end

  subgraph Core["Core"]
    PM["core/project/project-manager.ts\ngetExecutor, initProject"]
    CmdExec["class/command-options.ts\nCommandExecutor"]
  end

  Routes --> TaskCtrl
  Routes --> ConfigCtrl
  TaskCtrl --> BuildSvc
  ConfigCtrl --> BuildSvc
  ConfigCtrl --> ConfigSvc2["service/config-service.ts\nsaveConfig → settings"]
  BuildSvc --> Cmd
  BuildSvc --> ExecOp["service/operator-command-executor.ts"]
  Cmd --> ConfigSvc2
  Cmd --> Factory
  Factory --> Ascend
  Factory --> Cann
  Factory --> PyAsc
  Factory --> Triton["triton-strategy.ts"]
  ExecOp --> PM
  PM --> CmdExec
```

| File | Role |
|------|------|
| `controller/task-controller.ts` | `startBuild` / `startBuildExample`: `ensurePostActivateBootstrapReady`, `initProject`, registry guard, BuildService, `clearExecutor` in `finally`. |
| `service/build-service.ts` | `guardSupportedProjectTypeForCurrentProject`; `getBuildOpCommand` / `getBuildExampleCommand`; **`executeOperatorCommand`**; toasts; `notifyBuildSucceededForSidebar`; standard-custom `.run` deploy helper for simulate/on-board. |
| `service/operator-command-executor.ts` | `executeOperatorCommand`, `buildOperatorSpawnContext`. |
| `service/config-service.ts` | `getRuntimeConfigById`, `buildUserOptionsFromWorkspaceSettings`, `applyWorkspaceSettingsToConfigs`. |
| `domain/services/command.ts` | `getBuildOpCommand`, `getBuildExampleCommand` via `getBaseContext` → runtime config. |
| `domain/services/command-strategy/factory.ts` | `CommandStrategyFactory.getStrategy(opType)` → ascend, cann, pyasc, or triton. |
| `domain/utils/operator-script-placeholders.ts` | `applyOperatorNamesPlaceholder`, `replaceOperatorScriptPlaceholders` (`{soc_version}`, `{simulator_type}`, `{operatorNames}`). |
| `domain/plugins/ascend.plugin.ts` | Default compile scripts with `--ops={operatorNames}` in `base` (+ `utTestScript`). |
| `domain/services/command-strategy/ascend-strategy.ts` | Ascend: buildOpCommand (placeholder + deploy), buildUtTestCommand, buildExampleCommand (script + op, mode, pkg_mode). |
| `domain/services/command-strategy/cann-strategy.ts` | Cann: buildOpCommand / buildUtTestCommand via `applyOperatorNamesPlaceholder`. |
| `domain/services/command-strategy/pyasc-strategy.ts` | PyAsc: buildOpCommand and buildExampleCommand throw (not supported). |
| `domain/services/command-strategy/triton-strategy.ts` | Triton: Python `build_op` / `build_example` via configured script (`python3 ./<op>.py`); UT test throws; sanitizer command exists but Actions tree hides sanitizer when `TritonPlugin.buildBehavior.supportsSanitizer === false`. |
| `core/project/project-manager.ts` | `initProject()`, `getExecutor()` (CommandExecutor), `clearExecutor()`. |
| `api-routes.ts` | `ops`: `getConfigData`, `saveConfig` only. Build/run via in-plugin `taskMethods` (commands / Operate tree), not `ops` RPC. |

---

## DumpTensor Behavior Note

- `BuildService.startDumpTensor` runs `build_op`, then either **build example** (standard custom) or **run** (other project types).
- Example build and run commands are prefixed with `ASCEND_GLOBAL_LOG_LEVEL=1` and `ASCEND_DUMP_PATH` pointing at `dump_tensor_temp_data` under the IDE config dir (same env for both branches).
- After a successful example build or run, `show_kernel_debug_data` post-processes temp dump files into `DumpTensor`, then the panel opens (`finalizeDumpTensorFlow` → `openDumpTensorPanel`).
- **Import .bin** uses the same `show_kernel_debug_data` step before opening the panel.

---

## Summary

- **Entry:** Actions tree **Build** / VS Code commands → `taskMethods` → `BuildService` (not operator action queue). Folder context and debug paths call the same `startBuild` with different `scriptField` / `compileOption`.
- **Config:** `configs.json` rows + workspace `op-devtools.*` at runtime (`getRuntimeConfigById`); deploy target from `deployCommandOrRunCommand`; profiler binary path from DB `build_example.target_file`.
- **Command build:** `CommandStrategyFactory` by `op_type`; pyasc **throws** on kernel `buildOpCommand`; triton uses Python scripts when enabled (`operatorSupport.triton`).
- **Execution:** `executeOperatorCommand` — ascend env resolution, `{soc_version}` / `{simulator_type}` substitution, spawn env per [`ascend-env-spec.md`](./ascend-env-spec.md).
- **Protocols:** `ops` = simulate/on-board/sanitizer settings only; compile is in-plugin via `taskMethods`, not webview RPC.
