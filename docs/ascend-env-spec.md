# Ascend / CANN environment resolution — canonical spec

Status: implemented in `plugin/src/domain/utils/ascend-util.ts` and
`plugin/src/domain/utils/global-env-snapshot.ts`. Consumers route through the
single `resolveAscendEnv()` entry-point so this contract holds across
templates, generated scripts, and per-spawn environment.

> If something disagrees with this document, the document is the contract —
> file a bug against the implementation, not the doc.

---

## 1. Variables the plugin owns

| Name | Meaning | Where it lands |
|------|---------|----------------|
| `SOC_VERSION` | CANN SOC slug (e.g. `ascend910b`, `ascend950`) | Spawn env + `--soc=` CLI on ascend `build.sh` via `{soc_version}` placeholder |
| `SIMULATOR_TYPE` | Simulator directory under `$ASCEND_HOME_PATH/tools/simulator/<dir>/lib` (e.g. `Ascend910B3`, `Ascend950PR_9589`) | Spawn env (sim runs only) + `--simulator <dir>` CLI on cann `build.sh` via `{simulator_type}` placeholder |
| `NPU_ARCH` | AscendC `--npu-arch` (e.g. `dav-2201`, `dav-3510`) | Spawn env; read by templates' cmake via `$ENV{NPU_ARCH}` → cache |
| `SUPPORT_COMPUTE_UNIT` | ACLNN compute unit string for standard-custom ascend operators | Spawn env on every operator command; read by `ascend_template/add_custom/CMakeLists.txt` via `$ENV{...}` → cache. Mapped by `getSupportComputeUnitForCannSoc()` in `ascend-util.ts` (constants in `shared/cann-aclnn-build-defaults.ts`) |
| `SUPPORT_TILING_DIR` | Tiling subdirectory under `op_host` for `SUPPORT_COMPUTE_UNIT` | Same as above via `getSupportTilingDirForCannSoc()` |

The plugin treats these as the **only** environment names it owns. Any other
variable a project's env script defines passes through untouched.

## 2. Global env snapshot (read once at activation)

`plugin/src/domain/utils/global-env-snapshot.ts` reads
`process.env.{SOC_VERSION, SIMULATOR_TYPE, NPU_ARCH, ASCEND_ENV_SCRIPT}` at
module load and freezes the result. The plugin **never** writes back to
`process.env` for any of these names; detection results and resolution outputs
travel only through the resolver and the per-spawn `options.env`.

This means the spec's "global env" channel cannot be polluted by:

- `refreshAscendEnv()`-style merges of an env script into the host (removed —
  the plugin no longer sources `ASCEND_ENV_SCRIPT` at activation);
- per-command host-side `ensure*` writes (also removed);
- a previous operator command's spawn env (spawn env only affects the
  child shell, not the extension host).

## 3. Resolution rules (`resolveAscendEnv`)

`resolveAscendEnv({ isSimulator })` returns:

```ts
{
  socVersion:    string,                                  // never empty
  npuArch:       string,                                  // derived from socVersion
  simulatorType: string | undefined,                      // only when isSimulator
  source: {
    socVersion:    'workspace-setting' | 'global-env' |
                   'detected' | 'derived-from-simulator' | 'default',
    simulatorType: 'workspace-setting' | 'global-env' |
                   'default-from-soc' | 'n/a',
    npuArch:       'derived-from-soc',
  },
}
```

### 3.1 `simulatorType` (simulator runs only)

1. **Workspace setting** `op-devtools.performanceTuning.simulation.simulatorType`
   (only when explicitly set in user / workspace / workspace-folder scope —
   the `package.json` schema default does **not** count).
2. **Global env snapshot** `SIMULATOR_TYPE`.
3. **Default-from-SOC** via `getDefaultSimulatorTypeForCannSoc(socVersion)`
   after SOC is resolved.

Only the **workspace setting** (rule 1) is "explicit" in the sense the spec
cares about, and it is the only trigger for the SOC-from-simulator override
below.

### 3.2 `socVersion`

- **Simulator run with workspace-explicit simulator type** → SOC is derived
  from the simulator type via `simulatorTypeToCannSoc()`. This guarantees
  `SOC_VERSION` / `NPU_ARCH` cannot disagree with the simulator the user
  picked. If the simulator name has no inverse map entry the resolver logs a
  warning and falls back to the regular chain below.
