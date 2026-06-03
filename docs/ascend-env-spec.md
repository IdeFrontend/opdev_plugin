# Ascend / CANN environment resolution — canonical spec

Status: implemented in `plugin/src/domain/utils/ascend-util.ts`,
`plugin/src/domain/utils/global-env-snapshot.ts`, and
`plugin/src/domain/utils/ascend-detection-env.ts`. Operator commands use
`resolveAscendEnvForOperatorCommand()` → `buildOperatorSpawnEnvFromResolution()`;
other call sites use `resolveAscendEnv()`. Workspace keys:
[`workspace-settings.md`](./workspace-settings.md) (`environment.*`,
`performanceTuning.simulation.simulatorType`).

> If something disagrees with this document, the document is the contract —
> file a bug against the implementation, not the doc.

---

## 1. Variables the plugin owns

| Name | Meaning | Where it lands |
|------|---------|----------------|
| `SOC_VERSION` | CANN SOC slug (e.g. `ascend910b`, `ascend950`) for non-simulator runs; on **simulator-class** runs the spawn env value is the **simulator device directory name** (e.g. `Ascend910B3`, `Ascend950PR_9589`) so CANN cmake can link `tools/simulator/${SOC_VERSION}/lib` | Spawn env (see §4.1) + `{soc_version}` placeholder (always the resolved **slug**, not the sim dir) + `--soc=` on ascend `build.sh` when applicable |
| `simulatorType` (resolution field, not an env var) | Simulator directory name under `tools/simulator/<dir>/lib` | `AscendEnvResolution.simulatorType`; `{simulator_type}` placeholder; `--simulator <dir>` CLI flags. Read from workspace / global snapshot / default-from-SOC — **not** emitted as `process.env.SIMULATOR_TYPE` by the plugin |
| `NPU_ARCH` | AscendC `--npu-arch` (e.g. `dav-2201`, `dav-3510`) | Spawn env; derived from resolved SOC slug via `getNpuArchForCannSoc()`; cmake `$ENV{NPU_ARCH}` → cache |
| `SUPPORT_COMPUTE_UNIT` | ACLNN compute unit for standard-custom ascend cmake | Literal `set()` in generated `CMakeLists.txt`; `resolveAclnnCmakeDefaultsForGeneration()` at scaffold time (`shared/cann-aclnn-build-defaults.ts`) |
| `SUPPORT_TILING_DIR` | Tiling dir under `op_host` paired with compute unit | Same as `SUPPORT_COMPUTE_UNIT` (baked at generation, not spawn env) |

The plugin treats `SOC_VERSION` and `NPU_ARCH` as the only spawn-exported
environment names it owns, and only for project types whose CANN cmake reads
`$ENV{SOC_VERSION}` / `$ENV{NPU_ARCH}` (`ascend-c`, `torch-library`, or
`op_type=cann`). Standard-custom, pyasc, and triton runs use script placeholders
only (`{soc_version}`, `{simulator_type}`) — see
`IOperatorPlugin.getSpawnEnvExportKeys()` via `OperatorPluginRegistry.filterSpawnEnv()`.
`SUPPORT_*` are baked at generation (`AscendPlugin.patchGeneratedProject`), not env.
Any other variable a project's env script defines passes through untouched.

## 2. Global env snapshot (read once at activation)

`plugin/src/domain/utils/global-env-snapshot.ts` reads
`process.env.{SOC_VERSION, SIMULATOR_TYPE, NPU_ARCH, ASCEND_ENV_SCRIPT}` at
module load and freezes the result. The plugin **never** writes back to
`process.env` for any of these names; detection results and resolution outputs
travel only through the resolver and explicit `export … &&` prefixes in the
operator command string (see §4.1).

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
  socVersion:    string,                                  // may be '' (DEFAULT_FALLBACK_CANN_SOC)
  npuArch:       string,                                  // derived from socVersion ('' when slug empty)
  simulatorType: string | undefined,                      // set when isSimulator (after default-from-soc fill-in)
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
is also empty so builds fail visibly instead of silently using 910-class defaults.
At operator **generation**, empty SOC still maps `SUPPORT_*` via the same resolver
(fallback slug); regenerate the operator after fixing SOC settings if needed. The extension shows a one-time warning
with remediation steps before the build script exits.

