# Operator Project Config -> Workspace Settings (Re-validated, Best-Effort Final Proposal)

## Purpose

Move `Operator project config` from webview UI to VS Code workspace settings with no behavior regression for:

- build / debug command generation
- sanitizer configuration and direct sanitizer execution (no popup in primary sidebar flow)
- performance (simulation + on-board) configuration
- environment script (`projectSH`)

This is a design/specification document (not implementation).

### Branch implementation status (`svd/fix-settings-build-commands`)

Partially implemented — see [`svd-fix-settings-build-commands.md`](./svd-fix-settings-build-commands.md).

| Area | Status in branch |
|------|------------------|
| Per-flow compile keys (`compileCommand`, `sanitizerCompileCommand`, `onBoardCompileCommand`, `simulationCompileCommand`, …) | Migrated 1:1 from matching `config_type` rows; **no** cross-flow fallback to `compileCommand` |
| Sanitizer flags, simulate/on_board metrics, `deployCommandOrRunCommand` | Migrated to workspace; runtime from settings |
| `exampleBuildConfig.runCommand` / `executionMode` | Migrated; runtime from settings |
| **Profiler binary target** (`build_example.target_file`, mssanitizer/msprof arg) | **Not** in settings — still read from legacy `configs.json` (`c41f6cb86`); distinct from deploy key and from per-flow **compile** keys |
| On-board pre-build | `on_board` DB row id + `onBoardCompileCommand` — by design, not `build_op` / `compileCommand` |
| `ConfigHelper` | **Read only** — all writes use `ConfigService.writeOpDevtoolsDottedSettings` |
| Intermediate dotted keys (early UI-migration) | **Not read** — canonical 4-subsection keys only (`operator-project-workspace-config.ts`) |

---

## Re-validation scope

Validated against current sources:

- `web/src/views/panels/config/components/build-config.vue`
- `web/src/views/panels/config/components/sanitizer-config.vue`
- `web/src/views/panels/options-sanitizer/app.vue`
- `web/src/views/panels/config/components/simulation-tab.vue`
- `web/src/views/panels/config/components/onboard-tab.vue`
- `web/src/views/panels/config/components/env-config.vue`
- `web/src/views/panels/config/composables/use-opprof-config.ts`
- `shared/api-types/ops.d.ts` (`StartBuildParams`, `StartRunParams`)
- `plugin/src/helpers/operator-project-workspace-config.ts`
- `plugin/src/service/build-service.ts`
- `plugin/src/service/config-service.ts`
- `plugin/src/service/project-service.ts`
- `package.json` contributed settings (current state)

---

## Top-level model (required by request)

Use one root prefix:

- `op-devtools.*`

Organize into 4 subsections:

1. `op-devtools.compileAndDeploy.*`
2. `op-devtools.sanitizer.*`
3. `op-devtools.performanceTuning.*`
4. `op-devtools.environment.*`

Contribution structure requirement:

- `contributes.configuration` must be an array of separate configuration categories (not one merged category).
- Each top-level subsection must have its own category with dedicated `id` and `title`:
  1. category id `op-devtools.compileAndDeploy`, title `Compile & Deploy`
  2. category id `op-devtools.sanitizer`, title `Sanitizer`
  3. category id `op-devtools.performanceTuning`, title `Performance Tuning`
  4. category id `op-devtools.environment`, title `Environment`
- Keep all setting keys unchanged under `op-devtools.*`; only grouping/category contribution changes.

Do not expose editable JSON override settings.

---

## Complete field mapping (nothing intentionally omitted)

## Required ordering and defaults rules

