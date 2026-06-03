# Profiling failures and Insight viewer

**Priority:** P1  
**Issues:** [#1](https://gitcode.com/opdevtools/plugin_release/issues/1), [#2](https://gitcode.com/opdevtools/plugin_release/issues/2)  
**Reporter:** `虎啸山村`

---

## Overview

Two reports affect the profiling experience:

| Issue | Theme |
|-------|-------|
| #1 | Host environment variables from `/etc/profile` break msprof runs |
| #2 | Insight viewer Detail and Cache tabs render blank |

These are related (both touch on-board profiling output) but have different root causes and fixes.

---

## Issue #1 — Environment variables cause plugin run failure

**State:** Open (~7 days ago)  
**Link:** https://gitcode.com/opdevtools/plugin_release/issues/1

### Reported symptoms

Variables in `/etc/profile`:

```bash
export ASCEND_GLOBAL_LOG_LEVEL=1
export ASCEND_SLOG_PRINT_TO_STDOUT=1
```

Example failing command (on-board msprof):

```bash
. /etc/profile && mkdir -p .../build && cd .../build && msprof op \
  --output=.../.vscode/opprof \
  --aic-metrics=Occupancy,Roofline,Source,MemoryDetail,Default \
  .../build/op_608377
```

Errors logged:

```
RegisterProfileCallback, callback type is 4
RegisterProfileCallback, callback type is 5
```

### Current codebase behavior

- Plugin **sources `/etc/profile`** during auto-open (`welcome-controller.ts`) — inherits these variables into child processes.
- Plugin **sets** `ASCEND_GLOBAL_LOG_LEVEL=1` in some build paths (`build-service.ts` ~line 954) — may compound the problem.
- Profiler spawn env is built in `ascend-util.ts` (`getOperatorSpawnEnv`) — currently passes SOC/simulator/arch but does **not** sanitize CANN log variables.

### Key files

| File | Role |
|------|------|
| `plugin/src/domain/utils/ascend-util.ts` | Operator spawn env |
| `plugin/src/domain/utils/global-env-snapshot.ts` | Frozen env at activation |
| `plugin/src/service/build-service.ts` | Sets `ASCEND_GLOBAL_LOG_LEVEL` for some builds |
| `plugin/src/controller/welcome-controller.ts` | Sources `/etc/profile` on auto-open |
| `docs/ascend-env-spec.md` | Documented spawn env contract |

### Open questions

1. Plugin version, CANN version, hardware (A3 vs A5)?
2. Which actions fail — on-board only, or also build/run/sim?
3. Does unsetting those variables in `/etc/profile` and restarting VS Code fully fix it?
4. Does the command exit with failure or complete with errors?
5. Full terminal output beyond `RegisterProfileCallback` lines?
6. Are variables set only in `/etc/profile`?

### Implementation plan

1. **Sanitize profiler spawn env** — unset or override for msprof child processes:
   - `ASCEND_SLOG_PRINT_TO_STDOUT` → unset or `0`
   - `ASCEND_GLOBAL_LOG_LEVEL` → unset or quieter level for profiling only
2. **Review build-service** — avoid setting `ASCEND_GLOBAL_LOG_LEVEL=1` globally; scope to debug builds if needed.
3. **Optional: minimal profile source** — replace blanket `. /etc/profile` with targeted CANN env script where possible (`project.ascend_env_script`).
4. **Document** known-problematic variables in troubleshooting section of ascend-env-spec or new user-issues FAQ.
5. **Test** — spawn env unit test asserting log vars stripped for onboard commands.

---

## Issue #2 — Insight Detail and Cache tabs blank

**State:** Open (~7 days ago)  
**Link:** https://gitcode.com/opdevtools/plugin_release/issues/2

### Reported symptoms

In the profiling view (Insight data viewer), **Detail** and **Cache** panes show no content.

> Note: This is **not** the on-board "Cache heatmap" profiler option (`MemoryDetail` metric in settings). It is the Insight `Compute/detail.html` and `Compute/cache.html` iframes.

### Current codebase behavior

Flow in `InsightDataViewerPanel`:

1. Resolve `INSIGHT_HOME_PATH` (required).
2. Load iframe HTML from `$INSIGHT_HOME_PATH/plugins/Compute/detail.html` and `cache.html`.
3. On non-Windows: start `profiler_server`, allocate port 9000–9999, wait for ready.
4. Post `{ command: 'renderAllIframes', iframes, wsPort, binPath }` to webview.
5. WebSocket bridge (`NodeWebviewSocketBridge`) streams data to iframes.

Failure at any step → blank panes (other tabs may still work).

### Likely causes (ranked)

1. Missing or invalid `INSIGHT_HOME_PATH`
2. Missing `plugins/Compute/detail.html` or `cache.html` under Insight install
3. `profiler_server` failed to start (port conflict, missing `zip/server_*.zip`)
4. WebSocket bridge not initialized — shell loads, no data
5. Empty or corrupt `.bin` report file
6. Theme/CSS hides content — see `injectThemeOverrides()` in `plugin/src/class/insight-data-viewer-panel.ts`

### Key files

| File | Role |
|------|------|
| `plugin/src/class/insight-data-viewer-panel.ts` | Insight panel, iframes, server startup |
| `plugin/src/core/view/view-opener.ts` | Opens Insight from report list |
| `plugin/src/helpers/environment-variable-reader.ts` | Reads `INSIGHT_HOME_PATH` |

### Open questions

1. Plugin version, OS, local VS Code vs Remote-SSH / code-server?
2. Confirm this is the **Insight** panel opened from a performance report?
3. Do other Insight tabs work (Summary, Timeline, Roofline)?
4. On-board or simulation report? Does `.bin` exist on disk?
5. Value of `INSIGHT_HOME_PATH` — do `detail.html` / `cache.html` exist?
6. Errors in **Huawei Op Devtools** output channel when opening report?
7. Completely white vs tab headers visible with empty content?

### Implementation plan

1. **Preflight diagnostic** before opening Insight:
   - Check `INSIGHT_HOME_PATH` set and directory exists.
   - Check required HTML files exist.
   - Log clear error messages with remediation steps.
2. **Improve server startup errors** — surface `profiler_server` failure, port exhaustion, missing zip to user (toast + Output channel).
3. **Health check command** — palette command "Diagnose Insight environment" for support.
4. **Retry / fallback** — if server fails, show inline message in webview instead of blank iframes.
5. **Document** Insight prerequisites in `performance.md` or user guide.
6. **Investigate Remote-SSH** — server binary arch (`server_x86.zip` vs `server_arm.zip`) and path resolution on remote hosts.

---

## Recommended delivery

| Phase | Issue | Effort |
|-------|-------|--------|
| 1 | #1 env sanitization for msprof | Low |
| 2 | #2 preflight checks + error surfacing | Medium |
| 3 | #2 diagnose command + docs | Low |

Issues can ship independently.
