# Integrated Migration Summary (Logical View)

## Purpose

This document summarizes all migration work after `837c9e5219b5bb13c6d429d663ed66f15e1f497f`, but presents it by logical domains instead of commit order.

It is based on:

- [`docs/sidebar-treeview-migration-plan.md`](docs/sidebar-treeview-migration-plan.md)
- [`docs/operator-project-config-workspace-settings-suggestion.md`](docs/operator-project-config-workspace-settings-suggestion.md)
- implementation and history deltas across plugin, shared, and docs

Goals of this summary:

1. explain what changed by architecture/function
2. explain why each change matters
3. show how runtime behavior was preserved or intentionally changed
4. document remaining migration debt

---

## 1) Sidebar Migration to Native Tree Views

## 1.1 Architectural shift

The sidebar moved from webview-rendered UI to native VS Code Tree Views. This affects:

- rendering model (HTML/Vue -> `TreeDataProvider`)
- interaction model (in-webview events -> command execution)
- visibility model (frontend computed state -> extension-side context and provider state)

The migration introduced two core realities:

1. **stateful view switching** (Home vs Operate)
2. **tree-node command routing** for all primary actions

## 1.2 New view composition

The final layout uses native trees in the same pane:

- Home/empty-state tree when no usable operator config context is available
- Operate tree when project/config context is active
- Dedicated Operator Projects tree split from main flow menu

Visibility rule:

- `Operators` tree is shown only for projects that are both:
  - multi-operator (`hasMultipleOperators === true`)
  - standard custom (`isStandardCustom === true`)
- It is hidden otherwise.

This split reduces coupling between:

- action hierarchy (`Compile`, `Run`, `Debug`, `Sanitizer`, `Performance`)
- selection hierarchy (operator project list, selected operators, clear/select behavior)

## 1.3 Behavior parity carried over from webview logic

Visibility and action constraints that were previously in webview logic were preserved in provider/command guards:

- project-type dependent hiding rules (e.g. debug/sanitizer/perf restrictions)
- multi-select restrictions for single-operator actions
- conditional debug child visibility (CPU vs NPU)
- support flags gating sanitizer/performance flows

Implementation touchpoints:

- [`plugin/src/class/operate-tree-provider.ts`](plugin/src/class/operate-tree-provider.ts)
- [`plugin/src/extension.ts`](plugin/src/extension.ts)
- [`plugin/src/controller/home-controller.ts`](plugin/src/controller/home-controller.ts)

## 1.4 UX-level refinements during migration

The tree migration included UX refinements requested during iterative rollout:

- selected operators count/list visibility behavior
- clear-all handling in operator selection flow
- node label alignment and i18n consistency
- disabled-item behavior instead of hidden/action-failure where appropriate

This moved complex user feedback from webview controls to native tree semantics.

---

## 2) Operator Project Config Migration to Workspace Settings

## 2.1 Migration intent

The previous "Operator project config" webview was replaced by workspace settings so that configuration:

- is native to VS Code
- is source-controlled when stored in workspace settings
- can be edited without opening custom UI panels
- remains connected to existing backend command generation logic

## 2.2 Settings structure outcome

The final model uses `op-devtools.*` with four top-level categories:

1. `compileAndDeploy`
2. `sanitizer`
3. `performanceTuning`
4. `environment`

This structure is represented in [`package.json`](package.json) via separate configuration categories (array form), each with dedicated title/id and grouped properties.

## 2.3 Design constraints enforced

The migration implementation and proposal converged on these constraints:

- settings keys act as labels (camelCase split by VS Code)
- descriptions are used for hint-bearing items only
- order fields define prototype-parity ordering in settings UI
- no broad editable JSON blob for all options
- script and flow-critical options are exposed as typed fields (boolean/string/number/object map)

## 2.4 Data model conversion details

Some webview structures required explicit adaptation to settings model:

- table-like additional params converted to `map<string,string>` object settings
- nested popup booleans mapped to concrete setting keys
- runtime-only control key (`operatorMetrics` as bulk controller) added where needed

This balances VS Code settings UX constraints with backend config shape.

## 2.5 Files and system areas changed

- schema and settings contribution:
  - [`package.json`](package.json)
