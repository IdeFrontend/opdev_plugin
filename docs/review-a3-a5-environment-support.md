# Review: A3/A5 environment support (historical)

> **Status:** the refactor described below is **implemented**. Use these docs
> for day-to-day work instead of this file:
>
> - **`docs/ascend-env-spec.md`** — canonical SOC / simulator / `NPU_ARCH` contract
> - **`docs/ascend-a5-support.md`** — A5 canonical strings, profiler matrix, verification
> - **`plugin/src/domain/utils/ascend-util.ts`**, **`global-env-snapshot.ts`** — code
>
> This document is retained as the historical motivation and pre-refactor bug list.

Scope: the `feat: Ascend A5 support` commit on `a5-support` (commit `0a0210f59`).
The review focuses on resolution of `SOC_VERSION` / `SIMULATOR_TYPE` / `NPU_ARCH`
across templates, plugin host, and spawned shells; the design of the activation-time
env sourcing; and how the actual code differs from the spec given in the task description.

The review is organized as:

1. Templates — what is good, what still has hardcoded platform-specific parts.
2. Specification vs implementation — where the precedence rules diverge from spec.
3. Bug list with concrete reproductions.
4. The activation-time env sourcing (`refreshAscendEnv`) — why it should be removed.
5. Refactor proposal — a single resolver to unify SOC / simulator / NPU arch.
6. Logging additions required by the spec.
7. Concrete script-to-arg specification (proposed).

---

## 1. Templates

### 1.1 What is correct

- `plugin/templates/code_template/cann_template/*/build.sh` and `CMakeLists.txt`
  no longer hardcode `Ascend910B3` / `dav-2201`. They accept:
  - `SIMULATOR_TYPE` from `bash build.sh --simulator <name>`, from
    `$SIMULATOR_TYPE`, or from `-DSIMULATOR_TYPE=...`.
  - `SOC_VERSION` (CANN slug) from `$SOC_VERSION` or `-DSOC_VERSION=...`.
  - `NPU_ARCH` from `$NPU_ARCH` or `-DNPU_ARCH=...` with a hard
    `FATAL_ERROR` when empty (good — it forces the host to inject the value).
- The CMake snippet uses the “env-into-cache only when cache is empty”
  pattern, which makes `-D...=value` win on explicit invocation and `$ENV{...}`
  win on a fresh tree. This is the right shape for being “reusable for future
  changes”.
- `model.ts` / `ascend.plugin.ts` / `abstract-operator-plugin.ts` now emit
  `{simulator_type}` / `{soc_version}` placeholders instead of literal
  `Ascend910B3` / `ascend910b` strings. Good.

### 1.2 Issues with templates

1. **`plugin/templates/code_template/ascend_template/add_custom/CMakeLists.txt`
   still hardcodes platform-specific values** that defeat requirement #1:

   ```cmake
   set(SUPPORT_COMPUTE_UNIT "ascend910_95" CACHE STRING "...")
   set(SUPPORT_TILING_DIR  "arch35"        CACHE STRING "...")
   add_all_modules_sources(... COMPUTE_UNIT ${SUPPORT_COMPUTE_UNIT}
                                  TILING_DIR     ${SUPPORT_TILING_DIR} ...)
   ```

   The comment even admits the values may differ on A5: *“Atlas A5 / Ascend 950
   may use a different value in newer CANN.”* That puts the burden back on the
   user to edit the template per platform, which contradicts requirement #1.

   Fix: extend the same env-into-cache pattern used in the CANN templates so
   that the plugin can inject these values per resolved SOC. For example:

   ```cmake
   if((NOT DEFINED SUPPORT_COMPUTE_UNIT OR "${SUPPORT_COMPUTE_UNIT}" STREQUAL "")
      AND DEFINED ENV{SUPPORT_COMPUTE_UNIT} AND NOT "$ENV{SUPPORT_COMPUTE_UNIT}" STREQUAL "")
       set(SUPPORT_COMPUTE_UNIT "$ENV{SUPPORT_COMPUTE_UNIT}" CACHE STRING "..." FORCE)
   endif()
   if(NOT DEFINED SUPPORT_COMPUTE_UNIT)
       set(SUPPORT_COMPUTE_UNIT "ascend910_95" CACHE STRING "...")  # last-resort default
   endif()
   ```

   The plugin can then compute `SUPPORT_COMPUTE_UNIT` / `SUPPORT_TILING_DIR`
   from the resolved CANN SOC and inject them like it does for `NPU_ARCH`.

