---
title: 'GC-45 Basic ST results webview'
type: 'feature'
created: '2026-07-17'
status: 'done'
baseline_commit: '0778828e9f31bd07fde8545f7506cacfac635e28'
review_loop_iteration: 0
context:
  - '_bmad-output/project-context.md'
  - '_bmad-output/specs/spec-gc-45-st-results-webview/SPEC.md'
  - '_bmad-output/specs/spec-gc-45-st-results-webview/implementation.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** TTK ST runs produce authoritative CSV artifacts, but users must inspect them manually and cannot see an aggregate PASS/FAIL result or which testcase failed.

**Approach:** Parse every result CSV after a completed run and automatically show one latest-run webview containing a summary and a provenance-preserving testcase table.

## Boundaries & Constraints

**Always:** Preserve the existing TTK provisioning, command execution, queue/cancellation, unique outputs, relative-path notification, and `Open File` fallback. Carry `{sequence, mode, inputCsvPath, outputCsvPath}` from the actual execution plan. Parse strict UTF-8 CSV in the extension host with BOM, quoted delimiters/newlines, escaped quotes, reordered headers, and extra columns. Require `testcase_name`, `dyn_precision`, `cst_precision`, `bin_precision`, and `precision_status`; recognize only trimmed case-insensitive PASS/FAIL. Keep absolute paths private, send structured DTOs with relative labels and artifact IDs, use bundled assets, theme/high-contrast support, EN/ZH localization, and a restrictive CSP. Limit each file to 16 MiB and the aggregate to 20,000 rows.

**Ask First:** Change the limits, TTK behavior/version, supported project types, process-failure/ cancellation partial-report UX, or expand this slice into testcase selection, run history, comparison, export, or rerun controls.

**Never:** Infer mode from filenames, parse CSV with line/delimiter splitting, use testcase names as unique row keys, expose arbitrary-path opening, load CDN/network assets, silently truncate, treat unknown/malformed evidence as success, or claim this slice fully closes GC-45.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Valid aggregate | One or many kernel/ACLNN/E2E result files | One ordered report; mode and test-file columns match the plan | N/A |
| Precision failure | Any row has `precision_status=FAIL` | Failed count increments and overall outcome is `failed` | Preserve raw CSV action |
| Invalid evidence | Unknown status, malformed CSV, missing/duplicate header, invalid row, empty result, or invalid UTF-8 | Valid sibling files remain visible; overall outcome is `invalid` | Show localized file/row evidence and raw CSV action |
| Safety bound | File exceeds 16 MiB or aggregate exceeds 20,000 rows | No silent truncation; overall outcome is `invalid` | Explain the limit and keep raw artifact accessible |
| Panel/open failure | Panel cannot render or webview sends an unknown artifact ID | Successful TTK execution and existing notification remain truthful | Log/report presentation error; reject unauthorized open |

</frozen-after-approval>

## Code Map

- `shared/{st-test-results.ts,connector.ts}` -- typed report/actions and ready-aware channel.
- `plugin/src/domain/services/st-test-result-parser.ts` -- bounded reader, CSV state machine, mapping, and aggregation.
- `plugin/src/service/st-test-service.ts` -- preserve completed artifact provenance and build the report.
- `plugin/src/class/st-test-results-panel.ts` -- latest-panel lifecycle, CSP/theme, connector, and artifact allow-list.
- `plugin/src/controller/task-controller.ts` -- best-effort presentation while retaining completion fallback.
- `web/src/views/panels/st-test-results/*` -- Vue/Ant summary, errors, filters, table, and open action.
- `shared/i18n/{en.ts,zh-cn.ts}` and `docs/operator-treeview.md` -- localized UX and behavior documentation.
- `plugin/src/__tests__/unit/*st-test*` -- parser, service, panel, and completion regressions.

## Tasks & Acceptance

**Execution:**
- [x] `shared/{st-test-results.ts,connector.ts}` -- add DTO/action/channel contracts and single-source `StTestMode`.
- [x] `plugin/src/domain/services/st-test-result-parser.ts` -- add strict bounded ingestion, composite IDs, counters, and outcome precedence with focused tests.
- [x] `plugin/src/service/st-test-service.ts` -- preserve artifact provenance and return the report without breaking `outputPaths`; update service tests.
- [x] `plugin/src/class/st-test-results-panel.ts` -- add ready-queued updates, path revalidation, safe disposal, CSP, and panel tests.
- [x] `web/src/views/panels/st-test-results/*`, `shared/i18n/{en.ts,zh-cn.ts}` -- build the themed localized summary, errors, filters, paginated table, and accessible badges.
- [x] `plugin/src/controller/task-controller.ts`, `docs/operator-treeview.md` -- wire best-effort presentation, preserve fallback, document, compile/package, and inspect assets.

