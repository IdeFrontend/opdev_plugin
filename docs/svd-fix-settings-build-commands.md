# `svd/fix-settings-build-commands`: legacy → workspace settings

> **Branch:** `svd/fix-settings-build-commands` — **one squash commit** vs **`puer-master`** (not `master`).  
> **Status:** contract implemented; remaining work is mostly P2 (write races, SOC/multi-root). See [Open priorities](#open-priorities).  
> **Updated:** 2026-05-30  
> **Verification:** `pnpm -w run verify` — 93 passed, 17 skipped; `pnpm run compile` — OK.

---

## Goal

One-time copy of in-scope settings from legacy (`configs.json` / `user_options`) into workspace `settings.json` (`.arts/` or `.vscode/` via `getIdeSettingsFilePath`; `op-devtools.*` dotted keys), set `op-devtools.internal.settingsMigratedFromLegacy`, then read runtime fields **only** from workspace (VS Code configuration API). Writes: `ConfigService.writeOpDevtoolsDottedSettings`. While the flag is unset, migration does not overwrite keys already in the file (`queueSettingIfMissingInFile`).

After migration:

- **script** / sanitizer / simulate·on_board metrics → settings only  
- **deploy/run** target → settings only  
- **profiler / msprof binary target** → legacy DB (`getProfilerTargetFile`; `c41f6cb86`)

No recurring backfill; no DB fallback for script after migration.

**vs `puer-master`:** one-time `maybeMigrate` replaces `syncOperatorProjectWorkspaceSettings` on every refresh. New legacy DB rows after the flag do **not** sync into settings — by design.

---

## Status summary

| Area | State |
|------|--------|
| One-time migrate + single-flight | Done |
| Settings-only runtime (`getRuntimeConfigById`, strategies) | Done |
| Profiler binary from DB; deploy from settings | Done |
| Webview / `ops` saves → settings only | Done |
| `postConfig` update does not mirror script/target_file | Done |
| MIG-03: no flag on failed migrate write | Done |
| Drop `operatorProject.*` reads; no `syncAscend` after migrate | Done |
| P3 dedup, metric maps, drop `custom_options` | Done |
| Parallel `writeOpDevtoolsDottedSettings` (IO-01, #111) | Open P2 |
| Flatten-before-migrate on refresh (PRE-01) | Open P2/P3 |
| SOC / multi-root | Open P2 |
| Profiler target in settings (optional) | Open P2 opt. |

---

## Done on this branch

| Area | Change |
|------|--------|
| Migration | `maybeMigrateLegacySettingsToWorkspace` + `AsyncSingleFlight`; flag only in same batch as ≥1 new seed key |
| Migrate errors | `write` returns `false` or throws → no flag; `maybeMigrate` warns, no rethrow |
| Runtime | `buildUserOptionsFromWorkspaceSettings`; `readNonEmptyOpDevtoolsSetting` |
| Deploy | `readBuildOpDeployTargetFromWorkspace` / `writeBuildOpDeployTarget` |
| Commands | `getRuntimeConfigById` → overlay; `getRunTargetFile` → settings |
| API / webview | Narrow `ops`; settings-only saves; `operatorMetrics` in settings |
| Tests | migration (+ write failure), webview writes, workspace read, deploy-target, post-config |

Historical development was squashed into a single commit for PR review; this file is the branch contract and audit reference.

---

## Migration

### Legacy rows (no polling)

| Call site | Creates |
|-----------|---------|
| `generateStructure` | `build_op`, `build_example`, `ut_test`, `sanitizer`, `on_board`, `simulate` |
| `completeProjectConfigs` | missing rows |
| `createOpsByPrototype` / folder menu | same |
| `ensureSanitizerConfigExists` | skeleton `sanitizer` only (no migrate on that path alone) |

### Hooks

| Hook | When |
|------|--------|
| After `completeProjectConfigs` | `welcome-controller.openProject` (existing) |
| After `generateStructure` | welcome (new), `createOpsByPrototype`, folder menu |
| `refreshSidebarContexts` | `extension.ts` fallback (`activate` runs before bootstrap `openProject`) |

### Algorithm

1. Exit if flag set.  
2. Exit if no `build_op` — retry later ([MIG-02](#mig-02)).  
3. Raw DB (`getConfig`).  
4. `buildLegacySettingsMigrationWrites` → `filterPendingWritesByCurrentFile`.  
5. No new seed keys → exit without write ([MIG-01](#mig-01)).  
6. Write batch + flag; if `writeOpDevtoolsDottedSettings` returns `false` or throws → no flag ([MIG-03](#mig-03)).

`refreshSidebarContexts` always runs `writeOpDevtoolsDottedSettings({})` **before** `maybeMigrate` (nested → dotted flatten).

### Semantics (not bugs)

<a id="mig-01"></a>

**MIG-01 — keys already in settings:** step 5 means nothing to copy; runtime already uses settings. Not “stuck migrate”. Fix wrong/empty **values** in UI, or set flag manually if tooling needs it.

<a id="mig-02"></a>

**MIG-02 — `build_op` required:** migrate reads legacy rows already in `configs.json`. Missing `build_op` → retry after structure creation.

<a id="mig-03"></a>

**MIG-03 — migrate error (done in code):** flag only in successful seed batch; `false` return or exception → no flag; `maybeMigrate` does not rethrow.

### In-scope keys

| Dotted key | Legacy |
|------------|--------|
| `compileAndDeploy.buildConfig.*` | `build_op` scripts, deploy, op |
| `compileAndDeploy.exampleBuildConfig.*` | `build_example` |
| `compileAndDeploy.buildConfig.sanitizerCompileCommand` | `sanitizer.script` |
| `compileAndDeploy.buildConfig.onBoardCompileCommand` | `on_board.script` |
| `compileAndDeploy.buildConfig.simulationCompileCommand` | `simulate.script` |
| `compileAndDeploy.buildConfig.utTestCompileCommand` | `ut_test.script` |
| `environment.environmentScript` | `getProjectSH()` |
| sanitizer.*, `performanceTuning.*` | metric maps / flags |

Non-empty scripts: `queueNonEmptyString`. Out of scope: `socVersion`, `simulatorType`, profiler `target_file` columns, DB-only metadata.

---

## Runtime (post-migration)

| Read | Source |
|------|--------|
| Scripts / options | Workspace dotted keys |
| Deploy/run | `readBuildOpDeployTargetFromWorkspace` |
| Profiler binary | `getProfilerTargetFile` → DB |
| Row identity, `fileMapList` | DB |

Runtime does **not** check the migration flag; empty settings → empty commands (no DB script fallback).

**Per-flow keys:** `compileCommand` / `sanitizerCompileCommand` / `onBoardCompileCommand` / `simulationCompileCommand` / `utTestCompileCommand` — no cross-flow fallback.

**Commands:** `getRuntimeConfigById` → strategies use overlaid `config.script`; `getRunTargetFile` → workspace.

---

## Webview / `ops`

Saves → `writeOpDevtoolsDottedSettings` only. `getConfigData` → `getBuildConfigsList` (overlay); no inline `maybeMigrate` (relies on open hooks).

---

## Audit vs `puer-master` (2026-05-30)

**Verdict:** contract met. No post-flag backfill; command path settings-only with documented DB exceptions.

### Open

| ID | Issue | Where |
|----|--------|--------|
| PRE-01 | `writeOpDevtools({})` before `maybeMigrate` on every refresh; empty dotted keys can block DB seed | `extension.ts` |
| IO-01 | Parallel settings RMW (#111) | `writeOpDevtoolsDottedSettings` callers |
| UX-01 | Operate tree on when migrate failed | `refreshSidebarContexts` |
| HOOK-01 | `getConfigData` / sanitizer-only path without migrate | optional P3 |

### Not issues

MIG-01, MIG-02, MIG-03; post-flag new DB rows; per-flow keys; profiler DB + deploy settings; removed `syncOperator`.

---

## Open priorities

1. ~~P1 flag / postConfig drift~~ — done  
2. ~~Profiler target~~ — done  
3. ~~P3 dedup, maps, `custom_options`, webview metrics~~ — done  
4. ~~`operatorProject.*` / sync after migrate~~ — done  
5. ~~MIG-03 flag on write failure~~ — done  
6. **P2:** IO-01 — serialize or debounce settings writes (#111)  
7. **P2:** SOC / multi-root  
8. **P2 (opt.):** profiler binary → settings key  
9. **P2/P3:** PRE-01 — flatten order / empty placeholder keys  
10. **P3:** HOOK-01, UX-01; E2E; `run-integration.md`  

---

## Do not

1. Poll DB for migrate.  
2. Re-run migrate when flag set.  
3. Mirror setting fields to legacy DB from webview/deploy after migrate.  
4. `getConfiguration('op-devtools')` outside `getOpDevtoolsWorkspaceConfiguration()`.  
5. DB / cross-flow script fallback when a flow key is empty.  
6. On-board pre-build via `build_op` / `compileCommand`.  
7. `syncAscendEnvScriptFromWorkspaceSettings` at end of migrate.  
8. Recurring backfill (`puer-master` `syncOperatorProjectWorkspaceSettings`).

---

## Tests

```bash
pnpm -w run verify
cd plugin && pnpm test -- --testPathPattern="config-service-settings|config-service-webview|op-devtools-workspace|standard-custom-deploy|command-strategy-deploy-target"
```