- **Otherwise**, in order:
  1. Workspace setting `op-devtools.environment.socVersion` (explicit only).
  2. Global env snapshot `SOC_VERSION`.
  3. `asys info -r=status` then `npu-smi info` host detection, cached for the
     extension lifetime. Each tool runs in a one-off bash that sources the first
     usable `set_env.sh` from: explicit `op-devtools.environment.environmentScript`
     → `ASCEND_ENV_SCRIPT` (activation snapshot) → `find / -path "*/cann*/set_env.sh"`.
     Project `ascend_env_script` is not used here (it is synced from workspace settings).
     The extension host `process.env` is not mutated.
  4. `DEFAULT_FALLBACK_CANN_SOC` (empty string in `shared/cann-env-constants.ts`
     when nothing else resolves).

`projects.json` `soc_version` is still written by the env UI / workspace sync
for display and APIs, but the resolver does **not** read it.

### 3.3 `npuArch`

Always `getNpuArchForCannSoc(socVersion)`. There is no second path that maps
the simulator dir to an NPU arch — once SOC is resolved, NPU arch is fixed.
When `socVersion` is empty (autodetection failed and no override), `npuArch`
and ACLNN `SUPPORT_*` spawn values are also empty so builds fail visibly instead
of silently using 910-class defaults. The extension shows a one-time warning
with remediation steps before the build script exits.

## 4. What the plugin passes to operator commands

### 4.1 Spawn environment (`getOperatorSpawnEnv`)

For every operator command (build / build_example / on_board / simulate /
sanitizer / ut_test / dump_tensor / run), the spawn `env` map always contains:

```
SOC_VERSION = <resolved.socVersion>
NPU_ARCH    = <resolved.npuArch>
```

For simulator-class runs (`config_type === 'simulate'`, `scriptField ===
'cpu_debug_script'`, or the script contains `--simulator`), the map also
contains:

```
SIMULATOR_TYPE = <resolved.simulatorType>
```

The plugin does not emit any other Ascend-related variable. The spawn env is
merged over `process.env` by `CommandExecutor.execute`:
`{ ...process.env, ...options.env }`. That means the plugin-resolved values
take precedence in the child shell over anything the user has exported.

### 4.2 Command line

- `replaceOperatorScriptPlaceholders(script)` (or with a precomputed resolution)
  substitutes:
  - `{soc_version}` → `resolveAscendEnv(...).socVersion`
  - `{simulator_type}` → `resolveAscendEnv(...).simulatorType`
  using the same resolver call (with `isSimulator` derived from the script
  itself), so the placeholder substitution cannot diverge from the spawn env
  emitted for the same command.
- The simulator example-build CLI flag (`build-service.ts`) routes through
  the same resolver:
  - `op_type === 'ascend'` → `--simulator <simulatorType> --soc=<socVersion>`
  - other op types → `--simulator <simulatorType>`
- The Ascend env script is sourced **only** as a per-command prefix when
  `project.ascend_env_script` is set:
  `. ${project.ascend_env_script} && <command>`. The plugin does not source
  any other env script anywhere else.

## 5. What the plugin does NOT do

- Does **not** write to `process.env.SOC_VERSION` / `process.env.NPU_ARCH` /
  `process.env.SIMULATOR_TYPE` ever.
- Does **not** source `$ASCEND_ENV_SCRIPT` (or any other env script) at
  activation. The OS-level `ASCEND_ENV_SCRIPT` is recorded in the snapshot
  but never executed by the plugin.
- Does **not** export a mutable `soc_version` / `npu_arch` module binding —
  these are derived per call via `resolveAscendEnv()`.

## 6. Templates

### 6.1 CANN templates (`plugin/templates/code_template/cann_template/*/`)

- `build.sh` accepts `--simulator [SIMULATOR_TYPE]` and falls back to
  `$SIMULATOR_TYPE` env.
- `CMakeLists.txt` uses an env → cache pattern for `SIMULATOR_TYPE`,
  `SOC_VERSION`, `NPU_ARCH`. `NPU_ARCH` is mandatory for simulator and
  non-simulator builds; cmake errors out when it is empty.

### 6.2 Ascend `add_custom` template

