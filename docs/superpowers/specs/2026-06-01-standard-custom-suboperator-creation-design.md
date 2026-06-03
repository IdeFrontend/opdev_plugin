# Standard-custom sub-operator creation: stay-in-place + no phantom project record

- **Issue:** https://gitcode.com/opdevtools/plugin_release/issues/13
- **Date:** 2026-06-01
- **Status:** Approved design (pre-implementation)
- **Approach:** B — no persisted sub-operator project record; scaffold under the parent
  collection's `project_id` with an explicit output path.

## 1. Problem

When a user creates a new operator **inside** an existing standard-custom operator
project (e.g. `ops-math`), the newly created operator is registered and opened as a
**separate, mis-typed project** (`ascend`) and "cannot work properly". The issue asks
to simplify the flow: do **not** prompt "open in current/new window"; just create the
operator at the specified path and stay in the collection.

## 2. Root cause

Two distinct, compounding causes — both in the creation flow, not the user's project:

1. **Phantom project record (primary).** `welcome-controller.ts → createdProject`
   calls `projectService.init({ projectType: 'ascend' })` for the sub-operator. That
   delegates to `ProjectManager.initProject → createProject({ project_path: subOpDir,
   project_type: 'ascend' })`, which **upserts a standalone `project.json` record keyed
   by the sub-operator path** (`project-model.ts:172`). From then on
   `getProjectByPath(subOpDir)` returns an `ascend` project.

2. **Open-as-separate-folder + early-return detection.** After scaffolding,
   `createdProject` calls `promptForceNewWindowForOpenFolder()` and
   `vscode.openFolder(subOpDir)`. On (re)open, `openProject` does
   `getProjectByPath(...)` and **returns early on a hit** (`welcome-controller.ts:357`),
   so the filesystem detector never runs — the phantom `ascend` record decides the type.

### op_type vs project_type (important distinction)

A standard-custom sub-operator's **`op_type`** genuinely *is* `ascend` (or `cann`) — that
is correct and stays. The bug is registering it as a standalone **project** of
`project_type = 'ascend'`, which makes it a top-level project built outside the
collection's `build.sh --genop`. "Fix the type" here means "stop creating a competing
top-level project record", **not** "stop calling its op_type ascend".

### Why detector hardening alone is insufficient

Because `openProject` short-circuits on any `getProjectByPath` hit, hardening
`StandardCustomDetector` does nothing as long as the phantom record exists. Eliminating
the phantom record (in Approach B: never creating it) and the detector hardening are
therefore **one coupled change**, not two independent options.

## 3. Constraints discovered (scaffolding pipeline)

The file-scaffolding pipeline is `createDictory` (command) →
`handleOperatorProjectDirectoryFile` (STANDARD_CUSTOM branch) →
`welcomeMethods.createOps` → `generateOpsPrototype` and
`welcomeMethods.createOpsByPrototype` → `generateStructure`.

- `generateStructure` already accepts an explicit **`op_path`** override and uses it for
  `.vscode`/file placement and for the stored op record's `op_path`
  (`model.ts:232, 239, 305, 327`). The op record is linked to the scaffolding
  `project_id`. → Scaffolding under the **parent** `project_id` with
  `op_path = subOpDir` puts all on-disk artifacts in the sub-op dir **and** attaches the
  operator to the parent collection. (File placement solved; config-record keying — see
  next bullet — is what makes this safe.)
- **Config records are op-partitioned under a shared `project_id`.** `ensureConfigExists`
  looks up `getConfig(project_id, config_type, record.op_name)` (`model.ts:716`) and
  `getConfig` matches `op` when provided (`config-model.ts:179-182`); every stored config
  payload carries `op: record.op_name` (`model.ts:378-684`). So multiple operators under
  one `project_id` do **not** collide — they are keyed by `op_name`. This is the
  **intended** standard-custom model, confirmed by `getStandardCustomDeployCommand`
  (`standard-custom-deploy-command.spec.ts`): the project is the **collection**
  (`project_id`), operators are op records with `op_path = <collection>/<op>` resolved
  op-aware via `getConfigById → op → getOpByProjectIdAndOpName`. The phantom per-op
  `ascend` project was the anomaly, not the shared `project_id`.
- **Caveat — op-agnostic consumers.** Several single-operator call sites fetch
  `getConfig(projectId, config_type)` with no `op` and take `[0]`
  (`build-service.ts:196-200`, `performance-run-data.ts:40`,
  `folder-context-menu-service.ts:1505`, …). Those serve the single-operator project
  types (CANN/PyASC/Triton/standalone ascend), where workspace = operator = `project_id`.
  The standard-custom collection workflow uses the op-aware/selection-based path instead.
  Implementation **must confirm** (see §9) that no collection-operator build/run/profiling
  path relies on an op-agnostic `getConfig` under the collection `project_id`.
