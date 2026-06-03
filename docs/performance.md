# Performance profiling — architecture

This document describes how **simulation** and **on-board** performance analysis (`msprof` CLI) are integrated in Huawei OP DevTools **as implemented today**: build/deploy pre-steps, profiler command generation, output under `opprof`, and a **native VS Code tree** for browsing results. The extension orchestrates tooling; **msprof** runs in the operator environment.

For CANN/Ascend spawn environment (`SOC_VERSION`, `NPU_ARCH`, `SUPPORT_COMPUTE_UNIT`, `SUPPORT_TILING_DIR`; simulator-class runs use simulator dir as spawn `SOC_VERSION`), see [`ascend-env-spec.md`](./ascend-env-spec.md). For A5 on-board metric matrices, see [`ascend-a5-support.md`](./ascend-a5-support.md). For `op-devtools.performanceTuning.*` keys and mapping, see [`workspace-settings.md`](./workspace-settings.md).

---

## Overview

| Layer | Responsibility |
|-------|----------------|
| **CLI** | `msprof op simulator` (simulation) or `msprof op` (on-board) |
| **Plugin** | Optional pre-build / example build / deploy (project-type dependent), command assembly, shell execution |
| **Config** | Workspace settings ([`workspace-settings.md`](./workspace-settings.md) § Performance tuning); `configs.json` rows `simulate` / `on_board` for ids and **`fileMapList`** |
| **Results UI** | Native tree **`opdevtoolsPerformanceResultsTree`** (reports → folder/file leaves) |
| **Viewers** | CSV editor, Insight viewer (`bin`/`json`), optional `vscode.diff` via API |

There is **no** performance-tuning sidebar webview (`performancePanelView` / `performance-run-data` panel) and **no** `open-performance-panel-view` command.

---

## Workbench layout

```mermaid
flowchart LR
  subgraph Operate["Operate sidebar"]
    FlowTree["opdevtoolsOperateTree\nPerformance tuning →\nSimulation / On-board"]
    ResultsTree["opdevtoolsPerformanceResultsTree\nReport list + files"]
  end
  subgraph Optional["Optional panels"]
    SimOpts["options-simulator"]
    BoardOpts["options-on-board"]
  end
  subgraph External["Environment"]
    Msprof["msprof"]
    Opprof["op_path / ideConfig / opprof"]
  end

  FlowTree --> Msprof
  Msprof --> Opprof
  Opprof --> ResultsTree
  SimOpts --> FlowTree
  BoardOpts --> FlowTree
```

- **`opdevtoolsOperateTree`**: when the project supports profiling, a **Performance tuning** group (`nodeId === 'power'`) exposes **Simulation analysis** (`simulation`) and **On-board analysis** (`onboard`). Gear icons open workspace settings or the quick-options webviews.
- **`opdevtoolsPerformanceResultsTree`**: separate view (`%view.performanceResultsTree.name%`). **Report rows live here only**, not under the `power` node.
- **Dump tensor** sidebar (`dump-tensor-data` webview) reuses shared performance APIs for folder trees and `performance/diffFiles`; it is not the performance-results browser.

---

## Entry points

### 1. Operate flow tree

| Action | Tree node | Queue type | Runner |
|--------|-----------|------------|--------|
| Simulation | `simulation` | `simulation` | `taskMethods.startSimulate` → `BuildService.startSimulate` |
| On-board | `onboard` | `onboard` | `taskMethods.startOnBoard` → `BuildService.startOnBoard` |

Dispatch: `dispatchSimulator` / `dispatchOnBoard` in `task-method-dispatch.ts` → `dispatchEnqueueNativeOperatorAction` (serial operator queue; see [`operator-treeview.md`](./operator-treeview.md) § Operator action queue).

