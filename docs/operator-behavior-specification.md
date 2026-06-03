# Operator Plugin Behavior Specification (`plugin/src`)

## Scope and terminology

This document specifies current behavior implemented in `plugin/src` for operator project detection, registration, action execution, templates, and runtime/config dependencies.

The code uses two related type systems:

- **Detection types** (`OperatorProjectType`): `standard-custom`, `ascend-c`, `torch-library`, `pyasc`, `triton`, `multi-project`.
- **Runtime strategy types** (`op_type`): `ascend`, `cann`, `pyasc`, `triton` (used by command strategy and template generator). Triton is registered only when `op-devtools.operatorSupport.triton` is enabled.

## Operator types and project structures

### `standard-custom`
- Root contains `build.sh` with `--genop` (highest-priority rule).
- Typical structure: collection folders (`math`, `conv`, etc.), optional `experimental/<collection>`, and operator subfolders containing `CMakeLists.txt`.

### `ascend-c`
- `CMakeLists.txt` exists.
- `.asc` files exist (root or limited recursive search).
- No root `.py`.

### `torch-library`
- `CMakeLists.txt` exists.
- Root contains `.py` files.

### `pyasc`
- Root contains `.py` files.
- No `CMakeLists.txt`.

### `triton`
- Root contains `.py` files, no `CMakeLists.txt`.
- Heuristic detection: Triton Python markers in sources (`import triton`, `@triton.jit`, etc.) — see `TritonPlugin.detectProject` / `detection-utils.ts`.
- Default template: `triton_vector_add` (`TritonOpGenerator`).

## Detection and collection in workspace

```mermaid
flowchart TD
  A[Workspace opened / Open Project command] --> B[detectOperatorProject]
  B -->|not operator| C[vscode.openFolder fallback]
  B -->|operator| D[projectService.init]
  D --> E[generateStructure]
  B -->|standard-custom| F[scanOpsMeetAndOpsLists]
  F --> G[updateStandardCustomOperators]
```

Behavior details:
- On activation with workspace, plugin calls `welcomeMethods.openProject(..., isFromSystem=true)`.
- `openProject` detects type, initializes project metadata (`projects.json`), runs `generateStructure`, and for `standard-custom` scans and stores:
  - `ops_meet`
  - `ops_list`
  - `experimental_ops_list`
- Collection scanning uses whitelist-based collection names and detects operators by `CMakeLists.txt`.

## Supported actions and configuration

### Config model

**Canonical reference:** [`workspace-settings.md`](./workspace-settings.md) (keys, merge, migration).

`generateStructure` creates default **rows** in `configs.json` per operator (`build_op`, `build_example`, `sanitizer`, `on_board`, `simulate`). Initial script strings come from `OperatorPluginRegistry.getOpPlugin(op_type).getInitialConfigScripts()` at creation time.

**At command time** (after one-time legacy migration, `op-devtools.internal.settingsMigratedFromLegacy`):

| Source | Holds |
|--------|--------|
| Workspace `settings.json` (`op-devtools.*`) | Compile/deploy scripts, sanitizer options, simulation/on-board options, env script path, SOC/simulator overrides |
| `configs.json` row | Row id, `config_type`, operator linkage, **DB-only** fields (`fileMapList`, `config_name`, `target_dir`, …) and **`build_example.target_file`** (profiler binary path) |

Runtime `user_options` for commands are built by **`ConfigService.buildUserOptionsFromWorkspaceSettings`** + **`applyWorkspaceSettingsToConfigs`** (`getRuntimeConfigById`), not by re-reading stored script fields from the DB row. Writes to settings use **`ConfigService.writeOpDevtoolsDottedSettings`** only.

`getConfig` / `postConfig` remain for row lifecycle (create structure, list configs, DB-only updates); they do **not** drive compile script strings after migration.

## Ascend/CANN environment and SOC resolution

