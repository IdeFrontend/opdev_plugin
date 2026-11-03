# New project generation — implementation specification

How the **New Project** webview creates an operator project: UI parameters, `createdProject`, `createDictory` → `handleOperatorProjectDirectoryFile`, `createOpsByPrototype` → `OpGeneratorFactory`, template ZIPs, and post-extract renaming.

**Related:** [`operator-behavior-specification.md`](./operator-behavior-specification.md) (types and actions), [`workspace-settings.md`](./workspace-settings.md) (runtime `op-devtools.*` after scaffold), [`generated-files-specification.md`](./generated-files-specification.md) (persisted artifacts).

---

## 1. Terminology

| Term | Meaning |
|------|---------|
| **View ID** | `OperatorProjectViewId` in [`shared/project-type-view-id.ts`](../shared/project-type-view-id.ts): `CANN` = 1, `STANDARD_CUSTOM` = 2, `PYASC` = 3, `TRITON` = 4. |
| **`project_type` (stored)** | String on the project record from [`viewIdToProjectType`](../plugin/src/domain/utils/project-utils.ts): `cann`, `ascend`, `pyasc`, `triton`. **STANDARD_CUSTOM (2) stores `ascend`**, not `standard-custom`. |
| **`op_type` (generator)** | Passed to `createOpsByPrototype` / [`OpGeneratorFactory`](../plugin/src/domain/services/op-generator-factory.ts): `cann`, `ascend`, `pyasc`, `triton`. New Project uses `viewIdToProjectType` for init, except STANDARD_CUSTOM scaffolding uses **`opType: 'ascend'`** in `handleOperatorProjectDirectoryFile`. |
| **Feature-toggle key** | Used only in [`handleOperatorProjectDirectoryFile`](../plugin/src/class/webview-message-list.ts) via `normalizeViewIdToProjectType`: `cann`, `standard-custom`, `pyasc`, `triton`. Only **Triton** is gated today (`op-devtools.operatorSupport.triton`). |
| **`projectName` (UI)** | Form field → child folder name and, after init, `project_name` / canonical `op_name` when `opName` is passed through. |
| **`templateName` (API)** | Optional string from the webview; stored in `ExtensionContext.globalState` key `templateName` when set in `createdProject`, read by `createDictory` handler. |

---

## 2. Web UI

**Panel:** [`web/src/views/panels/new-project/`](../web/src/views/panels/new-project/) (`app.vue` → `new-project.vue` + [`use-new-project.ts`](../web/src/views/panels/new-project/composables/use-new-project.ts)).

### 2.1 Project type list

Default types shown: **CANN**, **PYASC**, **TRITON** (`items_type` in `new-project.vue`).

| Condition | UI change |
|-----------|-----------|
| `getProjectTypeSupportEnabled(TRITON)` is `false` | Triton card removed; selection falls back to CANN if needed. |
| Open workspace `getProjectType()` returns standard-custom context (`projectType === 'ascend'` from stored project records or detected `projectType === 'standard-custom'`) | List is **only STANDARD_CUSTOM** (Ascend standard-custom); selection forced to view ID 2. |

API: `common/getProjectTypeSupportEnabled` → [`common-controller.ts`](../plugin/src/controller/common-controller.ts) → `isOperatorSupportEnabled('triton')`.

### 2.2 Form payload

[`CreatedProjectParams`](../shared/api-types/webview.d.ts):

| Field | Role |
|-------|------|
| `projectPath` | Parent directory for the new folder. |
| `projectName` | New folder name and registered project name. |
| `projectSH` | Optional env script (`chmod +x` + source in `createdProject`; passed to init as `ascendEnvScript`). |
| `createOperatorProjectDictoryFileType` | View ID (1–4). |
| `templateName` | Optional; see §2.3. |

Defaults in composable: `projectPath` `/home/developer`, `projectSH` `/etc/profile`, generated `projectName`.

### 2.3 Template name resolution (web)

`resolveTemplateNameByProjectType()` in `use-new-project.ts`:

| View ID | `templateName` sent |
|---------|------------------------|
| **CANN (1)** | From selected CANN template radio, or `undefined` if none selected. |
| **PYASC (3)** | `undefined` (scaffold id is fixed in generator). |
| **STANDARD_CUSTOM (2)** | `undefined` (prototype + `add_custom.zip`). |
| **TRITON (4)** | Always `'triton_vector_add'`. |

**CANN UI radios** (only on CANN card): `helloworld`, `addn`, `torch_library_template` — not `triton_vector_add`.