- `generateOpsPrototype` does **not** accept an output path — it writes
  `<opName>.json` into `getProjectById(project_id).project_path`
  (`ops-prototype.ts:71, 19`). The prototype JSON is a **durable artifact** that belongs
  at the operator's own directory root (a normally-created operator keeps it there, and
  the collection re-scans operators from disk). → It must be threaded an explicit output
  path so it lands in `subOpDir`.
- The STANDARD_CUSTOM branch resolves op name / id from `ProjectManager`
  (`pm.projectId`, `pm.getProjectName()`), which today reflect the phantom record. With
  no phantom record, the sub-op path + name must be threaded explicitly instead.

## 4. Goals / Non-goals

**Goals**
- Creating an operator inside a standard-custom collection keeps the user in the
  collection window — no "current/new window" prompt, no folder switch.
- No standalone `project.json` record is created for the sub-operator; the parent
  collection's `ops_list` / `experimental_ops_list` is the single source of truth.
- Operator files (op_host/op_kernel, prototype JSON, `.vscode`/configs) are created at
  the specified sub-operator path, attached to the parent collection.
- Harden detection so that, even if a sub-operator folder is opened standalone later, it
  is typed `STANDARD_CUSTOM` rather than `ascend`.

**Non-goals**
- No change to creating brand-new top-level projects (CANN / PyASC / Triton / a new
  top-level standard-custom collection): those keep the existing prompt + open flow.
- No change to a sub-operator's `op_type` (stays `ascend`/`cann`).
- No redesign of the project store or the sidebar tree rendering.

## 5. Design (Approach B)

### 5.1 Gating — "sub-operator inside a standard-custom collection?"

In `createdProject`, replace the fragile `currentExplorerPath.includes('math' |
'experimental')` checks with a **filesystem** containment check (the approved approach —
robust even when the store is not yet populated):

```
const subOpDir = path.join(params.projectPath, params.projectName);
// 1) Filesystem decision: is an ancestor of subOpDir a standard-custom collection?
//    Reuse the detector signal directly (build.sh with --genop), not a string match.
const inCollection =
  viewIdIsStandardCustom(params.createOperatorProjectDictoryFileType) &&
  hasAncestorBuildShWithGenop(subOpDir);              // detection-utils.ts
// 2) Resolve the collection's project_id (needed to scaffold under it).
let parent = getContainingStandardCustomProject(subOpDir);   // project-model.ts:298 (store)
if (inCollection && !parent) {
  // Collection open but not yet registered (e.g. folder restored on startup):
  // detect + register it so we have a project_id to scaffold under.
  parent = await ensureCollectionRegistered(ancestorCollectionRoot(subOpDir));
}
const isSubOperator = inCollection && !!parent;
```

**Why the change from the first draft:** an earlier draft gated solely on
`getContainingStandardCustomProject`, which is a **store** lookup (matches only registered
`STANDARD_CUSTOM` records, `project-model.ts:308-314`). If the collection is open but not
yet in the store, that returns `undefined` and the bug silently reappears. The filesystem
signal (`hasAncestorBuildShWithGenop`) is the user-approved, more robust gate; the store
lookup is used only to obtain/ensure the collection's `project_id`. If, after both, no
collection is resolved → **not** a sub-operator → fall through to the existing
standalone-project flow unchanged.

Keep the existing experimental-vs-regular distinction (attach to
`experimental_ops_list` vs `ops_list`) — drive it off the path / existing logic, not off
a phantom record.

### 5.2 Sub-operator creation flow (core)

When `isSubOperator`:

1. **Do not** call `projectService.init({ projectType: 'ascend' })` — no phantom record.
2. Scaffold under `project_id = parent.id` with explicit `op_path = subOpDir` and explicit
   op name = `params.projectName`:
   - Extend the `createDictory` command payload to carry a sub-operator context
     `{ parentProjectId, opName, outputPath }` (both the caller in `createdProject` and
     the handler are in-repo).
   - In `handleOperatorProjectDirectoryFile` (STANDARD_CUSTOM branch), when the
     sub-operator context is present, use it instead of `pm.projectId` /
     `pm.getProjectName()`.
   - Extend `generateOpsPrototype(project_id, opName, prototypeName, extensionPath,
     outputPath?)` and the `createOps` / `createOpsByPrototype` wrappers so the prototype
     JSON is written to `subOpDir`.
   - Pass `op_path = subOpDir` to `generateStructure` (already supported).
3. Update the parent's `ops_list` / `experimental_ops_list` (existing logic,
   `welcome-controller.ts:199-231`).
4. **Remove** `promptForceNewWindowForOpenFolder()` + `vscode.openFolder(subOpDir)` for
   this case. Instead: `requestSidebarContextsRefresh()` + `revealInExplorer(subOpDir)`
   — stay in the ops-math window.