1. **Item order must match prototype exactly** (same visual order as the Vue panel).
2. **Do not hardcode static defaults in `package.json**` for operator project settings.
3. **Defaults must be dynamically populated** from real project config data (same source path as Vue/runtime config), and only written when the workspace key is not explicitly set by user.
4. **Rich hint text must stay on the same element** and use markdown form for `markdownDescription`.
5. **No `.operatorProject` in any key**.
6. **No custom key naming**: key suffix must match Vue prototype item title key naming (use prototype label identity, not storage/internal field name).
7. **No labels field**: VS Code uses the setting key as the label; camelCase indicates word breaks. Add descriptions only when the prototype shows a hint/tooltip.

## 1) Compile & deploy subsection

Source: `build-config.vue` + build/runtime APIs.

Required order (prototype parity):

1. `op-devtools.compileAndDeploy.buildConfig.operatorNameToCompile`
2. `op-devtools.compileAndDeploy.buildConfig.deployCommandOrRunCommand`
3. `op-devtools.compileAndDeploy.buildConfig.compileCommand`
4. `op-devtools.compileAndDeploy.buildConfig.cpuDebugCompileCommand`
5. `op-devtools.compileAndDeploy.buildConfig.npuDebugCompileCommand`
6. `op-devtools.compileAndDeploy.buildConfig.sanitizerCompileCommand`
7. `op-devtools.compileAndDeploy.buildConfig.onBoardCompileCommand`
8. `op-devtools.compileAndDeploy.buildConfig.simulationCompileCommand`
9. `op-devtools.compileAndDeploy.exampleBuildConfig.executionMode`
10. `op-devtools.compileAndDeploy.exampleBuildConfig.runCommand`

### 1.1) `buildConfig` subsubsection

- `op-devtools.compileAndDeploy.buildConfig.operatorNameToCompile`
  - UI element type: `string` (`textbox`)
  - Maps to `build_op.user_options.op`
- `op-devtools.compileAndDeploy.buildConfig.deployCommandOrRunCommand`
  - UI element type: `string` (`textbox`)
  - Maps to `build_op.user_options.target_file` (migrated to settings; **run/deploy** runtime)
  - Distinct from **profiler binary path** (`build_example.target_file` in DB only in current branch — not this key)
- `op-devtools.compileAndDeploy.buildConfig.compileCommand`
  - UI element type: `string` (`textbox`)
  - Maps to `build_op.user_options.script`
- `op-devtools.compileAndDeploy.buildConfig.cpuDebugCompileCommand`
  - UI element type: `string` (`textbox`)
  - Maps to `build_op.user_options.cpu_debug_script`
- `op-devtools.compileAndDeploy.buildConfig.npuDebugCompileCommand`
  - UI element type: `string` (`textbox`)
  - Maps to `build_op.user_options.npu_debug_script`
- `op-devtools.compileAndDeploy.buildConfig.sanitizerCompileCommand`
  - UI element type: `string` (`textbox`)
  - Maps to `sanitizer.user_options.script`
- `op-devtools.compileAndDeploy.buildConfig.onBoardCompileCommand`
  - UI element type: `string` (`textbox`)
  - Maps to `on_board.user_options.script`
- `op-devtools.compileAndDeploy.buildConfig.simulationCompileCommand`
  - UI element type: `string` (`textbox`)
  - Maps to `simulate.user_options.script`

### 1.2) `exampleBuildConfig` subsubsection

- `op-devtools.compileAndDeploy.exampleBuildConfig.executionMode`
  - UI element type: `string` (`enum dropdown: eager | graph`)
  - Maps to `build_example.user_options.execution_mode` (`eager|graph`)
- `op-devtools.compileAndDeploy.exampleBuildConfig.runCommand`
  - UI element type: `string` (`textbox`)
  - Description: `Operator name, execution mode and package mode are appended automatically.`
  - Markdown description form: `Operator name, execution mode and package mode are appended automatically.`
  - Maps to `build_example.user_options.script`

Notes:

- `target_dir` exists in UI code but is currently hidden (`v-if="false"`). Keep out of first-class keys unless feature is re-enabled.
- As requested, all compile-script settings are centralized in this subsection.
- `exampleBuildConfig` must be shown only for multi-operator projects.