- localized settings descriptions/titles:
  - [`package.nls.json`](package.nls.json)
  - [`package.nls.zh-cn.json`](package.nls.zh-cn.json)
- proposal/spec updates:
  - [`docs/operator-project-config-workspace-settings-suggestion.md`](docs/operator-project-config-workspace-settings-suggestion.md)

## 2.6 Compile and Environment mappings

The following mappings are the canonical migration contract used by runtime merge logic for sections owned by configuration migration (not direct-run popups).

### Compile and deploy

- `op-devtools.compileAndDeploy.buildConfig.operatorNameToCompile` -> `build_op.user_options.op`
- `op-devtools.compileAndDeploy.buildConfig.deployCommandOrRunCommand` -> `build_op.user_options.target_file`
- `op-devtools.compileAndDeploy.buildConfig.compileCommand` -> `build_op.user_options.script`
- `op-devtools.compileAndDeploy.buildConfig.cpuDebugCompileCommand` -> `build_op.user_options.cpu_debug_script`
- `op-devtools.compileAndDeploy.buildConfig.npuDebugCompileCommand` -> `build_op.user_options.npu_debug_script`
- `op-devtools.compileAndDeploy.buildConfig.sanitizerCompileCommand` -> `sanitizer.user_options.script`
- `op-devtools.compileAndDeploy.buildConfig.onBoardCompileCommand` -> `on_board.user_options.script`
- `op-devtools.compileAndDeploy.buildConfig.simulationCompileCommand` -> `simulate.user_options.script`
- `op-devtools.compileAndDeploy.exampleBuildConfig.executionMode` -> `build_example.user_options.execution_mode`
- `op-devtools.compileAndDeploy.exampleBuildConfig.runCommand` -> `build_example.user_options.script`

### Environment

- `op-devtools.environment.environmentScript` -> project env script (`ascend_env_script` / `projectSH` read path)

---

## 3) Direct-Run Flow Migration (Popup to Settings-Driven Execution)

This is the most behavior-visible migration: click action now runs immediately, and "what to collect" is configured in settings.

## 3.1 Common execution contract

Across Sanitizer / On-board / Simulation, the target contract is:

1. user clicks action node
2. no "select content" popup appears in primary flow
3. command executes immediately
4. options are read from settings-backed config merge
5. existing output/result panels continue to work

## 3.3 On-board migration

Functional changes:

- moved on-board popup options to settings keys under `performanceTuning.onBoard.*`
- action changed to immediate execution
- settings icon opens filtered on-board settings section

Special logic:

- `operatorMetrics` parent checkbox controls a set of metric child keys
- sync listener updates children in batch (`Promise.all`) to reduce staggered UI updates
- recursion guard prevents update loops

Operationally, this replaced webview parent/child checkbox behavior with extension-side configuration synchronization logic.

Runtime mapping details:

- `op-devtools.compileAndDeploy.buildConfig.onBoardCompileCommand` -> `on_board.user_options.script`
- `op-devtools.performanceTuning.onBoard.interCoreLoad` -> `on_board.user_options.Occupancy`
- `op-devtools.performanceTuning.onBoard.roofline` -> `on_board.user_options.Roofline`
- `op-devtools.performanceTuning.onBoard.operatorCodeHotspot` -> `on_board.user_options.Source`
- `op-devtools.performanceTuning.onBoard.cacheHeatmap` -> `on_board.user_options.MemoryDetail`
- `op-devtools.performanceTuning.onBoard.cubeAndVectorInstructionTimeAndRatio` -> `on_board.user_options.ArithmeticUtilization`
- `op-devtools.performanceTuning.onBoard.l2CacheHitRate` -> `on_board.user_options.L2Cache`
- `op-devtools.performanceTuning.onBoard.memoryReadWriteBandwidth` -> `on_board.user_options.Memory`
- `op-devtools.performanceTuning.onBoard.l0ReadWriteBandwidth` -> `on_board.user_options.MemoryL0`
- `op-devtools.performanceTuning.onBoard.ubReadWriteBandwidth` -> `on_board.user_options.MemoryUB`
- `op-devtools.performanceTuning.onBoard.computeAndMoveUnitTimeRatio` -> `on_board.user_options.PipeUtilization`
- `op-devtools.performanceTuning.onBoard.resourceConflictRatio` -> `on_board.user_options.ResourceConflictRatio`
- `op-devtools.performanceTuning.onBoard.enableKernelCodeSegmentProfiling` -> `on_board.user_options.KernelScale`
- `op-devtools.performanceTuning.onBoard.parameters` -> `on_board.user_options.advance_param` (map converted to `[{ name, value }]`)
- `op-devtools.performanceTuning.onBoard.operatorMetrics` -> bulk-control setting (no standalone backend field; controls metric child settings)

