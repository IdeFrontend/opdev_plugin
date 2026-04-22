# Plugin Generated Files Specification (`plugin/src`)

## Scope

This specification lists files and directories created, updated, or deleted by the plugin, and explains:

- purpose,
- lifecycle conditions (create/update/delete),
- how each artifact is consumed by plugin behavior.

The scope covers runtime behavior in `plugin/src`, including workspace-local artifacts and user-level storage.

## Storage zones

- **Operator workspace**: files created in the opened operator project.
- **User data storage**: JSON stores under `config.user_data_dir`.
- **Remote config storage**: dedicated config file under VS Code server home path.
- **Environment/tooling paths**: files created for plugin installation or export/download flows.

---

## A) Workspace artifacts (inside operator project)

## `.vscode/devtool_config.json`

- **Purpose**: marker/config file signaling operator-tooling initialization in a project.
- **Created when**: `ensureLaunchJsonExists(op_path, ...)` runs and file does not exist.
- **Updated when**: not actively updated by plugin logic after creation (unless externally modified).
- **Deleted when**: not deleted by normal plugin flows.
- **Used by**:
  - startup checks to toggle UI behavior (`hasDevtoolConfig` context),
  - project discovery scans that look for initialized operator subprojects.

## `.vscode/launch.json`

- **Purpose**: debug launch configurations (e.g., CPU/NPU debug).
- **Created when**:
  - `ensureLaunchJsonExists` runs,
  - `.vscode/devtool_config.json` does **not** already exist,
  - and `launch.json` is missing.
- **Updated when**: usually manual/debug-config user edits; plugin does not continuously rewrite it.
- **Deleted when**: not deleted by normal plugin flows.
- **Used by**:
  - `taskMethods.runDebug()` / `runCpuDebug()` via named debug profiles,
  - `debugConfig` commands opening launch configuration.

## `.arts/launch.json`

- **Purpose**: mirrored launch config for `.arts` toolchain context.
- **Created when**:
  - `ensureLaunchJsonExists` runs,
  - `.vscode/devtool_config.json` does **not** already exist,
  - and `.vscode/launch.json` is being created in the same run.
- **Updated when**: created from bundled debug template at initialization; not continuously rewritten.
- **Deleted when**: not deleted by normal plugin flows.
- **Used by**: tooling compatibility paths expecting `.arts`-side launch config.

## `.arts/.env`

- **Purpose**: snapshot of environment variables used as fallback for runtime environment reads.
- **Created when**:
  - `exportEnvToFile` executes `env > ./.arts/.env` during launch/config initialization,
  - and only on the branch where `.vscode/devtool_config.json` was absent (because existing `devtool_config.json` causes early return from `ensureLaunchJsonExists`).
- **Updated when**: re-initialization path reruns export command.
- **Deleted when**: not deleted by normal plugin flows.
- **Used by**:
  - `EnvironmentVariableReader` fallback when `process.env` does not provide required values,
  - insight/performance helpers that need environment context.

## `build/` directory (project root)

- **Purpose**: build output/work directory initialized early.
- **Created when**:
  - `exportEnvToFile` runs `mkdir build`,
  - and only on the branch where `.vscode/devtool_config.json` was absent (same early-return condition as above).
- **Updated when**: build commands produce/modify artifacts inside.
- **Deleted when**: not deleted by plugin runtime logic.
- **Used by**:
  - compile/run pipelines and strategy-generated commands that enter build dirs.

## `.vscode/mindstudio_sanitizer_log/*.log`

- **Purpose**: sanitizer report logs.
- **Created when**: sanitizer command runs with generated `--log-file` path.
- **Updated when**: each sanitizer execution generates a new log file.
- **Deleted when**: no plugin auto-delete in normal flows.
- **Used by**:
  - run data list collection (`RunDataService.getSanitizerRunData`),
  - sanitizer panel/report visualization.

---

## B) User data artifacts (`config.user_data_dir/data`)

## `projects.json`

- **Purpose**: registry of known projects and project-level metadata.
- **Created when**:
  - first access through `JsonStorage.read` default initialization,
  - first `createProject(...)`.