**Acceptance Criteria:**
- Given a successful multi-mode run, when results are parsed, then one panel shows every row in execution order with correct mode/file provenance and exact counters.
- Given any invalid evidence, when aggregation completes, then overall PASS is impossible while valid sibling results and raw artifacts remain inspectable.
- Given a repeated run, when the panel already exists, then it replaces the report and artifact allow-list instead of accumulating stale state.
- Given an `Open CSV` request, when its artifact ID is current and its file remains a safe regular result, then VS Code opens it; otherwise the request is rejected.
- Given panel initialization failure, when TTK has completed, then execution remains completed and the accepted relative-path notification still works.

## Spec Change Log

## Design Notes

Use a dedicated panel and connector instead of reviving the historical implementation or reusing the generic CSV editor. The historical parser used `split`, leaked absolute paths, stored report history, lacked mode/file columns, and used non-unique testcase row keys. A dedicated panel can own the current report and private artifact allow-list without a stale global store.

Structurally malformed files contribute no rows. Structurally valid rows with missing required values contribute invalid rows. Overall status precedence is `invalid`, then `failed`, then `passed`; PASS requires at least one row and every artifact/row to be valid and passing.

## Verification

**Commands:**
- `pnpm --dir plugin test -- --runInBand <focused ST result suites>` -- parser, provenance, outcomes, lifecycle, and open authorization pass.
- `pnpm run lint` -- oxlint and ESLint pass.
- `pnpm run type-check` -- extension/shared TypeScript and Vue contracts pass.
- `pnpm run compile` -- plugin and discovered webview entry build.
- `pnpm run verify` -- compile and plugin Jest regression suite pass, aside from explicitly reproduced baseline failures.
- `vsce ls --no-dependencies` or packaged VSIX inspection -- ST results HTML/assets are included.

**Manual checks:**
- Remote SSH/A2: all-PASS kernel, mixed PASS/FAIL, multi-file, combined modes, malformed output, filters/pagination/Open CSV, and light/dark/high-contrast themes.

## Suggested Review Order

**Workflow integration**

- Controller preserves completion fallback, then opens visualization best-effort.
  [`task-controller.ts:414`](../../plugin/src/controller/task-controller.ts#L414)

- Service carries execution-plan provenance into one aggregate report.
  [`st-test-service.ts:107`](../../plugin/src/service/st-test-service.ts#L107)

**Parsing and trust boundaries**

- Aggregator enforces outcome precedence and ordered multi-file evidence.
  [`st-test-result-parser.ts:522`](../../plugin/src/domain/services/st-test-result-parser.ts#L522)

- Bounded reader validates identity, containment, size, and strict UTF-8.
  [`st-test-result-parser.ts:330`](../../plugin/src/domain/services/st-test-result-parser.ts#L330)

**Panel lifecycle and delivery**

- Panel serializes initialization and atomically replaces report plus allow-list.
  [`st-test-results-panel.ts:78`](../../plugin/src/class/st-test-results-panel.ts#L78)

- Connector retains latest DTO across Webview readiness and reloads.
  [`connector.ts:54`](../../plugin/src/core/connector.ts#L54)

**Contracts and UI**

- Shared DTO exposes relative labels, outcomes, and opaque artifact IDs.
  [`st-test-results.ts:58`](../../shared/st-test-results.ts#L58)

- Thin view composes summary, evidence alerts, and result table.
  [`st-test-results-view.vue:17`](../../web/src/views/panels/st-test-results/components/st-test-results-view.vue#L17)

- Table resets filters and labels invalid CSV evidence truthfully.
  [`results-table.vue:61`](../../web/src/views/panels/st-test-results/components/results-table.vue#L61)

- File alerts localize diagnostics and emit allow-listed open actions.
  [`results-files.vue:30`](../../web/src/views/panels/st-test-results/components/results-files.vue#L30)

- Provider selects Ant locale while preserving VS Code theme tokens.
  [`app.vue:15`](../../web/src/views/panels/st-test-results/app.vue#L15)

**Verification and documentation**

- Parser tests cover strict CSV, confusables, limits, and sibling preservation.
  [`st-test-result-parser.spec.ts:99`](../../plugin/src/__tests__/unit/st-test-result-parser.spec.ts#L99)

- Panel tests lock concurrent initialization and latest allow-list behavior.
  [`st-test-results-panel.spec.ts:316`](../../plugin/src/__tests__/unit/st-test-results-panel.spec.ts#L316)

- Connector tests lock replay after reload and failed delivery.
  [`webview-connector.spec.ts:84`](../../plugin/src/__tests__/unit/webview-connector.spec.ts#L84)

- Operator workflow documentation records visualization scope and fallback.
  [`operator-treeview.md:117`](../../docs/operator-treeview.md#L117)
