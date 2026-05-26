# Ascend A5 / Atlas A5 support

This document is the **A5-focused guide** for the Mind Studio / operator VS Code extension. It lists canonical strings, what the plugin does today on A5-class hardware, how to verify behavior, and known gaps.

**Canonical environment resolution** (precedence, spawn env, placeholders, lifecycle) lives in **`docs/ascend-env-spec.md`**. Read that first for “how SOC / simulator / NPU arch are chosen”; this file covers **A5-specific values and behavior** on top of that contract.

**Historical context** for the env refactor (bug list, motivation): **`docs/review-a3-a5-environment-support.md`**.

There is **no separate “A5” product mode**. A5 support means the plugin consistently uses the correct **CANN SOC slug**, **simulator directory**, **`NPU_ARCH`**, **host detection** substrings, and **on-board profiler** metric matrix for Ascend 950 / Atlas A5 class targets.

---

## 1. Canonical A5 strings

Shared constants: `shared/cann-env-constants.ts`. Detection and mapping: `plugin/src/domain/utils/ascend-util.ts`.

| Concept | Constant / value | Used for |
|---------|------------------|----------|
| CANN SOC slug | `ascend950` (`CANN_SOC_ASCEND_950`) | `SOC_VERSION`, `{soc_version}`, `build.sh --soc=` |
| NPU arch | `dav-3510` (`NPU_ARCH_DAV_3510`) | Spawn `NPU_ARCH`, cmake `-DNPU_ARCH=` |
| Default simulator dir | `Ascend950PR_9589` (`SIMULATOR_ASCEND_950PR_9589`) | `SIMULATOR_TYPE`, `{simulator_type}`, msprof `op simulator --soc-version` |
| A5 profiler SOC check | `isAscendA5ProfilerCannSoc()` → true only for normalized `ascend950` | On-board `msprof op` aic-metrics matrix (`shared/msprof-onboard-env.ts`) |

**Three names (do not conflate):**

| Name | A5 example | Role |
|------|------------|------|
| `SOC_VERSION` | `ascend950` | CANN packaging / Ascend `build.sh --soc=` |
| `SIMULATOR_TYPE` | `Ascend950PR_9589` | Directory under `$ASCEND_HOME_PATH/tools/simulator/<name>/lib` |
| `NPU_ARCH` | `dav-3510` | AscendC `--npu-arch` |

When the workspace sets **`op-devtools.performanceTuning.simulation.simulatorType`** to `Ascend950PR_9589`, `resolveAscendEnv` **derives** `SOC_VERSION=ascend950` and `NPU_ARCH=dav-3510` for that simulate run so SOC and simulator cannot disagree (see **`docs/ascend-env-spec.md`** §3).

---

## 2. Implementation status (current tree)

### 2.1 Implemented

| Area | Behavior |
|------|----------|
| **Single resolver** | `resolveAscendEnv` / `resolveAscendEnvForOperatorCommand` in `ascend-util.ts`; spawn env, `{soc_version}` / `{simulator_type}`, profiler, and build paths share one resolution per command. |
| **Host detection** | Lazy `asys info -r=status` then `npu-smi info`; `ASCEND_SOC_RULES` maps A5-related substrings to `ascend950` (`atlas a5 series`, `atlas a5`, `atlasa5`, `ascend 950`, `950`, …). |
| **NPU arch from SOC** | `getNpuArchForCannSoc('ascend950')` → `dav-3510` (also `atlas a5` tokens in slug). |
| **SOC ↔ simulator tables** | `ascend950` ↔ `Ascend950PR_9589`; inverse via `simulatorTypeToCannSoc` (+ `950` / `9589` heuristics for unknown sim names). |
| **Templates / new operators** | `ascend.plugin.ts`, `abstract-operator-plugin.ts`, `model.ts` use `{soc_version}` / `{simulator_type}` placeholders, not hardcoded 910B strings. |
| **On-board profiler (A5)** | `OnBoardStrategy`: `MemoryDetail` replaced by `PCSampling` in base metrics; Roofline/PCSampling enable `Default` metric bundle (`profiler-service.ts`). |
| **New project opprof defaults** | `generateStructure` sets `MemoryDetail: false`, `PCSampling: true` when `resolveAscendEnv(...).socVersion` is A5 (`model.ts`). |
| **Workspace sync** | `extension.ts` / `config-service.ts`: A5 syncs `performanceTuning.onBoard.pcSampling`; A3 syncs `cacheHeatmap` from `MemoryDetail`. |
| **Config load from settings** | `operator-project-workspace-config.ts`: maps `pcSampling` vs `cacheHeatmap` using workspace `environment.socVersion` + `isAscendA5ProfilerCannSoc`. |
| **i18n / package.nls** | User-facing copy for PC sampling vs cache heatmap on Ascend 950 / A5 (`shared/i18n`, `package.nls*.json`). |
| **Unit tests** | `operator-spawn-env.spec.ts` (A5 sim → `ascend950` + `dav-3510` + `SUPPORT_*`), `operator-script-placeholders.spec.ts`, `profiler-simulator-resolution.spec.ts`, `pyasc-plugin.spec.ts`. |