`plugin/templates/code_template/ascend_template/add_custom/CMakeLists.txt`
uses the same env → cache pattern for `SUPPORT_COMPUTE_UNIT` and
`SUPPORT_TILING_DIR` as cann templates use for `NPU_ARCH`: both must be set
(explicit `-D`, environment, or extension spawn env) or cmake fails with
`FATAL_ERROR`.

`buildOperatorSpawnEnvFromResolution()` always sets `SUPPORT_COMPUTE_UNIT` and
`SUPPORT_TILING_DIR` from `getSupportComputeUnitForCannSoc(socVersion)` /
`getSupportTilingDirForCannSoc(socVersion)`.

| CANN SOC slug (packaging / `--soc=`) | Spawn `SUPPORT_COMPUTE_UNIT` | Spawn `SUPPORT_TILING_DIR` | Notes |
|--------------------------------------|------------------------------|----------------------------|-------|
| `ascend910b`, `ascend910_93`, `ascend910`, empty fallback | `ascend910_95` | `arch22` | A2/A3 class |
| `ascend950` (Atlas A5) | `ascend950` | `arch35` | A5 class; verify against your CANN ACLNN sample |

## 7. Logging

Two structured logs are enough to debug every reported mismatch:

- On activation:
  ```
  [op-devtools][ascend-env] global env snapshot: SOC_VERSION=… SIMULATOR_TYPE=…
                                                  NPU_ARCH=… ASCEND_ENV_SCRIPT=…
  ```
- **Once per operator command execution** (`executeOperatorCommand` →
  `resolveAscendEnvForOperatorCommand`):
  ```
  [op-devtools/ascend-env] Ascend Environment Resolved: soc=ascend950 (source=derived-from-simulator),
    simulator=Ascend950PR_9589 (source=workspace-setting),
    npu_arch=dav-3510 (source=derived-from-soc)
    [isSimulator=true]
  ```
  Config bootstrap / profiler helpers may still call `resolveAscendEnv` separately.
- On every spawned operator shell command (in the shared **Huawei Op Devtools**
  output channel only):
  ```
  [op-devtools/command] Executing {"command":"…","cwd":"…","env":{"SOC_VERSION":"…","NPU_ARCH":"…"}}
  ```
- Live stdout/stderr from operator tools stream to a **per-run** output channel
  named `Op Dev Tools: <label>` (e.g. `compile`, `run`, `simulate`, `sanitizer`,
  `test`, `debug`). The channel is created when the process starts and disposed
  when it exits. The command line is printed as the first line in that channel.

When the lazy host detection runs, an additional info log records which path
won (`asys` vs `npu-smi`) and the resulting slug.

## 8. Required unit tests (already in tree)

- `plugin/src/__tests__/unit/operator-spawn-env.spec.ts` — full precedence
  matrix for `getOperatorSpawnEnv` and `resolveAscendEnv`, including the
  simulator-driven SOC rule and the workspace → global-env → default chain.
- `plugin/src/__tests__/unit/operator-script-placeholders.spec.ts` —
  `{soc_version}` / `{simulator_type}` substitution, including the case where
  a workspace simulator drives SOC in a simulator script but not in an
  on-board script.
- `plugin/src/__tests__/unit/profiler-simulator-resolution.spec.ts` —
  `SimulatorStrategy` ends up with a matching `--soc-version` argument for
  workspace- and global-env-derived simulator types.

## 9. A5 / Atlas A5

Ascend 950 / Atlas A5 uses slug `ascend950`, NPU arch `dav-3510`, default
simulator `Ascend950PR_9589`, and a distinct on-board msprof metric matrix.
See **`docs/ascend-a5-support.md`** for detection substrings, profiler A3 vs A5
behavior, verification steps, and remaining gaps.

## 10. Pointers

- Resolver: `plugin/src/domain/utils/ascend-util.ts` (`resolveAscendEnv`,
  `getOperatorSpawnEnv`, `isSimulatorCompile`).
- Global env snapshot: `plugin/src/domain/utils/global-env-snapshot.ts`.
- Spawn entry-point: `plugin/src/service/operator-command-executor.ts`.
- Placeholder substitution:
  `plugin/src/domain/utils/operator-script-placeholders.ts`.
- Workspace setting helpers: `plugin/src/helpers/operator-project-workspace-config.ts`.
- Templates: `plugin/templates/code_template/cann_template/*/` and
  `plugin/templates/code_template/ascend_template/add_custom/`.