**UI key → `templateName` string** (`getTemplateName`):

| UI `selectedTemplate` | `templateName` |
|----------------------|----------------|
| `helloworld` | `hello_world` |
| `addn` | `addn_custom` |
| `torch_library_template` | `torch_library_template` |
| `triton_vector_add` | `triton_vector_add` (used for TRITON view ID, not CANN radios) |

---

## 3. Extension entry: `createdProject`

[`welcome-controller.ts`](../plugin/src/controller/welcome-controller.ts) → `welcomeMethods.createdProject` (exposed to webview as `createdProject`).

### 3.1 Ordered steps (all view IDs)

1. Wait for pending post-activation bootstrap so automatic workspace initialization cannot race project creation.
3. Resolve the active workspace root from `.vscode/cache.json` (`getProjectByPath` → `cache.folders[rootKey]`), falling back to filesystem detection only for sub-operator classification.
4. For a STANDARD_CUSTOM child inside the active workspace, resolve the root collection record. If it is missing, call `WorkspaceDetectorService.detectAndRegisterWorkspace`, then read the store again. The service creates one normalized root record with stored type `ascend` before scanning `ops_meet`, `ops_list`, and `experimental_ops_list`. Creation aborts with `welcome.initOperatorProjectFailed` if recovery still produces no parent.
5. For a resolved STANDARD_CUSTOM child, try the workspace `build.sh --genop` command, then create the child directory when the command did not produce it.
6. Optional `projectSH`: `chmod +x` + execute via `CommandExecutor` (failures logged only).
7. For a STANDARD_CUSTOM child, append it once to the root record's regular or experimental operator list in `cache.folders[rootKey]` scan state using normalized-path identity. The child is never registered as a standalone project. Other project types use `projectService.init` → `ProjectManager` context + `op-devtools.projectType` workspace setting for the new standalone root.
8. Seed `cache.sanitizerPythonTarget` (keyed by the canonical operator name via `sanitizerTargetKeyForOp`) for **PYASC** / **TRITON** (`python3 ./<projectName>.py`) and for `torch_library_template` (`python ../run.py`), so a fresh creation already resolves the base sanitizer Python target.
9. `revealInExplorer` on the new folder (best effort), show `welcome.projectCreated`, and run `ensureLaunchJsonExists(fullProjectPath)`.
10. If `params.templateName` is set, store it in `globalState.templateName` for `createDictory`.
11. Invoke `huawei-op-devtools.createDictory` with `subOperatorContext` (collection root path, operator name, child output path, `skipFileGeneration`) for an in-place STANDARD_CUSTOM child; other flows pass only `createOperatorProjectDirectoryFileType`.
12. On scaffold failure, show `welcome.createDirOkCreateFilesError` and keep the directory.
13. In-place children remain in the current collection window. Standalone projects prompt for current versus new window before `vscode.openFolder`.

### 3.2 Canonical `op_name`

[`CreateOpsByPrototypeParams`](../shared/api-types/ops.d.ts) optional **`opName`**. [`ProjectService.createOpsByPrototype`](../plugin/src/service/project-service.ts) passes `op_name` into the generator (trimmed `opName` || current project basename).

`handleOperatorProjectDirectoryFile` passes **`opName`** (the current project basename, or the sub-operator name for STANDARD_CUSTOM children) so the form **`projectName`** is the scaffold **`op_name`**.

---

## 4. Command handler: `handleOperatorProjectDirectoryFile`

[`webview-message-list.ts`](../plugin/src/class/webview-message-list.ts), invoked by command [`COMMAND_CREATE_DIRECTORY`](../plugin/src/constants.ts) (`huawei-op-devtools.createDictory`).

### 4.1 Preconditions

- `normalizeViewIdToProjectType(viewId)` → `cann` | `standard-custom` | `pyasc` | `triton`.
- `isRequestedProjectTypeEnabled`: only **`triton`** can be disabled (`extension.unsupportedProjectTypeDisabled`).
- Reads **`globalState.templateName`** (set in §3.1 step 10 only when web sent `templateName`).

### 4.2 Per view ID

| View ID | Action |
|---------|--------|
| **CANN (1)** | `createOpsByPrototype({ opsPrototypeFile: '', opType: 'cann', templateName, opName })`. Clears `globalState.templateName` if set. Closes active editor. |
| **PYASC (3)** | Same with `opType: 'pyasc'`. `templateName` from global state is usually unset. |
| **TRITON (4)** | Same with `opType: 'triton'`, `templateName: templateName \|\| 'triton_vector_add'`, `opName`. |
| **STANDARD_CUSTOM (2)** | `createOps({})` → prototype JSON path; then `createOpsByPrototype({ opsPrototypeFile: path, opType: 'ascend', opName })` **without** `templateName`. |