## 2) Sanitizer subsection

Sources: `sanitizer-config.vue` and `options-sanitizer/app.vue`.

Required order (prototype parity):

1. `op-devtools.sanitizer.memory`
2. `op-devtools.sanitizer.memoryLeak`
3. `op-devtools.sanitizer.allocUnused`
4. `op-devtools.sanitizer.race`
5. `op-devtools.sanitizer.uninitialized`
6. `op-devtools.sanitizer.reportLogLevel`
7. `op-devtools.sanitizer.maxSingleLogFileSize`
8. `op-devtools.sanitizer.detectionScope`
9. `op-devtools.sanitizer.blockId`

- `op-devtools.sanitizer.memory`
  - UI element type: `boolean` (`checkbox`)
  - Description: `Base: illegal read/write, multi-core stomp, unaligned access, illegal free.`
  - Maps to `sanitizer.user_options.tool.memcheck`
- `op-devtools.sanitizer.memoryLeak`
  - UI element type: `boolean` (`checkbox`, effective when `memory=true`)
  - Description: `Optional memory check item from Sanitizer - select content view.`
  - Maps to `sanitizer.user_options.memcheckOption['leak-check']`
- `op-devtools.sanitizer.allocUnused`
  - UI element type: `boolean` (`checkbox`, effective when `memory=true`)
  - Description: `Optional memory check item from Sanitizer - select content view.`
  - Maps to `sanitizer.user_options.memcheckOption['check-unused-memory']`
- `op-devtools.sanitizer.race`
  - UI element type: `boolean` (`checkbox`)
  - Maps to `sanitizer.user_options.tool.racecheck`
- `op-devtools.sanitizer.uninitialized`
  - UI element type: `boolean` (`checkbox`)
  - Maps to `sanitizer.user_options.tool.initcheck`
- `op-devtools.sanitizer.reportLogLevel`
  - UI element type: `string` (`enum dropdown: info | warn | error`)
  - Maps to `sanitizer.user_options.logLevel`
- `op-devtools.sanitizer.maxSingleLogFileSize`
  - UI element type: `number` (`number input`, range 1-10240 MB)
  - Description: `Integer 1-10240, unit MB. Default 1024.`
  - Markdown description form: `Integer \`1-10240, unit MB. Default 1024.`
  - Maps to `sanitizer.user_options.maxDebuglogSize`
- `op-devtools.sanitizer.detectionScope`
  - UI element type: `string` (`enum dropdown: Global | Single block`)
  - Description: `Integer 0-200. Before enable: memory/init/sync detect all blocks; race: inter-core all blocks, intra-core block 0. After enable: memory/init/sync detect specified block; race: no inter-core, specified block intra-core.`
  - Markdown description form: `Integer \`0-200. Before enable: memory/init/sync detect all blocks; race: inter-core all blocks, intra-core block 0. After enable: memory/init/sync detect specified block; race: no inter-core, specified block intra-core.`
  - Maps to `sanitizer.user_options.useBlock` (`Global=false`, `Single block=true`)
- `op-devtools.sanitizer.blockId`
  - UI element type: `number` (`number input`, range 0-200, conditional)
  - Maps to `sanitizer.user_options.blockId`

### Sanitizer "select content" view -> settings migration (required)

Goal:

- Remove `Sanitizer - select content` popup/webview from user flow.
- When user clicks `Sanitizer` in sidebar/flow menu, execute sanitizer immediately (same behavior as current popup `Start now`).
- All options used for execution must come from workspace settings (this subsection + sanitizer compile command key in compile settings).
- This includes all options previously shown in `Sanitizer - select content` popup (`Memory`, `Race`, `Uninitialized`, `Memory leak`, `Alloc unused`).

Target UX:

1. User clicks `Sanitizer`.
2. No popup appears.
3. Sanitizer task starts immediately.
4. If user wants to adjust options, they edit workspace settings:
  - `op-devtools.sanitizer.*`
  - `op-devtools.compileAndDeploy.buildConfig.sanitizerCompileCommand`