- **Updated when**:
  - project init/open/create flows write project records,
  - standard-custom scans refresh `ops_meet`, `ops_list`, `experimental_ops_list`,
  - build success marks operator `isCompiled` state.
- **Deleted when**:
  - only by test helper `_resetProjectsForTest()` (`storage.delete()`).
- **Used by**:
  - path-to-project resolution,
  - operator list rendering and context-menu action routing,
  - keeping compile state across scans and sessions.

## `ops.json`

- **Purpose**: operator records per project (`op_type`, path, template, timestamps).
- **Created when**:
  - first access through model store initialization,
  - operator structure generation ensures record exists.
- **Updated when**:
  - `generateStructure(...)` upserts operator records.
- **Deleted when**:
  - only by test helper `_resetOpsForTest()`.
- **Used by**:
  - command path resolution (`getDefaultPath`, run/debug/strategy lookup),
  - default config generation binding to operator identity.

## `configs.json`

- **Purpose**: persisted action configurations (`build_op`, `build_example`, `sanitizer`, `on_board`, `simulate`, etc.).
- **Created when**:
  - first config read/write via `JsonStorage`,
  - default config generation in `generateStructure`.
- **Updated when**:
  - user/config UI changes (`postConfig`),
  - pyasc run/debug/profile flows rewrite `build_op.target_file`,
  - add-report actions append/update `fileMapList`.
- **Deleted when**:
  - only by test helper `_resetConfigsForTest()`.
- **Used by**:
  - all command builders and action execution paths,
  - run data collection and report visualization.

## `*.json.bak` backup files (e.g., `projects.json.bak`)

- **Purpose**: recovery backup when JSON parse/read fails.
- **Created when**: `JsonStorage.read` catches read/parse error on existing store.
- **Updated when**: recreated on subsequent corruption events.
- **Deleted when**: not auto-deleted by normal runtime.
- **Used by**: manual troubleshooting/recovery; plugin does not actively read backups.
- **Current scope**:
  - applies to stores using `JsonStorage` (e.g., `projects.json`, `configs.json`),
  - does **not** apply to `ops.json`, which is managed by direct read/parse/write fallback in `model.ts` and resets to default without writing `.bak`.

---

## C) Remote config artifact

## `~/.vscode-server/data/ms-op-suite/config.json`

- **Purpose**: remote-side lightweight config (e.g., `lastProjectPath`).
- **Created when**: first write through `RemoteConfig.writeConfig(...)`.
- **Updated when**:
  - set/clear last project path,
  - set/delete arbitrary keys via remote config API.
- **Deleted when**:
  - not removed as file in normal flow; `clear()` writes `{}`.
- **Used by**:
  - restoring remembered project path and remote preferences.

---

## D) Environment-specific installer/generated artifacts

These are generated by plugin installer flows and may exist outside the operator workspace.

## Code-server / CodeArts extension installation files

- **Paths**:
  - `~/.codearts-server/extensions/<pluginId>-<version>/...` (preferred),
  - fallback `~/.local/share/code-server/extensions/<pluginId>-<version>/...`,
  - `extensions.json` in same extensions directory.
- **Purpose**: unpack and register bundled debug extension VSIX.
- **Created when**:
  - plugin not active and environment detected as code-server/CodeArts.
- **Updated when**:
  - `extensions.json` appended with extension metadata entry.
- **Deleted when**:
  - temp unzip directory is deleted immediately after extraction;
  - installed extension directories are not removed by normal plugin flow.
- **Used by**:
  - enabling debug extension availability in server-based IDE environments.

## Temporary unzip directory (`temp-unzip-<timestamp>`)

- **Purpose**: transient VSIX extraction workspace.
- **Created when**: code-server/CodeArts install routine unpacks VSIX.
- **Updated when**: during extraction/copy.
- **Deleted when**: explicitly removed via `fs.rmSync(..., { recursive: true, force: true })`.
- **Used by**: intermediate step only; never used after installation copy.

## `.devcontainer/devcontainer.json` (web Codespaces flow)

