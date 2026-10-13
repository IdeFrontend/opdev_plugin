# Ascend950PR&950DT series environment support

**Priority:** P0  
**Issue:** [#6 — Support Ascend950PR&950DT series env problem](https://gitcode.com/opdevtools/plugin_release/issues/6)  
**Reporter:** `ljtyzx` (~6 days ago)

---

## Overview

Two distinct problems reported on Ascend950PR&950DT series hardware:

1. Wrong **`SOC_VERSION`** (or related cmake values) in project templates / builds.
2. **Left sidebar does not expand** to show results after on-board profiling completes.

Related internal documentation:

- [ascend-env-spec.md](../../design-docs/ascend-env-spec.md) — resolution precedence and spawn env contract
- [ascend-a5-support.md](../../design-docs/ascend-a5-support.md) — Ascend950PR&950DT series canonical strings and known gaps
- [review-a3-a5-environment-support.md](../../design-docs/review-a3-a5-environment-support.md) — Atlas A3 series vs Ascend950PR&950DT series differences (current implementation)

---

## Sub-issue A — CMake / SOC values

### Reported symptoms

> The SOC_VERSION param in CMakeLists.txt is error — it should be `Ascend910B1` default (Atlas A3 series ENV); if Ascend950PR&950DT series env, it is `Ascend950PR_9589`.

### Interpretation

The plugin distinguishes three names (see ascend-env-spec):

| Variable | Atlas A3 series example | Ascend950PR&950DT series example | Role |
|----------|------------|------------|------|
| `SOC_VERSION` | `ascend910b` | `ascend950` | CANN slug, `build.sh --soc=` |
| `SIMULATOR_TYPE` | `Ascend910B3` | `Ascend950PR_9589` | Simulator directory name |
| `NPU_ARCH` | `dav-2201` | `dav-3510` | AscendC / cmake |

The reporter may be conflating `SOC_VERSION` with `SIMULATOR_TYPE`, **or** a template may still expose wrong defaults for Ascend950PR&950DT series ACLNN builds.

### Current codebase behavior

| Area | Status |
|------|--------|
| `resolveAscendEnv()` in `ascend-util.ts` | Resolves Ascend950PR&950DT series slug `ascend950`, arch `dav-3510`, sim `Ascend950PR_9589` |
| Host detection (`ASCEND_SOC_RULES`) | Maps Ascend950PR&950DT series substrings to `ascend950` |
| Spawn env (`SOC_VERSION`, `NPU_ARCH`, `SIMULATOR_TYPE`) | Injected per command |
| On-board profiler metrics | Ascend950PR&950DT series uses `PCSampling` instead of `MemoryDetail` |
| Stored project `soc_version` | **Not read** by resolver (display/UI only) |
| `SUPPORT_COMPUTE_UNIT` / `SUPPORT_TILING_DIR` | Ascend `add_custom` template defaults to `ascend910_95` / `arch35`; plugin does not inject Ascend950PR&950DT series values |

### Key files

| File | Role |
|------|------|
| `plugin/src/domain/utils/ascend-util.ts` | Resolver, detection, spawn env |
| `shared/cann-env-constants.ts` | Canonical Ascend950PR&950DT series strings |
| `shared/msprof-onboard-env.ts` | `isAscendA5ProfilerCannSoc()` |
| `plugin/src/domain/services/profiler-service.ts` | Atlas A3 series vs Ascend950PR&950DT series metric matrix |
| `plugin/templates/code_template/ascend_template/add_custom/CMakeLists.txt` | ACLNN compute-unit defaults |
| `plugin/src/domain/models/model.ts` | `generateStructure` profiler defaults |
| `plugin/src/extension.ts`, `plugin/src/service/config-service.ts` | Workspace SOC sync |

### Open questions

1. Project type — AscendC `add_custom`, CANN template, standard-custom ops-math?
2. Which file shows the wrong value — generated `CMakeLists.txt`, build log, or UI display?
3. Exact wrong vs expected values on the Ascend950PR&950DT series host?
4. CANN version and `npu-smi info` / `asys info -r=status` output?
5. Is `environment.socVersion` set to `ascend950` in workspace settings? ([`workspace-settings.md`](../../design-docs/workspace-settings.md))
6. Does reporter expect `Ascend950PR_9589` in `SOC_VERSION` or in `SIMULATOR_TYPE`?

### Implementation plan

1. **Clarify naming with reporter** — point to ascend-env-spec §1; confirm whether bug is slug, simulator dir, or `SUPPORT_COMPUTE_UNIT`.
2. **Inject Ascend950PR&950DT series ACLNN defaults** when resolved SOC is `ascend950`:
   - Add `SUPPORT_COMPUTE_UNIT` / `SUPPORT_TILING_DIR` to spawn env or document required user values.
   - Consider `shared/cann-aclnn-build-defaults.ts` for chip-specific defaults.
3. **Wire stored project soc into resolver** (optional) — or document that workspace `environment.socVersion` is required for the Ascend950PR&950DT series.
4. **Regen** — when SOC changes from Atlas A3 series to Ascend950PR&950DT series, refresh stored simulate/on_board configs (see [config-lifecycle.md](./config-lifecycle.md)).
5. **Extend detection rules** if `npu-smi` output on reporter's host uses unmatched strings.
6. **Tests** — extend `operator-spawn-env.spec.ts` for Ascend950PR&950DT series cmake-related env; template snapshot tests.

---

## Sub-issue B — Sidebar not expanding after on-board

### Reported symptoms

> When I run the on-board command, it finished, the left board not expand to show.

### Current codebase behavior

After onboard completes, `extension.ts` calls:

```ts
await operateTreeProvider.refreshPerformanceReports({ focusIfNew: true });
```

In `operate-tree-provider.ts`:

- `findNewPerformanceReportKey` returns **undefined** if no new report key vs previous scan.
- Skips focus when `previousKeys.size === 0 && newReports.length > 1` (first load with multiple reports).
- `revealPerformanceReport` only runs when a new key is found.

Possible failure modes:

- On-board succeeded but report not written to path scanned by `performance-run-data.ts` (`{operator}/.vscode/opprof`).
- Report exists but key unchanged (overwrite) — not treated as "new".
- Performance tree not visible (`opDevtools.showOperateTree` / view focus).
- User expects **Operate** tree expansion, not **Performance results** tree.

### Key files

| File | Role |
|------|------|
| `plugin/src/extension.ts` | Post-onboard refresh callback |
| `plugin/src/class/operate-tree-provider.ts` | `refreshPerformanceReports`, `revealPerformanceReport` |
| `plugin/src/core/performance/performance-run-data.ts` | Scans opprof output |
| `design-docs/performance.md` | Performance results tree and msprof flow |

### Open questions

1. Which sidebar — Performance results, Operate tree, or Insight panel?
2. Did on-board exit successfully? New file under `.vscode/opprof`?
3. Ascend950PR&950DT series only or also Atlas A3 series?
4. Does manual refresh / opening Performance results view show the report?
5. Plugin version?

### Implementation plan

1. **Confirm expected UX** with reporter (Performance results vs Operate tree).
2. **After onboard, always reveal latest report** — change `focusIfNew` logic to pick newest report by timestamp even when key existed, or add `focusLatest: true` option.
3. **Focus Performance results view** — `vscode.commands.executeCommand('opdevtoolsPerformanceResultsTree.focus')` after reveal.
4. **Verify Ascend950PR&950DT series onboard output path** — ensure `msprof` output dir matches scanner on the Ascend950PR&950DT series (SOC-specific path differences).
5. **Log diagnostics** — log report keys before/after refresh in Output channel when onboard completes.
6. **Tests** — unit test `findNewPerformanceReportKey` edge cases; optional integration test for reveal.

---

## Delivery order

1. Clarify SOC vs simulator naming with reporter (may be docs-only).
2. Sidebar reveal fix (UX, low risk).
3. ACLNN / compute-unit injection for Ascend950PR&950DT series builds.
4. Refresh stale Atlas A3 series profiler settings on Ascend950PR&950DT series hosts.
