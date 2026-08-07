import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  buildStTestResultReport,
  type CompletedStTestArtifact,
} from '@plugin/domain/services/st-test-result-parser';
import {
  buildHistoricalStTestReport,
  createStTestRunHistoryRecord,
  loadStTestRunHistory,
  loadStTestRunHistoryFromWorkspace,
  MAX_ST_TEST_HISTORY_RUNS,
  persistStTestRunHistoryRecord,
  ST_TEST_RUN_MANIFEST_FILE,
} from '@plugin/domain/services/st-test-run-history';

const HEADER = 'testcase_name,dyn_precision,cst_precision,bin_precision,precision_status';

describe('ST test run history', () => {
  let workspaceRoot: string;
  let historyDirectory: string;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-st-history-'));
    historyDirectory = path.join(workspaceRoot, '.vscode', 'st-results');
    fs.mkdirSync(historyDirectory, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, {
      recursive: true,
      force: true,
    });
  });

  function createRun(
    runId: string,
    completedAt: string,
    status: 'PASS' | 'FAIL' = 'PASS',
    operatorName: string = 'add',
    layout: 'current' | 'legacy' = 'current',
  ) {
    const runHistoryDirectory = layout === 'legacy'
      ? path.join(workspaceRoot, '.vscode', 'st-results', operatorName)
      : path.join(workspaceRoot, '.vscode', 'st-results');
    const runOperatorPath = path.join(workspaceRoot, 'operators', operatorName);
    const runDirectory = path.join(runHistoryDirectory, runId);
    const inputCsvPath = path.join(runOperatorPath, 'tests', 'st', 'arch35', `ttk_kernel_${operatorName}.csv`);
    const outputCsvPath = path.join(runDirectory, 'kernel', `001-ttk_kernel_${operatorName}-result.csv`);
    const artifact: CompletedStTestArtifact = {
      artifactId: `${runId}:1`,
      sequence: 1,
      mode: 'kernel',
      inputCsvPath,
      outputCsvPath,
    };

    fs.mkdirSync(path.dirname(inputCsvPath), { recursive: true });
    fs.mkdirSync(path.dirname(outputCsvPath), { recursive: true });
    fs.writeFileSync(inputCsvPath, 'input');
    fs.writeFileSync(outputCsvPath, `${HEADER}\ncase_${runId},1,1,1,${status}\n`);

    const report = buildStTestResultReport({
      workspaceRoot,
      operatorPath: runOperatorPath,
      operatorName,
      runId,
      runDirectory,
      artifacts: [artifact],
    });
    const record = createStTestRunHistoryRecord(
      report,
      [artifact],
      runDirectory,
      completedAt,
    );

    persistStTestRunHistoryRecord(record);

    return {
      artifact,
      outputCsvPath,
      report,
      runDirectory,
    };
  }

  it('persists compact metadata, sorts runs newest-first, and reparses the selected CSV', () => {
    createRun('2026-07-20T10-00-00-run', '2026-07-20T10:00:00.000Z');
    const latest = createRun('2026-07-21T10-00-00-run', '2026-07-21T10:00:00.000Z');

    fs.writeFileSync(latest.outputCsvPath, `${HEADER}\ncase_latest,1,1,1,FAIL\n`);

    const history = loadStTestRunHistory(historyDirectory, 'add');

    expect(history.map((record) => record.runId))
      .toEqual([
        '2026-07-21T10-00-00-run',
        '2026-07-20T10-00-00-run',
      ]);
    expect(history[0].summary.failed)
      .toBe(0);

    const refreshedReport = buildHistoricalStTestReport(history[0]);

    expect(refreshedReport.outcome)
      .toBe('failed');
    expect(refreshedReport.summary.failed)
      .toBe(1);
    expect(refreshedReport.files[0].testFile)
      .toBe('tests/st/arch35/ttk_kernel_add.csv');
    expect(refreshedReport.files[0].resultFile)
      .toBe('.vscode/st-results/2026-07-21T10-00-00-run/kernel/001-ttk_kernel_add-result.csv');
  });

  it('discovers validated histories for every operator in a workspace', () => {
    createRun('add-run', '2026-07-20T10:00:00.000Z');
    createRun('multiply-run', '2026-07-21T10:00:00.000Z', 'FAIL', 'multiply');

    const history = loadStTestRunHistoryFromWorkspace(workspaceRoot);

    expect(history.map(({ record }) => ({
      operatorName: record.operatorName,
      runId: record.runId,
    })))
      .toEqual([
        {
          operatorName: 'multiply',
          runId: 'multiply-run',
        },
        {
          operatorName: 'add',
          runId: 'add-run',
        },
      ]);
    expect(history.every((entry) => entry.workspaceRoot === workspaceRoot))
      .toBe(true);
  });

  it('continues to discover legacy operator-grouped histories', () => {
    createRun('legacy-add-run', '2026-07-20T10:00:00.000Z', 'PASS', 'add', 'legacy');
    createRun('legacy-multiply-run', '2026-07-21T10:00:00.000Z', 'FAIL', 'multiply', 'legacy');

    const history = loadStTestRunHistoryFromWorkspace(workspaceRoot);

    expect(history.map(({ record }) => ({
      operatorName: record.operatorName,
      runId: record.runId,
    })))
      .toEqual([
        {
          operatorName: 'multiply',
          runId: 'legacy-multiply-run',
        },
        {
          operatorName: 'add',
          runId: 'legacy-add-run',
        },
      ]);
  });

  it('does not duplicate legacy runs already discovered by the flat scan', () => {
    createRun('duplicate-run', '2026-07-22T10:00:00.000Z');
    createRun('duplicate-run', '2026-07-21T10:00:00.000Z', 'PASS', 'add', 'legacy');
    createRun('legacy-only-run', '2026-07-20T10:00:00.000Z', 'PASS', 'add', 'legacy');

    const history = loadStTestRunHistoryFromWorkspace(workspaceRoot);

    expect(history.map(({ record }) => record.runId))
      .toEqual([
        'duplicate-run',
        'legacy-only-run',
      ]);
  });

  it('loads only the newest 50 runs after flat and legacy histories are merged', () => {
    for (let index = 0; index < MAX_ST_TEST_HISTORY_RUNS + 5; index += 1) {
      createRun(
        `flat-run-${index}`,
        new Date(Date.UTC(2026, 6, 20, 0, index))
          .toISOString(),
      );
    }

    createRun(
      'legacy-newest-run',
      new Date(Date.UTC(2026, 6, 21, 0, 0))
        .toISOString(),
      'PASS',
      'add',
      'legacy',
    );

    const workspaceHistory = loadStTestRunHistoryFromWorkspace(workspaceRoot);
    const operatorHistory = loadStTestRunHistory(historyDirectory, 'add');

    expect(workspaceHistory)
      .toHaveLength(MAX_ST_TEST_HISTORY_RUNS);
    expect(operatorHistory)
      .toHaveLength(MAX_ST_TEST_HISTORY_RUNS);
    expect(workspaceHistory[0].record.runId)
      .toBe('legacy-newest-run');
    expect(workspaceHistory.map(({ record }) => record.runId))
      .not.toContain('flat-run-0');
    expect(operatorHistory.map((record) => record.runId))
      .not.toContain('flat-run-0');
  });

  it('does not overwrite invalid manifests or load paths that escape a run directory', () => {
    const runId = '2026-07-21T11-00-00-run';
    const created = createRun(runId, '2026-07-21T11:00:00.000Z');
    const manifestPath = path.join(created.runDirectory, ST_TEST_RUN_MANIFEST_FILE);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      artifacts: Array<{ resultPath: string }>;
    };

    manifest.artifacts[0].resultPath = '..\\outside.csv';
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));

    expect(loadStTestRunHistory(historyDirectory, 'add'))
      .toEqual([]);
    expect(() => persistStTestRunHistoryRecord(createStTestRunHistoryRecord(
      created.report,
      [created.artifact],
      created.runDirectory,
    )))
      .toThrow('Refusing to overwrite an invalid ST test history manifest');
  });

  it('ignores invalid candidate directories while loading valid runs', () => {
    createRun('valid-run', '2026-07-21T11:00:00.000Z');

    for (let index = 0; index < 60; index += 1) {
      const invalidDirectory = path.join(historyDirectory, `zz-invalid-${index}`);

      fs.mkdirSync(invalidDirectory);
      fs.writeFileSync(path.join(invalidDirectory, ST_TEST_RUN_MANIFEST_FILE), '{}');
    }

    expect(loadStTestRunHistory(historyDirectory, 'add')
      .map((record) => record.runId))
      .toEqual(['valid-run']);
  });
});