2. `build.sh` uses `case` with `break` after each branch. That is intentional,
   but the “unrecognized option” path falls through with `cmake_args=""`. That
   silently drops invalid arguments. Consider warning-on-unknown, or echoing
   the parsed `cmake_args` before invoking cmake.

3. The `--debug` branch has no documentation about which `NPU_ARCH` it expects.
   With the FATAL_ERROR in cmake, `--debug` will fail without `NPU_ARCH`
   exported. This is correct behavior but the `show_help` text only documents
   `NPU_ARCH` in the simulator example; consider extending the doc block.

4. `cmake_args="-DENABLE_SIMULATOR=ON -DASCEND_HOME_PATH=${ASCEND_HOME_PATH}"`
   silently breaks when `ASCEND_HOME_PATH` is unset (the `-D` flag will end up
   `-DASCEND_HOME_PATH=`). A short `: "${ASCEND_HOME_PATH:?ASCEND_HOME_PATH must be set}"`
   guard would surface the cause earlier.

---

## 2. Specification vs current implementation

The spec from the task:

- **SOC** priorities:
  - simulator runs *with explicit simulator type in VS Code setting*: SOC is
    **derived from the resolved simulator type**.
  - other runs: VS Code `environment.socVersion` → `SOC_VERSION` env → `asys`.
- **Simulator type** priorities (simulator runs only): VS Code setting →
  `SIMULATOR_TYPE` env → default per detected SOC.
- **NPU arch**: always computed from the resolved SOC.

The current implementation diverges from this on every one of the three rules.

### 2.1 SOC resolution

`resolveEffectiveCannSoc` is:

```ts
const workspaceOrProject = getSocVersionWithWorkspaceOverride(project?.soc_version);
return resolveRuntimeCannSoc(workspaceOrProject || null, soc_version) || 'ascend910b';
```

This is effectively `workspace → projects.json → module soc_version → 'ascend910b'`.
The module `soc_version` itself is `process.env.SOC_VERSION || 'ascend910b'`, possibly
overwritten by autodetection in `ensureSocVersionForDependentOperations()`.

Divergences from the spec:

- The `projects.json soc_version` channel is an extra layer not in the spec
  precedence. It happens to sit between “VS Code setting” and “env / detected”.
  If you keep it, document it; otherwise drop it from the runtime resolution
  and use it only as the initial value of the “workspace setting” when the user
  has never set one.
- The module-level `soc_version` defaults to `'ascend910b'` at import time
  (`process.env.SOC_VERSION || 'ascend910b'`). After that point the value is
  no longer distinguishable from “user set `SOC_VERSION=ascend910b`” nor from
  “nothing detected”. The spec calls these out as different channels.