- **Purpose**: add required debug extension in devcontainer configuration.
- **Created when**: web IDE detected as Codespaces and file does not already reference plugin ID.
- **Updated when**: file can be rewritten by generation flow when needed.
- **Deleted when**: not deleted by plugin.
- **Used by**: environment bootstrap so extension is installed in devcontainer sessions.

## `.gitpod.yml` (web Gitpod flow)

- **Purpose**: declare required VS Code extension for Gitpod.
- **Created when**: web IDE detected as Gitpod and file does not already contain plugin ID.
- **Updated when**: generation flow writes plugin extension entry.
- **Deleted when**: not deleted by plugin.
- **Used by**: Gitpod workspace extension auto-install behavior.

---

## E) User-triggered export/download temporary artifacts

## `<directory>.zip` temporary archive (desktop save flow)

- **Purpose**: transient archive when exporting a directory via file service.
- **Created when**: `FileService.saveFileToLocalDesktop` compresses selected directory.
- **Updated when**: generated once per export operation.
- **Deleted when**: deleted after copying to user-selected save path.
- **Used by**: local download/export UX only.

## User-selected downloaded output file(s)

- **Purpose**: explicit user export target (performance/file download).
- **Created when**: user confirms save location in download/save dialogs.
- **Updated when**: overwritten if user allows and destination exists.
- **Deleted when**: plugin does not auto-delete.
- **Used by**: outside plugin runtime; user-consumed output.

---

## File schemas

## `.vscode/devtool_config.json`

- **Format**: JSON object.
- **Schema**:

```json
{
  "type": "string"
}
```

- **Current writer behavior**: writes `{ "type": create_by || "1" }`.

## `.vscode/launch.json` and `.arts/launch.json`

- **Format**: JSON object (VS Code launch schema).
- **Schema** (plugin-level expectation):

```json
{
  "version": "string",
  "configurations": [
    {
      "name": "string",
      "type": "string",
      "request": "launch|attach",
      "...": "other debugger-specific fields"
    }
  ]
}
```

- **Current writer behavior**: copies bundled `debug-launch.json` content.

## `.arts/.env`

- **Format**: dotenv-like plain text generated from `env`.
- **Schema**: one variable per line.

```text
KEY=value
ANOTHER_KEY=value
...
```

## `.vscode/mindstudio_sanitizer_log/*.log`

- **Filename schema**:

```text
mssanitizer_<timestamp>.log
```

- **Content schema**: tool-native mssanitizer output (unstructured text log).

## `projects.json`

- **Format**: JSON object.
- **Top-level schema**:

```json
{
  "lastId": "number",
  "projects": [
    {
      "id": "number",
      "project_name": "string",
      "project_path": "string",
      "template_name": "string|null",
      "project_type": "string|null",
      "ascend_env_script": "string|null",
      "create_by": "string|null",
      "create_time": "ISO datetime string",
      "update_by": "string|null",
      "update_time": "ISO datetime string",
      "sub_project_ids": "number[]|null",
      "is_experimental": "boolean|null",
      "ops_meet": [
        { "name": "string", "path": "string" }
      ],
      "ops_list": [
        { "name": "string", "path": "string", "isCompiled": "boolean|undefined" }
      ],
      "experimental_ops_list": [
        { "name": "string", "path": "string", "isCompiled": "boolean|undefined" }
      ],
      "selected_operator_ids": "number[]|null"
    }
  ]
}
```

## `ops.json`

- **Format**: JSON object.
- **Top-level schema**:

```json
{
  "lastId": "number",
  "ops": [
    {
      "id": "number",
      "task_id": "number|null",
      "project_id": "number",
      "op_class": "string|null",
      "op_name": "string",
      "op_type": "string",
      "op_path": "string",
      "ascend_env_script": "string|null",
      "examples": "string|null",
      "create_by": "string|null",
      "create_time": "ISO datetime string",
      "update_by": "string|null",
      "update_time": "ISO datetime string",
      "template_name": "string|null"
    }
  ]
}
```

## `configs.json`

- **Format**: JSON object.
- **Top-level schema**:

```json
{
  "lastId": "number",
  "configs": [
    {
      "id": "number",
      "config_name": "string",
      "config_type": "string",
      "script": "string",
      "target_dir": "string|null",
      "target_file": "string|null",
      "custom_options": "string|null",
      "user_options": "object|null",
      "project_id": "number",
      "op": "string|null",
      "create_by": "string|null",
      "create_time": "ISO datetime string",
      "update_by": "string|null",
      "update_time": "ISO datetime string"
    }
  ]
}
```

- **`user_options` schema**: depends on `config_type`:
  - `build_op`: includes `op`, `script`, `config_name`, `target_dir`, `target_file`, debug script fields.
  - `build_example`: includes `op`, `script`, `config_name`, `target_dir`, `target_file`, `execution_mode`.
  - `sanitizer`: includes `tool`, `memcheckOption`, `logLevel`, `maxDebuglogSize`, `blockId`, `fileMapList`, etc.
  - `on_board` / `simulate`: includes profiler flags, `dataStoragePath`, `advance_param`, `fileMapList`, etc.

## `*.json.bak`

- **Format**: byte-for-byte backup copy of the original JSON file at time of read/parse failure for stores backed by `JsonStorage`.
- **Schema**: same intended schema as source file, but may be malformed (backup of corrupted content).

## `~/.vscode-server/data/ms-op-suite/config.json`

- **Format**: JSON object with extensible keys.
- **Schema**:

```json
{
  "lastProjectPath": "string (optional)",
  "...customKeys": "unknown"
}
```

## `extensions.json` (Code-server/CodeArts extensions dir)

- **Format**: JSON array.
- **Schema**:

```json
[
  {
    "identifier": { "id": "string" },
    "version": "string",
    "location": {
      "$mid": 1,
      "fsPath": "string",
      "external": "file:// URL string",
      "path": "string",
      "scheme": "file"
    },
    "relativeLocation": "string",
    "metadata": {
      "installedTimestamp": "number",
      "pinned": "boolean",
      "source": "vsix"
    }
  }
]
```

## `~/.codearts-server/extensions/<pluginId>-<version>/...` and fallback code-server extension dir

- **Format**: extracted VSIX extension directory tree.
- **Schema**: VS Code extension package layout (e.g., `package.json`, extension runtime files, assets).

## `.devcontainer/devcontainer.json`

- **Format**: JSON object.
- **Schema** (generated shape):

```json
{
  "name": "MindStudio Dev",
  "image": "mcr.microsoft.com/devcontainers/base:ubuntu",
  "customizations": {
    "vscode": {
      "extensions": ["ascend.mindstudio-debug-vscode-plugin"]
    }
  }
}
```

## `.gitpod.yml`

- **Format**: YAML document.
- **Schema** (generated shape):

```yaml
image: gitpod/workspace-full
vscode:
  extensions:
    - ascend.mindstudio-debug-vscode-plugin
```

## `<directory>.zip` temporary archive

- **Format**: ZIP file.
- **Schema**: standard ZIP central-directory format containing recursive snapshot of selected directory.

## User-selected downloaded output file(s)

- **Format/schema**: mirrors the source being exported (file copy or generated zip), so schema is source-dependent.

---

## Lifecycle and usage notes

- Most generated state is **append/update-in-place** rather than delete/recreate.
- Normal runtime does **not** clean historical JSON/log artifacts automatically.
- Explicit deletions are mainly:
  - test reset helpers (`_reset*ForTest`),
  - temp install/export intermediates.
- Many generated files are intentionally idempotent: creation is skipped if already present.

## Source index

- `plugin/src/domain/utils/project-utils.ts`
- `plugin/src/domain/models/project-model.ts`
- `plugin/src/domain/models/model.ts`
- `plugin/src/domain/models/config-model.ts`
- `plugin/src/core/storage/json-storage.ts`
- `plugin/src/service/build-service.ts`
- `plugin/src/service/sanitizer-service.ts`
- `plugin/src/service/run-data-service.ts`
- `plugin/src/service/folder-context-menu-service.ts`
- `plugin/src/service/file-service.ts`
- `plugin/src/helpers/remote-config.ts`
- `plugin/src/class/mind-studio-plugin-installer.ts`

