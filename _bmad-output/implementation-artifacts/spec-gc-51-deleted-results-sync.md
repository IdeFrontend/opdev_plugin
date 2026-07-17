---
title: 'Synchronize deleted Performance Results on refresh'
type: 'bugfix'
created: '2026-07-17'
status: 'done'
review_loop_iteration: 0
baseline_commit: 'cc29aca4868c332280e1902d90b438cfa2a06911'
context:
  - '{project-root}/docs/performance.md'
---

# Synchronize deleted Performance Results on refresh

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The manual Performance Results refresh must make the tree match filesystem truth after a report folder, mapped result, child file, or nested folder is deleted. Existing scanning handles stable pre-refresh deletion, but selected-report context remains stale and deletion races can incorrectly clear unrelated results or let an older refresh restore deleted data.

**Approach:** Reconcile each completed refresh as one authoritative snapshot, localize missing-path races to the vanished entry, keep stable folder identity, clear deleted selection state, and protect the behavior with filesystem-backed and provider-level regression tests.

## Boundaries & Constraints

**Always:** Refresh remains explicit and idempotent; surviving reports and files remain visible; a deleted selected report clears both selection context keys; the latest requested refresh wins; unexpected whole-scan failure preserves the last valid inventory; Huawei and Ascend flavor IDs remain compatible.

**Ask First:** Adding automatic filesystem watchers, changing persisted result schemas, or deleting stored configuration/mark metadata requires separate approval.

**Never:** Treat a transient read failure as proof that every result was deleted; mutate `fileMapList`; remove saved marks merely because a path is temporarily unavailable; depend on child array indexes as folder identity; add polling or public-network behavior.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Report deletion | Report directory or mapped file/folder is absent before Refresh | Missing report disappears; unrelated reports remain | Persisted mapping and mark metadata remain unchanged |
| Child deletion | Supported CSV/BIN/JSON or nested folder is absent before Refresh | Deleted node and now-empty folder branches disappear; surviving children remain | Repeated Refresh produces the same tree |
| Selected deletion | Deleted report was selected or marked | Report disappears, selection clears, both selection context keys become false | Recreating the same key does not silently restore selection |
| Mid-scan deletion | A listed report or nested folder disappears during scanning | Only the vanished entry/subtree is omitted | A still-existing path with an unrelated read error fails the snapshot without replacing prior inventory |
| Overlapping refresh | Older scan resolves after a newer deletion snapshot | Newer requested snapshot remains authoritative | Stale completion performs no state, cache, selection, or focus update |
| Folder identity | One sibling folder is deleted before another expanded sibling | Surviving folder keeps stable identity and resolves only its own children | Stale deleted-folder nodes resolve empty |

</frozen-after-approval>

## Code Map

- `plugin/src/core/performance/performance-run-data.ts` — filesystem-authoritative discovery for opprof and mapped reports, including recursive child scanning.
- `plugin/src/class/operate-tree-provider.ts` — refresh ordering, snapshot application, caches, stable tree-node identity, selection, and VS Code context keys.
- `plugin/src/extension.ts` — existing manual Refresh command and Performance Results TreeView binding; no new watcher is required.
- `plugin/src/__tests__/unit/performance-run-data-refresh.spec.ts` — Node-backed temporary-filesystem deletion and race coverage.
- `plugin/src/__tests__/unit/operate-tree-provider-performance-refresh.spec.ts` — provider snapshot, concurrency, selection, context, and tree identity coverage.
- `plugin/src/__tests__/unit/performance-results-refresh-contribution.spec.ts` — existing visible-button manifest contract.
- `docs/performance.md` — canonical refresh and reconciliation behavior.

## Tasks & Acceptance

**Execution:**

