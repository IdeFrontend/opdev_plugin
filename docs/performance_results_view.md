# Performance results view

This document describes how the **native** performance tuning results UI works in the extension today: a dedicated `TreeView` in the Operate secondary sidebar, backed by the same `OperateTreeProvider` instance that drives the main Operate flow tree, with data assembled on the host from the workspace filesystem and project configuration.

## Where it lives in the workbench

- The view is contributed as **`opdevtoolsPerformanceResultsTree`** in `package.json`, inside the **`mindstudio-opssuite-vscode-plugin`** view container alongside the other Operate sidebar trees. It is shown when `opDevtools.showOperateTree` is true (Operate experience is visible).
- The localized title comes from **`%view.performanceResultsTree.name%`** (see `package.nls*.json` bundles).
- Registration happens in **`plugin/src/extension.ts`**: a small adapter implements `TreeDataProvider<OperateNode>` whose root `getChildren(undefined)` calls `operateTreeProvider.getPerformanceResultsPanelNodes()`, and non-root children delegate to `operateTreeProvider.getChildren(element)` for `performanceReportItem` and `performanceFolder` nodes only.

## Relationship to “Performance tuning” in the Operate tree

- Under **Ops Operate** (`opdevtoolsOperateTree`), when the project supports on-board and/or simulation, a collapsible **Performance tuning** node (`nodeId === 'power'`) appears. Its children are the **On-board analysis** and **Simulation analysis** actions (`onboard`, `simulation`), not the report list.
- The **list of performance reports** is only in **`opdevtoolsPerformanceResultsTree`**, not nested under the power node.

## Data contract

- In-memory shape follows **`PerformanceExecutionRecord`** and nested **`PerformanceRunDataFolder` / `PerformanceRunDataFile`** from **`shared/api-types`** (same types the older webview path used).
- Each **report** (execution record) has: stable `key`, display `title`, `timestamp`, filesystem `dirPath`, optional `marked`, and `children` (folder/file tree built from disk).

## How report rows are discovered (`PerformanceRunData`)

Implementation: **`plugin/src/core/performance/performance-run-data.ts`**, accessed via **`RunDataService.getPerformanceRunData`** → **`performanceMethods.getRunData`** → **`OperateTreeProvider.refreshPerformanceReports`**.

1. **Profiler output under the operator path**  
   If the workspace is a recognized operator project with `build_op` config, the code resolves the configured operator directory and looks for **`<opDir>/.vscode/opprof/`**. Each **subdirectory** is one execution run. The run’s `key` is the folder name, `title` matches, `timestamp` comes from directory `ctime`, `dirPath` is the absolute path to that run folder. If `.vscode/opprof` does not exist yet, this branch simply contributes no rows from here.

2. **Simulate and on-board `fileMapList` entries**  
   Regardless of whether `.vscode/opprof` exists, the scanner walks **`simulate`** and **`on_board`** domain configs. For each config whose `user_options.fileMapList` is an array of `{ filePath, reportTime }`, if `filePath` still exists on disk, a synthetic record is added:
   - Simulate paths use keys prefixed with **`simulate_`** plus the file path.
   - On-board paths use keys prefixed with **`onboard_`** plus the file path.
   - `title` is the basename of `filePath`; `timestamp` uses `reportTime` from config; `dirPath` is `filePath`. If the path is a **directory**, children are scanned; if it is a **file**, `children` is empty.

3. **Marked flags**  
   Before building the list, a `Set` of marked keys is loaded from **`PermanentStorage`** under **`marked_performance_records`**. Each record’s `marked` field is set from that set.

4. **Sorting**  
   **`queryExecutionRecords`** returns merged records in scan order. **`OperateTreeProvider`** sorts the loaded **`reports`** array in memory by `timestamp` (and `key` as a tie-break). Toggling sort in the UI only reorders that array — it does not rescan the filesystem.

## Folder and file nodes under a report

- **`scanSubFiles`** walks the report directory recursively. **Directories** become **`PerformanceRunDataFolder`** nodes only if they contain at least one included file downstream (empty branches are pruned). **Files** are included only if the extension is **`csv`**, **`bin`**, or **`json`** (lowercase extension without dot).
- The tree view maps folders to **`performanceFolder`** nodes and files to **`performanceFile`** nodes. Folder node ids encode the report key and numeric path segments so expansion can resolve the correct subtree without holding a duplicate object graph in the provider.

## What you see at the root of the performance tree

- **`getPerformanceResultsPanelNodes()`** returns **`getPerformanceReportNodes()`** directly: there is **no** synthetic “Performance tuning results” parent row in the panel; top-level rows are either real reports or a single **empty** placeholder.
- If there are no visible reports, one static item is shown with label from **`web.perf.noData`** (`nodeId` still `performanceReportItem` but without report commands or `contextValue`, so inline actions do not attach to it).

## Sorting and “marked only” filter

- State lives on **`OperateSidebarState.performance`**: `reports`, `sortOrder` (`asc` | `desc`, default `desc`), `markedOnly`, and `selectedReportKey`.
- **Sort by execution time**: command **`huawei-op-devtools.sidebar.performance.report.sortTime`** calls **`togglePerformanceSortOrder`**, which flips **`sortOrder`** and re-sorts the in-memory **`reports`** list only (no **`refreshPerformanceReports`** / disk read).
- **Marked-only**: **`setPerformanceMarkedOnly`** toggles the flag and refires tree updates; **`getVisiblePerformanceReports`** either returns all reports or only those with `marked === true`. Context key **`opDevtools.performanceMarkedOnly`** stays in sync for the title-bar filter toggle.