### 5.3 Detector hardening

In `StandardCustomDetector.detectProject` (`standard-custom.detector.ts`), promote the
Path-2 result to **`definitive`** when the ancestor signal is present (parent has
`build.sh`, or `hasAncestorBuildShWithGenop(dirPath)` is true). Today this case returns
`heuristic`, so a sub-operator containing `.asc` files loses to `AscendPlugin`. With no
phantom record (§5.2) the `openProject` early-return no longer fires, so a manual
standalone open of a sub-operator folder now detects `STANDARD_CUSTOM` correctly.

## 6. Error handling & edge cases

- **No containing collection** → `isSubOperator` is false → existing standalone flow
  (creating CANN/PyASC/Triton or a new top-level standard-custom collection is
  unaffected).
- **Scaffold failure** → keep current behavior (warn; the directory already exists).
  Because no phantom record is created, there is nothing to clean up on failure.
- **Prototype JSON** → written to `subOpDir` via the explicit output path; never to the
  parent collection dir.
- **Experimental operators** → preserve `experimental_ops_list` vs `ops_list` routing.
- **op record attribution** → the generated op record carries `project_id = parent.id`
  and `op_path = subOpDir`; verify it is picked up by the collection's operator scan
  (`scanOpsMeetAndOpsLists` / `updateStandardCustomOperators`).

## 7. Affected files

- `plugin/src/controller/welcome-controller.ts` — gating; skip `init`; scaffold via
  parent id + explicit path; remove prompt/open for sub-ops; refresh + reveal.
- `plugin/src/class/webview-message-list.ts` — STANDARD_CUSTOM branch honors the
  sub-operator context instead of `ProjectManager`.
- `plugin/src/domain/services/ops-prototype.ts` — `generateOpsPrototype` gains an
  explicit output-path parameter.
- `plugin/src/service/project-service.ts` — `createOps` / `createOpsByPrototype` thread
  explicit output path + op name.
- `plugin/src/extension.ts` — `createDictory` command payload type extended with the
  sub-operator context.
- `plugin/src/domain/plugins/standard-custom.detector.ts` — ancestor `--genop` ⇒
  `definitive`.
- `plugin/src/domain/plugins/detection-utils.ts` — reuse existing
  `hasAncestorBuildShWithGenop` for the gate (read-only; no change expected).
- `plugin/src/domain/models/project-model.ts` — possibly add `ensureCollectionRegistered`
  helper (only if §9.2 finds the collection may be unregistered at create time).
- Build/run consumers — **only if** §9.1 finds a collection path that is op-agnostic;
  otherwise untouched.

## 8. Testing

- **Unit**
  - Gating: a path whose ancestor has `build.sh --genop` is treated as a sub-operator
    (filesystem signal), and the parent `project_id` is resolved/registered; a path
    outside any collection yields the standalone flow.
  - Scaffolding under parent id with `op_path = subOpDir` writes `.vscode`/configs and
    the prototype JSON into `subOpDir`, and the op record has `project_id = parent.id`.
  - No new `project.json` record is created for the sub-operator path.
  - `StandardCustomDetector` returns `definitive STANDARD_CUSTOM` for a folder that
    contains `.asc` files and whose ancestor has `build.sh --genop`.
- **Regression**
  - Existing suites: `standard-custom-deploy-command.spec.ts` and the detector specs.
  - Note: the repo baseline is not green (lint + one Jest suite fail on a clean
    checkout) — compare against `HEAD` before attributing failures to this change.

## 9. Pre-implementation verification (do these first)

1. **Collection-operator build/run/profiling is op-aware.** Confirm that every path that
   builds/runs/profiles an operator *within a standard-custom collection* resolves the
   config op-aware (by `op_name`/config-id, like `getStandardCustomDeployCommand`), and
   that none routes through an op-agnostic `getConfig(collectionProjectId, type)[0]`
   (`build-service.ts:189-201`, `performance-run-data.ts:40`, …). If any collection path
   is op-agnostic, it must be made op-aware as part of this change — escalate scope before
   coding. *(Strong evidence it is already op-aware; confirm, don't assume.)*
2. **Collection `project_id` availability at create time.** Confirm whether the parent
   collection is guaranteed registered in the store when `createdProject` runs. If not,
   implement `ensureCollectionRegistered` (§5.1) so a `project_id` always exists to
   scaffold under.
3. **Op record surfacing.** Confirm the parent-id + `op_path = subOpDir` op record is
   picked up by the collection's operator scan (`scanOpsMeetAndOpsLists` /
   `updateStandardCustomOperators`) and shows in the sidebar under the collection.
4. **No other phantom-record dependency.** Confirm no code path other than the
   prototype/structure generators relied on the phantom per-op `project_id`.