Detailed runtime mapping for immediate execution:

1. `op-devtools.compileAndDeploy.buildConfig.sanitizerCompileCommand` -> `sanitizer.user_options.script`
2. `op-devtools.sanitizer.memory` -> `sanitizer.user_options.tool.memcheck`
3. `op-devtools.sanitizer.memoryLeak` -> `sanitizer.user_options.memcheckOption['leak-check']`
4. `op-devtools.sanitizer.allocUnused` -> `sanitizer.user_options.memcheckOption['check-unused-memory']`
5. `op-devtools.sanitizer.race` -> `sanitizer.user_options.tool.racecheck`
6. `op-devtools.sanitizer.uninitialized` -> `sanitizer.user_options.tool.initcheck`
7. `op-devtools.sanitizer.reportLogLevel` -> `sanitizer.user_options.logLevel`
8. `op-devtools.sanitizer.maxSingleLogFileSize` -> `sanitizer.user_options.maxDebuglogSize`
9. `op-devtools.sanitizer.detectionScope` -> `sanitizer.user_options.useBlock`
  - `global` => `false`
  - `singleBlock` => `true`
10. `op-devtools.sanitizer.blockId` -> `sanitizer.user_options.blockId` (effective only when `useBlock=true`)

Execution contract (must match existing `Start now` path):

1. Keep existing project/type guards and error prompts.
2. Keep existing task command generation and terminal execution.
3. Keep existing run result views/panels.
4. Do not save anything back to DB just because user clicked `Sanitizer`.
5. Keep existing explicit save APIs separate from run action.

Command behavior changes:

1. `Sanitizer` sidebar action should call direct-run flow (no options popup command).
2. Existing sanitizer options command can be retained temporarily only as a compatibility alias:
  - either no-op
  - or redirect to filtered settings search (`@ext:huawei-op-devtools op-devtools.sanitizer`)
3. No user entry point should open `options-sanitizer` view for run configuration.
4. Clicking the sanitizer **settings icon** in tree view must open VS Code workspace settings filtered to sanitizer section (for example query `@ext:huawei-op-devtools op-devtools.sanitizer`) instead of opening any sanitizer webview.
5. Clicking the **On-board analysis settings icon** in tree view must open VS Code workspace settings filtered to `op-devtools.performanceTuning.onBoard`.
6. Clicking the **Simulation analysis settings icon** in tree view must open VS Code workspace settings filtered to `op-devtools.performanceTuning.simulation`.

Validation checklist for this migration:

1. Click `Sanitizer` -> no popup opens.
2. Click `Sanitizer` -> run starts immediately.
3. Change `reportLogLevel` in settings -> next run uses new level.
4. Change `detectionScope` to `singleBlock` + set `blockId` -> next run reflects it.
5. Toggle `memory`/`race`/`uninitialized` in settings -> next run reflects selected detection content.
6. Toggle `memoryLeak`/`allocUnused` in settings -> next run reflects selected optional memory checks.
7. Change `sanitizerCompileCommand` -> next run uses updated script.
8. Existing sanitizer result panels continue to populate as before.

## 3) Performance tuning subsection

Sources: `simulation-tab.vue`, `onboard-tab.vue`, `use-opprof-config.ts`.

### Simulation

Required order (prototype parity):

1. `op-devtools.performanceTuning.simulation.simulatorType`
2. `op-devtools.performanceTuning.simulation.memoryThroughputWaveform`
3. `op-devtools.performanceTuning.simulation.resourceConflictRatio`
4. `op-devtools.performanceTuning.simulation.parameters`

- `op-devtools.performanceTuning.simulation.simulatorType`
  - UI element type: `string` (`textbox`)
  - Description: `See supported types under CANN path ascend-toolkit/latest/tools/simulator.`
  - Markdown description form: `See supported types under CANN path \`ascend-toolkit/latest/tools/simulator.`
  - Maps to `simulate.user_options.simulatorType`