## 4. What the plugin passes to operator commands

### 4.1 Ascend environment in the command line

Built in `executeOperatorCommand` after `resolveAscendEnvForOperatorCommand()`.
`isSimulatorCompile()` is true when `config_type === 'simulate'`,
`scriptField === 'cpu_debug_script'`, or the script matches `--simulator`.

For every operator command (build / build_example / on_board / simulate /
sanitizer / ut_test / dump_tensor / run), `executeOperatorCommand` embeds
resolved Ascend variables as explicit `export … &&` prefixes in the command
string (via `injectAscendEnvExports` in `shell-env-exports.ts`). Keys are
emitted only when non-empty:

```
export SOC_VERSION=<resolved> && export NPU_ARCH=<resolved> && …
```

`buildOperatorSpawnEnvFromResolution()` resolves `SOC_VERSION` and `NPU_ARCH`;
`OperatorPluginRegistry.filterSpawnEnv()` keeps keys declared by the op_type plugin
(`CannPlugin` → both keys) unless project_type forces no export (`standard-custom`,
`pyasc`, `triton`):

| Key | Non-simulator run | Simulator-class run |
|-----|-------------------|---------------------|
| `SOC_VERSION` | Resolved CANN slug (`resolution.socVersion`) | Simulator **directory name** (`resolution.simulatorType`, or `getDefaultSimulatorTypeForCannSoc(slug)` if still unset) |
| `NPU_ARCH` | From slug | From slug (same internal SOC resolution) |

Empty values are omitted from the command line. The plugin does **not** pass
these via `options.env` on `CommandExecutor.execute` for operator runs — the
command string is the single source of truth so the per-run output channel
shows a copy-pasteable line.

The plugin does **not** set `SIMULATOR_TYPE` in the export chain. CANN
simulator cmake reads the device dir from `$ENV{SOC_VERSION}` on sim builds
(see template `CMakeLists.txt` comments). Host `SIMULATOR_TYPE` in the
activation snapshot is only an input to **resolution**, not forwarded as an
export key.

When `project.ascend_env_script` is set, exports are inserted **before** the
`. ${project.ascend_env_script} &&` source prefix so plugin-resolved values are
established first; `set_env.sh` may still adjust other CANN variables for the
rest of the chain.

### 4.2 Command line and placeholders

- **`executeOperatorCommand`** resolves once (`resolveAscendEnvForOperatorCommand`),
  builds env via `buildOperatorSpawnEnvFromResolution`, applies
  `applyAscendPlaceholdersToScript` on the command string, then
  `injectAscendEnvExports`.
- `{soc_version}` → `resolution.socVersion` (CANN slug, including
  `derived-from-simulator`).
- `{simulator_type}` → `resolution.simulatorType`, or — when the script contains
  `{simulator_type}` but the run is not simulator-class —
  `enrichAscendResolutionForPlaceholders()` fills simulator dir without changing
  SOC resolution (workspace → global env → default-from-soc).
