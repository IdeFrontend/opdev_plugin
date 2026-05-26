# Standard-custom operator workflow (ops-math / 一站式)

**Priority:** P0  
**Reporter cluster:** `devin-cwd` (v1.2.9 / v1.3.0)  
**Issues:** [#8](https://gitcode.com/opdevtools/plugin_release/issues/8), [#9](https://gitcode.com/opdevtools/plugin_release/issues/9), [#10](https://gitcode.com/opdevtools/plugin_release/issues/10)  
**PR:** [IdeFrontend/mstt#114](https://github.com/IdeFrontend/mstt/pull/114)

---

## Overview

Three related reports describe broken or incomplete command chains for **standard-custom** operator projects (typical layout: ops-math repo with `build.sh --pkg`, `.run` deploy packages, and `experimental/` operator collections). The plugin generates build and profiler commands but omits deploy steps, `--force`, and `--experimental` flags that the CANN toolchain now requires.

```mermaid
flowchart LR
  subgraph current [Current onboard/sim chain]
    A[source profile] --> B[cd + build.sh --pkg]
    B --> C[msprof op ...]
  end
  subgraph expected [Next release target]
    D[source profile] --> E["cd + build.sh --pkg ... --force"]
    E --> F["build.sh installs .run internally"]
    F --> G[msprof op ...]
  end
```

### Design decision (deploy)

**Deploy belongs in `build.sh` or user overrides** — not as a plugin-appended `RUN_FILE=$(find …)` shell fragment on cann onboard/sim.

| Layer | Responsibility |
|-------|------------------|
| **New projects (plugin templates)** | Upgraded template `build.sh` may include deploy-after-`--pkg` for pkg/.run flows |
| **[ops-math `build.sh`](https://gitcode.com/cann/ops-math/blob/master/build.sh)** | **Not auto-migrated** — script is CANN-owned; users fix deploy manually (see [User guidance](#user-guidance) below) |
| **Plugin command generation** | Pass through flags (`--ops`, `--experimental`, `--force`, …) when defaults are used; do not append `RUN_FILE` for standard-custom cann |
| **Workspace settings** | Escape hatch: override full compile script per flow (`onBoardCompileCommand`, etc.) |

Historical note: `RUN_FILE` in [`command-utils.ts`](../../plugin/src/domain/utils/command-utils.ts) (2026-03-30) was wired only for **ascend Build** via `getExecutableCommand`; standard-custom onboard/sim never used it.

---

## Shipped in PR #114

| Issue | Shipped | Not auto-fixed |
|-------|---------|----------------|
| **#8** | `--force` after `"$RUN_FILE"` on **Ascend Build** deploy; NPU debug passes **selected operator** | Cann onboard/sim deploy; ops-math without `build.sh` / settings override |
| **#9** | `--experimental` on Build, Run, On-board, Simulation, Dump tensor, NPU debug pre-build | UT test path (`compileOption` not wired to `getUtTestCommand`) |
| **#10** | User guidance + [deploy_run_package.sh](../../plugin/templates/snippets/deploy_run_package.sh) snippet | Plugin does **not** append deploy before msprof for cann |

### Key code changes

| Area | Files |
|------|-------|
| Deploy `--force` (Ascend Build) | `command-utils.ts`, `ascend-strategy.ts`, `command-utils.spec.ts` |
| `--experimental` threading | `compile-options.ts`, `extension.ts`, `task-controller.ts`, `build-service.ts` |
| NPU debug operator selection | `extension.ts`, `build-service.ts` |
| Deploy snippet for repos | `plugin/templates/snippets/deploy_run_package.sh` |

---

## User guidance

Use when closing or commenting on ops-math / 一站式 deploy issues. **Automatic migration of upstream ops-math `build.sh` is out of scope.**

### Why the plugin stops at `build.sh --pkg`

For standard-custom repos (e.g. ops-math), the plugin runs your repository’s [`build.sh`](https://gitcode.com/cann/ops-math/blob/master/build.sh). Today that builds the `.run` under `build_out/` but does **not** install it before on-board/simulation profiling. The plugin does not append deploy for cann/onboard paths (this is not a regression — see historical note above).

You can fix this in either of two ways:

### Option A — Modify `build.sh` in your ops-math repo (recommended)

Add a deploy helper and call it after a successful `--pkg` build when you need installation (on-board, simulation, or explicit deploy). Adapt paths to your CANN version.

```bash
# Add near the top or in your pkg completion path:
deploy_run_package() {
  local build_out="${BUILD_OUT_DIR:-build_out}"
  local run_file
  run_file=$(find "$build_out" -maxdepth 1 -name '*.run' | head -1)
  if [[ -z "$run_file" ]]; then
    echo "error: no .run package under $build_out" >&2
    return 1
  fi
  chmod +x "$run_file"
  if [[ "${DEPLOY_FORCE:-0}" == "1" ]] || [[ " $* " == *" --force "* ]]; then
    "$run_file" --force
  else
    "$run_file"
  fi
}

# After your existing --pkg logic produces build_out/*.run, e.g.:
#   deploy_run_package "$@"
```

Then run from the plugin or terminal as usual; optionally pass `--force` through your script’s argument parser so the `.run` installer gets it (required on some 一站式 versions per [#8](https://gitcode.com/opdevtools/plugin_release/issues/8)).

**Pros:** Same command in IDE and terminal; no plugin-specific overrides.  
**Cons:** You maintain the fork/patch until CANN upstream merges the same behavior.

Copy-paste helper: [`plugin/templates/snippets/deploy_run_package.sh`](../../plugin/templates/snippets/deploy_run_package.sh).

### Option B — Override compile commands in VS Code settings

If you cannot change `build.sh` immediately, set the **full** build script for the on-board (or simulation) pre-profiling step in workspace settings. Settings override defaults at runtime ([`operator-project-workspace-config.ts`](../../plugin/src/helpers/operator-project-workspace-config.ts)).

**Settings → Extensions → Huawei OP DevTools → Compile & Deploy**, or edit `.vscode/settings.json`:

```json
{
  "op-devtools.compileAndDeploy.buildConfig.onBoardCompileCommand": "bash build.sh --pkg --soc=ascend910b --vendor_name=custom --bisheng_flags=ccec_g --ops=add && RUN_FILE=$(find build_out -maxdepth 1 -name '*.run' | head -1) && chmod +x \"$RUN_FILE\" && \"$RUN_FILE\" --force"
}
```

For **simulation**, use `simulationCompileCommand` instead. Replace `ascend910b`, `add`, and flags with your SOC and selected operator. For operators under `experimental/`, add `--experimental` to the `bash build.sh …` portion.

**Pros:** No repo `build.sh` change; per-workspace.  
**Cons:** Must keep settings in sync with CANN/ops-math updates; duplicated logic if teammates use different machines.

### Related settings (reference)

| Setting | Maps to | Use for |
|---------|---------|---------|
| `compileAndDeploy.buildConfig.deployCommandOrRunCommand` | `build_op.target_file` | **Path or glob** for `.run` find/chmod (e.g. `build_out/*.run`), not a full shell with flags. On **Ascend Build**, the plugin appends `"$RUN_FILE" --force` after resolve. **Not** used on cann onboard/sim. |
| `compileAndDeploy.buildConfig.onBoardCompileCommand` | `on_board` build script | On-board profiling pre-build |
| `compileAndDeploy.buildConfig.simulationCompileCommand` | `simulate` build script | Simulation pre-build |
| `compileAndDeploy.buildConfig.compileCommand` | `build_op` build script | Sidebar **Build** |
| `compileAndDeploy.exampleBuildConfig.runCommand` | `build_example` | Run example (multi-op standard-custom) |

There is **no** separate “deploy only” setting for cann — override the whole compile command string, or fix `build.sh`.

---

## Issue details

### #8 — Cannot deploy standard-custom operator

**Link:** https://gitcode.com/opdevtools/plugin_release/issues/8

**Reported:** NPU debug missing selected operator; deploy requires `--force` on 一站式.

**Shipped:** Ascend Build appends `"$RUN_FILE" --force` via `getExecutableCommand` deploy mode; NPU debug pre-build receives selected `operatorNames`.

**Remaining:** Cann onboard/sim deploy still requires Option A or B above. Open questions for reporter: exact 一站式 version, UI path used, whether manual terminal deploy with `--force` succeeds.

**Key files:** `cann-strategy.ts`, `ascend-strategy.ts`, `command-utils.ts`, `extension.ts`, `build-service.ts`

### #9 — Missing `--experimental` for experimental operators

**Link:** https://gitcode.com/opdevtools/plugin_release/issues/9

**Reported:** Operators under `experimental/` in ops-math do not get `--experimental` on `build.sh`.

**Shipped:** `getCompileOptionForSelectedOperators()` ([`compile-options.ts`](../../plugin/src/helpers/compile-options.ts)) adds `--experimental` when selected operators have `isExperimental: true` — wired to sidebar **Build**, **Run**, **On-board**, **Simulation**, **Dump tensor**, and **NPU debug** pre-build. `workspace-detector-service.ts` marks `experimental/` operators.

**Remaining:** UT test compile path. Open questions: which action failed for reporter, exact operator path, mixed regular + experimental selection.

**Key files:** `compile-options.ts`, `extension.ts`, `task-controller.ts`, `cann-strategy.ts`, `workspace-detector-service.ts`

### #10 — Performance tuning missing deploy command

**Link:** https://gitcode.com/opdevtools/plugin_release/issues/10

**Reported:** On-board/simulation runs only `build.sh --pkg …` without installing `.run` before msprof.

**Shipped:** Documentation and deploy snippet; plugin intentionally does not append `RUN_FILE` on cann onboard/sim (see design decision). Settings override (`onBoardCompileCommand` / `simulationCompileCommand`) remains the plugin-side escape hatch.

**Remaining:** Template `build.sh` deploy for **new** plugin-generated projects (future). Open questions: on-board vs sim only, confirm `build_out/*.run` path after manual deploy.

**Key files:** `cann-strategy.ts`, `command-utils.ts`, `extension.ts`

---

## Verification

### Automated tests

```bash
cd plugin && npm test -- --testPathPattern="command-utils|compile-options|post-activate-bootstrap"
```

| File | Covers |
|------|--------|
| `command-utils.spec.ts` | #8 deploy/run modes, `--force` on `.run` |
| `compile-options.spec.ts` | #9 experimental flag helper |
| `post-activate-bootstrap.spec.ts` | Deferred startup (related #4 work in same PR branch) |

### Manual QA prerequisites

- [ ] Standard-custom workspace (e.g. ops-math) with regular + `experimental/` operators
- [ ] Ascend project for #8 Ascend Build check (optional)
- [ ] CANN + msprof on Linux host
- [ ] Inspect commands in **Huawei OP Devtools** output channel

### Manual checklist

**#8 — Deploy `--force` + NPU debug**

- [ ] **Build** (Ascend): command ends with `"$RUN_FILE" --force` (not `--force` inside `deployCommandOrRunCommand` setting)
- [ ] **Run** (cann): test binary path; **no** `--force`
- [ ] **NPU debug** pre-build includes `--ops=<selected>`; changing selection updates operator
- [ ] `deployCommandOrRunCommand` = `build_out/*.run` only still works on Ascend Build

**#9 — `--experimental`**

- [ ] Experimental op → **Build**, **On-board**, **Simulation**, **Run**, **NPU debug**: compile step includes `--experimental`
- [ ] Regular op → same actions: **no** `--experimental`

**#10 — Onboard deploy (repo / settings)**

- [ ] **Baseline:** default **On-board** = compile script only, then msprof (no plugin RUN_FILE deploy)
- [ ] **Option B:** `onBoardCompileCommand` override runs compile + deploy + `--force` before msprof
- [ ] **Option A:** `deploy_run_package` in repo `build.sh`; plugin **On-board** works without settings override

### Sign-off template

```
Branch: nikitin/issues-fixes
CANN version: ___
Hardware: A3 / A5

#8: automated PASS / manual: ___
#9: automated PASS / manual: ___
#10: automated PASS / manual: ___ (Option A / B / baseline)

Blockers: ___
```

---

## Out of scope

Automatic analysis or patching of upstream [ops-math `build.sh`](https://gitcode.com/cann/ops-math/blob/master/build.sh).