## Title bar vs row actions

- **`view/title`** (when `view == opdevtoolsPerformanceResultsTree`): **Add visualization** (`huawei-op-devtools.reportVisualizationPerformance`), **Sort by time**, and **Show marked only** / **Show all** for the list filter. Copy, download, and mark/unmark are **not** on the title bar.
- Clicking a report row still runs **`huawei-op-devtools.sidebar.performance.report.select`**, which stores **`selectedReportKey`** and updates context keys **`opDevtools.performanceReportSelected`** and **`opDevtools.performanceSelectedReportMarked`** (used internally and for any future menu wiring).

## Inline actions on report rows

- Under **`view/item/context`**, with groups **`inline@3`** (copy), **`inline@4`** (download), **`inline@5`** (mark or unmark depending on `contextValue`):
  - **Copy** — `huawei-op-devtools.sidebar.performance.report.copyPath`
  - **Download** — `huawei-op-devtools.sidebar.performance.report.download` (immediately after copy in the row action strip)
  - **Mark** / **Unmark** — separate `when` clauses on `opdevtools.performanceReportItem.unmarked` vs `.marked`
- **`when`** clauses require `viewItem` to match **`opdevtools.performanceReportItem.marked`** or **`opdevtools.performanceReportItem.unmarked`** so the empty-state row does not get actions.
- File leaves use **`huawei-op-devtools.sidebar.performance.file.open`** with a **`navigation@1`** group where configured.

## Mark / copy / download / open file behavior

- **Mark toggle** — **`togglePerformanceReportMark`**: optimistic UI update, then **`performanceMethods.toggleRecordMark`** → **`RunDataService.togglePerformanceRecordMark`** → **`PerformanceRunData.markRecord` / `unmarkRecord`**. On failure, the mark is reverted and **`web.perf.markFailed`** is shown.
- **Copy report** (command id still references “copy path” in localization) — **`copyPerformanceReportPath`** → **`performanceMethods.copyReport`**: recursively reads **file contents** under the report directory, concatenates them into one string, and writes that to the system clipboard (see **`readDirectoryFiles`** in **`performance-data-controller.ts`**). Empty directories show a warning and do not copy.
- **Download** — **`downloadPerformanceReport`** → **`performanceMethods.downloadReport`** (zips the report directory via **`adm-zip`** in the same module).
- **Open file** — **`openPerformanceFile`**: **`csv`** goes through **`viewService.openCsvFile`**; **`bin`** and **`json`** through **`viewService.openInsight`**, matching the specialized viewers rather than a generic text editor.

## Refreshing the tree after runs

- **`huawei-op-devtools.flashPerformanceRunData`** is registered in **`extension.ts`** to call **`operateTreeProvider.refreshPerformanceReports()`** only (no webview postMessage).
- After **simulation** and **on-board** quick-option flows finish successfully in the extension (legacy **`build-service`** and v2 **`build.controller`**), the same command is executed so new output under `.vscode/opprof` or updated `fileMapList` paths appears without opening any legacy performance webview panel.

## Commands reference (performance sidebar)

| Command id | Role |
|------------|------|
| `huawei-op-devtools.sidebar.performance.report.select` | Select report (updates selection context) |
| `huawei-op-devtools.sidebar.performance.report.copyPath` | Copy concatenated text contents of files under the report directory (inline on report row) |
| `huawei-op-devtools.sidebar.performance.report.download` | Zip download (inline on report row, after copy) |
| `huawei-op-devtools.sidebar.performance.report.mark` / `.unmark` | Toggle mark (inline on report row) |
| `huawei-op-devtools.sidebar.performance.report.sortTime` | Toggle timestamp sort (title bar) |
| `huawei-op-devtools.sidebar.performance.report.filterMarked` / `.showAll` | Marked-only filter (title bar) |
| `huawei-op-devtools.sidebar.performance.file.open` | Open leaf by type |
| `huawei-op-devtools.flashPerformanceRunData` | Reload performance list from disk/config |
| `huawei-op-devtools.reportVisualizationPerformance` | Add folder to on-board `fileMapList` (+ optional folder picker) |

## Key files

| Area | Path |
|------|------|
| Tree data and performance-specific state | `plugin/src/class/operate-tree-provider.ts` |
| Disk scan, opprof + fileMapList merge, marks | `plugin/src/core/performance/performance-run-data.ts` |
| Bridge + clipboard/zip helpers | `plugin/src/controller/performance-data-controller.ts`, `plugin/src/service/run-data-service.ts` |
| View registration, commands, contexts | `plugin/src/extension.ts` |
| View container / menus | `package.json` (`views`, `menus["view/title"]`, `menus["view/item/context"]`) |
| CSV / insight open | `plugin/src/service/view-service.ts` |

## Out of scope for this doc

- The older Vue sidebar bundle under **`web/src/views/sidebars/performance-run-data/`** may still exist in the repo for reuse or packaging; the VS Code **panel webview** for performance tuning results was removed in favor of this native tree + existing dump-tensor panel layout. This file does not describe that web bundle.
