---
title: 'GC-45 Basic managed TTK ST runner'
type: 'feature'
created: '2026-07-15'
status: 'done'
baseline_commit: '9b81a0df489f03a8dda4fbdd5edd29bd9d966b1c'
review_loop_iteration: 0
context:
  - '_bmad-output/project-context.md'
  - '_bmad-output/planning-artifacts/prds/prd-mstt-2026-07-14/open-issue-acceptance-manifest.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Current `QA` has no usable ST action for standard-custom operators. Manual TTK setup breaks zero-configuration and blocks the urgent base scope of GitCode issue 45.

**Approach:** Add a native ST action that detects TTK, provisions a plugin-managed copy when absent, and runs every matching CSV sequentially. Preserve raw output and unique result files; defer the full results UI.

## Boundaries & Constraints

**Always:** Start from current `QA` on a linear feature branch; use no merge commits. Support a Linux extension host and one selected standard-custom operator. Reuse one Python 3.8+ interpreter for probe, install, and runs. Prefer system TTK; otherwise use plugin cache or fetch official `https://gitcode.com/cann/ops-test-kit.git` at pinned SHA `e559b7f1f55040a5f6a8d3cb0c05e4d6f8e9a3fe`. Keep source and dependencies under `globalStorageUri`, never global site-packages. Preserve the CANN environment. Discover `tests/st/arch35/ttk_<mode>_*.csv`, sort it, run each file once with a unique output, and integrate queue/Stop. Quote paths and log actionable errors without secrets.

**Ask First:** Change the source/SHA, install into system Python, support another project type, or run multiple selected operators.

**Never:** Auto-update valid cache, add telemetry, infer test pass/fail from process exit, use heuristic `--warmup false` retries, add a results webview, or claim full issue closure/offline supply.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| System TTK | Probe returns `TTK v...` | Run without download | Reject timeout, nonzero exit, or invalid signature |
| Managed install | No usable TTK; GitCode reachable | Single-flight pinned download, isolated install, re-probe, then run | Clean incomplete staging; retain valid cache |
| Restricted network | Valid cached TTK exists | Run without network | If no valid cache, stop with source/network guidance |
| Multiple inputs | Selected modes; many CSVs | Run sorted CSVs sequentially with distinct results | Report missing inputs before execution |
| Cancellation/failure | Stop or command failure | Kill active process; launch no next CSV | Show failed stage and produced paths |

</frozen-after-approval>

## Code Map

- `plugin/src/service/ttk-installer.service.ts` -- isolated probe, pinned provisioning, cache validation, and single-flight control.
- `plugin/src/domain/{services/st-test-command.ts,utils/st-test-paths.ts}` -- discovery, unique outputs, and safe commands.
- `plugin/src/service/st-test-service.ts` -- selected-operator sequential orchestration.
- `plugin/src/{constants.ts,extension.ts,class/operate-tree-provider.ts}` -- standard-custom-only native ST action and mode picker.
- `plugin/src/{controller/task-controller.ts,helpers/task-method-dispatch.ts,helpers/operator-action-queue.ts}` -- execution, cancellation, and queue state.
- `package.json`, base NLS, `shared/i18n/*`, and focused unit specs -- metadata, messages, and regressions.

## Tasks & Acceptance

**Execution:**
- [x] Add ST path/command helpers for all three modes and kernel defaults `-d=false -b=release --pc=8`.
- [x] Add bounded, atomic, isolated managed provisioning and sequential CSV orchestration with truthful Test output.
- [x] Wire the native mode picker and queue/Stop lifecycle without a webview.
- [x] Test probe/install/cache/network failures, quoting, ordering, unique outputs, orchestration, and cancellation.

**Acceptance Criteria:**
- Given one selected standard-custom operator, ST needs no workspace configuration and lets the user select one or more modes.
- Given absent TTK, concurrent requests perform one installation and reuse it.
- Given any path containing spaces or shell metacharacters, generated commands keep inputs, plugin path, and outputs as literal arguments.
- Successful processes report result locations without claiming precision success; infrastructure errors fail the action.
- The ST action is absent outside standard-custom context, and cancellation prevents subsequent CSV launches.