- `op-devtools.performanceTuning.simulation.memoryThroughputWaveform`
  - UI element type: `boolean` (`checkbox`)
  - Description: `Default: compute & move unit instruction time ratio.`
  - Maps to `simulate.user_options.PMSampling`
- `op-devtools.performanceTuning.simulation.resourceConflictRatio`
  - UI element type: `boolean` (`checkbox`)
  - Description: `Operator code hotspot (default).`
  - Maps to `simulate.user_options.ResourceConflictRatio`
- `op-devtools.performanceTuning.simulation.parameters`
  - UI element type: `map<string,string>` (VS Code object editor via `Add Item`: `"parameter name": "parameter value"`)
  - Description: `Parameters are appended to command line. Run msprof op -h for options. aic-metrics is set in base config.`
  - Markdown description form: `Parameters are appended to command line. Run \`msprof op -h for options. aic-metrics is set in base config.`
  - Column description (`Parameter name`): `Parameter name has -- prefix by default.`
  - Column markdown description (`Parameter name`): `Parameter name has \`-- prefix by default.`
  - Maps to `simulate.user_options.advance_param` (`[{ name, value }]`)
  - Prototype parity: labels/columns come from `web.config.editTable.addParam`, `web.config.editTable.paramName`, `web.config.editTable.paramValue`, `web.config.editTable.action`

### Simulation "select content" view -> settings migration (required)

Goal:

- Remove `Simulation - select content` popup/webview from primary user flow.
- When user clicks `Simulation analysis` in sidebar/flow menu, execute simulation analysis immediately (same behavior as current popup `Start now`).
- All options used for execution must come from workspace settings under `op-devtools.performanceTuning.simulation.*` (plus existing compile/script settings).

Target UX:

1. User clicks `Simulation analysis`.
2. No popup appears.
3. Simulation task starts immediately.
4. If user wants to change collection content/options, they edit workspace settings in `op-devtools.performanceTuning.simulation.*`.

Detailed runtime mapping for immediate execution:

1. `op-devtools.performanceTuning.simulation.simulatorType` -> `simulate.user_options.simulatorType`
2. `op-devtools.performanceTuning.simulation.memoryThroughputWaveform` -> `simulate.user_options.PMSampling`
3. `op-devtools.performanceTuning.simulation.resourceConflictRatio` -> `simulate.user_options.ResourceConflictRatio`
4. `op-devtools.performanceTuning.simulation.parameters` -> `simulate.user_options.advance_param`

Execution contract (must match existing `Start now` path):

1. Keep existing project/type guards and error prompts.
2. Keep existing task command generation and terminal execution.
3. Keep existing run result views/panels.
4. Do not save DB data just because user clicked `Simulation analysis`.
5. Keep explicit save APIs separate from direct-run action.

### On-board

Required order (prototype parity):

1. `op-devtools.performanceTuning.onBoard.interCoreLoad`
2. `op-devtools.performanceTuning.onBoard.roofline`
3. `op-devtools.performanceTuning.onBoard.operatorCodeHotspot`
4. `op-devtools.performanceTuning.onBoard.cacheHeatmap`
5. `op-devtools.performanceTuning.onBoard.operatorMetrics`
6. `op-devtools.performanceTuning.onBoard.cubeAndVectorInstructionTimeAndRatio`
7. `op-devtools.performanceTuning.onBoard.l2CacheHitRate`
8. `op-devtools.performanceTuning.onBoard.memoryReadWriteBandwidth`
9. `op-devtools.performanceTuning.onBoard.l0ReadWriteBandwidth`
10. `op-devtools.performanceTuning.onBoard.ubReadWriteBandwidth`
11. `op-devtools.performanceTuning.onBoard.computeAndMoveUnitTimeRatio`
12. `op-devtools.performanceTuning.onBoard.resourceConflictRatio`
13. `op-devtools.performanceTuning.onBoard.enableKernelCodeSegmentProfiling`
14. `op-devtools.performanceTuning.onBoard.parameters`