On success: progress 100%, `webview.opFileCreated`. On failure: error toast and rethrow.

Each path → `ProjectService.createOpsByPrototype` ([`plugin/src/service/project-service.ts`](../plugin/src/service/project-service.ts)) → **`OpGeneratorFactory.getGenerator`** ([`plugin/src/domain/services/op-generator-factory.ts`](../plugin/src/domain/services/op-generator-factory.ts)) → `OperatorPluginRegistry.getProjectGenerator`.

After successful prototype generation: `ConfigService.ensureOpDevtoolsSettingsSeeded()` — a per-key create-if-missing seed of `op-devtools.*` built from the plugin's `getInitialConfigScripts` + `getDefaultPaths`; keys already present in `settings.json` are dropped, the rest are written (no one-key-skips-all gate).

---

## 5. Core generation: `createOpsByPrototype` and generators

### 5.1 Orchestration

[`ProjectService.createOpsByPrototype`](../plugin/src/service/project-service.ts):

1. Resolve `opName` (`params.opName` trimmed, else current project basename) and `opPath` (explicit `params.opPath`, else `<projectPath>/<opName>` for a sub-operator, else the project path itself).
2. Build generator params (`op_type`, `ops_prototype_file`, `op_name`, `template_name`, `op_path`) and call **`OpGeneratorFactory.getGenerator`** → [`OperatorPluginRegistry.getProjectGenerator`](../plugin/src/domain/plugins/operator-plugin.registry.ts).
3. **`generator.parseMeta()`** — resolves `op_name` and `template_name` fallbacks (required before generation, the Cann generator renames template files on it).
4. Unless `skipFileGeneration` (caller already scaffolded via `build.sh --genop`): **`generator.executeGeneration()`** (unzip + rename + replace).
5. `ensureLaunchJsonExists(op_path)` (`.vscode` / `.arts` bootstrap).
6. `ConfigService.ensureOpDevtoolsSettingsSeeded(projectPath, …, opType, opPath, templateName)` — per-key create-if-missing seed of `op-devtools.*` from `OperatorPluginRegistry.getOpPlugin(op_type).getInitialConfigScripts` / `getDefaultPaths`.

New Project always generates the structure (`skipFileGeneration` unset).

### 5.2 Generator selection and ZIP paths

| `op_type` | Class | Runtime ZIP (`extensionPath`) |
|-----------|--------|----------------------------------|
| `ascend` | `AscendOpGenerator` | `out/templates/code_template/ascend_template/add_custom.zip` (fixed). |
| `cann` | `CannOpGenerator` | `out/templates/code_template/cann_template/${template_name}.zip`. |
| `pyasc` | `PyAscOpGenerator` | `out/templates/code_template/cann_template/pyasc_template.zip` (fixed). |
| `triton` | `TritonOpGenerator` | `out/templates/code_template/triton_template/${template_name}.zip` (default `triton_vector_add`). |

Sources live under [`plugin/templates/code_template/`](../plugin/templates/code_template/). [`scripts/build-extension.ts`](../scripts/build-extension.ts) copies templates to `out/templates/` and packs each directory to `*.zip` for runtime.

[`TritonPlugin.createProjectGenerator`](../plugin/src/domain/plugins/triton.plugin.ts) defaults `params.template_name` to `triton_vector_add` before constructing `TritonOpGenerator`.

### 5.3 `parseMeta()` — `op_name` and `template_name`

| Generator | `op_name` | `template_name` |
|-----------|-----------|-----------------|
| **CannOpGenerator** | `params.op_name` \|\| `project.project_name` \|\| basename(`project_path`) | `params.template_name` \|\| `'hello_world'` |
| **PyAscOpGenerator** | Same as CANN | **Always** `'pyasc_template'` (ignores web `templateName`). |
| **TritonOpGenerator** | Same as CANN | `params.template_name` \|\| `'triton_vector_add'` |
| **AscendOpGenerator** | Trimmed `params.op_name` if set; else if no prototype file → `project_name` / basename; else JSON prototype `op` field | `params.template_name` \|\| `'add_custom'` |

### 5.4 `executeGeneration()` — unzip

