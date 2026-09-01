# Plugin Generated Files Specification (`plugin/src`)

## Scope

This specification lists files and directories created, updated, or deleted by the plugin, and explains:

- purpose,
- lifecycle conditions (create/update/delete),
- how each artifact is consumed by plugin behavior.

The scope covers runtime behavior in `plugin/src`, including workspace-local artifacts and environment/tooling paths.

## Storage zones

- **Operator workspace**: files created in the opened operator project (inside the IDE config directory — `.vscode` in VS Code, `.arts` in CodeArts — unless stated otherwise).
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
  - project discovery scans that look for initialized operator subprojects,
  - project recognition in `getProjectByPath` (one of the operator-project markers).

## `.vscode/cache.json`

- **Purpose**: per-workspace runtime state — selected/compiled operator paths, per-folder scan state, file-map lists, and the per-operator sanitizer Python target.
- **Created when**: first `updateWorkspaceCache` write (project open / registration / scan).
- **Updated when**: folder scans, file-map lists, sanitizer Python target, selected/compiled operator state.
- **Corruption handling**: a corrupt or unparseable `cache.json` is renamed to `cache.json.bak` on read and the next writer starts from a fresh object. Reads never create the file; a writer always does (a missing cache is created, never skipped).
- **Used by**:
  - the per-section DAO factories — `getSimulateConfig(projectPath)` / `getOnBoardConfig(projectPath)` / `getSanitizerConfig(projectPath, op)` (DB-only fields: `fileMapLists[configType]` → `fileMapList`, `sanitizerPythonTarget[op]` → `target_file`),
  - `getProjectByPath` / `WorkspaceDetectorService` (standard-custom scan state under `folders[rootKey]`),
  - `resolveOpRecord` (synthesized operator records; an attached `opType` selects the command strategy — `'cann'` for standard-custom collection sub-operators, `'ascend'` for plugin-created ones; a scanned entry without one falls back to `'cann'` for standard-custom collections).
- **Schema** (`plugin/src/helpers/workspace-cache.ts`, `CACHE_SCHEMA_VERSION = 1`):

```json
{
  "schemaVersion": 1,
  "project": { "selectedOperatorPaths": [], "compiledOpPaths": {} },
  "folders": {
    "<normalized-root-path>": {
      "opsMeet": [], "opsList": [], "experimentalOpsList": []
    }
  },
  "fileMapLists": { "sanitizer": [], "simulate": [], "on_board": [] },
  "sanitizerPythonTarget": {}
}
```

`isCompiled` is sticky (merges preserve it across scans); `opType` is attached when the operator's type is known.

## `.vscode/settings.json` (`op-devtools.*`)

- **Purpose**: canonical runtime config — compile/deploy scripts, options, project type, env script ([`workspace-settings.md`](./workspace-settings.md)).
- **Created when**: `ensureOpDevtoolsSettingsSeeded` / first settings write.
- **Updated when**: user edits in Settings UI, option panels (`writeOpDevtoolsDottedSettings`), project type detection.
- **Deleted when**: not deleted by normal plugin flows.
- **Used by**: the per-section DAO factories (each reads its own dotted keys directly); `getProjectByPath` project recognition via the internal `op-devtools.projectType` key (not declared in `package.json`).
- **Write semantics**: JSONC-tolerant read (BOM, comments, trailing commas); an unparseable file is never overwritten; atomic temp+rename; per-path serialized queue; content-diff guard (byte-identical write is a no-op); a nested `"op-devtools": { … }` object is flattened to dotted keys on write.

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
- **IDE config directory**: the file lives in the active IDE config directory — `.vscode` in VS Code, `.arts` in CodeArts (`getIdeConfigDirName()`); only one is created, there is no mirrored copy.

## `<ideConfig>/.env`

- **Purpose**: snapshot of environment variables used as fallback for runtime environment reads.
- **Created when**:
  - `exportEnvToFile` executes `env > ./<ideConfig>/.env` during launch/config initialization,
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

## `<workspaceRoot>/<ideConfig>/mindstudio_sanitizer_log/*.log`

(`<ideConfig>` is `.vscode` or `.arts` — see `getIdeConfigDirName()`; the directory lives under the **workspace root** — every strategy (cann / ascend / triton) writes `--log-file` there, and the reader scans only that directory.)

- **Purpose**: sanitizer report logs.
- **Created when**: sanitizer command runs with generated `--log-file` path.
- **Updated when**: each sanitizer execution generates a new log file.
- **Deleted when**: no plugin auto-delete in normal flows.
- **Used by**:
  - run data list collection (`RunDataService.getSanitizerRunData`),
  - native results tree `opdevtoolsSanitizerResultsTree` and Problems diagnostics (`SanitizerDiagnosticsService`).

---

## B) Environment-specific installer/generated artifacts

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

## C) User-triggered export/download temporary artifacts

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

## `.vscode/launch.json` (or `.arts/launch.json` in CodeArts)

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

- **Current writer behavior**: copies bundled `debug-launch.json` content, then injects `host` / `remoteWorkspaceFolder` into the `remote-debug` configuration.

## `<ideConfig>/.env`

- **Format**: dotenv-like plain text generated from `env`.
- **Schema**: one variable per line.

```text
KEY=value
ANOTHER_KEY=value
...
```

## `<workspaceRoot>/<ideConfig>/mindstudio_sanitizer_log/*.log`

- **Filename schema**:

```text
mssanitizer_<timestamp>.log
```

- **Content schema**: tool-native mssanitizer output (unstructured text log).

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

- `plugin/src/domain/utils/project-utils.ts` — `ensureLaunchJsonExists` (devtool_config.json, launch.json, `.env`, `build/`)
- `plugin/src/domain/models/project-model.ts` — `getProjectByPath` project recognition
- `plugin/src/domain/models/op-record.ts` — `resolveOpRecord` (cache scan state → operator records)
- `plugin/src/service/build-service.ts`
- `plugin/src/service/sanitizer-service.ts`
- `plugin/src/service/run-data-service.ts`
- `plugin/src/service/folder-context-menu-service.ts`
- `plugin/src/service/file-service.ts`
- `plugin/src/service/config-service.ts` — settings writes, runtime merge, per-section DAO factories
- `plugin/src/helpers/workspace-cache.ts` — `.vscode/cache.json` read/update (`.bak` rename on corruption)
- `plugin/src/helpers/ide-config-dir.ts` — `.vscode` vs `.arts` resolution
- `plugin/src/helpers/ide-settings-persist.ts` — guarded `settings.json` writes
- `plugin/src/class/environment-variable-reader.ts` — `<ideConfig>/.env` fallback reads
- `plugin/src/class/mind-studio-plugin-installer.ts`