- `op-devtools.performanceTuning.onBoard.interCoreLoad`
  - UI element type: `boolean` (`checkbox`)
  - Maps to `on_board.user_options.Occupancy`
- `op-devtools.performanceTuning.onBoard.roofline`
  - UI element type: `boolean` (`checkbox`)
  - Description: `Checking this collects all operator performance metrics by default.`
  - Maps to `on_board.user_options.Roofline`
- `op-devtools.performanceTuning.onBoard.operatorCodeHotspot`
  - UI element type: `boolean` (`checkbox`)
  - Maps to `on_board.user_options.Source`
- `op-devtools.performanceTuning.onBoard.cacheHeatmap`
  - UI element type: `boolean` (`checkbox`)
  - Description: `Checking this collects all operator performance metrics by default.`
  - Maps to `on_board.user_options.MemoryDetail`
- `op-devtools.performanceTuning.onBoard.operatorMetrics`
  - UI element type: `boolean` (`checkbox`)
  - Behavior requirement: checking this setting must set all metric checkboxes (`op-devtools.performanceTuning.onBoard.cubeAndVectorInstructionTimeAndRatio`, `op-devtools.performanceTuning.onBoard.l2CacheHitRate`, `op-devtools.performanceTuning.onBoard.memoryReadWriteBandwidth`, `op-devtools.performanceTuning.onBoard.l0ReadWriteBandwidth`, `op-devtools.performanceTuning.onBoard.ubReadWriteBandwidth`, `op-devtools.performanceTuning.onBoard.computeAndMoveUnitTimeRatio`, `op-devtools.performanceTuning.onBoard.resourceConflictRatio`) to `true`; unchecking it must set all these metric checkboxes to `false`.
  - Persistence note: this is a UI control/aggregation setting for bulk toggle behavior and does not map to a standalone backend `user_options` field.
- `op-devtools.performanceTuning.onBoard.cubeAndVectorInstructionTimeAndRatio`
  - UI element type: `boolean` (`checkbox`)
  - Maps to `on_board.user_options.ArithmeticUtilization`
- `op-devtools.performanceTuning.onBoard.l2CacheHitRate`
  - UI element type: `boolean` (`checkbox`)
  - Maps to `on_board.user_options.L2Cache`
- `op-devtools.performanceTuning.onBoard.memoryReadWriteBandwidth`
  - UI element type: `boolean` (`checkbox`)
  - Maps to `on_board.user_options.Memory`
- `op-devtools.performanceTuning.onBoard.l0ReadWriteBandwidth`
  - UI element type: `boolean` (`checkbox`)
  - Maps to `on_board.user_options.MemoryL0`
- `op-devtools.performanceTuning.onBoard.ubReadWriteBandwidth`
  - UI element type: `boolean` (`checkbox`)
  - Maps to `on_board.user_options.MemoryUB`
- `op-devtools.performanceTuning.onBoard.computeAndMoveUnitTimeRatio`
  - UI element type: `boolean` (`checkbox`)
  - Maps to `on_board.user_options.PipeUtilization`
- `op-devtools.performanceTuning.onBoard.resourceConflictRatio`
  - UI element type: `boolean` (`checkbox`)
  - Maps to `on_board.user_options.ResourceConflictRatio`
