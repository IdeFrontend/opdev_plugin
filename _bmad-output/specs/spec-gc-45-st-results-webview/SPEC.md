---
id: SPEC-gc-45-st-results-webview
companions:
  - implementation.md
  - architecture-diagrams.md
  - ../../project-context.md
  - ../../implementation-artifacts/spec-gc-45-basic-ttk.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for this implementation slice. The completed basic TTK runner remains the execution baseline.

# GC-45 Basic ST Results Webview

## Why

The managed TTK runner produces authoritative CSV artifacts but leaves users to inspect them manually. GitCode issue 45 requires the IDE to interpret testcase precision outcomes, summarize whether the run passed, and identify failed testcases. This slice adds that minimum result experience without expanding into the issue's full test-selection UX.

## Capabilities

- **CAP-1**
  - **intent:** The product ingests every result CSV produced by a completed ST run into one typed report.
  - **success:** Valid files yield rows containing `testcase_name`, `dyn_precision`, `cst_precision`, `bin_precision`, and `precision_status`; malformed or incomplete files remain inspectable and make the report non-passing.

- **CAP-2**
  - **intent:** The user sees an in-IDE summary and table of testcase precision outcomes.
  - **success:** The results panel shows total, passed, failed, and invalid counts plus `Mode`, `Test file`, `Testcase`, `Dyn precision`, `CST precision`, `Bin precision`, and `Status` columns, with failed and invalid evidence distinguishable without color alone.

- **CAP-3**
  - **intent:** Results from multiple modes and CSV inputs are combined without losing their provenance.
  - **success:** Every row carries the mode from the executed plan and the relative source CSV path; duplicate testcase names from different files remain separate rows in deterministic execution order.

- **CAP-4**
  - **intent:** The user can inspect the raw result artifact behind the visualization.
  - **success:** An `Open CSV` action sends only an artifact ID, and the extension opens the exact allow-listed output file associated with that ID.

## Constraints

- Preserve the completed TTK discovery, provisioning, sequential execution, cancellation, unique-output, and completion-notification behavior. Mode provenance must come from the execution plan, never filename inference.
- Read files and interpret CSV in the extension host. The webview receives only structured-cloneable report DTOs, relative display paths, and opaque artifact IDs; it never receives authority to open arbitrary paths.
- Accept strict UTF-8 CSV with a BOM, LF or CRLF, quoted delimiters, escaped quotes, embedded newlines, reordered required headers, and extra columns. Missing or duplicate required headers, invalid UTF-8, unreadable or empty output, missing testcase/status values, ragged required fields, or an unknown status are invalid evidence.
- Bound ingestion to 16 MiB per result file and 20,000 aggregate testcase rows. Exceeding either limit makes the report invalid and preserves raw CSV access; it must never silently truncate a report and claim success.
- Normalize `precision_status` after trimming and case-folding. Only `PASS` and `FAIL` are recognized. Overall status precedence is `invalid`, then `failed`, then `passed`; `passed` requires at least one row, every artifact valid, and every row `PASS`.
- Combine every completed artifact into one latest-run panel. Re-running replaces the in-memory report and artifact allow-list rather than accumulating history.
- Use bundled local assets only, a restrictive webview CSP, Vue-safe escaped rendering, validated message actions, VS Code light/dark/high-contrast themes, and English and Chinese localization.
- This slice does not by itself close GC-45; process failure or cancellation during a multi-file sequence continues to use the existing error/partial-artifact path.

## Non-goals

- Selecting individual testcase rows before execution or reproducing the IntelliJ test tree.
- Persisted run history, restoration after extension restart, cross-run comparison, export formats, rerun controls, or telemetry.
- Changing TTK versioning, provisioning, command construction, user-defined parameters, older-CANN retry policy, or supported operator/project types.

## Success signal

On a real standard-custom operator, a successful multi-mode TTK process sequence automatically opens one themed results panel. The panel shows every testcase with its `kernel`, `aclnn`, or `e2e` provenance, reports the exact PASS/FAIL/invalid totals, identifies failed cases, and opens each underlying CSV while never presenting malformed or unknown evidence as a passing run.

## Assumptions

- TTK writes status values equivalent to `PASS` or `FAIL`; any other non-empty value is displayed verbatim but classified as invalid for this MVP.