- `{operatorNames}` / `--ops={operatorNames}` — compile scripts only; handled by
  `applyOperatorNamesPlaceholder()` before ascend/cann strategies build the command
  (see [`build-integration.md`](./build-integration.md#operatornames-and---ops-compile-scripts)).
- Legacy call sites may use `replaceOperatorScriptPlaceholders()` in
  `operator-script-placeholders.ts` (computes without per-command logging when
  no resolution is passed).
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
- Does **not** set `SIMULATOR_TYPE` in per-command exports (simulator dir is
  passed as `SOC_VERSION` on simulator-class runs; see §4.1).
- Does **not** source `$ASCEND_ENV_SCRIPT` (or any other env script) at
  activation. The OS-level `ASCEND_ENV_SCRIPT` is recorded in the snapshot
  but never executed by the plugin.
- Does **not** export a mutable `soc_version` / `npu_arch` module binding —
  these are derived per call via `resolveAscendEnv()`.

## 6. Templates

### 6.1 CANN templates (`plugin/templates/code_template/cann_template/*/`)

- `build.sh` `--simulator [dir]` passes `-DSOC_VERSION=<dir>` or uses
  `$SOC_VERSION` from the environment (plugin injects the sim dir as
  `SOC_VERSION` on simulator-class runs).
- `CMakeLists.txt` uses env → cache for `SOC_VERSION` (sim device dir when
  `ENABLE_SIMULATOR`) and `NPU_ARCH`. `NPU_ARCH` is mandatory; cmake errors when
  empty.

### 6.2 Ascend `add_custom` template

`plugin/templates/code_template/ascend_template/add_custom/CMakeLists.txt`
ships `__MSTT_SUPPORT_COMPUTE_UNIT__` / `__MSTT_SUPPORT_TILING_DIR__`
placeholders. `AscendOpGenerator` replaces them after unzip using
`resolveAclnnCmakeDefaultsForGeneration()` (workspace / project SOC → global
env → detection → default, same SOC chain as operator commands).

| CANN SOC slug (at generation) | `SUPPORT_COMPUTE_UNIT` | `SUPPORT_TILING_DIR` | Notes |
|-------------------------------|------------------------|----------------------|-------|
| `ascend910b`, `ascend910_93`, `ascend910`, empty fallback | `ascend910_95` | `arch22` | A2/A3 class |
| `ascend950` (Atlas A5) | `ascend950` | `arch35` | A5 class; verify against your CANN ACLNN sample |

## 7. Logging

Two structured logs are enough to debug every reported mismatch:

- On activation (`logGlobalEnvSnapshot` → **Huawei Op Devtools** channel, scope
  `op-devtools/ascend-env`):
  ```
  global env snapshot: SOC_VERSION=…, SIMULATOR_TYPE=…, NPU_ARCH=…, ASCEND_ENV_SCRIPT=…
  ```
- **Once per operator command** (`resolveAscendEnvForOperatorCommand`) or per
  `resolveAscendEnv()` call (config bootstrap / profiler):
  ```
  Ascend Environment Resolved: soc=ascend950 (source=derived-from-simulator),
    simulator=Ascend950PR_9589 (source=workspace-setting),
    npu_arch=dav-3510 (source=derived-from-soc),
    support_compute_unit=ascend950, support_tiling_dir=arch35 [isSimulator=true]
  ```
- On every spawned operator shell (same shared channel, scope `op-devtools/command`):
  ```
  Executing {"command":"export SOC_VERSION='…' && export NPU_ARCH='…' && …","cwd":"…"}
  ```
  Ascend vars appear inside the logged `command` string (`export … &&` chain), not
  as a separate `env` object. (`SIMULATOR_TYPE` is never exported.)
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
- `plugin/src/__tests__/unit/shell-env-exports.spec.ts` — bash quoting,
  `formatAscendEnvExports` key order, and `injectAscendEnvExports` (prepend vs
  before `. set_env.sh &&` source prefix).
- `plugin/src/__tests__/unit/operator-command-executor.spec.ts` —
  `executeOperatorCommand` wires resolution → placeholders → export injection
  and calls `CommandExecutor.execute` without `options.env`.
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

- Resolver: `plugin/src/domain/utils/ascend-util.ts` — `computeAscendEnvResolution`,
  `resolveAscendEnv`, `resolveAscendEnvForOperatorCommand`,
  `buildOperatorSpawnEnvFromResolution`, `isSimulatorCompile`,
  `enrichAscendResolutionForPlaceholders` (`getOperatorSpawnEnv` is deprecated).
- Host detection env: `plugin/src/domain/utils/ascend-detection-env.ts` —
  `resolveCannSetEnvScriptForDetection`, `execBashWithCannEnv`.
- Global env snapshot: `plugin/src/domain/utils/global-env-snapshot.ts`.
- SOC warning: `plugin/src/helpers/ascend-soc-warning.ts` (`maybeWarnSocNotDetected`).
- Spawn entry-point: `plugin/src/service/operator-command-executor.ts`.
- Command-line exports: `plugin/src/domain/utils/shell-env-exports.ts`.
- Placeholders: `plugin/src/domain/utils/operator-script-placeholders.ts`.
- Workspace settings: `plugin/src/helpers/operator-project-workspace-config.ts`;
  doc: [`workspace-settings.md`](./workspace-settings.md).
- Command logging: `plugin/src/class/command-options.ts` (operator runs log the
  full command string; `pickAscendSpawnEnv` only applies when callers pass `env`).
- Templates: `plugin/templates/code_template/cann_template/*/` and
  `plugin/templates/code_template/ascend_template/add_custom/`.