- **AdmZip** extracts into `op_path` (absolute operator project directory).
- **`skipExisting`**: per-entry skip if target exists (folder menu init; not default New Project).

### 5.5 Post-extract: rename and content substitution

[`BaseOpGenerator`](../plugin/src/domain/services/op-generator-factory.ts): `_renameFiles`, `_replaceContent`, `_replaceMsttPlaceholders`.

```text
if (template_name && op_name) {
  _renameFiles(template_name);
  _replaceContent(template_name);
}
if (op_name) {
  _replaceMsttPlaceholders();
}
```

#### `_renameFiles(templateName)`

Rename files whose basename contains `templateName` (regex global replace → `op_name`). Honors `skipExisting` for destination conflicts.

#### `_replaceContent(templateName)`

Keys: `TEMPLATE_UPPER`, PascalCase of segments, `template_snake` → corresponding forms of `op_name`. Substring replace in text files; with `skipExisting`, only files whose name or content matches a key.

#### `_replaceMsttPlaceholders()`

| Token | Value |
|-------|--------|
| `__MSTT_OP_NAME_PASCAL__` | PascalCase from `op_name` |
| `__MSTT_OP_NAME_UPPER__` | upper snake |
| `__MSTT_OP_NAME__` | `op_name` |
| `__MSTT_SUPPORT_COMPUTE_UNIT__` | ACLNN compute unit from `resolveAclnnCmakeDefaultsForGeneration()` (**Ascend / STANDARD_CUSTOM** only) |
| `__MSTT_SUPPORT_TILING_DIR__` | ACLNN tiling dir paired with compute unit (**Ascend / STANDARD_CUSTOM** only) |