### 2.4 Project-type notes (templates)

| Type | A4/A5 template status |
|------|------------------------|
| **CANN** (`cann_template/*`) | Env-driven `build.sh` / cmake — reference implementation |
| **Ascend** (`ascend_template/add_custom`) | CMake reads spawn `SUPPORT_*`; plugin injects on every command |
| **PyAsc** (`pyasc_temple`) | Python-only; configs use `python3 ./<op>.py`; profiler uses resolver |
| **Triton** (`triton_vector_add`) | Python-only; no CANN env template contract; simulate/on-board disabled in plugin |

### 2.2 Not driven by `resolveAscendEnv` (intentional or legacy)

| Item | Detail |
|------|--------|
| **`projects.json` `soc_version`** | Env config UI persists it for display/APIs; **`resolveAscendEnv` does not read it**. Operator commands use workspace SOC → global snapshot → detection → empty default. To target A5, set **`op-devtools.environment.socVersion`** to `ascend950`, export `SOC_VERSION=ascend950` before launching VS Code, rely on detection, or set workspace simulator `Ascend950PR_9589` for simulate runs. |
| **`getProjectSocVersion()`** | Returns `getSocVersionWithWorkspaceOverride(project.soc_version)` — used for **workspace settings sync** and env webview display, not for spawn env. |
| **`DEFAULT_FALLBACK_CANN_SOC`** | Empty string when settings, env, and detection all fail (no silent `ascend910b` in resolver). |
| **`SUPPORT_COMPUTE_UNIT` / `SUPPORT_TILING_DIR`** | Plugin injects `ascend910_95` / `arch35` on every spawn. For A5, `SOC_VERSION=ascend950` and `NPU_ARCH=dav-3510`; ACLNN compute unit remains `ascend910_95` (950-generation `SocVersion` in CANN `op_host`, not a separate `ascend950` string). |

### 2.3 Remaining gaps / operational caveats

- **Extend `ASCEND_SOC_RULES`** if your `npu-smi` / `asys` output uses strings not yet in the map; verify on physical A5 hosts.
- **Simulator directory names** must exist under your CANN `tools/simulator`; CANN upgrades may rename dirs — update constants or workspace setting accordingly.
- **Saved simulate / opprof config** can freeze `simulatorType` and metric flags from `generateStructure` time; changing SOC later does not rewrite stored configs until the user edits or regenerates.
- **Stale workspace settings** — `extension.ts` / `config-service` may have synced `Ascend910B3` into `.vscode/settings.json` on older projects; update simulate/on-board settings after migrating to A5.
- **Multi-NPU hosts** — detection scans full probe text with ordered substring rules; heterogeneous machines need an explicit workspace SOC or simulator setting.
- **Profiler simulate** — `SimulatorStrategy` passes resolved **simulator directory** to `msprof op simulator --soc-version`, not the CANN slug (by design).

---

## 3. Host detection (A5 substrings)

Rules in `ASCEND_SOC_RULES` (`ascend-util.ts`). Matching is case-insensitive substring on normalized probe output; **more specific keys are listed first** (e.g. `atlas a5 series` before `950`).

| `npu-smi` / `asys` substring (examples) | CANN slug |
|----------------------------------------|-----------|
| `atlas a5 series`, `atlas a5`, `atlasa5` | `ascend950` |
| `ascend 950`, `ascend950`, `950` | `ascend950` |