- For simulator runs with an explicit simulator type, **SOC is not derived
  from the simulator type at all** — see the unit test
  `operator-spawn-env.spec.ts` ("sim spawn sets SIMULATOR_TYPE, slug SOC_VERSION,
  and sim NPU_ARCH"):

  ```text
  workspace simulatorType = Ascend910B3
  project soc_version     = ascend950
  expected env: {
    SIMULATOR_TYPE: 'Ascend910B3',
    NPU_ARCH:        'dav-2201',     // from sim
    SOC_VERSION:     'ascend950'     // mismatch with simulator
  }
  ```

  This is the mismatch the spec was meant to prevent. With this binding,
  `--soc=ascend950` will be emitted to ascend `build.sh` while the runtime
  simulator is a 910 family device.

### 2.2 Simulator type resolution

`resolveSimulatorDir` precedence is:

```text
getWorkspaceSimulatorType() → options.configUserOptions.simulatorType →
getDefaultSimulatorTypeForCannSoc(resolveEffectiveCannSoc(projectId))
```

Divergences from the spec:

- `process.env.SIMULATOR_TYPE` is **never read** at the host. It is only used
  *inside* `build.sh` as a last-resort fallback for the `--simulator` flag.
  Per the spec the resolver should read it (after VS Code setting, before
  the SOC-derived default).
- `configUserOptions.simulatorType` is a “saved simulate config” value baked
  in by `generateStructure` at create time. It is not part of the spec
  precedence. Like the project `soc_version`, decide whether it is a default
  feeding the VS Code setting, or whether it stays in the runtime chain (in
  which case the spec needs to be updated to mention it).

### 2.3 NPU arch resolution

The spec says “always from resolved SOC”. The implementation has two parallel
mappings:

- `getNpuArchForCannSoc(slug)` — used for cann non-sim.
- `getNpuArchForSimulatorType(simDir)` — used for simulator runs.

When the simulator type and SOC come from different sources (current behavior),
those two mappings disagree. For the cann + simulator test case above,
`NPU_ARCH=dav-2201` (from `Ascend910B3`) but `SOC_VERSION=ascend950`. The cmake
template will succeed (`NPU_ARCH` is non-empty), but the produced binary will
target 910 family while CANN was told it is 950.

Fix: derive `NPU_ARCH` only from the resolved SOC. The simulator type can then
be checked against the SOC and a warning logged on disagreement.

### 2.4 `getOperatorSpawnEnv` is type-conditional

The function emits a different shape for `cann` / `ascend` / `simulator` /
projectId. The shape differences are not justified:

- For `op_type === 'ascend'` non-sim the function returns only
  `{ SOC_VERSION }`. `NPU_ARCH` is not emitted in the spawn env, so child
  shells fall back to whatever `process.env.NPU_ARCH` holds (set earlier by
  `ensureNpuArchForDependentOperations`). That mixes “spawn env” and
  “process env” channels. Spawn env should be self-contained: always emit
  `SOC_VERSION`, `NPU_ARCH`, and `SIMULATOR_TYPE` (when relevant).
- For unknown `op_type` with a `projectId` it returns `{ SOC_VERSION }` only;
  for unknown `op_type` without `projectId` it returns `undefined`. That last
  branch falls back to “whatever process.env contains” — the same channel
  conflation.

### 2.5 The “simulate example compileOption” code path

`build-service.ts::buildSimulateExampleCompileOption` is also branched by
op_type:

```ts
if (opType === 'ascend') return `--simulator ${simDir} --soc=${slug}`;
return `--simulator ${simDir}`;
```

This is the only call site that emits a CLI `--soc=` argument to the example
build. For cann (where templates rely on `SOC_VERSION` env), the simDir and
the slug can disagree (see §2.3). Once SOC is derived from the simulator type
this becomes consistent.

---

## 3. Concrete bug list

| # | Bug | File |
|---|-----|------|
| 1 | Simulator runs with explicit `simulatorType` do not derive SOC from it. SOC/NPU_ARCH and SIMULATOR_TYPE can target different chip families simultaneously. | `plugin/src/domain/utils/ascend-util.ts:411` (`getOperatorSpawnEnv`), `plugin/src/domain/utils/operator-script-placeholders.ts` |
| 2 | `process.env.SIMULATOR_TYPE` is never read at the host, contrary to the spec for the simulator-type precedence. | `plugin/src/domain/utils/ascend-util.ts:349` (`resolveSimulatorDir`) |
| 3 | The “VS Code default” `environment.socVersion = "ascend910b"` from `package.json` leaks through `getEnvironmentSocVersionFromWorkspace()` as if it were an explicit user value, while `getSocVersionWithWorkspaceOverride` honors only `inspect()` overrides. Two readers of the same setting disagree. | `plugin/src/helpers/operator-project-workspace-config.ts:491` vs `:524` |
| 4 | `module.soc_version` is `export let` and mutated at runtime. Consumers (`cann-strategy.ts`, `ascend-strategy.ts`, `config-service.ts`, `model.ts`) import it as a named binding. Whether they see the mutated value depends on the TS module target and on whether the mock layer froze the value. Several jest mocks (`profiler-simulator-resolution.spec.ts`) already work around the live binding. | `plugin/src/domain/utils/ascend-util.ts:174` |
| 5 | `process.env.SOC_VERSION` after first detection is indistinguishable from a value the user actually exported. After one `ensureSocVersionForDependentOperations()` call, the spec channels collapse into one. | `plugin/src/domain/utils/ascend-util.ts:272` |
| 6 | `refreshAscendEnv()` sources whatever `ASCEND_ENV_SCRIPT` (not the project script) points to and merges all of it into `process.env`. Any variable in that script silently leaks into every later spawn and into the extension host. There is no way to find out where a given variable came from. | `plugin/src/domain/utils/ascend-util.ts:183`, `plugin/src/extension.ts:321` |
| 7 | `ensureNpuArchForDependentOperations()` only sets `NPU_ARCH` when env is empty. After a simulator run sets `NPU_ARCH=dav-3510` in the parent host (via `Object.assign(process.env, env)` from a future `refreshAscendEnv` re-run, or via leaked exports), a subsequent on-board build can inherit that stale value. The spec says NPU_ARCH must always be recomputed from the resolved SOC. | `plugin/src/domain/utils/ascend-util.ts:302` |
| 8 | `ensureCannSocAndNpuArchBeforeOperatorCommand()` mutates `process.env`. It is called both at activation and before each operator command, so the host env state evolves over the session. The “refresh ascend env once at activate” comment in `extension.ts` is therefore not accurate either. | `plugin/src/service/operator-command-executor.ts:50` |
| 9 | `tryRefreshSocVersionFromAsys()` runs `find / -path "*/cann*/set_env.sh" 2>/dev/null \| head -1` on every cold detection. On large filesystems that is slow and unbounded. Cache the result (or shortcut on `ASCEND_TOOLKIT_HOME`). | `plugin/src/domain/utils/ascend-util.ts:196` |
| 10 | `getSocFromCoreName()` defaults to `'ascend910b'` when no map key matches — a silent wrong default rather than a clear “unknown” return. Combined with the import-time `'ascend910b'` default and the schema default, the system has at least three places that quietly substitute `ascend910b`. The user cannot tell which one is winning from logs. | `plugin/src/domain/utils/ascend-util.ts:72` |
| 11 | `ascend_soc_map` keys are duplicated for upper/lower case (`910B`, `910b`, etc.) but `getSocFromCoreName` already lowercases the input. The duplicated keys are dead. They also waste the “longest key first” sort because both variants have the same length. | `plugin/src/domain/utils/ascend-util.ts:12` |
| 12 | The `add_custom` ascend template hardcodes `SUPPORT_COMPUTE_UNIT=ascend910_95` and `SUPPORT_TILING_DIR=arch35`, requiring the user to edit the template per platform (violates requirement #1). | `plugin/templates/code_template/ascend_template/add_custom/CMakeLists.txt` |
| 13 | `isAscendA5ProfilerCannSoc('ascend950')` exact-string match. The detected SOC may include trailing whitespace if a future detection path passes raw text; safer to use the normalized form (`normalizeCannSoc` is available). | `shared/msprof-onboard-env.ts` |
| 14 | `getEnvFromScript` silently swallows the script’s `stderr`, so an env script that fails to source produces only a console error. There is no surface for the user to see this. | `plugin/src/domain/utils/ascend-util.ts:35` |
| 15 | The `getDefaultAscendEnvScript()` helper always returns `''`. Either remove the indirection or wire the fallback (e.g. `/etc/profile.d/ascend.sh`). | `plugin/src/domain/utils/ascend-util.ts:31` |
| 16 | `ensureCannSocAndNpuArchBeforeOperatorCommand` runs **before** spawn env is computed, and the spawn-env path then overrides the values it just wrote. The two paths duplicate work. | `plugin/src/service/operator-command-executor.ts:46-55` |
| 17 | `getOperatorSpawnEnv` reads `ctx.configUserOptions.simulatorType` for the simulator chain, but `replaceOperatorScriptPlaceholders` reads the same key from the *config* user options it was passed. Each call site passes a different object (some pass `simulatorItem?.user_options`, some pass `userOptions` from a build_op config that won’t carry `simulatorType`). The set of simulator types eligible at script placeholder time and at spawn-env time can differ. | `plugin/src/domain/utils/operator-script-placeholders.ts`, `plugin/src/domain/utils/ascend-util.ts:349` |

---

## 4. Activation-time env sourcing — should be eliminated

The user’s suggestion (cache global env once, never source `ASCEND_ENV_SCRIPT`
at activation) is well-founded. The current dual mechanism is described in
`docs/ascend-env-spec.md` §2 / §5 and `docs/ascend-a5-support.md`, which document the post-refactor env model (no activation-time `ASCEND_ENV_SCRIPT` merge)
between the two. In practice:

1. `refreshAscendEnv()` at activation merges *whatever* the OS-level
   `ASCEND_ENV_SCRIPT` exports into `process.env`. There is **no contract** on
   what that script may export. CANN env scripts commonly export 30+ variables
   including `ASCEND_HOME_PATH`, `LD_LIBRARY_PATH`, `PATH`, `PYTHONPATH`,
   `ASCEND_OPP_PATH`, `ASCEND_AICPU_PATH`, etc. Every subsequent `spawn` in
   the extension host inherits these; if the user’s VS Code settings disagree
   with what the script set, the script wins.

2. The script that gets sourced at activation is the **OS-level**
   `ASCEND_ENV_SCRIPT`, not the **project-level** `ascend_env_script` (DB
   field), and not the **workspace-level** `environment.environmentScript`.
   These three sources can all differ on the same host. The plugin then
   prepends the project script with `. ${project.ascend_env_script}` in
   every spawned shell — sourcing the project script a second time inside the
   spawn. That double sourcing is wasteful and makes the precedence between
   the two scripts impossible to reason about.

3. After activation, `ensureSocVersionForDependentOperations()` mutates
   `process.env.SOC_VERSION` and `process.env.NPU_ARCH` further. The host’s
   `process.env` becomes a moving target during the session.

**Recommendation:** remove `refreshAscendEnv()` entirely from activation and
keep env sourcing only in the per-command shell prefix
(`. ${project.ascend_env_script} && …`) — which is where the spec already
wants it. Replace the host-side use of `process.env.SOC_VERSION` /
`process.env.NPU_ARCH` / `process.env.SIMULATOR_TYPE` with a single
**read-once snapshot** captured at activation:

```ts
// In a new file, e.g. plugin/src/domain/utils/global-env-snapshot.ts
const SNAPSHOT = Object.freeze({
  SOC_VERSION:     process.env.SOC_VERSION?.trim()    || undefined,
  SIMULATOR_TYPE:  process.env.SIMULATOR_TYPE?.trim() || undefined,
  NPU_ARCH:        process.env.NPU_ARCH?.trim()       || undefined,
  ASCEND_ENV_SCRIPT: process.env.ASCEND_ENV_SCRIPT?.trim() || undefined,
});
export function getGlobalEnvSnapshot() { return SNAPSHOT; }
```

The snapshot is captured before any plugin code runs, so it cannot be
contaminated by later detection. Everything else (`process.env.SOC_VERSION`
mutation, `ensureSocVersion…`, `ensureNpuArch…`) goes away. The only
remaining writer of env values is the per-spawn `options.env` passed to
`CommandExecutor.execute`, which already merges over `process.env` and so does
not need any host-side mutation to take effect in the child.

The detection step (`asys info` / `npu-smi info`) becomes a **lazy, cached**
call, only invoked when the spec precedence falls all the way through to it:

```ts
let cachedDetectedSoc: string | undefined | null;  // undefined = not yet probed, null = probed and failed
function detectSocOnce(): string | null { ... }
```

---

## 5. Refactor proposal: one resolver, three rules

The whole `ascend-util.ts` file would shrink to roughly:

```ts
// Cached global env snapshot
const GLOBAL = readGlobalEnvOnce();

// Cached detection (lazy)
let DETECTED_SOC: string | null | undefined;
function detectSoc(): string | null { /* asys → npu-smi → null */ }

// The single resolver — used everywhere SOC / simulator / NPU arch is needed.
export interface ResolvedAscendEnv {
  socVersion:    string;
  npuArch:       string;
  simulatorType: string | undefined; // undefined for non-simulator runs
  source: {
    socVersion:    'workspace' | 'env' | 'detected' | 'derived-from-simulator' | 'default';
    simulatorType: 'workspace' | 'env' | 'default-from-soc' | 'n/a';
    npuArch:       'derived-from-soc';
  };
}

export function resolveAscendEnv(ctx: {
  projectId?: number;
  isSimulator: boolean;
}): ResolvedAscendEnv {
  // --- simulator type (only meaningful when isSimulator) ---
  let simulatorSource: ResolvedAscendEnv['source']['simulatorType'] = 'n/a';
  let simulatorType: string | undefined = undefined;
  if (ctx.isSimulator) {
    const wsSim = getWorkspaceSimulatorType();
    if (wsSim) { simulatorType = wsSim; simulatorSource = 'workspace'; }
    else if (GLOBAL.SIMULATOR_TYPE) { simulatorType = GLOBAL.SIMULATOR_TYPE; simulatorSource = 'env'; }
    // else: fall through, will derive default from resolved SOC after SOC is decided
  }

  // --- SOC ---
  let socVersion: string;
  let socSource: ResolvedAscendEnv['source']['socVersion'];
  if (ctx.isSimulator && simulatorSource === 'workspace') {
    socVersion = simulatorToCannSoc(simulatorType!);   // <-- spec rule for simulator runs
    socSource  = 'derived-from-simulator';
  } else {
    const ws = getWorkspaceSocVersionExplicitOnly();
    if (ws) { socVersion = normalize(ws); socSource = 'workspace'; }
    else if (GLOBAL.SOC_VERSION) { socVersion = normalize(GLOBAL.SOC_VERSION); socSource = 'env'; }
    else {
      const det = detectSoc();
      if (det) { socVersion = det; socSource = 'detected'; }
      else     { socVersion = 'ascend910b'; socSource = 'default'; }
    }
  }

  // --- simulator type default (after SOC resolved) ---
  if (ctx.isSimulator && simulatorType === undefined) {
    simulatorType = getDefaultSimulatorForSoc(socVersion);
    simulatorSource = 'default-from-soc';
  }

  // --- NPU arch (always from SOC) ---
  const npuArch = getNpuArchForCannSoc(socVersion);

  const resolved = { socVersion, npuArch, simulatorType,
                     source: { socVersion: socSource, simulatorType: simulatorSource, npuArch: 'derived-from-soc' as const } };
  logResolution(ctx, resolved);
  return resolved;
}
```

With this:

- `simulatorToCannSoc(simulatorType)` is a tiny inverse map of
  `CANN_SOC_TO_SIMULATOR_TYPE` (`Ascend910B3 → ascend910b`,
  `Ascend950PR_9589 → ascend950`, …). Unknown simulator types fall back to
  the workspace SOC chain — that case can be a warning log.
- The `source` object is what feeds the debug logs the user asked for.
- There are no `let` exports, no `process.env` writes, no implicit defaults
  scattered across modules.

`getOperatorSpawnEnv` collapses to:

```ts
export function getOperatorSpawnEnv(ctx: OperatorSpawnEnvContext) {
  const r = resolveAscendEnv({ projectId: ctx.projectId, isSimulator: isSimulatorCompile(ctx) });
  const env: Record<string, string> = {
    SOC_VERSION: r.socVersion,
    NPU_ARCH:    r.npuArch,
  };
  if (r.simulatorType) env.SIMULATOR_TYPE = r.simulatorType;
  return env;
}
```

The same `resolveAscendEnv` powers `replaceOperatorScriptPlaceholders`,
`buildSimulateExampleCompileOption`, `SimulatorStrategy` and the profiler,
`config-service`, and `extension.ts::syncOperatorProjectWorkspaceSettings`.
Every consumer now agrees on the resolution, by construction.

The set of public helpers shrinks significantly:

- Remove: `refreshAscendEnv`, `ensureSocVersionForDependentOperations`,
  `ensureNpuArchForDependentOperations`,
  `ensureCannSocAndNpuArchBeforeOperatorCommand`, the `export let soc_version`,
  the `export let npu_arch`, the `tryRefreshSocVersionFromAsys` /
  `tryRefreshSocVersionFromNpuSmi` exports.
- Keep: `getDefaultSimulatorTypeForCannSoc`, `getNpuArchForCannSoc`,
  `normalizeCannSoc`, `isAscendA5ProfilerCannSoc`, `isSimulatorCompile`,
  the SOC map, and the new `resolveAscendEnv`.
- Add: `getGlobalEnvSnapshot`, `simulatorToCannSoc`.

---

## 6. Logging

Add a single structured log every time `resolveAscendEnv` runs:

```text
[op-devtools][resolveAscendEnv] soc=ascend950 (source=derived-from-simulator)
  simulator=Ascend950PR_9589 (source=workspace)  npu_arch=dav-3510 (source=derived-from-soc)
  projectId=12 isSimulator=true
```

And one log on activation showing the global env snapshot:

```text
[op-devtools][activate] global env snapshot: SOC_VERSION=ascend910b (from OS env),
                       SIMULATOR_TYPE=<unset>, NPU_ARCH=<unset>, ASCEND_ENV_SCRIPT=<unset>
```

These two are enough to debug every reported mismatch (current logs only
print the SOC alone, and only on detection success).

---

## 7. End-to-end spec proposal (place under `docs/`)

The following contract is what the implementation needs to match once it is
refactored.

### 7.1 What the plugin always emits to a spawned operator command

Plugin always passes these three environment variables in the spawn `env`
(overriding `process.env`):

| Variable | Always set? | Value |
|---|---|---|
| `SOC_VERSION` | yes | resolved CANN slug (lowercase) |
| `NPU_ARCH` | yes | derived from `SOC_VERSION` |
| `SIMULATOR_TYPE` | only for simulator runs | resolved simulator directory name |

Plugin also prepends `. ${project.ascend_env_script} && ` to the command
line when `project.ascend_env_script` is set. That is the **only** place the
plugin sources an env script.

### 7.2 What the plugin passes on the command line

For `op_type === 'ascend'` `build.sh`-style scripts the plugin keeps emitting
`--soc=${SOC_VERSION}` via the `{soc_version}` placeholder — this matches
what the ascend templates expect today.

For `op_type === 'cann'` `build.sh`-style scripts the plugin emits
`--simulator ${SIMULATOR_TYPE}` (still via `{simulator_type}`) and relies on
`SOC_VERSION`/`NPU_ARCH` env (consumed by cmake) — also matches today.

The `buildSimulateExampleCompileOption` flag construction stays op-type aware
but uses resolved values from a single `resolveAscendEnv` call.

### 7.3 Resolution rules (canonical)

1. `simulatorType`
   - For simulator runs only.
   - `op-devtools.performanceTuning.simulation.simulatorType` (explicit user/workspace) →
     `process.env.SIMULATOR_TYPE` (snapshot) →
     `defaultSimulatorForSoc(resolvedSoc)`.
2. `socVersion`
   - For simulator runs whose `simulatorType` came from the VS Code setting:
     `socVersion = inverseSimMap(simulatorType)`.
   - Otherwise: `op-devtools.environment.socVersion` (explicit only,
     ignoring the package-default) → `process.env.SOC_VERSION` (snapshot) →
     `detectSocOnce()` → `'ascend910b'`.
3. `npuArch`
   - Always `getNpuArchForCannSoc(socVersion)`.

### 7.4 No host-side env mutation

The plugin does not write to `process.env.SOC_VERSION`,
`process.env.NPU_ARCH`, or `process.env.SIMULATOR_TYPE`. Every command spawn
gets the resolved values via the `options.env` argument to `CommandExecutor`.

### 7.5 No env sourcing at activation

`refreshAscendEnv()` is removed. The OS-level `ASCEND_ENV_SCRIPT` is recorded
in the snapshot but not sourced into `process.env`. If a user wants its
exports available inside operator shells, they either (a) set
`project.ascend_env_script` (sourced per command) or (b) source the script
in their parent shell before launching VS Code (already supported via the
snapshot).

---

## 8. Smaller items worth fixing in the same PR

- Replace `ascend_soc_map` with an array of `{ regex, slug }` entries that
  drop the duplicated case keys and document the matching order explicitly.
  The current “sort by key length desc” relies on the fact that `Object.entries`
  in V8 preserves insertion order on string keys — fine in practice, but a
  regex-list expresses intent better.
- Move `'ascend910b'` default-of-last-resort into a single named constant
  (`DEFAULT_FALLBACK_CANN_SOC`) so the silent fallback is greppable. It is
  currently inlined in four places.
- Add unit tests that pin the spec behavior:
  - simulator + explicit `simulatorType=Ascend950PR_9589` + no `socVersion`
    setting → `SOC_VERSION=ascend950`, `NPU_ARCH=dav-3510`.
  - simulator + no explicit simulator + workspace `socVersion=ascend910b`
    → `SIMULATOR_TYPE=Ascend910B3`, `NPU_ARCH=dav-2201`.
  - non-simulator + `process.env.SOC_VERSION=ascend950` + no workspace setting
    → `SOC_VERSION=ascend950`. (The current implementation passes this only
    when nothing has been detected yet — add a snapshot test that pins it.)
- Remove dead code in `extension.ts` (the `try { refreshAscendEnv() ... } catch {}`
  block) once the refactor lands.
- The mutable `export let soc_version` / `export let npu_arch` should become
  getter functions to avoid live-binding portability concerns under different
  TS targets.

---

## 9. Suggested PR sequencing

1. **Spec PR**: land `docs/ascend-spec.md` with §7 above so the agreement is
   visible before code moves.
2. **Snapshot PR**: introduce `getGlobalEnvSnapshot()`, replace direct reads
   of `process.env.SOC_VERSION` / `NPU_ARCH` / `SIMULATOR_TYPE` outside
   `ascend-util` with the snapshot. No behavior change yet.
3. **Resolver PR**: introduce `resolveAscendEnv`, route all consumers through
   it. Remove the activation `refreshAscendEnv` call and the
   `ensureCannSocAndNpuArchBeforeOperatorCommand` mutations of `process.env`.
   This is the PR that fixes bugs #1, #2, #4, #5, #6, #7, #8, #16, #17.
4. **Template PR**: parameterize `add_custom/CMakeLists.txt` and surface the
   computed values via spawn env so a fresh A5 project does not require
   editing the template (bug #12).
5. **Cleanup PR**: drop dead helpers, add structured logs, and add the unit
   tests listed in §8.

This sequencing keeps each PR small, lets the spec PR land first, and ensures
the resolver PR can be reviewed against a frozen contract.