Used in **PYASC** / **TRITON** Python templates where symbols must track `op_name` but do not embed the template id. **Ascend** `add_custom` also uses `__MSTT_SUPPORT_*__` in `CMakeLists.txt` (patched by `AscendPlugin.patchGeneratedProject()` → `patchAclnnCmakeSupportVars()` in `ascend-util.ts`, invoked from the generator's `executeGeneration` after unzip). CANN/Ascend `.asc` trees typically rely on template-id replacement only.

#### Design summary

| Situation | Mechanism |
|-----------|-----------|
| Paths/symbols contain `template_name` | `_renameFiles` + `_replaceContent` |
| Must track `op_name` without template id in text | `__MSTT_*` + `_replaceMsttPlaceholders` |
| Fixed toolchain/API strings | No automatic rewrite |

---

## 6. End-to-end flows (New Project)

### 6.1 CANN

```mermaid
sequenceDiagram
  participant Web as NewProjectWebview
  participant WC as createdProject
  participant PM as projectService.init
  participant CMD as createDictory
  participant WH as handleOperatorProjectDirectoryFile
  participant GS as createOpsByPrototype

  Web->>WC: createdProject(CANN, templateName?)
  WC->>WC: mkdirSync recursive, optional projectSH
  WC->>PM: init(cann, templateName, ...)
  WC->>WC: globalState.templateName if set
  WC->>CMD: createDictory(CANN)
  CMD->>WH: handleOperatorProjectDirectoryFile
  WH->>GS: createOpsByPrototype(cann, templateName, opName)
  GS->>GS: CannOpGenerator unzip + §5.5
```

- Default ZIP template: **`hello_world`** if `templateName` omitted.
- `torch_library_template` seeds the sanitizer Python target (`cache.sanitizerPythonTarget`, keyed by operator name) to `python ../run.py` in `createdProject` (§3.1 step 8), so build/run/sanitizer defaults resolve without an active-file sync.

### 6.2 PYASC

- Same orchestration; **`op_type`: `pyasc`**.
- ZIP: **`pyasc_template.zip`**; substitution id **`pyasc_template`**.

### 6.3 TRITON

- **`op_type`: `triton`**; requires **`op-devtools.operatorSupport.triton`**.
- ZIP: **`triton_template/triton_vector_add.zip`** (default if global state empty).

### 6.4 STANDARD_CUSTOM (view ID 2)

- **`project_type` stored:** `ascend`.
- A detected workspace that is not yet in `.vscode/cache.json` (`folders[rootKey]`) is registered idempotently by `WorkspaceDetectorService.detectAndRegisterWorkspace` before its operator lists are scanned or a child operator is created. Existing root identity and metadata are reused.
- **`createOps`** writes prototype JSON; **`createOpsByPrototype`** with **`op_type: 'ascend'`**, no `templateName`.
- In-place child generation receives the registered collection root path (`subOperatorContext.parentProjectPath`) and never creates a standalone child record.
- ZIP: **`add_custom.zip`** via `AscendOpGenerator`.

---

## 7. Template inventory (source tree)

Under [`plugin/templates/code_template/`](../plugin/templates/code_template/):

| Directory / archive | Used by |
|---------------------|---------|
| `cann_template/hello_world` | CANN default |
| `cann_template/addn_custom` | CANN addn |
| `cann_template/torch_library_template` | CANN torch library |
| `cann_template/pyasc_template` | PYASC |
| `triton_template/triton_vector_add` | TRITON |
| `ascend_template/add_custom` | Ascend / STANDARD_CUSTOM |

---

## 8. Persistence summary

| Step | Storage |
|------|---------|
| `init` (`projectService.init`) | Workspace settings `op-devtools.projectType` + `op-devtools.environment.environmentScript` (`ascend_env_script`); `ProjectManager` path-keyed context. |
| Detected STANDARD_CUSTOM workspace registration | One normalized root record in `.vscode/cache.json` (`folders[rootKey]`, `project_type: ascend`); repeated and concurrent registration reuses it. |
| STANDARD_CUSTOM child creation | Root `opsList` / `experimentalOpsList` scan state in cache (`folders[rootKey]`, keyed by normalized child path, `isCompiled: false`); no standalone child project record. |
| PYASC / TRITON / torch-library creation | `cache.sanitizerPythonTarget[opName]` — `python3 ./<projectName>.py` / `python ../run.py`. |
| `createOpsByPrototype` | Operator identity is resolved at runtime from the cache scan state (`resolveOpRecord`); no separate `ops` row is written. |
| Same | **`ensureOpDevtoolsSettingsSeeded`** → dotted `op-devtools.*` (build_op / build_example / ut_test / sanitizer / simulate / on_board scripts from plugin `getInitialConfigScripts` + `getDefaultPaths`) in workspace `settings.json`, per-key create-if-missing ([`workspace-settings.md`](./workspace-settings.md)). |

Runtime command fields are read from workspace settings; scan state, `sanitizerPythonTarget`, and `selectedOperatorPaths` remain in `.vscode/cache.json`.

**Regression (optional):** `node scripts/verify-template-entrypoints.cjs` — PYASC/TRITON `__MSTT_*` placeholder resolution.

---

## 9. Errors and edge cases

| Failure | Behavior |
|---------|----------|
| mkdir failure | Thrown; `welcome.createProjectDirFailed`. |
| `init` failure | Thrown; `welcome.initOperatorProjectFailed`. |
| Detected STANDARD_CUSTOM root still missing after registration recovery | Thrown before scaffolding receives a parent ID; `welcome.initOperatorProjectFailed`. |
| Disabled Triton | Error in handler before generation. |
| `createDictory` / scaffold failure | Warning; folder kept; user may still open folder. |
| `createOps` empty path (STANDARD_CUSTOM) | `webview.createPrototypeFailedEmptyPath`. |

---

## 10. File reference index

| Concern | Primary file(s) |
|---------|------------------|
| Web payload + templates | [`use-new-project.ts`](../web/src/views/panels/new-project/composables/use-new-project.ts), [`new-project.vue`](../web/src/views/panels/new-project/components/new-project.vue) |
| `createdProject` | [`welcome-controller.ts`](../plugin/src/controller/welcome-controller.ts) |
| `createDictory` / scaffold | [`webview-message-list.ts`](../plugin/src/class/webview-message-list.ts) |
| Init + prototype | [`project-service.ts`](../plugin/src/service/project-service.ts), [`project-manager.ts`](../plugin/src/core/project/project-manager.ts) |
| Generator orchestration | [`project-service.ts`](../plugin/src/service/project-service.ts) `createOpsByPrototype` |
| Generators | [`op-generator-factory.ts`](../plugin/src/domain/services/op-generator-factory.ts) |
| Plugins | [`domain/plugins/*.plugin.ts`](../plugin/src/domain/plugins/) |
| View ID → stored `project_type` | [`project-utils.ts`](../plugin/src/domain/utils/project-utils.ts) `viewIdToProjectType` |
| Triton feature toggle | [`feature-toggle.ts`](../plugin/src/helpers/feature-toggle.ts), [`common-controller.ts`](../plugin/src/controller/common-controller.ts) |
| Source templates | [`plugin/templates/code_template/`](../plugin/templates/code_template/) |

---

*Reflects `plugin/src` and `web/src/views/panels/new-project` as of 2026-06.*
