# Run Integration Architecture

How **operator run** (运行算子) is integrated: entry points, config selection, command generation, and execution — for every supported **project type** and **`op_type`**.

**Related:** [`build-integration.md`](./build-integration.md) (shared strategies, `executeOperatorCommand`), [`workspace-settings.md`](./workspace-settings.md) (`deployCommandOrRunCommand`), [`operator-treeview.md`](./operator-treeview.md) (Run row — **not** queued), [`operator-plugin-registry.md`](./operator-plugin-registry.md) (registry axes), [`new-project-generation-specification.md`](./new-project-generation-specification.md) (stored `project_type` vs `op_type`).

---

## Overview

The plugin does **not** ship a runtime. It:

- **Builds** a run command with **`getRunCommand(configId)`** → command strategy (`getRunTargetFile`, `buildRunCommand`).
- **Selects the config row** in `BuildService.startRun` from **`OperatorPluginRegistry.getOpPlugin(projectType).buildBehavior`** (where `projectType` comes from `homeMethods.getProjectType()` — stored `projects.json` `project_type` or live detection).
- **Selects the shell strategy** from the operator row’s **`op_type`** (`CommandStrategyFactory.getStrategy(operator?.op_type)` inside `getRunCommand`).
- **Runs** through **`executeOperatorCommand`** with `outputLabel: 'run'` (ascend env + placeholders + per-run output channel).
- **Exposes** run via VS Code commands → `taskMethods.startRun` (Actions tree **Run**, folder context menu for PyAsc). **Not** on `ops` RPC.

**Two axes (do not conflate):**

| Axis | Examples | Used in run for |
|------|----------|-----------------|
| **`project_type`** | `ascend`, `cann`, `pyasc`, `triton`, or detection strings `standard-custom`, `ascend-c`, `torch-library` | `build_op` vs `build_example` config id, active-`.py` gate, unsupported-project guard |
| **`op_type`** (on `ops` row) | `ascend`, `cann`, `pyasc`, `triton` | `cdCmd` / `cdBuildCmd`, `getRunTargetFile`, `buildRunCommand` |