## 3.4 Simulation migration

Functional changes:

- simulation action changed to immediate execution
- popup content options migrated into settings:
  - `simulatorType`
  - `memoryThroughputWaveform`
  - `resourceConflictRatio`
  - `parameters`
- settings icon opens filtered simulation settings section

Hint parity added for migrated options:

- default compute/move ratio hint
- operator code hotspot default hint

Runtime mapping:

- `op-devtools.compileAndDeploy.buildConfig.simulationCompileCommand` -> `simulate.user_options.script`
- `op-devtools.performanceTuning.simulation.simulatorType` -> `simulate.user_options.simulatorType`
- `op-devtools.performanceTuning.simulation.memoryThroughputWaveform` -> `simulate.user_options.PMSampling`
- `op-devtools.performanceTuning.simulation.resourceConflictRatio` -> `simulate.user_options.ResourceConflictRatio`
- `op-devtools.performanceTuning.simulation.parameters` -> `simulate.user_options.advance_param` (map converted to `[{ name, value }]`)

---

## 4) Runtime Merge and Dynamic Initialization Model

## 4.1 Why merge is needed

Config sources now include:

1. persisted project config (`user_options` from DB/config file path) — row identity + db-only fields after migration
2. workspace settings overrides (canonical `op-devtools.*` keys only)

A merge layer is required so command generation sees one effective config object.

## 4.2 Merge implementation details

The helper [`plugin/src/helpers/operator-project-workspace-config.ts`](plugin/src/helpers/operator-project-workspace-config.ts):

- reads relevant settings keys by section
- inspects explicit values with scope awareness
- maps scalar keys to nested backend fields
- converts object maps to `advance_param` row arrays where needed
- applies section-specific overlays:
  - build/build_example/simulate/on_board/sanitizer/env

Service integration:

- `build-service` reads merged build/perf configs
- `config-service` reads merged sanitizer configs while preserving raw-save path
- `project-service` applies environment script override

## 4.3 One-time migration initialization (current branch)

`configService.maybeMigrateLegacySettingsToWorkspace()` in [`plugin/src/extension.ts`](plugin/src/extension.ts) (via `refreshSidebarContexts`, welcome open, folder mark):

- runs once when `op-devtools.internal.settingsMigratedFromLegacy` is absent
- seeds canonical dotted keys from legacy `configs.json` (`buildLegacySettingsMigrationWrites`)
- does **not** read or write intermediate non-canonical dotted keys
- sets migration flag only after ≥1 seed key

Post-migration: webview/API saves use `ConfigService.writeOpDevtoolsDottedSettings` only.

## 4.4 Multi-scope implications

Part of migration complexity came from VS Code setting scopes:

- global/user
- workspace
- workspaceFolder

Parent-child setting sync (notably on-board metrics) required explicit handling to ensure UI and effective values remained consistent across scopes.

---

## 5) Internationalization and Documentation Alignment

## 5.1 i18n work

Migration added/updated texts across:

- command titles
- settings category titles
- setting descriptions/markdown hints
- tree labels and operator-sidebar strings

Files:

- [`package.nls.json`](package.nls.json)
- [`package.nls.zh-cn.json`](package.nls.zh-cn.json)
- [`shared/i18n/en.ts`](shared/i18n/en.ts)
- [`shared/i18n/zh-cn.ts`](shared/i18n/zh-cn.ts)

## 5.2 Documentation work

The two core docs now serve different but complementary roles:

1. [`docs/sidebar-treeview-migration-plan.md`](docs/sidebar-treeview-migration-plan.md)
   - target native-tree architecture
   - behavior parity requirements
   - command and visibility model expectations

