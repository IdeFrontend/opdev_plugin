# Implementation Contract

## Scope and baseline

Implement result ingestion and visualization on top of `_bmad-output/implementation-artifacts/spec-gc-45-basic-ttk.md`. Do not rewrite TTK acquisition or command execution. The current runner already owns deterministic plans containing `mode`, `inputCsvPath`, and `outputCsvPath`; preserve that provenance through its return value instead of reconstructing it from filenames.

Authoritative requirement sources:

- [GitCode issue 45](https://gitcode.com/opdevtools/plugin_release/issues/45), step 3 and its discussion.
- `_bmad-output/planning-artifacts/prds/prd-mstt-2026-07-14/prd.md`, especially FR-23 and FR-26.
- The issue screenshot, which confirms the five minimum CSV fields and `PASS`/`FAIL` values.

## Data contracts

Keep absolute filesystem paths in extension-only types. Put the DTOs shared with the webview in `shared/st-test-results.ts`.

```ts
export type StTestMode = 'kernel' | 'aclnn' | 'e2e';
export type StTestRowOutcome = 'pass' | 'fail' | 'invalid';
export type StTestReportOutcome = 'passed' | 'failed' | 'invalid';
export type StTestResultErrorCode =
  | 'file_unreadable'
  | 'file_too_large'
  | 'invalid_utf8'
  | 'malformed_csv'
  | 'missing_header'
  | 'duplicate_header'
  | 'empty_result'
  | 'invalid_row'
  | 'row_limit_exceeded';

export interface StTestResultRowDto {
  id: string;                 // artifactId + source row index
  artifactId: string;
  mode: StTestMode;
  testFile: string;           // operator-relative display path
  testcaseName: string;
  dynPrecision: string;
  cstPrecision: string;
  binPrecision: string;
  precisionStatus: string;    // normalized display value or raw unknown value
  outcome: StTestRowOutcome;
}

export interface StTestResultFileDto {
  artifactId: string;
  sequence: number;
  mode: StTestMode;
  testFile: string;
  resultFile: string;         // workspace-relative display path
  rowCount: number;
  error?: {
    code: StTestResultErrorCode;
    detail?: string;          // safe field/row detail, never an absolute path
  };
}

export interface StTestResultReportDto {
  runId: string;
  operatorName: string;
  runDirectory: string;       // workspace-relative display path
  outcome: StTestReportOutcome;
  summary: {
    total: number;
    passed: number;
    failed: number;
    invalid: number;
    files: number;
    invalidFiles: number;
  };
  files: StTestResultFileDto[];
  rows: StTestResultRowDto[];
}
```

Extend the extension-only execution result with completed artifacts:

```ts
interface CompletedStTestArtifact {
  artifactId: string;
  sequence: number;
  mode: StTestMode;
  inputCsvPath: string;       // absolute, extension-private
  outputCsvPath: string;      // absolute, extension-private
}
```

Retain `outputPaths` in `StTestExecutionResult` for the accepted completion notification and derive it from completed artifacts. Add `artifacts` and `report` rather than replacing the existing field abruptly.

## Result ingestion

Add `plugin/src/domain/services/st-test-result-parser.ts` with a pure report builder around a narrowly isolated file reader.

For each completed artifact, in execution-plan order:

1. Open the result without following symbolic links, confirm it remains a regular file under the run directory, and reject a file larger than 16 MiB before decoding it.
2. Decode strict UTF-8 while accepting a leading BOM.
3. Parse CSV records with quoted commas, escaped quotes, embedded CR/LF, LF/CRLF record endings, and trailing empty fields. Do not use `split(',')` or `split('\n')`.
4. Locate the five required headers by exact trimmed name, independent of order. Extra columns are ignored. A missing or duplicate required header invalidates that file.
5. Ignore fully blank records. Preserve source order and use `artifactId:rowIndex` as the row identity; never use `testcase_name` as a unique key.
6. Require non-empty `testcase_name` and `precision_status`. Preserve precision text for display, including percentages and `INVALID` values.
7. Normalize status with `trim().toUpperCase()`: `PASS` becomes `pass`, `FAIL` becomes `fail`, and every other value becomes `invalid` while retaining its raw display text.
8. Stop before emitting more than 20,000 aggregate testcase rows. Mark the report invalid with `row_limit_exceeded`; do not silently truncate and claim completeness.
9. Convert paths to relative display values before constructing the shared DTO. Do not include `workspaceRoot`, `operatorPath`, or absolute paths in the report.

One malformed file must not hide valid sibling files. Add a stable, localizable `StTestResultFileDto.error` and make the aggregate outcome invalid. A structurally malformed CSV contributes no rows; a structurally valid row with a missing required value contributes one invalid row. A catastrophic parser implementation error follows the existing completion fallback and logs an actionable extension-host error without leaking CSV contents.

Outcome calculation is deterministic:

| Evidence | Report outcome |
| --- | --- |
| Any unreadable, malformed, empty, header-invalid, row-invalid, or unknown-status evidence | `invalid` |
| Otherwise, at least one `FAIL` | `failed` |
| Otherwise, at least one row and every row is `PASS` | `passed` |
| Zero testcase rows | `invalid` |

TTK process exit remains an infrastructure gate. A nonzero exit or cancellation never becomes a precision report success and continues through the existing error path.

## Extension flow

1. In `plugin/src/service/st-test-service.ts`, replace the internal completed-path list with completed artifact records while retaining `outputPaths` in the returned API.
2. After every requested TTK command exits successfully and its output is verified, build `StTestResultReportDto` from the completed artifacts.
3. In `plugin/src/controller/task-controller.ts`, keep `showStTestCompletionNotification(...)` as the raw-file fallback and call `StTestResultsPanel.createOrShow(context, report, artifacts)`.
4. If the results panel already exists, replace its report and artifact allow-list, reveal it, and send the new DTO. If it is closed, create it and queue the DTO until the webview signals connector readiness.
5. A panel-rendering or message failure must not turn a completed TTK run into an execution failure or suppress the relative result paths.

Use a dedicated `plugin/src/class/st-test-results-panel.ts`, not the generic CSV editor and not a generic latest-report global store. The panel owns exactly one latest report and a private `Map<artifactId, outputCsvPath>`, which prevents stale cross-workspace reports and arbitrary path-open messages.

The panel must:

- create one panel type dedicated to ST results;
- render `panels/st-test-results` through the existing HTML transformer;
- set `localResourceRoots` to packaged web assets only;
- register and dispose the existing theme bridge;
- use a ready-aware typed connector channel added to `shared/connector.ts`;
- accept only `{ type: 'openResultFile', artifactId: string }` from the webview;
- reject unknown artifact IDs and revalidate the allow-listed file before opening it with `vscode.workspace.openTextDocument`;
- clear its static current-panel reference, connector, theme subscription, and allow-list on disposal.

Apply a restrictive CSP to the generated page: `default-src 'none'`; scripts, fonts, and styles may load only from the webview resource source required by the bundled Vite entry; images may additionally use `data:` if Ant Design requires it; do not allow remote origins, `unsafe-eval`, or network requests. Permit only the minimum inline-style policy required by the existing Ant Design theme runtime.

## Webview

Create:

```text
web/src/views/panels/st-test-results/
  st-test-results.html
  main.ts
  app.vue
```

Vite discovers the HTML entry automatically. `main.ts` must initialize shared i18next resources from the supplied webview language before mounting Vue. `app.vue` must use Composition API, `useTheme()`, and `<a-config-provider :theme="themeConfig">`.

The panel layout is:

1. Header: operator name and localized overall badge (`PASSED`, `FAILED`, or `INVALID`).
2. Summary: Total, Passed, Failed, Invalid, and Result files.
3. Optional file-level alert list for invalid artifacts, each with its relative path and `Open CSV` action.
4. One paginated table, preserving execution order, with columns:

   `Mode | Test file | Testcase | Dyn precision | CST precision | Bin precision | Status`

5. In-memory mode and status filters. Default view shows all rows. Long paths and testcase names use ellipsis plus a tooltip, not destructive truncation.

Display the literal mode tokens `kernel`, `aclnn`, and `e2e`. Show PASS with success text/icon, FAIL with error text/icon, and unknown values with warning text/icon. Color is supplementary only. Render CSV text through Vue interpolation or bound text properties; never use `v-html`.

Use pagination with a default page size of 50 so a normal report does not render every DOM row at once. The 16 MiB-per-file and 20,000-row safety bounds are named constants covered by tests; reaching either limit produces a localized invalid-report explanation and preserves `Open CSV`.

## File map

New files:

- `shared/st-test-results.ts`
- `plugin/src/domain/services/st-test-result-parser.ts`
- `plugin/src/class/st-test-results-panel.ts`
- `plugin/src/__tests__/unit/st-test-result-parser.spec.ts`
- `plugin/src/__tests__/unit/st-test-results-panel.spec.ts`
- `web/src/views/panels/st-test-results/{st-test-results.html,main.ts,app.vue}`

Modified files:

- `shared/connector.ts` — typed results channel.
- `plugin/src/service/st-test-service.ts` — completed artifact provenance and report construction.
- `plugin/src/controller/task-controller.ts` — present the report while preserving completion fallback.
- `plugin/src/helpers/st-test-completion-notification.ts` — only if localized wording/actions must distinguish the visualization from raw CSV.
- `plugin/src/constants.ts` — panel type/view identifiers.
- `shared/i18n/en.ts` and `shared/i18n/zh-cn.ts` — headings, columns, statuses, errors, tooltips, and actions.
- `plugin/src/__tests__/unit/st-test-service.spec.ts` and completion/panel tests — provenance and lifecycle regression coverage.
- `docs/operator-treeview.md` — documented results behavior and MVP boundary.

No manifest command or contributed view is required because the panel opens programmatically after ST completion. No Vite configuration change is required because panel entries are scanned dynamically.

## Implementation sequence

1. Add shared DTOs and connector channel.
2. Extend ST execution results to preserve artifact provenance while keeping `outputPaths` compatibility.
3. Implement the strict reader, CSV parser, row mapper, and aggregate outcome builder with focused unit tests.
4. Add the dedicated panel lifecycle, ready-aware report delivery, artifact-ID open action, CSP, and panel unit tests.
5. Add the Vue entry, summary, table, filters, theme integration, and EN/ZH strings.
6. Wire the controller to open/update the panel and retain the existing completion notification.
7. Update documentation and run build, packaging, and A2 verification.

## Automated verification

Parser/report tests must cover:

- UTF-8 BOM, LF and CRLF;
- quoted commas, escaped quotes, and embedded newlines;
- reordered and extra headers;
- missing and duplicate required headers;
- empty and header-only files;
- ragged rows and missing testcase/status values;
- PASS, FAIL, mixed, unknown, and differently cased statuses;
- malicious HTML-like cell text remaining plain data;
- one file, multiple files in one mode, and `kernel` + `aclnn` + `e2e` aggregation;
- duplicate testcase names across and within files;
- stable execution order, composite row IDs, relative paths, counters, and outcome precedence.

Service/controller/panel tests must prove:

- mode and input CSV come from the actual execution plan;
- `outputPaths` and the accepted notification remain intact;
- a new run replaces the report and allow-list in the existing panel;
- report delivery waits for webview readiness;
- unknown artifact IDs cannot open files;
- disposal releases listeners and state;
- a panel failure leaves raw artifacts accessible.

Run, in order:

```text
pnpm --dir plugin test -- --runInBand <focused ST result suites>
pnpm run lint
pnpm run type-check
pnpm run compile
pnpm run verify
```

The repository has no automated Vue/webview E2E framework, so do not claim UI automation coverage. Perform focused manual verification in Extension Host and Remote SSH on the supported A2 environment:

- one all-PASS kernel CSV;
- one CSV containing FAIL;
- multiple CSVs in one mode;
- combined kernel, ACLNN, and E2E inputs;
- an unknown status and a malformed/missing required column;
- mode/status filters, pagination, long names, and `Open CSV`;
- light, dark, and high-contrast themes;
- restricted network with no remote webview requests.

Finally build/package the extension and inspect the VSIX to confirm the new `out/web/src/views/panels/st-test-results` entry and assets are present under the repository's deny-all packaging allowlists.

## Deferred work

- Showing completed partial results when a later TTK process fails or the sequence is cancelled.
- Selecting individual CSV inputs or testcase rows from the results panel.
- Persisting, comparing, exporting, or rerunning historical reports.
- Full IntelliJ-style test tree and complete GC-45 acceptance across every promised hardware/CANN cell.
