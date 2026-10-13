# Operator plugin registry — current state and gaps

How `plugin/src` routes operator-type and project-structure behavior through **`OperatorPluginRegistry`** (`domain/plugins/`).

**Related:** [`operator-behavior-specification.md`](./operator-behavior-specification.md) (user-visible actions), [`new-project-generation-specification.md`](./new-project-generation-specification.md), [`build-integration.md`](./build-integration.md), [`ascend-env-spec.md`](./ascend-env-spec.md).

---

## Two axes

| Axis | Type | Registry API | Examples |
|------|------|--------------|----------|
| **Runtime `op_type`** | `ascend`, `cann`, `pyasc`, `triton` | `registerOpPlugin` → `getOpPlugin(opType)` | Command strategies, paths, generators, `buildBehavior` |
| **Detection `OperatorProjectType`** | `standard-custom`, `ascend-c`, `torch-library`, `pyasc`, `triton`, … | `registerDetector` → `detectProject(dir)` | Sidebar capabilities, folder menus |

`viewIdToProjectType` / stored `project_type` can differ from `op_type` (e.g. STANDARD_CUSTOM stores `ascend` for scaffold). See behavior spec.

**Triton:** registered only when `op-devtools.operatorSupport.triton` is true (`domain/plugins/index.ts`).

---

## What the registry owns today

Registered at `registerOperatorPlugins()` from `extension.ts` activate:

| Plugin / detector | `op_type` | Detection | Notes |
|-------------------|-----------|-------------|--------|
| `StandardCustomDetector` | — | `standard-custom` | First in detector order |
| `TorchLibraryDetector` | — | `torch-library` | |
| `TritonPlugin` (optional) | `triton` | `triton` | Feature toggle |
| `PyAscPlugin` | `pyasc` | `pyasc` | |
| `AscendPlugin` | `ascend` | `ascend-c` | |
| `CannPlugin` | `cann` | — | No detector |

**Routed through the registry:**

| Concern | Implementation |
|---------|----------------|
| Default paths | `OperatorPluginRegistry.getDefaultPaths(op)` → `{ targetOpFile, targetExampleFile }` |
| Project generator | `OpGeneratorFactory.getGenerator` → `getProjectGenerator` |
| Project detection | `OperatorProjectDetector` → `OperatorPluginRegistry.detectProject` |
| Initial config scripts (most) | `ProjectService.createOpsByPrototype` → `ConfigService.ensureOpDevtoolsSettingsSeeded` → `getInitialConfigScripts` / `getDefaultPaths` |
| Build/run/sim/on-board preflight | `BuildService` → `opPlugin.buildBehavior` |
| Actions tree capabilities | `OperatorPluginRegistry.getBuildBehaviorByProjectType` |

---

## What is still outside the registry

| Location | What remains | Impact for new types |
|----------|--------------|----------------------|
| **`CommandStrategyFactory`** | `ascend` / `cann` / `pyasc` / `triton` strategy classes | Still need a strategy class + factory map entry |
| **`folder-context-menu-service.ts`** | Large `switch (detection.projectType)` for mark-as-operator, templates, warnings | Touch menu paths when adding a **project type** |
| **`config-service.ts`** | Section defaults (sanitizer, on-board, simulate, …) assembled in `ensureOpDevtoolsSettingsSeeded` from plugin `getInitialConfigScripts` / `getDefaultPaths`; `ut_test` uses `scripts.utTestScript` from plugin | Defaults move with the plugin; section DAOs stay settings-native |
| **`command.ts`** | All commands via `CommandStrategyFactory.getStrategy(op_type)` | Expected until strategies are plugin-owned |

Adding a **new `op_type`** today: implement `*.plugin.ts` ( `IOperatorPlugin` + optional `IProjectDetector` ), register in `index.ts`, add **`command-strategy/<type>-strategy.ts`** + factory registration, add tests.

Adding a **new project type** with existing `op_type`: often detector-only + `folder-context-menu-service` cases + `buildBehavior` flags.

---

## `IOperatorPlugin` surface (summary)

Key hooks used in production:

- `getDefaultPaths(op)` — deploy/run targets, script paths  
- `getInitialConfigScripts(record, workspaceRoot)` — script bundle (`script`, debug scripts, `utTestScript`, example, sanitizer, on-board, simulation) consumed by `ConfigService.ensureOpDevtoolsSettingsSeeded`  
- `createProjectGenerator(...)` — template unzip / scaffold  
- `buildBehavior` — `requiresBuildBeforeAnalysis`, `requiresActiveFileCheck`, `supportsSanitizer`, `supportsSimulate`, `supportsOnBoard`, CPU/NPU debug flags  
- `getSpawnEnvExportKeys()` — which of `SOC_VERSION` / `NPU_ARCH` this op_type may export; filtered by `OperatorPluginRegistry.filterSpawnEnv()` (project_type can force none)  
- `patchGeneratedProject(opPath, params)` — post-unzip template fixes (`AscendPlugin` → ACLNN `SUPPORT_*` in cmake)  
- `detectProject(dir)` — when plugin also implements `IProjectDetector`

Interfaces: `domain/plugins/operator-plugin.interface.ts`, `project-detector.interface.ts`, `abstract-operator-plugin.ts`.

---

## Command strategies (parallel system)

Runtime shell commands are built by **`CommandStrategyFactory`** (`domain/services/command-strategy/`), not by the plugin registry directly. Plugins influence commands indirectly via the per-section typed DAO factories on `ConfigService` (`getBuildOpConfig()` / `getBuildExampleConfig()` / `getUtTestConfig()` / `getSimulateConfig(projectPath)` / `getOnBoardConfig(projectPath)` / `getSanitizerConfig(projectPath, op)`) and `buildBehavior`.

The registry does **not** dispatch commands itself — `CommandStrategyFactory` owns that; the two systems share `buildBehavior` and the settings-native section DAOs.

---

## Detection order

Order in `domain/plugins/index.ts` matters:

1. `StandardCustomDetector`  
2. `TorchLibraryDetector`  
3. `TritonPlugin` (if enabled)  
4. `PyAscPlugin`  
5. `AscendPlugin`  

First match wins.

---

## Source files

| Path | Role |
|------|------|
| `domain/plugins/index.ts` | Registration |
| `domain/plugins/operator-plugin.registry.ts` | Registry |
| `domain/plugins/*.plugin.ts`, `*.detector.ts` | Per-type behavior |
| `domain/services/operator-project-detector.ts` | Thin detect wrapper |
| `domain/services/command-strategy/factory.ts` | Strategy dispatch |
| `service/build-service.ts` | `buildBehavior` consumer |
| `service/folder-context-menu-service.ts` | Residual project-type switches |

---

## Tests

- Plugin registry / detection: search `plugin/src/__tests__` for `OperatorPluginRegistry`, `StandardCustom`, `Triton`.  
- Commands: `command-strategy` specs, `operator-spawn-env.spec.ts`.