2. [`docs/operator-project-config-workspace-settings-suggestion.md`](docs/operator-project-config-workspace-settings-suggestion.md)
   - canonical settings key map
   - UI type and hint rules
   - runtime mapping contracts
   - direct-run migration details for Sanitizer/On-board/Simulation

## 5.3 Alignment status

Implementation generally follows doc direction; see Section 7 for remaining gaps (popup residues, lint, manual QA).

---

## 6) Related Adjacent Fix Included in Scope

A non-core but relevant UX fix was included in the same migration window:

- [`web/src/views/panels/link/components/link-ssh.vue`](web/src/views/panels/link/components/link-ssh.vue)
  - changed folder picker trigger from focus to click

Practical effect:

- prevents accidental dialog opening when merely focusing the input

This is not part of sidebar/settings architecture, but improves user flow stability in project open/create panels.

---

## 7) Leftovers and Gaps

## 7.1 Intermediate settings key aliases — removed

Runtime reads **canonical keys only** (`compileAndDeploy.*`, `sanitizer.*`, `performanceTuning.*`, `environment.*`). Rename any non-canonical dotted keys still present in `settings.json`.

## 7.2 Popup command/view residues still exist

Current state:

- popup-related constants and compatibility paths remain in codebase for some flows

Why it exists:

- staged migration safety and fallback compatibility

Risk:

- maintenance overhead and ambiguity about "final" supported UX path

## 7.3 Extension lint debt remains high

Current state:

- [`plugin/src/extension.ts`](plugin/src/extension.ts) contains substantial pre-existing lint/style debt

Risk:

- harder review signal for future behavioral changes
- larger diff noise during command-routing changes

## 7.4 Verification remains mostly manual

Current state:

- high-dimensional matrix still verified manually:
  - project types
  - multi-select states
  - direct-run with settings permutations
  - scope interactions for setting sync

Risk:

- regressions may reappear in tree visibility/action gating and settings sync behavior

---

## 8) Recommended Next Actions

1. Remove compatibility-only popup routes/constants after sign-off window.
3. Add automated regression checks:
   - tree visibility matrix
   - single/multi-operator action gating
   - direct-run settings-to-runtime mapping parity
4. Run dedicated lint/format cleanup in extension orchestration files as separate non-functional change.
5. Add a concise migration QA checklist to docs for future contributors.

---

## 9) Affected File Groups (Logical)

## Sidebar and command orchestration

- [`plugin/src/class/operate-tree-provider.ts`](plugin/src/class/operate-tree-provider.ts)
- [`plugin/src/controller/home-controller.ts`](plugin/src/controller/home-controller.ts)
- [`plugin/src/controller/task-controller.ts`](plugin/src/controller/task-controller.ts)
- [`plugin/src/extension.ts`](plugin/src/extension.ts)
- [`package.json`](package.json)
- [`package.nls.json`](package.nls.json)
- [`package.nls.zh-cn.json`](package.nls.zh-cn.json)
- [`shared/i18n/en.ts`](shared/i18n/en.ts)
- [`shared/i18n/zh-cn.ts`](shared/i18n/zh-cn.ts)

## Settings schema and runtime mapping

- [`plugin/src/helpers/operator-project-workspace-config.ts`](plugin/src/helpers/operator-project-workspace-config.ts)
- [`plugin/src/service/build-service.ts`](plugin/src/service/build-service.ts)
- [`plugin/src/service/config-service.ts`](plugin/src/service/config-service.ts)
- [`plugin/src/service/project-service.ts`](plugin/src/service/project-service.ts)
- [`package.json`](package.json)
- [`package.nls.json`](package.nls.json)
- [`package.nls.zh-cn.json`](package.nls.zh-cn.json)

## Specifications

- [`docs/sidebar-treeview-migration-plan.md`](docs/sidebar-treeview-migration-plan.md)
- [`docs/operator-project-config-workspace-settings-suggestion.md`](docs/operator-project-config-workspace-settings-suggestion.md)

## Adjacent UI fix

- [`web/src/views/panels/link/components/link-ssh.vue`](web/src/views/panels/link/components/link-ssh.vue)
