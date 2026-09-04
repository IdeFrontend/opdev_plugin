# Ascend A5 / Atlas A5 support

This document is the **A5-focused guide** for the Mind Studio / operator VS Code extension. It lists canonical strings, what the plugin does today on A5-class hardware, how to verify behavior, and known gaps.

**Canonical environment resolution** (precedence, spawn env, placeholders, lifecycle) lives in **`docs/ascend-env-spec.md`**. Read that first for “how SOC / simulator / NPU arch are chosen”; this file covers **A5-specific values and behavior** on top of that contract.

**A3 vs A5 behavior split** (detailed matrix): **`docs/review-a3-a5-environment-support.md`**.

There is **no separate “A5” product mode**. A5 support means the plugin consistently uses the correct **CANN SOC slug**, **simulator directory**, **`NPU_ARCH`**, **host detection** substrings, and **on-board profiler** metric matrix for Ascend 950 / Atlas A5 class targets.

---

## 1. Canonical A5 strings

Shared constants: `shared/cann-env-constants.ts`. Detection and mapping: `plugin/src/domain/utils/ascend-util.ts`.

| Concept | Constant / value | Used for |
|---------|------------------|----------|
| CANN SOC slug | `ascend950` (`CANN_SOC_ASCEND_950`) | `SOC_VERSION` (non-simulator builds), `{soc_version}`, `build.sh --soc=` |
| NPU arch | `dav-3510` (`NPU_ARCH_DAV_3510`) | Spawn `NPU_ARCH`, cmake `-DNPU_ARCH=` |
| Default simulator dir | `Ascend950PR_9589` (`SIMULATOR_ASCEND_950PR_9589`) | Spawn `SOC_VERSION` on simulator builds, `{simulator_type}`, `msprof op simulator --soc-version` |
| A5 profiler SOC check | `isAscendA5ProfilerCannSoc()` → true only for normalized `ascend950` | On-board `msprof op` aic-metrics matrix (`shared/msprof-onboard-env.ts`) |

**Three names (do not conflate):**

| Name | A5 example | Role |
|------|------------|------|
| `SOC_VERSION` | `ascend950` | CANN packaging / Ascend `build.sh --soc=` |
| `SIMULATOR_TYPE` | `Ascend950PR_9589` | Directory under `$ASCEND_HOME_PATH/tools/simulator/<name>/lib` |
| `NPU_ARCH` | `dav-3510` | AscendC `--npu-arch` |

When the workspace sets **`performanceTuning.simulation.simulatorType`** to `Ascend950PR_9589` ([`workspace-settings.md`](./workspace-settings.md)), `resolveAscendEnv` **derives** `SOC_VERSION=ascend950` and `NPU_ARCH=dav-3510` for that simulate run so SOC and simulator cannot disagree (see [`ascend-env-spec.md`](./ascend-env-spec.md) §7).

---

## 2. Implementation status (current tree)

### 2.1 Implemented

| Area | Behavior |
|------|----------|
| **Single resolver** | `resolveAscendEnv` / `resolveAscendEnvForOperatorCommand` in `ascend-util.ts`; spawn env, `{soc_version}` / `{simulator_type}`, profiler, and build paths share one resolution per command. |
| **Host detection** | Lazy `asys` / `npu-smi`; Chip Name → series → slug per [`ascend-env-spec.md`](./ascend-env-spec.md) §1 (`Ascend950*` → A5 / `ascend950`). |
| **NPU arch from SOC** | `getNpuArchForCannSoc('ascend950')` → `dav-3510`; Pro/Premium/901 chips → A2 slug + `dav-1001` when detected. |
| **SOC ↔ simulator tables** | `ascend950` ↔ `Ascend950PR_9589`; inverse via `simulatorTypeToCannSoc` (series profile table only). |
| **Templates / new operators** | `ascend.plugin.ts`, `abstract-operator-plugin.ts` use `{soc_version}` / `{simulator_type}` placeholders, not hardcoded 910B strings. |
| **On-board profiler (A5)** | `OnBoardStrategy`: `MemoryDetail` replaced by `PCSampling` in base metrics; Roofline/PCSampling enable `Default` metric bundle (`profiler-service.ts`). |
| **Simulator profiler** | `SimulatorStrategy`: `--soc-version=Ascend950PR_9589` (simulator **directory**, not `ascend950` slug) — see [`ascend-env-spec.md`](./ascend-env-spec.md) §8.1. |
| **New project opprof defaults** | Project creation seeds `MemoryDetail: false`, `PCSampling: true` when the effective SOC is A5 (`config-service.ts`). |
| **On-board config storage** | Options persist as `performanceTuning.onBoard.*` workspace settings; `pcSampling` vs `cacheHeatmap` are SOC-gated at read time by `isAscendA5ProfilerCannSoc(resolveEffectiveCannSoc())` in `config-service.ts`. |
| **i18n / package.nls** | User-facing copy for PC sampling vs cache heatmap on Ascend 950 / A5 (`shared/i18n`, `package.nls*.json`). |
| **Unit tests** | `operator-spawn-env.spec.ts` (A5 sim → `ascend950` + `dav-3510`), `aclnn-cmake-generation.spec.ts` (`SUPPORT_*` at generation), `operator-script-placeholders.spec.ts`, `profiler-simulator-resolution.spec.ts`, `pyasc-plugin.spec.ts`. |