After **New Project** or **Open Project** init, stored `project_type` usually matches an **`op_type`** string (`cann`, `ascend`, `pyasc`, `triton`). Detection-only workspaces can still report `standard-custom`, `ascend-c`, or `torch-library` — see [Registry resolution](#registry-resolution-startrun-vs-sidebar).

---

## Protocols

```mermaid
flowchart LR
  subgraph Plugin["This plugin"]
    Commands[VS Code command / Actions tree / folder menu]
    TaskCtrl[Task controller]
    BuildSvc[BuildService.startRun]
    DomainCmd[getRunCommand]
    Strategy[Command strategy by op_type]
    ExecOp[executeOperatorCommand]
  end

  subgraph Env["Execution"]
    Executor[CommandExecutor]
    Shell[Shell / binary or python3]
  end

  Commands --> TaskCtrl --> BuildSvc
  BuildSvc --> DomainCmd --> Strategy
  BuildSvc --> ExecOp --> Executor --> Shell
```

| Layer | Role |
|-------|------|
| **Entry** | `huawei-op-devtools.sidebar.run` → `taskMethods.startRun`; PyAsc folder **Run** → `folder-context-menu-service` then `startRun({ filePath })` |
| **Plugin → shell** | `executeOperatorCommand` → `ProjectManager.getExecutor().execute(..., { env, toolOutputLabel: 'run' })` |

---

## Run flow

```mermaid
sequenceDiagram
  participant User
  participant Task as TaskController
  participant Build as BuildService
  participant Home as homeMethods.getProjectType
  participant Reg as OperatorPluginRegistry.getOpPlugin
  participant Domain as getRunCommand
  participant ExecOp as executeOperatorCommand

  User->>Task: startRun(params)
  Task->>Task: guardSupportedProjectType
  Task->>Build: startRun(params)
  Build->>Build: guardSupportedProjectTypeForCurrentProject
  Build->>Home: projectType
  Build->>Reg: getOpPlugin(projectType).buildBehavior

  alt requiresActiveFileCheck and no filePath
    Build->>Build: active .py required
    Build->>Build: writeBuildOpDeployTarget(python3 relPath)
  end

  Build->>Build: configId = build_op or build_example
  Build->>Domain: getRunCommand(configId)
  Note over Domain: strategy = operator.op_type
  Domain->>Domain: getRuntimeConfigById
  Build->>ExecOp: execute(runCommand, spawnContext)
  ExecOp-->>Build: { code, output }
```

---

## Project types and run behavior

### Summary table

| Project context | `project_type` after init ([`viewIdToProjectType`](../plugin/src/domain/utils/project-utils.ts)) | Typical `op_type` on operators | `startRun` config row | Command strategy | Run target (`getRunTargetFile`) | Working directory in `buildRunCommand` |
|-----------------|--------------------------------------------------------------------------------------------------|-------------------------------|----------------------|------------------|--------------------------------|----------------------------------------|
| **CANN** (New Project view 1) | `cann` | `cann` | `build_example` | **cann** | Workspace `compileAndDeploy.buildConfig.deployCommandOrRunCommand` | `sourceCannCmd` + **`cdBuildCmd`** + `getExecutableCommand(target)` |
| **Standard custom** (view 2; detection `standard-custom`) | `ascend` | `ascend` | `build_example` | **ascend** | Same workspace deploy key | `sourceCannCmd` + **`cdCmd`** + `getExecutableCommand(target, { mode: 'run' })` |
| **Ascend C** (detection `ascend-c`) | `cann` | `cann` (init uses `viewIdToProjectType`) | `build_example` | **cann** | Workspace deploy key | `cdBuildCmd` + executable |
| **Torch library** (detection `torch-library`) | `cann` | `cann` | `build_example` | **cann** | Workspace deploy key | `cdBuildCmd` + executable |
| **PyAsc** | `pyasc` | `pyasc` | **`build_op`** | **pyasc** | Workspace deploy (`python3 …`) via `getPythonRunTargetFile` | `sourceCannCmd` + **`cdCmd`** + normalized python command (no chmod) |
| **Triton** (`op-devtools.operatorSupport.triton`) | `triton` | `triton` | **`build_op`** | **triton** | Same as PyAsc (workspace deploy) | Same as PyAsc |

**Compiled run (CANN / Ascend / Ascend C / Torch / Standard custom):** user sets **`deployCommandOrRunCommand`** to the built binary or `.run` package (often updated after **编译示例**). `startRun` passes **`build_example`** config id, but the **executable path** still comes from the **`build_op`** workspace key through `getRunTargetFile` — not from DB `build_example.target_file`. DB `build_example.target_file` remains for **profiler / msprof** flows ([`workspace-settings.md`](./workspace-settings.md)).

**Python run (PyAsc / Triton):** deploy target is `python3 <path>` in the same workspace key; `startRun` uses **`build_op`** config id because `requiresBuildBeforeAnalysis: false`.

### Per-type notes

#### CANN (`project_type` / `op_type` = `cann`)

- Plugin: `CannPlugin` → `requiresBuildBeforeAnalysis: true`, no active-file check.
- Run after example build: set **`deployCommandOrRunCommand`** to the runnable artifact (or rely on post-build helpers that refresh it for standard-custom `.run` flows — see `getStandardCustomDeployCommand` in `command.ts`).
- Strategy **`cdBuildCmd`**: `mkdir -p <op>/build && cd <op>/build` (operator run path from `getOpRunPath`).

#### Standard custom (stored `ascend`, `op_type` `ascend`)

- Same config row and deploy key as other compiled types; strategy uses **`cdCmd`** to operator run path (not `cdBuildCmd` for run).
- Multi-operator selection: Actions **Run** is disabled when multiple operators are selected ([`operator-treeview.md`](./operator-treeview.md)).
- Collection operators share one project; run uses the configured example / deploy target for the active config row.

#### Ascend C and Torch library

- **Detection** types: `ascend-c`, `torch-library` ([`operator-behavior-specification.md`](./operator-behavior-specification.md)).
- **After Open Project init:** `project_type` is stored as **`cann`** (`viewIdToProjectType`), so `startRun` uses **CannPlugin** behavior and **`build_example`**.
- Operators created by `generateStructure` use **`op_type: cann`** for these opens unless later changed by mark-as-operator / templates.
- Torch library may set `template_name` / `torch_library_template` at init; run pipeline is still CANN strategy + `build_example`.

#### PyAsc (`pyasc`)

- `requiresActiveFileCheck: true`, `activeFileExtension: '.py'`.
- Without `params.filePath`: active editor must be `.py`; plugin writes **`python3 <path relative to workspace root>`** via `writeBuildOpDeployTarget`.
- **Folder menu (PyAsc root):** updates deploy target relative to **operator `op_path`**, then `startRun({ filePath: basename })` only to **skip** the active-editor check (`filePath` is not read for command assembly).
- `buildOpCommand` / `buildExampleCommand` **throw** — run is the primary “execute” path.
- Special error: missing `runtime_camodel` → `build.runFailedPyascRuntime`.

#### Triton (`triton`)

- Same Python run model as PyAsc (`build_op`, workspace deploy, active `.py` gate).
- Registered only when **`op-devtools.operatorSupport.triton`** is true.
- `buildBehavior`: no sanitizer / simulate / on-board in plugin flags (Actions tree hides those capabilities).
- Default deploy in generator often `python3 ./<op_name>.py`; user may override in settings.

#### Unsupported / disabled

- **`guardSupportedProjectTypeForCurrentProject`:** `OperatorPluginRegistry.isProjectTypeSupported(detectedType)` — unknown or empty `project_type` → error toast, run aborted.
- **`multi-project`:** reserved detection label; not a normal single-operator run target.
- Actions **Run** hidden or disabled when project type unsupported or multiple operators selected (tree rules).

---

## Registry resolution (`startRun` vs sidebar)

| API | Used by | Resolution |
|-----|---------|------------|
| **`getOpPlugin(projectType)`** | **`BuildService.startRun`** | Treats `projectType` as an **`op_type`** key; unknown strings fall back to **`cann`** plugin |
| **`getBuildBehaviorByProjectType(projectType)`** | **Actions tree** (`OperateTreeProvider`) | Matches **`projectTypeMappings`** first (`standard-custom` → CannPlugin, `ascend-c` / `torch-library` → AscendPlugin, …) |

**Practical impact:**

- Registered **standard-custom** projects store **`ascend`** → `startRun` and sidebar agree (Ascend plugin, `build_example`).
- **Unregistered** workspace with detection **`ascend-c`** or **`torch-library`**: sidebar may show **Ascend** capabilities while **`startRun`** still uses **cann** fallback until `projectService.init` stores `cann` via `viewIdToProjectType`.
- Prefer **`getProjectTypePlugin` / `getBuildBehaviorByProjectType`** semantics when documenting expected behavior; implementation of `startRun` still uses **`getOpPlugin`** today.

Command generation always follows **`operator.op_type`**, not `project_type`, so a mismatch between stored project type and operator rows is visible only in config-id / UI gates, not in the shell strategy class.

---

## Config selection and runtime merge

| `buildBehavior.requiresBuildBeforeAnalysis` | Config row | Default `configId` when omitted |
|---------------------------------------------|------------|--------------------------------|
| `false` (PyAsc, Triton) | `build_op` | `getBuildConfigId()` |
| `true` (Cann, Ascend, defaults) | `build_example` | `getBuildExampleConfigId()` |

Runtime merge: **`ConfigService.getRuntimeConfigById`** → `applyWorkspaceSettingsToConfigs` ([`workspace-settings.md`](./workspace-settings.md)).

For **`build_op`** rows, merged `target_file` comes from **`compileAndDeploy.buildConfig.deployCommandOrRunCommand`**. For **`build_example`** rows, workspace merge does **not** set `target_file`; strategies read deploy via **`getRunTargetFile`** → workspace key anyway.

### Strategy run assembly

| Strategy | `getRunTargetFile` | `buildRunCommand` |
|----------|-------------------|-------------------|
| **ascend** | `readBuildOpDeployTargetFromWorkspace()` | `sourceCannCmd`, **`cdCmd`**, `getExecutableCommand(target, { execute: true, mode: 'run' })` |
| **cann** | Same workspace deploy key | `sourceCannCmd`, **`cdBuildCmd`**, `getExecutableCommand(target, { execute: true })` |
| **pyasc** / **triton** | `getPythonRunTargetFile` → workspace deploy | `sourceCannCmd`, **`cdCmd`**, `normalizePythonCommandInterpreter(target)` (interpreter from workspace / venv / `python.defaultInterpreterPath`) |

Profiler / msprof / sanitizer **binary** paths still use DB `build_example.target_file` (or strategy-specific `getProfilerTargetFile`) — not the deploy workspace key.

---

## `startRun` params (`StartRunParams`)

| Field | Description |
|-------|-------------|
| `configId` | Optional; else plugin picks `build_op` vs `build_example` from plugin **`buildBehavior`** |
| `filePath` | Optional; **only** skips `requiresActiveFileCheck` (PyAsc folder menu). Does not select the script by itself — folder menu writes deploy target first |

---

## Component map

| File | Role |
|------|------|
| `controller/task-controller.ts` | `startRun`, `initProject`, registry guard, `clearExecutor` |
| `service/build-service.ts` | `startRun`, `writeBuildOpDeployTarget`, `getRunCommand`, `executeOperatorCommand` |
| `service/folder-context-menu-service.ts` | PyAsc folder run → deploy target + `startRun({ filePath })` |
| `service/operator-command-executor.ts` | Env + execute |
| `service/config-service.ts` | `getRuntimeConfigById`, deploy target writes |
| `domain/services/command.ts` | `getRunCommand` |
| `controller/home-controller.ts` | `getProjectType` |
| `domain/plugins/*.plugin.ts` | `buildBehavior`, `projectTypeMappings` |
| `domain/services/command-strategy/*.ts` | Per-`op_type` run command shape |

---

## Summary

- **Entry:** Actions **Run** / command palette / PyAsc folder menu → `taskMethods.startRun` (not action queue).
- **Config row:** from **`getOpPlugin(projectType).buildBehavior`**; **shell strategy:** from **`operator.op_type`**.
- **Run target:** workspace **`deployCommandOrRunCommand`** for all strategies at run time; DB `build_example.target_file` is for profiler-related flows.
- **Execution:** `getRunCommand` → **`executeOperatorCommand`** (same stack as build).

---

## Troubleshooting

### `qemu: uncaught target signal 11 (Segmentation fault)`

Usually **architecture mismatch** (x86_64 host running aarch64-built binary). Run on matching hardware or rebuild in the same environment.

### PyAsc: `cannot find -lruntime_camodel`

Set **`environment.environmentScript`** to your CANN `set_env.sh` ([`workspace-settings.md`](./workspace-settings.md)), not only `/etc/profile`. Ensure CANN runtime libraries are installed in the run environment.

### Run does nothing / “unsupported project type”

Check **`projects.json`** `project_type` and live detection via **Open Project**. Triton requires **`op-devtools.operatorSupport.triton`**. Empty or unknown `project_type` fails `isProjectTypeSupported`.

### Wrong binary or `python3` path

Update **`compileAndDeploy.buildConfig.deployCommandOrRunCommand`** in workspace settings. For PyAsc sidebar run, ensure a **`.py`** editor is active or use the folder menu on a `.py` file (menu updates deploy before `startRun`).
