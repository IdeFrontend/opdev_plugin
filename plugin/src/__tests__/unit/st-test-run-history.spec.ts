import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Node 24 freezes the fs module namespace, so jest.spyOn(fs, ...) cannot
// redefine its members. Wrap the real module in call-countable mocks instead.
jest.mock('fs', () => {
  const actual = jest.requireActual('fs') as typeof fs;

  return {
    ...actual,
    readdirSync: jest.fn(actual.readdirSync),
  };
});

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

  it('rejects a manifest result path that escapes with Windows-style separators', () => {
    const runId = 'escape-run';

    createRun(runId, '2026-07-21T11:00:00.000Z');
    const manifestPath = path.join(historyDirectory, runId, ST_TEST_RUN_MANIFEST_FILE);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      artifacts: Array<{ resultPath: string }>;
    };

    // `..\outside.csv` is the Windows-separator escape form: on POSIX hosts a
    // backslash is a plain filename character, so the containment check must
    // normalize separators before comparing. The run must be rejected as
    // invalid on every platform.
    manifest.artifacts[0].resultPath = '..\\outside.csv';
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));

    expect(loadStTestRunHistory(historyDirectory, 'add'))
      .toEqual([]);
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

  it('returns an empty history when the history directories do not exist', () => {
    expect(loadStTestRunHistory(path.join(historyDirectory, 'missing'), 'add'))
      .toEqual([]);
    expect(loadStTestRunHistoryFromWorkspace(path.join(workspaceRoot, 'missing-workspace')))
      .toEqual([]);
  });

  it('propagates non-ENOENT directory read errors while loading an operator history', () => {
    const readdirMock = fs.readdirSync as jest.Mock;

    readdirMock.mockImplementationOnce(() => {
      throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
    });

    try {
      expect(() => loadStTestRunHistory(historyDirectory, 'add'))
        .toThrow('EACCES');
    }
    finally {
      readdirMock.mockClear();
    }
  });

  it('swallows per-operator directory read errors during the legacy scan', () => {
    createRun('legacy-scan-run', '2026-07-21T10:00:00.000Z', 'PASS', 'add', 'legacy');

    const readdirMock = fs.readdirSync as jest.Mock;
    const realReaddir = jest.requireActual<typeof fs>('fs').readdirSync;
    let callCount = 0;

    readdirMock.mockImplementation((...args: Parameters<typeof fs.readdirSync>) => {
      callCount += 1;

      if (callCount === 3) {
        throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
      }

      return realReaddir(...args);
    });

    try {
      expect(loadStTestRunHistoryFromWorkspace(workspaceRoot))
        .toEqual([]);
    }
    finally {
      readdirMock.mockClear();
    }
  });

  it('rejects a manifest whose artifact result path is absolute', () => {
    const runId = 'absolute-path-run';

    createRun(runId, '2026-07-21T10:00:00.000Z');
    const manifestPath = path.join(historyDirectory, runId, ST_TEST_RUN_MANIFEST_FILE);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      artifacts: Array<{ resultPath: string }>;
    };

    manifest.artifacts[0].resultPath = path.join(workspaceRoot, 'outside.csv');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));

    expect(loadStTestRunHistory(historyDirectory, 'add'))
      .toEqual([]);
  });

  it('rejects a manifest whose summary is not an object', () => {
    const runId = 'bad-summary-run';

    createRun(runId, '2026-07-21T10:00:00.000Z');
    const manifestPath = path.join(historyDirectory, runId, ST_TEST_RUN_MANIFEST_FILE);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      summary?: unknown;
    };

    manifest.summary = 'not-an-object';
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));

    expect(loadStTestRunHistory(historyDirectory, 'add'))
      .toEqual([]);
  });

  it('rejects a manifest whose summary has more invalid files than files', () => {
    const runId = 'invalid-over-files-run';

    createRun(runId, '2026-07-21T10:00:00.000Z');
    const manifestPath = path.join(historyDirectory, runId, ST_TEST_RUN_MANIFEST_FILE);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      summary: { files: number;
        invalidFiles: number };
    };

    manifest.summary.invalidFiles = manifest.summary.files + 1;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));

    expect(loadStTestRunHistory(historyDirectory, 'add'))
      .toEqual([]);
  });

  it('rejects a manifest with duplicate artifact ids', () => {
    const runId = 'duplicate-artifact-run';

    createRun(runId, '2026-07-21T10:00:00.000Z');
    const manifestPath = path.join(historyDirectory, runId, ST_TEST_RUN_MANIFEST_FILE);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      summary: { files: number };
      artifacts: Array<Record<string, unknown>>;
    };

    manifest.artifacts[1] = { ...manifest.artifacts[0] };
    manifest.summary.files = 2;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));

    expect(loadStTestRunHistory(historyDirectory, 'add'))
      .toEqual([]);
  });

  it('rejects a manifest file larger than 1 MiB', () => {
    const runId = 'oversized-manifest-run';

    createRun(runId, '2026-07-21T10:00:00.000Z');
    const manifestPath = path.join(historyDirectory, runId, ST_TEST_RUN_MANIFEST_FILE);

    fs.appendFileSync(manifestPath, ' '.repeat(1024 * 1024));

    expect(loadStTestRunHistory(historyDirectory, 'add'))
      .toEqual([]);
  });

  it('skips a run directory nested under an unexpected parent', () => {
    createRun('nested-run', '2026-07-21T10:00:00.000Z');

    const nestedParent = path.join(historyDirectory, 'other-parent');

    fs.mkdirSync(nestedParent, { recursive: true });
    fs.renameSync(
      path.join(historyDirectory, 'nested-run'),
      path.join(nestedParent, 'nested-run'),
    );

    expect(loadStTestRunHistory(historyDirectory, 'add'))
      .toEqual([]);
  });

  it('throws when a report lacks the file entry for an artifact', () => {
    const created = createRun('missing-file-run', '2026-07-21T10:00:00.000Z');

    expect(() => createStTestRunHistoryRecord(
      created.report,
      [
        created.artifact,
        {
          artifactId: 'missing-file-run:2',
          sequence: 2,
          mode: 'kernel',
          inputCsvPath: created.artifact.inputCsvPath,
          outputCsvPath: created.artifact.outputCsvPath,
        },
      ],
      created.runDirectory,
    ))
      .toThrow('Missing report file for ST artifact missing-file-run:2');
  });

  it('throws when the run directory does not match the record run id', () => {
    const created = createRun('mismatch-run', '2026-07-21T10:00:00.000Z');
    const record = createStTestRunHistoryRecord(
      created.report,
      [created.artifact],
      path.join(historyDirectory, 'other-name'),
    );

    expect(() => persistStTestRunHistoryRecord(record))
      .toThrow('ST history run directory does not match the report run ID');
  });

  it('throws when the record summary is inconsistent', () => {
    const created = createRun('bad-summary-record', '2026-07-21T10:00:00.000Z');
    const record = createStTestRunHistoryRecord(
      created.report,
      [created.artifact],
      created.runDirectory,
    );

    record.summary.total = 99;

    expect(() => persistStTestRunHistoryRecord(record))
      .toThrow('Invalid ST test history metadata');
  });

  it('throws when an artifact is missing from the record display', () => {
    const runId = 'missing-display-run';
    const runDirectory = path.join(historyDirectory, runId);
    const operatorPath = path.join(workspaceRoot, 'operators', 'add');
    const artifact: CompletedStTestArtifact = {
      artifactId: `${runId}:1`,
      sequence: 1,
      mode: 'kernel',
      inputCsvPath: path.join(operatorPath, 'tests', 'st', 'arch35', 'ttk_kernel_add.csv'),
      outputCsvPath: path.join(runDirectory, 'kernel', '001-ttk_kernel_add-result.csv'),
    };

    fs.mkdirSync(path.dirname(artifact.inputCsvPath), { recursive: true });
    fs.mkdirSync(path.dirname(artifact.outputCsvPath), { recursive: true });
    fs.writeFileSync(artifact.inputCsvPath, 'input');
    fs.writeFileSync(artifact.outputCsvPath, `${HEADER}\ncase_missing_display,1,1,1,PASS\n`);

    const report = buildStTestResultReport({
      workspaceRoot,
      operatorPath,
      operatorName: 'add',
      runId,
      runDirectory,
      artifacts: [artifact],
    });
    const record = createStTestRunHistoryRecord(
      report,
      [artifact],
      runDirectory,
    );

    delete record.display[artifact.artifactId];

    expect(() => persistStTestRunHistoryRecord(record))
      .toThrow(`Invalid ST history artifact ${artifact.artifactId}`);
  });

  it('throws when the serialized manifest exceeds the size limit', () => {
    const runId = 'oversized-record-run';
    const runDirectory = path.join(historyDirectory, runId);
    const longTestFile = 't'.repeat(4096);
    const longResultFile = 'r'.repeat(4096);
    const artifactCount = 150;
    const artifacts: CompletedStTestArtifact[] = [];
    const display: Record<string, { testFile: string;
      resultFile: string }> = {};

    for (let index = 0; index < artifactCount; index += 1) {
      const artifactId = `long-artifact-${String(index)}`;

      artifacts.push({
        artifactId,
        sequence: index + 1,
        mode: 'kernel',
        inputCsvPath: path.join(workspaceRoot, 'operators', 'add', 'input.csv'),
        outputCsvPath: path.join(runDirectory, 'kernel', `${artifactId}.csv`),
      });
      display[artifactId] = {
        testFile: longTestFile,
        resultFile: longResultFile,
      };
    }

    const record = createStTestRunHistoryRecord(
      {
        runId,
        operatorName: 'add',
        completedAt: '2026-07-21T10:00:00.000Z',
        runDirectory: `.vscode/st-results/${runId}`,
        outcome: 'passed',
        summary: {
          total: artifactCount,
          passed: artifactCount,
          failed: 0,
          invalid: 0,
          files: artifactCount,
          invalidFiles: 0,
        },
        files: artifacts.map((artifact) => ({
          artifactId: artifact.artifactId,
          sequence: artifact.sequence,
          mode: artifact.mode,
          testFile: longTestFile,
          resultFile: longResultFile,
          rowCount: 1,
        })),
        rows: [],
      },
      artifacts,
      runDirectory,
    );

    expect(() => persistStTestRunHistoryRecord(record))
      .toThrow('ST test history metadata exceeds the manifest size limit');
  });

  it('returns the existing record when the same run is persisted twice', () => {
    const created = createRun('twice-run', '2026-07-21T10:00:00.000Z');
    const record = createStTestRunHistoryRecord(
      created.report,
      [created.artifact],
      created.runDirectory,
    );

    const persisted = persistStTestRunHistoryRecord(record);

    expect(persisted)
      .toBeDefined();
    expect(persisted.runId)
      .toBe('twice-run');
  });
});