**Canonical spec:** [`ascend-env-spec.md`](./ascend-env-spec.md) (precedence, spawn env, placeholders, logging). **A5:** [`ascend-a5-support.md`](./ascend-a5-support.md). **Workspace keys:** [`workspace-settings.md`](./workspace-settings.md#environment-op-devtoolsenvironment).

Operator commands use `resolveAscendEnvForOperatorCommand` → `executeOperatorCommand` ([`build-integration.md`](./build-integration.md)). Strategies may prepend `. ${project.ascend_env_script} &&` when `projects.json` has a script path synced from `environment.environmentScript`.

### Action capability by type

| Type | Build | Run | Debug | Sanitizer | On-board/Simulate | Mark/Unmark |
|---|---|---|---|---|---|---|
| `standard-custom` | Yes | Yes | Yes | Yes (needs `--bisheng_flags`) | Blocked in context menu | Yes |
| `ascend-c` | Strategy exists, menu actions blocked | Blocked in folder menu | Blocked | Blocked | Blocked | Blocked |
| `torch-library` | Strategy/init exists, menu actions blocked | Blocked in folder menu | Blocked | Blocked | Blocked | Blocked |
| `pyasc` | Build/build_example unsupported in strategy | Yes | Yes | Unsupported in strategy | Yes | Blocked |
| `triton` | Python script via `build_op` / `build_example` (not CANN `build.sh`) | Yes | No (plugin disables CPU/NPU debug rows) | Hidden in Actions tree (`supportsSanitizer: false`) | No (`supportsSimulate` / `supportsOnBoard: false`) | Blocked |

Notes:
- `pyasc` and `triton` run paths require/select a `.py` target and rewrite `build_op.target_file` when needed.
- `triton` uses `TritonCommandStrategy` (shared Python-operator shell assembly with PyAsc); probe `torch` + `triton` imports via `probeTritonPythonDependencies()` where used.
- Debug flows compile first with script-field overrides (`npu_debug_script` / `cpu_debug_script`), then launch debug configuration — not exposed for Triton in the Actions tree.

## Templates per operator type and rationale

Template mapping:
- `op_type=ascend` -> `ascend_template/add_custom.zip`
- `op_type=cann` -> `cann_template/<template>.zip` (default `hello_world`)
- `op_type=pyasc` -> `cann_template/pyasc_temple.zip`
- `op_type=triton` -> `triton_template/triton_vector_add.zip` (default template name)

Detection/init mapping:
- `ascend-c` -> template `hello_world`
- `torch-library` -> template `torch_library_template`
- `pyasc` -> template `pyasc_temple`
- `triton` -> template `triton_vector_add`
- `standard-custom` -> usually skip unzip, initialize configs only

Rationale in current code:
- Existing user projects should not be overwritten (`skipExisting`, skip unzip paths).
- Templates are used as minimal bootstrapping for generated projects.

## How users add new operators

- **Inside standard-custom**: create operator under valid collection; metadata updates into root project’s `ops_list` / `experimental_ops_list`.
- **Inside pyasc / triton**: add/select `.py` files and use run flows (debug/profile for pyasc; triton has no debug rows in Actions tree).

## Why separate Open Operator command exists

`Open Operator Project` performs operator-specific bootstrap that plain `Open Folder` does not:
- type detection
- project registration
- config generation (`build_*`, `sanitizer`, profiling configs)
- `.vscode/devtool_config.json` and launch setup
- standard-custom collection/operator scanning persistence

Without this, plugin state/config may be incomplete.

## Dependencies between actions and caching strategy

```mermaid
flowchart LR
  A[Action request] --> B{Type}
  B -->|pyasc / triton| C[Skip compile; set target .py]
  B -->|others| D[Build first]
  D --> E{Action}
  E --> F[Run]
  E --> G[Sanitizer]
  E --> H[On-board]
  E --> I[Simulate]
  G --> J[May build example first]
  H --> J
  I --> J
```

Persisted state (cache-like):
- `projects.json`: project metadata, operator lists, compile flags
- `ops.json`: operator records
- `configs.json`: action configuration records

Incremental behavior:
- `skipExisting` avoids clobbering existing files on generation.
- Compiled status is preserved on rescans and updated after successful builds.
- No content-hash artifact cache is implemented; build avoidance is mostly script/toolchain-level plus persisted metadata.

## Additional behavior questions covered

- `multi-project` is present in enum but not a first-class runtime action pipeline.
- There is a mapping asymmetry between detection types and `op_type` conversion in some paths (`viewIdToProjectType` vs other init code).
- Context menu intentionally blocks some action/type combinations even when config scaffolding exists.
- Platform assumptions exist in command execution paths (e.g., shell/bash usage).

## Key source files

- `plugin/src/domain/plugins/` — registry ([`operator-plugin-registry.md`](./operator-plugin-registry.md))
- `plugin/src/domain/services/operator-project-detector.ts`
- `plugin/src/service/workspace-detector-service.ts`
- `plugin/src/controller/welcome-controller.ts`
- `plugin/src/extension.ts`
- `plugin/src/service/folder-context-menu-service.ts`
- `plugin/src/domain/models/model.ts`
- `plugin/src/domain/services/op-generator-factory.ts`
- `plugin/src/service/build-service.ts`
- `plugin/src/service/sanitizer-service.ts`
- `plugin/src/controller/task-controller.ts`
- `plugin/src/domain/services/command-strategy/*.ts`
- `plugin/src/domain/models/project-model.ts`
- `plugin/src/domain/utils/project-utils.ts`
- `plugin/src/helpers/operator-project-workspace-config.ts` (`getAscendEnvScriptWithWorkspaceOverride`, `getEnvironmentScriptPathFromWorkspace`)