Log lines when detection runs (Huawei Op Devtools channel, scope `op-devtools/ascend-env`):

```
detected SOC via asys: ascend950
detected SOC via npu-smi: ascend950
```

Per-command resolution (same channel):

```
Ascend Environment Resolved: soc=ascend950 (source=…), simulator=Ascend950PR_9589 (source=…), npu_arch=dav-3510 (source=derived-from-soc) [projectId=… isSimulator=…]
```

---

## 4. On-board profiler: A3 vs A5

Controlled by `isAscendA5ProfilerCannSoc(cannSoc)` (exact normalized slug `ascend950`).

| | A3 / 910B-class (`ascend910b`, …) | A5 / 950-class (`ascend950`) |
|---|-----------------------------------|------------------------------|
| Cache-style metric | `MemoryDetail` in base set | Not in base set |
| PC sampling metric | Not in base set | `PCSampling` in base set |
| “Collect all operators by default” when | Roofline or MemoryDetail checked | Roofline or PCSampling checked |
| Workspace setting mirrored | `performanceTuning.onBoard.cacheHeatmap` | `performanceTuning.onBoard.pcSampling` |

On-board command build passes `onboardCannSoc` from `resolveAscendEnv({ isSimulator: false })` in `ascend-strategy.ts` / `cann-strategy.ts` / `python-operator-strategy-shared.ts`.

---

## 5. Verification checklist (A5 hardware or agent)

| Step | Action |
|------|--------|
| Host identity | Run `npu-smi info` (and optionally `asys info -r=status` after sourcing CANN). Record exact core/product strings. |
| CANN toolkit | Confirm `ascend950` and simulator dir name against **your** CANN operator guide and `ls $ASCEND_HOME_PATH/tools/simulator`. |
| Workspace | Set `op-devtools.environment.socVersion` to `ascend950` **or** `performanceTuning.simulation.simulatorType` to `Ascend950PR_9589` for simulate-driven resolution. |
| Build / simulate | Run compile + simulate; check output channel for `Ascend Environment Resolved` and spawn `env` with `SOC_VERSION`, `NPU_ARCH`, and `SIMULATOR_TYPE` when applicable. |
| On-board opprof | New operator on A5 should default `PCSampling: true`, `MemoryDetail: false`; run 上板分析 and confirm `msprof op` aic-metrics in generated command. |
| Placeholders | Scripts with `{soc_version}` / `{simulator_type}` should show `ascend950` / `Ascend950PR_9589` after resolution, not baked-in 910B literals. |
| Tests (CI) | `pnpm test` (or project test script) — `operator-spawn-env.spec.ts`, `operator-script-placeholders.spec.ts`. |

---

## 6. Primary code locations

| Area | Path |
|------|------|
| SOC rules, resolver, spawn env | `plugin/src/domain/utils/ascend-util.ts` |
| Global env snapshot | `plugin/src/domain/utils/global-env-snapshot.ts` |
| A5 profiler SOC helper | `shared/msprof-onboard-env.ts` |
| Shared constants | `shared/cann-env-constants.ts`, `shared/cann-aclnn-build-defaults.ts` |
| Placeholders | `plugin/src/domain/utils/operator-script-placeholders.ts` |
| Spawn entry | `plugin/src/service/operator-command-executor.ts` |
| On-board / sim profiler strategies | `plugin/src/domain/services/profiler-service.ts` |
| Strategies (onboardCannSoc) | `plugin/src/domain/services/command-strategy/ascend-strategy.ts`, `cann-strategy.ts` |
| New-op defaults | `plugin/src/domain/models/model.ts` |
| Workspace SOC / simulator helpers | `plugin/src/helpers/operator-project-workspace-config.ts` |
| Settings sync | `plugin/src/extension.ts`, `plugin/src/service/config-service.ts` |
| Env config UI | `web/src/views/panels/config/components/env-config.vue`, `simulation-tab.vue` |
| Env spec (all platforms) | `docs/ascend-env-spec.md` |

---

*Last verified against `plugin/src`, `shared`, `web`, and `plugin/templates/code_template` (2026-05). CANN `SOC_VERSION` and simulator directory names must match the toolkit you ship; validate on target hardware.*