- [x] `plugin/src/core/performance/performance-run-data.ts` — isolate disappeared report, mapped path, and nested-directory reads so one deletion cannot invalidate unrelated scan results.
- [x] `plugin/src/class/operate-tree-provider.ts` — apply only the latest successful snapshot, preserve state on scan failure, clear deleted selection/context, and use stable folder path segments.
- [x] `plugin/src/__tests__/unit/performance-run-data-refresh.spec.ts` — exercise child file, nested folder, report directory, mapped path, repeated refresh, and disappearance-during-scan cases.
- [x] `plugin/src/__tests__/unit/operate-tree-provider-performance-refresh.spec.ts` — verify deleted selection, false context keys, no selection resurrection, latest-refresh-wins, stable folder identity, and retained inventory on load failure.
- [x] `docs/performance.md` — document filesystem-authoritative manual reconciliation and non-destructive handling of persisted mappings/marks.

**Acceptance Criteria:**

- Given a visible Performance Result with deleted filesystem content, when the user invokes Refresh, then the tree contains exactly the surviving report and child paths.
- Given a deleted selected report, when Refresh completes, then no report is selected and selection-dependent actions are disabled.
- Given deletion races or overlapping refreshes, when all requests settle, then unrelated results remain and the newest requested successful snapshot is displayed.
- Given an unrecoverable scan error, when Refresh fails, then the last valid inventory remains instead of becoming an empty-success state.

## Spec Change Log

## Design Notes

Use filesystem names as folder path segments because sibling names are unique within one directory and remain stable when another child is removed. A monotonic refresh revision prevents stale async completions without serializing user actions. Missing-path handling must re-check existence before suppressing an error so permission or provider failures are not mislabeled as deletion.

## Verification

**Commands:**

- `pnpm --dir plugin exec jest src/__tests__/unit/performance-run-data-refresh.spec.ts src/__tests__/unit/operate-tree-provider-performance-refresh.spec.ts src/__tests__/unit/performance-results-refresh-contribution.spec.ts --runInBand` — all GC-51 regression suites pass.
- `pnpm exec oxlint <changed TypeScript tests and sources> && pnpm exec eslint <changed TypeScript tests and sources>` — changed TypeScript is clean.
- `pnpm exec tsc -b shared/tsconfig.json && pnpm run type-check` — extension and web types pass.
- `pnpm run compile` — production extension and web assets build successfully.

**Manual checks (if no CLI):**

- In a packaged Extension Development Host, delete a report folder and a child CSV while the Performance Results view is open, invoke Refresh, and confirm only deleted nodes disappear and selection-dependent actions clear.

## Suggested Review Order

**Atomic tree refresh**

- Start here: newest refresh owns inventory, selection, caches, contexts, and focus.
  [`operate-tree-provider.ts:2001`](../../plugin/src/class/operate-tree-provider.ts#L2001)

- Serialized context writes prevent an older refresh from restoring stale command state.
  [`operate-tree-provider.ts:2141`](../../plugin/src/class/operate-tree-provider.ts#L2141)

- Name-based folder paths preserve node identity when a sibling disappears.
  [`operate-tree-provider.ts:2347`](../../plugin/src/class/operate-tree-provider.ts#L2347)

**Filesystem reconciliation**

- Report discovery localizes deletion races while preserving unrelated completed records.
  [`performance-run-data.ts:106`](../../plugin/src/core/performance/performance-run-data.ts#L106)

- Recursive scanning revalidates folders and files after asynchronous traversal.
  [`performance-run-data.ts:236`](../../plugin/src/core/performance/performance-run-data.ts#L236)

- Missing-path classification suppresses deletion only, propagating unrelated provider failures.
  [`performance-run-data.ts:318`](../../plugin/src/core/performance/performance-run-data.ts#L318)

**Regression coverage and contract**

- Real temporary filesystems cover stable deletion, races, remote errors, and preserved metadata.
  [`performance-run-data-refresh.spec.ts:153`](../../plugin/src/__tests__/unit/performance-run-data-refresh.spec.ts#L153)

- Provider tests cover concurrency, context ordering, focus races, and stable identities.
  [`operate-tree-provider-performance-refresh.spec.ts:191`](../../plugin/src/__tests__/unit/operate-tree-provider-performance-refresh.spec.ts#L191)

- Documentation defines explicit refresh behavior without watchers or destructive persistence changes.
  [`performance.md:269`](../../docs/performance.md#L269)
