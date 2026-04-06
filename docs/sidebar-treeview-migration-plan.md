# Sidebar Tree View Migration Plan (home + operate)

## Goal

Replace the current webview sidebars:

- `web/src/views/sidebars/home/`
- `web/src/views/sidebars/operate/`

with native VS Code tree views, with these states:

- **Home state**: shown when `hasDevtoolConfig === false`
- **Operate state**: shown when `hasDevtoolConfig === true`

Operate must use default VS Code tree styling (no custom webview theming), while preserving the current hierarchy and node visibility rules.

## Scope

In scope:

- `plugin` side view registration and data providers
- `package.json` contributes for the two sidebars
- command/context wiring needed for dynamic tree nodes and state switching

Out of scope:

- panel webviews (config, welcome, sanitizer/performance panels)
- external pages/assets under `web/src/views/sidebars/`*

## Current behavior to preserve

### Home sidebar behavior

Current `home` webview provides:

- Help guide link
- Welcome/home link
- `New Operator Project` action
- `Open Operator Project` action

### Operate sidebar hierarchy

Current top-level hierarchy in `operate` (from `menuItems`) is:

1. Project Config
2. Compile/Deploy
3. Run
4. Debug (conditionally shown, with right-side settings button on the Debug node)
  - CPU Debug (conditionally shown)
  - NPU Debug (conditionally shown)
5. Sanitizer (conditionally shown, with right-side settings button on this node)
6. Performance Tuning (conditionally shown)
  - On-board Analysis (with right-side settings button on this subnode)
  - Simulation Analysis (with right-side settings button on this subnode)

For native tree view, these right-side settings buttons are implemented as item actions (inline where possible, otherwise item context actions) on the same node/subnode.

### Current visibility rules to preserve

Rules today are computed in `web/src/views/sidebars/operate/app.vue`, based on:

- `hasDevtoolConfig`
- `isStandardCustom`
- `supportsSanitizerAndTuning`
- `projectType` (`pyasc`, `ascend`, `cann`, etc.)
- `projectTemplateName`
- `debugModeEnabled`

Exact visibility logic to carry over:

- If `projectType === "pyasc"`, hide:
  - Compile/Deploy
  - Debug
  - Sanitizer
- Debug submenu composition:
  - CPU Debug hidden when `projectType === "ascend"` or `(projectType === "cann" && projectTemplateName === "torch_library_template")`
  - NPU Debug shown only when `debugModeEnabled === true`
  - Debug parent shown only if at least one debug child is visible
- If `isStandardCustom && !supportsSanitizerAndTuning`, hide:
  - Performance Tuning
  - Debug

Notes:

- Existing multi-operator selection/disable behavior is currently interactive UI logic inside the webview. For the first tree version, we preserve the same business rules and node visibility conditions, while expressing multi-operator interactions through command-driven flow (no embedded selector/search/tag UI).

## Target architecture

## 1) New native tree views

Introduce two providers in `plugin/src/class/`:

- `home-tree-provider.ts` (for home state)
- `operate-tree-provider.ts` (for operate state)

Both implement:

- `vscode.TreeDataProvider<TreeNode>`

`TreeNode` model:

- `id`
- `label`
- `contextValue`
- `collapsibleState`
- `command?`
- `children?`

No custom CSS/theming; rely on default VS Code tree rendering.

## 2) State switching model

State is controlled via context keys and `when` clauses:

- `opDevtools.showHomeTree`
- `opDevtools.showOperateTree`

Rules:

- `showHomeTree = (hasDevtoolConfig === false)`
- `showOperateTree = (hasDevtoolConfig === true)`
- This is independent of whether a workspace is open; an opened workspace without `.vscode/devtool_config.json` still shows Home state.

Initial values are set during activation; then refreshed on relevant events:

- workspace folder changes
- open-project/new-project completion
- explicit refresh command (if added)

## 3) package.json contributions

Replace current sidebar view contributions:

- remove/retire `pluginSidebar` webview
- remove/retire `OpsOperateProvider` webview

Add native tree views in a single container:

- Use one container for both states (same location for users).
- Register:
  - Home/empty-state tree view with `when: opDevtools.showHomeTree`
  - Operate tree view with `when: opDevtools.showOperateTree`
- Home/empty-state actions should be exposed via tree-view empty content contribution (the tree empty-state extension point), not a webview.

## 4) Command mapping

Tree items call existing extension commands (or thin wrappers), for parity:

- New Operator Project -> `huawei-op-devtools.open`
- Open Operator Project -> `huawei-op-devtools.openProject`
- Project Config -> `huawei-op-devtools.config`
- Compile/Deploy -> command used by current build flow (same API path as now)
- Run -> command used by current run flow
- CPU/NPU Debug -> existing debug commands
- Sanitizer/On-board/Simulation -> existing commands

For home links previously opening external URL/welcome:

- keep as tree items bound to existing/new commands:
  - open welcome
  - open help URL
- Keep `huawei-op-devtools.toggleOpsOperate` as a UI convenience command for toggling container visibility.

Settings action commands (new or wrapper commands) to add:

- `huawei-op-devtools.operate.debugSettings`
- `huawei-op-devtools.operate.sanitizerSettings`
- `huawei-op-devtools.operate.onBoardSettings`
- `huawei-op-devtools.operate.simulationSettings`

Implementation note:

- In native tree, these are exposed as:
  - view/item context menu actions (`contributes.menus["view/item/context"]`)
  - optional inline icon actions in tree item row via `group: "inline"`
- They should be shown only for matching `contextValue` and use the same visibility rules as their parent nodes.

## 5) Dynamic visibility in operate tree

`OperateTreeProvider.getChildren()` will build the same node structure as current webview menu logic, using the same upstream data sources:

- debug mode from existing config service
- project type from existing `home-controller` API/service path
- multi-operator / standard-custom flags from existing logic
- devtool config existence from existing service

Then filter nodes with the same conditions listed above.

Settings action visibility follows node visibility:

- If a node is hidden by condition, its settings action is hidden too.
- If a node is visible, its settings action is available on that same node/subnode (inline and/or context menu where configured).

Refresh triggers:

- on activation
- on workspace change
- after project open/create commands complete
- optional command: `huawei-op-devtools.refreshOperateTree`

## 6) Incremental migration strategy

Phase 1:

- Add tree providers and register them
- Keep existing webview providers temporarily (guarded by context keys) for fallback

Phase 2:

- Switch default visibility to tree views
- Verify command and condition parity

Phase 3:

- Remove obsolete webview sidebar providers and unused frontend sidebar assets

## Verification checklist

- No project config (`hasDevtoolConfig === false`):
  - Home tree visible
  - Operate tree hidden
- Project configured (`hasDevtoolConfig === true`):
  - Operate tree visible
  - Home tree hidden
- `pyasc` project:
  - Compile/Deploy, Debug, Sanitizer hidden
- `ascend` project:
  - CPU Debug hidden
- `cann + torch_library_template`:
  - CPU Debug hidden
- Debug mode off:
  - NPU Debug hidden
- Standard custom without sanitizer/tuning support:
  - Debug and Performance Tuning hidden
- Commands execute same backend behavior as before

## Open questions (please confirm)

- None.