## Spec Change Log

## Design Notes

Upstream has no tags, so the observed official SHA is pinned. Import `ops-test-kit` from source; install requirements into a sibling managed directory and prepend both to `PYTHONPATH`. Use `tests/assets` as `--plugin` when present, otherwise `tests`; fail if neither exists.

## Verification

**Commands:**
- `pnpm --dir plugin test -- --runInBand <six focused suites>` -- 6 suites and 47 ST/queue tests pass.
- `pnpm run type-check`, `pnpm run compile:plugin`, scoped ESLint, and `git diff --check` -- pass.
- `pnpm --dir plugin test -- --runInBand` -- 69 suites pass, 2 skip, and 3 baseline suites fail with the same 7 failures reproduced on clean `QA`.

## Suggested Review Order

**Entry point and UX**

- Native command enforces one operator, resolves its workspace, and selects modes.
  [`extension.ts:1097`](../../plugin/src/extension.ts#L1097)

- Tree state exposes ST only for a ready standard-custom selection.
  [`operate-tree-provider.ts:1515`](../../plugin/src/class/operate-tree-provider.ts#L1515)

**Provisioning boundary**

- One shared discovery path prefers system, validated cache, then pinned provisioning.
  [`ttk-installer.service.ts:113`](../../plugin/src/service/ttk-installer.service.ts#L113)

- Host-safe filesystem locking serializes provisioners and rechecks cache ownership.
  [`ttk-installer.service.ts:667`](../../plugin/src/service/ttk-installer.service.ts#L667)

- Atomic staging pins source and installs dependencies outside global site-packages.
  [`ttk-installer.service.ts:380`](../../plugin/src/service/ttk-installer.service.ts#L380)

**Execution and artifacts**

- Service preflights every mode, runs CSVs sequentially, and reports truthful outputs.
  [`st-test-service.ts:95`](../../plugin/src/service/st-test-service.ts#L95)

- Shell-safe command construction preserves CANN environment and managed Python paths.
  [`st-test-command.ts:36`](../../plugin/src/domain/services/st-test-command.ts#L36)

- UUID runs and bounded hashed names prevent stale-result collisions.
  [`st-test-paths.ts:80`](../../plugin/src/domain/utils/st-test-paths.ts#L80)

**Queue and cancellation**

- Dedicated global ST scope prevents executor overlap after selection changes.
  [`operator-action-queue.ts:52`](../../plugin/src/helpers/operator-action-queue.ts#L52)

- Dispatch merges global ST status while preserving local scopes for other actions.
  [`task-method-dispatch.ts:206`](../../plugin/src/helpers/task-method-dispatch.ts#L206)

- Executor ownership makes Stop cancellation safe without clearing a newer task.
  [`task-controller.ts:412`](../../plugin/src/controller/task-controller.ts#L412)

**Evidence and integration**

- Installer regressions cover cache integrity, waiter isolation, and cross-instance locking.
  [`ttk-installer.service.spec.ts:321`](../../plugin/src/__tests__/unit/ttk-installer.service.spec.ts#L321)

- Orchestration regressions cover ordering, raw output, collisions, and containment.
  [`st-test-service.spec.ts:94`](../../plugin/src/__tests__/unit/st-test-service.spec.ts#L94)

- Queue regression proves changed selections cannot overlap ST runs.
  [`operator-action-queue.spec.ts:60`](../../plugin/src/__tests__/unit/operator-action-queue.spec.ts#L60)

- Manifest contribution registers the native ST command without a webview.
  [`package.json:844`](../../package.json#L844)

- Operator-tree documentation records discovery, results, and global ST scope.
  [`operator-treeview.md:109`](../../docs/operator-treeview.md#L109)