### 2.4 Project-type notes (templates)

| Type | A2/A3/A5 template status |
|------|------------------------|
| **CANN** (`cann_template/*`) | Env-driven `build.sh` / cmake — reference implementation |
| **Ascend** (`ascend_template/add_custom`) | `SUPPORT_*` literals in generated `CMakeLists.txt`; `{soc_version}` placeholders on build (no `SOC_VERSION` / `NPU_ARCH` spawn export) |
| **PyAsc** (`cann_template/pyasc_template`) | Python-only; configs use `python3 ./<op>.py`; profiler uses resolver |
| **Triton** (`triton_template/triton_vector_add`) | Python-only; simulate/on-board msprof via Operate panel (PyAsc-style `python3` entry); requires CANN env + `torch_npu` + `triton` |

### 2.2 Not driven by `resolveAscendEnv`

| Item | Detail |
|------|--------|
| **`DEFAULT_FALLBACK_CANN_SOC`** | Empty string when settings, env, and detection all fail (no silent `ascend910b` in resolver). |
| **`SUPPORT_COMPUTE_UNIT` / `SUPPORT_TILING_DIR`** | Baked into generated `CMakeLists.txt` via `resolveAclnnCmakeDefaultsForGeneration`: A3-class → `ascend910_95` + `arch22`; A5-class → `ascend950` + `arch35` ([`cann-aclnn-build-defaults.ts`](../shared/cann-aclnn-build-defaults.ts), matrix in [`review-a3-a5-environment-support.md`](./review-a3-a5-environment-support.md)). |

### 2.3 Remaining gaps / operational caveats

- **Extend chip rules** in [`ascend-env-spec.md`](./ascend-env-spec.md) §4 if `Chip Name` strings on your host are not yet covered; verify on physical A5 hosts.
- **Simulator directory names** must exist under your CANN `tools/simulator`; CANN upgrades may rename dirs — update constants or workspace setting accordingly.
- **Persisted on-board / simulate options** — `performanceTuning.onBoard.*` and `performanceTuning.simulation.*` settings persist across sessions; on-board reads are SOC-gated at read time, while simulate options stay as configured until edited.
- **Multi-NPU hosts** — detection scans full probe text with ordered substring rules; heterogeneous machines need an explicit workspace SOC or simulator setting.
- **Profiler simulate** — `SimulatorStrategy` passes resolved **simulator directory** to `msprof op simulator --soc-version`, not the CANN slug ([`ascend-env-spec.md`](./ascend-env-spec.md) §8.1).

---

## 3. Host detection (chip → series)

Rules in [`ascend-env-spec.md`](./ascend-env-spec.md) §4 (`shared/ascend-series-registry.ts`). Extract `Chip Name`, normalize (strip spaces), prefix `Ascend950*` → series A5.

| Chip Name (examples) | CANN slug |
|----------------------|-----------|
| `Ascend950PR_9589`, `Ascend 950PR_9589` | `ascend950` |

Log lines when detection runs (Huawei Op Devtools channel, scope `op-devtools/ascend-env`):

```
detected series=A5 soc=ascend950 npu_arch=dav-3510 chip=Ascend950PR_9589 (via=npu-smi)
detected series=A5 soc=ascend950 npu_arch=dav-3510 chip=Ascend950PR_9589 (via=asys)
```

Per-command resolution (same channel):

```
Ascend Environment Resolved: soc=ascend950 (source=workspace-setting), simulator=Ascend950PR_9589 (source=workspace-setting), npu_arch=dav-3510 (source=derived-from-soc), support_compute_unit=ascend950, support_tiling_dir=arch35 [isSimulator=true]
```

---

## 4. On-board profiler: A3 vs A5

Controlled by `isAscendA5ProfilerCannSoc(cannSoc)` (exact normalized slug `ascend950`).

| | A3 / non-A5 class (`ascend910_93`, `ascend910b`, …) | A5 / 950-class (`ascend950`) |
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
| Workspace | Set `environment.socVersion` to `ascend950` **or** `simulation.simulatorType` to `Ascend950PR_9589` ([`workspace-settings.md`](./workspace-settings.md)). |
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
| New-op on-board defaults | `plugin/src/service/config-service.ts` |
| Workspace SOC / simulator helpers | `plugin/src/helpers/operator-project-workspace-config.ts` |
| On-board options (webview + settings DAO) | `plugin/src/extension.ts`, `plugin/src/service/config-service.ts` |
| Env spec (all platforms) | `docs/ascend-env-spec.md` |

---

*Last verified against `plugin/src`, `shared`, `web`, and `plugin/templates/code_template` (2026-05). CANN `SOC_VERSION` and simulator directory names must match the toolkit you ship; validate on target hardware.*