- `op-devtools.performanceTuning.onBoard.enableKernelCodeSegmentProfiling`
  - UI element type: `boolean` (`checkbox`)
  - Description: `For custom range, call MetricsProfStart and MetricsProfStop in kernel code.`
  - Confirmation note: `Confirm you have called MetricsProfStart and MetricsProfStop around the kernel code segment; otherwise this option has no effect.`
  - Markdown description form: `For custom range, call [MetricsProfStart](https://www.hiascend.com/document/detail/zh/canncommercial/83RC1/API/ascendcopapi/atlasascendc_api_07_1214.html) and [MetricsProfStop](https://www.hiascend.com/document/detail/zh/canncommercial/83RC1/API/ascendcopapi/atlasascendc_api_07_1215.html) in kernel code.`
  - Markdown confirmation form: `Confirm you have called [MetricsProfStart](https://www.hiascend.com/document/detail/zh/canncommercial/83RC1/API/ascendcopapi/atlasascendc_api_07_1214.html) and [MetricsProfStop](https://www.hiascend.com/document/detail/zh/canncommercial/83RC1/API/ascendcopapi/atlasascendc_api_07_1215.html) around the kernel code segment; otherwise this option has no effect.`
  - Maps to `on_board.user_options.KernelScale`
- `op-devtools.performanceTuning.onBoard.parameters`
  - UI element type: `map<string,string>` (VS Code object editor via `Add Item`: `"parameter name": "parameter value"`)
  - Description: `Parameters are appended to command line. Run msprof op -h for options. aic-metrics is set in base config.`
  - Markdown description form: `Parameters are appended to command line. Run \`msprof op -h for options. aic-metrics is set in base config.`
  - Column description (`Parameter name`): `Parameter name has -- prefix by default.`
  - Column markdown description (`Parameter name`): `Parameter name has \`-- prefix by default.`
  - Maps to `on_board.user_options.advance_param` (`[{ name, value }]`)
  - Prototype parity: labels/columns come from `web.config.editTable.addParam`, `web.config.editTable.paramName`, `web.config.editTable.paramValue`, `web.config.editTable.action`

Notes:

- `Memory heatmap (default)` and `Default options:` are grouping captions/containers in the popup, not persisted option fields; they should not be standalone settings keys.
- `op-devtools.performanceTuning.onBoard.operatorMetrics` is a dedicated bulk-toggle checkbox setting for the operator metrics group and should fan out to all nested metric booleans.
- Operator metric subkeys intentionally do **not** include an additional `operatorMetrics` segment (for example use `op-devtools.performanceTuning.onBoard.l2CacheHitRate` instead of `op-devtools.performanceTuning.onBoard.operatorMetrics.l2CacheHitRate`) because VS Code Settings UI behavior is not reliable with these longer nested key paths in this flow.

### On-board "select content" view -> settings migration (required)

Goal:

- Remove `On-board - select content` popup/webview from primary user flow.
- When user clicks `On-board analysis` in sidebar/flow menu, execute on-board analysis immediately (same behavior as current popup `Start now`).
- All options used for execution must come from workspace settings under `op-devtools.performanceTuning.onBoard.*` (plus existing compile/script settings).

Target UX:

1. User clicks `On-board analysis`.
2. No popup appears.
3. On-board task starts immediately.
4. If user wants to change collection content/options, they edit workspace settings in `op-devtools.performanceTuning.onBoard.*`.

Detailed runtime mapping for immediate execution:

1. `op-devtools.performanceTuning.onBoard.interCoreLoad` -> `on_board.user_options.Occupancy`
2. `op-devtools.performanceTuning.onBoard.roofline` -> `on_board.user_options.Roofline`
3. `op-devtools.performanceTuning.onBoard.operatorCodeHotspot` -> `on_board.user_options.Source`
4. `op-devtools.performanceTuning.onBoard.cacheHeatmap` -> `on_board.user_options.MemoryDetail`
5. `op-devtools.performanceTuning.onBoard.operatorMetrics` -> bulk toggle controller; when changed, it updates all on-board metric settings to the same boolean value.
6. `op-devtools.performanceTuning.onBoard.cubeAndVectorInstructionTimeAndRatio` -> `on_board.user_options.ArithmeticUtilization`
7. `op-devtools.performanceTuning.onBoard.l2CacheHitRate` -> `on_board.user_options.L2Cache`
8. `op-devtools.performanceTuning.onBoard.memoryReadWriteBandwidth` -> `on_board.user_options.Memory`
9. `op-devtools.performanceTuning.onBoard.l0ReadWriteBandwidth` -> `on_board.user_options.MemoryL0`
10. `op-devtools.performanceTuning.onBoard.ubReadWriteBandwidth` -> `on_board.user_options.MemoryUB`
11. `op-devtools.performanceTuning.onBoard.computeAndMoveUnitTimeRatio` -> `on_board.user_options.PipeUtilization`
12. `op-devtools.performanceTuning.onBoard.resourceConflictRatio` -> `on_board.user_options.ResourceConflictRatio`
13. `op-devtools.performanceTuning.onBoard.enableKernelCodeSegmentProfiling` -> `on_board.user_options.KernelScale`
14. `op-devtools.performanceTuning.onBoard.parameters` -> `on_board.user_options.advance_param`

Execution contract (must match existing `Start now` path):

1. Keep existing project/type guards and error prompts.
2. Keep existing task command generation and terminal execution.
3. Keep existing run result views/panels.
4. Do not save DB data just because user clicked `On-board analysis`.
5. Keep explicit save APIs separate from direct-run action.

## 4) Environment subsection

Source: `env-config.vue` + project script service.

Required order (prototype parity):

1. `op-devtools.environment.environmentScript`

- `op-devtools.environment.environmentScript`
  - UI element type: `string` (`textbox`)
  - Description: `Absolute path to set_env.sh after CANN install. Empty if using one-stop platform image. If path error appears, set a valid env script path.`
  - Markdown description form: `Absolute path to \`set_env.sh after CANN install. Empty if using one-stop platform image. If path error appears, set a valid env script path.`
  - Maps to project env script (`ascend_env_script`)

---

## Per-operator overrides

Per request, do not expose editable JSON objects in workspace settings.

If per-operator overrides are still needed, keep them as internal persistence/runtime behavior (not as a user-editable settings item).

---

## Merge precedence (final recommendation)

For each runtime read:

1. persisted config (`user_options` from db/store)
2. global scalar workspace keys in subsection (`*.script`, `*.op`, etc.)
3. per-operator runtime overlay (internal only, non-settings) if feature remains enabled

Rationale: default stability + explicit workspace control + per-operator exceptions.

---

## Compatibility strategy

Use only the canonical 4-subsection keys (`compileAndDeploy.*`, `sanitizer.*`, `performanceTuning.*`, `environment.*`). Intermediate dotted keys from early UI-migration experiments are **not** read at runtime; rename any leftovers in `.vscode/settings.json` to the canonical keys.

---

## Behavioral constraints (validated)

1. `--ops` depends on `operatorNames` propagation.
2. `StartBuildParams` supports `operatorNames`; `StartRunParams` currently does not.
3. Sanitizer sidebar action should execute immediately using workspace settings (no popup in primary sidebar flow).
4. Several settings are conditionally applicable:
  - CPU/NPU debug script visibility depends on project type and capability flags.
  - Performance/sanitizer related settings are not always available for every project type.

Descriptions in `package.nls*.json` should call out conditional applicability.

---

## Suggested rollout (lowest risk)

1. Add full settings schema + i18n descriptions for the canonical 4 subsections.
2. Route all runtime reads through workspace settings only (see `svd-fix-settings-build-commands.md`).
3. Keep old webview command behavior unchanged for compatibility during rollout.
4. Validate parity matrix:
  - build command fields
  - debug scripts
  - sanitizer panel + direct sanitizer run
  - simulation/on-board toggles and advanced params
  - env script read/write
5. Deprecate and remove old panel only after parity sign-off.

---

## Explicit non-goals

- DB schema rewrite.
- Migration of unrelated extension settings (for example `op-devtools.debugMode`).
- Refactor of task orchestration outside operator project config scope.