**Quick options:** unless `simulation.showQuickOptions` / `onBoard.showQuickOptions` is `false`, the tree opens the options webview first (defaults and behavior: [`workspace-settings.md`](./workspace-settings.md#performance-tuning-op-devtoolsperformancetuning)).

Commands: `huawei-op-devtools.sidebar.simulation`, `huawei-op-devtools.sidebar.onboard` (and operate-tree inline actions). Before run, **PyAsc** projects call `homeMethods.validatePyascForAnalysis()` when not using quick panels.

After a queued run finishes, `extension.ts` may call `refreshPerformanceReports({ focusIfNew: true })` in addition to `BuildService` calling `flashPerformanceRunData`.

### 2. Options webviews

| Panel | Path | `ops` API |
|-------|------|-----------|
| Simulation | `web/src/views/panels/options-simulator/` | `getConfigData` / `saveConfig` (type `simulate`), `startSimulate` |
| On-board | `web/src/views/panels/options-on-board/` | `getConfigData` / `saveConfig` (type `on_board`), `startOnBoard` |

On confirm, webviews call `startSimulate` / `startOnBoard` then close the editor. Settings persist to workspace `op-devtools.*` via `ConfigService.writeOpDevtoolsDottedSettings` (not legacy `postConfig` for script fields).

### 3. Explorer: add visualization

| Command | Adds to `fileMapList` on config type |
|---------|--------------------------------------|
| `huawei-op-devtools.reportVisualizationSimulation` | `simulate` |
| `huawei-op-devtools.reportVisualizationOnBoard` | `on_board` |
| `huawei-op-devtools.reportVisualizationPerformance` | `on_board` (folder picker or explorer folder) |

Implementation: `FolderContextMenuService.addReportToFileMapList(uri, configType)`.

---

## Simulation run pipeline

**Service:** `BuildService.startSimulate` (`plugin/src/service/build-service.ts`).

```mermaid
sequenceDiagram
  participant User
  participant Build as BuildService
  participant Exec as executeOperatorCommand
  participant Msprof as msprof op simulator

  User->>Build: startSimulate
  opt requiresBuildBeforeAnalysis
    Build->>Exec: getBuildOpCommand (simulate config id)
    opt standard-custom
      Build->>Exec: getBuildExampleCommand + deploy
    end
  end
  Build->>Exec: getSimulateCommand
  Exec->>Msprof: shell
  Msprof-->>Build: writes under op_path/ideConfig/opprof
  Build->>User: flashPerformanceRunData
```

Notable behavior:

- Uses **`OperatorPluginRegistry.getOpPlugin(project.project_type).buildBehavior`** for active-file check (PyAsc: must have `.py` active; updates deploy target) and whether build/example/deploy run first.
- **Simulate config id** drives pre-build when `requiresBuildBeforeAnalysis` (uses simulate row’s config for `getBuildOpCommand`).
- **Standard custom:** after example build, `deployStandardCustomRunPackage`.
- On success: `build.simulationSuccess` + `huawei-op-devtools.flashPerformanceRunData` with `{ focusIfNew: true }`.
- On failure: throws (simulate path) so the operator queue can surface errors.

---

## On-board run pipeline

**Service:** `BuildService.startOnBoard`.

Same structure as simulation, but:

- Pre-build uses **on_board** config id when `requiresBuildBeforeAnalysis`.
- Command: `getOnBoardCommand` → `ProfilerFactory.getStrategy('onboard')` with `onboardCannSoc` from `resolveAscendEnv({ isSimulator: false })`.
- PyAsc active-file failure **returns** early (does not throw) — asymmetry vs simulate.
- On success: `build.onBoardSuccess` + `flashPerformanceRunData({ focusIfNew: true })`.

---

## Command generation

### Facades

| Function | File | Strategy method |
|----------|------|-----------------|
| `getSimulateCommand(configId, exampleConfigId, operatorNames?)` | `domain/services/command.ts` | `buildSimulateCommand` |
| `getOnBoardCommand(configId, exampleConfigId, operatorNames?)` | same | `buildOnBoardCommand` |

`CommandStrategyFactory.getStrategy(op_type)` selects ascend / cann / pyasc / triton implementation. Commands are joined with CANN env sourcing + `cd` to build directory (`joinCommands`).

### msprof assembly (`domain/services/profiler-service.ts`)

| Mode | Class | CLI shape |
|------|-------|-----------|
| Simulation | `SimulatorStrategy` | `msprof op simulator --soc-version=<SIMULATOR_TYPE> --output=<op_path>/<ideConfig>/opprof --aic-metrics=...` |
| On-board | `OnBoardStrategy` | `msprof op --output=<op_path>/<ideConfig>/opprof --aic-metrics=...` |

**Simulation metrics** (from merged `user_options`): base `PipeUtilization`; optional `ResourceConflictRatio`, `PMSampling` (mapped from workspace settings). **`--soc-version`** uses `resolveAscendEnv({ isSimulator: true }).simulatorType`.

**On-board metrics** depend on SOC: `isAscendA5ProfilerCannSoc(cannSoc)` chooses A5 vs A3-style base sets; workspace checkboxes are merged in `ConfigService.buildUserOptionsFromWorkspaceSettings('on_board', …)` (key ↔ `user_options` mapping: [`workspace-settings.md`](./workspace-settings.md#performance-tuning-op-devtoolsperformancetuning)). A5 matrix: [`ascend-a5-support.md`](./ascend-a5-support.md).

**Profiler target binary:** `strategy.getProfilerTargetFile` reads **`build_example.target_file`** from `configs.json` ([`workspace-settings.md`](./workspace-settings.md#what-is-not-in-workspace-settings)). Optional `operatorNames` rewrites `test_aclnn_*` path segment for standard custom.

**Output directory:** `joinIdeConfigRelative('opprof')` under operator `op_path` (typically `<opDir>/.vscode/opprof` or `<opDir>/.arts/opprof`).

---

## Configuration

Profiling keys, compile scripts, and runtime merge: **[`workspace-settings.md`](./workspace-settings.md)** (§ Performance tuning, § Compile & deploy, § Runtime model).

### `configs.json` (this feature)

| `config_type` | Role |
|---------------|------|
| `simulate` | Row id for `getSimulateConfigId`; **`user_options.fileMapList`** for external report paths |
| `on_board` | Row id for `getOnBoardConfigId`; **`fileMapList`** for manual / imported visualizations |
| `build_op` / `build_example` | Pre-build / deploy / profiler target resolution |

### `ops` API (webviews)

| Method | Role |
|--------|------|
| `ops/getConfigData` | Load simulate / on_board rows for options panels |
| `ops/saveConfig` | Persist metrics + scripts to workspace settings |
| `ops/startSimulate` | Queued `startSimulate` |
| `ops/startOnBoard` | Queued `startOnBoard` |

Profiler runs are **not** started from the results tree; only from operate flow / options panels / explorer hooks.

### `performance` API (host)

Registered in `api-routes.ts` as `performanceMethods` (`performance-data-controller.ts`). Used **in-process** by `OperateTreeProvider` and from webviews:

| Method | Used by |
|--------|---------|
| `performance/getRunData` | Host tree refresh (via `runDataService`) |
| `performance/toggleRecordMark` | Mark/unmark reports |
| `performance/copyReport` | Concatenate all file contents under report dir → clipboard |
| `performance/downloadReport` | Zip report directory |
| `performance/diffFiles` | `vscode.diff` — **Dump tensor** file tree (`web/.../dump-tensor-data`) |

There is **no** webview panel that calls `getRunData` for the performance results tree.

---

## Discovering reports (`PerformanceRunData`)

**Implementation:** `plugin/src/core/performance/performance-run-data.ts`  
**Bridge:** `RunDataService.getPerformanceRunData` → `performanceMethods.getRunData` → `OperateTreeProvider.refreshPerformanceReports`.

1. **`opprof` subdirectories**  
   If the project has `build_op` and an operator path, scan `<op_path>/<ideConfig>/opprof/`. Each **subdirectory** = one report (`key` = folder name, `timestamp` = ctime, `children` = scanned files).

2. **`fileMapList`**  
   From all `simulate` and `on_board` configs: `{ filePath, reportTime }` entries that still exist on disk. Keys: `simulate_<path>` or `onboard_<path>`. Directories get scanned children; single files have empty `children`.

3. **Marks**  
   `PermanentStorage` key `marked_performance_records` → `marked` on each record.

4. **Sort in UI**  
   `queryExecutionRecords` returns scan order; **`OperateTreeProvider`** sorts `state.performance.reports` in memory (`sortOrder` asc/desc). Title-bar sort toggles **do not** rescan disk.

### File tree under a report

`scanSubFiles` includes only **`csv`**, **`bin`**, **`json`** (lowercase). Empty directory branches are pruned. Tree nodes: `performanceFolder`, `performanceFile`.

---

## Results tree behavior

**Registration:** `extension.ts` — adapter `TreeDataProvider` delegating to `operateTreeProvider.getPerformanceResultsPanelNodes()` and `getChildren` for `performanceReportItem` / `performanceFolder`.

**State:** `OperateSidebarState.performance` — `reports`, `sortOrder` (default `desc`), `markedOnly`, `selectedReportKey`.

**Root rows:** real reports or a single empty placeholder (`web.perf.noData`) without inline actions.

**Selection:** `onDidChangeSelection` on `performanceResultsTreeView` → `selectPerformanceReport` / context keys `opDevtools.performanceReportSelected`, `opDevtools.performanceSelectedReportMarked`.

**Reveal:** `refreshPerformanceReports({ focusIfNew: true })` can focus and expand the newest report (`revealPerformanceReport`).

### Title bar vs row actions

| Location | Actions |
|----------|---------|
| `view/title` | Add visualization, sort by time, marked-only filter |
| Report row inline | Copy (file **contents**), download (zip), mark/unmark |
| File leaf | Open (`sidebar.performance.file.open`) |

### Open file behavior

| Extension | Handler |
|-----------|---------|
| `csv` | `viewService.openCsvFile` |
| `bin`, `json` | `viewService.openInsight` → Insight data viewer panel (`INSIGHT_HOME_PATH` / `.arts/.env`) |

See [`user-issues/profiling-and-insight.md`](./user-issues/profiling-and-insight.md) for known Insight viewer issues (not plugin msprof orchestration).

### Refresh

- **Command:** `huawei-op-devtools.flashPerformanceRunData`
- **Implementation:** `operateTreeProvider.refreshPerformanceReports(args)` only — **no** `postMessage` / iframe refresh.

---

## Commands reference (performance results tree)

| Command id | Role |
|------------|------|
| `huawei-op-devtools.sidebar.performance.report.select` | Update selection context |
| `huawei-op-devtools.sidebar.performance.report.copyPath` | Copy concatenated report file contents |
| `huawei-op-devtools.sidebar.performance.report.download` | Zip download |
| `huawei-op-devtools.sidebar.performance.report.mark` / `.unmark` | Toggle mark |
| `huawei-op-devtools.sidebar.performance.report.sortTime` | Toggle timestamp sort (in-memory) |
| `huawei-op-devtools.sidebar.performance.report.filterMarked` / `.showAll` | Marked-only filter |
| `huawei-op-devtools.sidebar.performance.file.open` | Open csv / bin / json |
| `huawei-op-devtools.flashPerformanceRunData` | Rescan disk + config lists |
| `huawei-op-devtools.reportVisualizationPerformance` | Add folder to on_board `fileMapList` |

---

## Key source files

| Area | Path |
|------|------|
| Simulate / on-board orchestration | `plugin/src/service/build-service.ts` |
| Task entry | `plugin/src/controller/task-controller.ts` |
| Queue / ops dispatch | `plugin/src/helpers/task-method-dispatch.ts` |
| Command facades | `plugin/src/domain/services/command.ts` |
| msprof strategies | `plugin/src/domain/services/profiler-service.ts` |
| Per-op-type wrappers | `plugin/src/domain/services/command-strategy/*-strategy.ts` |
| Settings merge | `plugin/src/service/config-service.ts` |
| Disk scan | `plugin/src/core/performance/performance-run-data.ts` |
| Tree UI + state | `plugin/src/class/operate-tree-provider.ts` |
| Clipboard / zip / diff | `plugin/src/controller/performance-data-controller.ts` |
| CSV / Insight | `plugin/src/service/view-service.ts`, `plugin/src/class/insight-data-viewer-panel.ts` |
| Registration | `plugin/src/extension.ts`, `package.json` |
| Options webviews | `web/src/views/panels/options-simulator/`, `options-on-board/` |
| A5 metric matrix | `shared/msprof-onboard-env.ts`, `ascend-util.ts` |

---

## Related documents

| Document | Use for |
|----------|---------|
| [`build-integration.md`](./build-integration.md) | Shared build / executor / `executeOperatorCommand` |
| [`ascend-env-spec.md`](./ascend-env-spec.md) | Spawn env for compile + msprof |
| [`ascend-a5-support.md`](./ascend-a5-support.md) | A5 on-board metrics and defaults |
| [`workspace-settings.md`](./workspace-settings.md) | All `op-devtools.*` keys and runtime merge |
| [`sanitizer.md`](./sanitizer.md) | Parallel native-tree pattern for sanitizer results |
