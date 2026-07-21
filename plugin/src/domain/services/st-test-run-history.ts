import * as fs from 'fs';
import * as path from 'path';
import { TextDecoder } from 'util';

import {
  buildStTestResultReport,
  type CompletedStTestArtifact,
} from '@plugin/domain/services/st-test-result-parser';
import {
  isPathOutside,
  resolveStTestResultsRootDirectory,
  toSafeStTestPathSegment,
} from '@plugin/domain/utils/st-test-paths';
import type {
  StTestMode,
  StTestReportOutcome,
  StTestResultReportDto,
  StTestRunHistoryItemDto,
} from '@shared/st-test-results';

export const ST_TEST_RUN_MANIFEST_FILE = '.st-test-run.json';

export const MAX_ST_TEST_HISTORY_RUNS = 50;

const ST_TEST_RUN_MANIFEST_VERSION = 1;
const MAX_ST_TEST_RUN_MANIFEST_BYTES = 1024 * 1024;
const MAX_ST_TEST_HISTORY_ARTIFACTS = 4096;
const MAX_ST_TEST_HISTORY_PATH_LENGTH = 4096;
const NO_FOLLOW_FLAG = (fs.constants as typeof fs.constants & {
  O_NOFOLLOW?: number;
}).O_NOFOLLOW ?? 0;
const UTF8_DECODER = new TextDecoder('utf-8', {
  fatal: true,
  ignoreBOM: true,
});

type StoredStTestArtifact = {
  artifactId: string;
  sequence: number;
  mode: StTestMode;
  testFile: string;
  resultFile: string;
  resultPath: string;
};

type StTestRunManifest = {
  version: typeof ST_TEST_RUN_MANIFEST_VERSION;
  runId: string;
  operatorName: string;
  completedAt: string;
  runDirectory: string;
  outcome: StTestReportOutcome;
  summary: StTestResultReportDto['summary'];
  artifacts: StoredStTestArtifact[];
};

export type StTestRunHistoryRecord = StTestRunHistoryItemDto & {
  operatorName: string;
  runDirectory: string;
  runDirectoryLabel: string;
  artifacts: CompletedStTestArtifact[];
  display: Record<string, {
    testFile: string;
    resultFile: string;
  }>;
};

export type StTestWorkspaceRunHistoryRecord = {
  workspaceRoot: string;
  record: StTestRunHistoryRecord;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasUnsafeOperatorName(value: string): boolean {
  return [...value]
    .some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;

      return codePoint <= 0x1f
        || (codePoint >= 0x7f && codePoint <= 0x9f)
        || codePoint === 0x2028
        || codePoint === 0x2029;
    });
}

function isSafeRelativePath(value: unknown): value is string {
  if (typeof value !== 'string'
    || value.length === 0
    || value.length > MAX_ST_TEST_HISTORY_PATH_LENGTH
    || path.isAbsolute(value)) {
    return false;
  }

  const normalized = path.normalize(value);

  return normalized !== '..'
    && !normalized.startsWith(`..${path.sep}`);
}

function isMode(value: unknown): value is StTestMode {
  return value === 'kernel' || value === 'aclnn' || value === 'e2e';
}

function isOutcome(value: unknown): value is StTestReportOutcome {
  return value === 'passed' || value === 'failed' || value === 'invalid';
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0;
}

function parseSummary(value: unknown): StTestResultReportDto['summary'] | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const {
    total,
    passed,
    failed,
    invalid,
    files,
    invalidFiles,
  } = value;

  if (![
    total,
    passed,
    failed,
    invalid,
    files,
    invalidFiles,
  ].every(isNonNegativeInteger)
  || (passed as number) + (failed as number) + (invalid as number) !== total
  || invalidFiles as number > (files as number)) {
    return undefined;
  }

  return {
    total: total as number,
    passed: passed as number,
    failed: failed as number,
    invalid: invalid as number,
    files: files as number,
    invalidFiles: invalidFiles as number,
  };
}

function parseArtifact(value: unknown): StoredStTestArtifact | undefined {
  if (!isObject(value)
    || typeof value.artifactId !== 'string'
    || value.artifactId.length === 0
    || value.artifactId.length > 256
    || !isNonNegativeInteger(value.sequence)
    || value.sequence === 0
    || !isMode(value.mode)
    || !isSafeRelativePath(value.testFile)
    || !isSafeRelativePath(value.resultFile)
    || !isSafeRelativePath(value.resultPath)
    || path.extname(value.resultPath)
      .toLowerCase() !== '.csv') {
    return undefined;
  }

  return {
    artifactId: value.artifactId,
    sequence: value.sequence,
    mode: value.mode,
    testFile: value.testFile,
    resultFile: value.resultFile,
    resultPath: value.resultPath,
  };
}

function parseManifest(
  value: unknown,
  expectedRunId: string,
  expectedOperatorName?: string,
): StTestRunManifest | undefined {
  if (!isObject(value)
    || value.version !== ST_TEST_RUN_MANIFEST_VERSION
    || value.runId !== expectedRunId
    || typeof value.operatorName !== 'string'
    || value.operatorName.length === 0
    || value.operatorName.length > 256
    || hasUnsafeOperatorName(value.operatorName)
    || (expectedOperatorName !== undefined && value.operatorName !== expectedOperatorName)
    || typeof value.completedAt !== 'string'
    || !Number.isFinite(Date.parse(value.completedAt))
    || !isSafeRelativePath(value.runDirectory)
    || !isOutcome(value.outcome)
    || !Array.isArray(value.artifacts)
    || value.artifacts.length > MAX_ST_TEST_HISTORY_ARTIFACTS) {
    return undefined;
  }

  const summary = parseSummary(value.summary);
  const artifacts = value.artifacts.map(parseArtifact);

  if (!summary
    || artifacts.some((artifact) => artifact === undefined)
    || summary.files !== artifacts.length) {
    return undefined;
  }

  const validArtifacts = artifacts as StoredStTestArtifact[];
  const artifactIds = new Set(validArtifacts.map((artifact) => artifact.artifactId));
  const sequences = new Set(validArtifacts.map((artifact) => artifact.sequence));

  if (artifactIds.size !== validArtifacts.length
    || sequences.size !== validArtifacts.length) {
    return undefined;
  }

  return {
    version: ST_TEST_RUN_MANIFEST_VERSION,
    runId: value.runId,
    operatorName: value.operatorName,
    completedAt: value.completedAt,
    runDirectory: value.runDirectory,
    outcome: value.outcome,
    summary,
    artifacts: validArtifacts,
  };
}

function readManifestFile(manifestPath: string): unknown {
  const pathStat = fs.lstatSync(manifestPath);

  if (pathStat.isSymbolicLink()
    || !pathStat.isFile()
    || pathStat.size > MAX_ST_TEST_RUN_MANIFEST_BYTES) {
    throw new Error('Invalid ST test history manifest');
  }

  let descriptor: number | undefined;

  try {
    descriptor = fs.openSync(
      manifestPath,
      fs.constants.O_RDONLY | NO_FOLLOW_FLAG,
    );
    const openedStat = fs.fstatSync(descriptor);

    if (!openedStat.isFile()
      || openedStat.dev !== pathStat.dev
      || openedStat.ino !== pathStat.ino
      || openedStat.size > MAX_ST_TEST_RUN_MANIFEST_BYTES) {
      throw new Error('Invalid ST test history manifest');
    }

    const contents = fs.readFileSync(descriptor);
    const currentPathStat = fs.lstatSync(manifestPath);

    if (!currentPathStat.isFile()
      || currentPathStat.dev !== openedStat.dev
      || currentPathStat.ino !== openedStat.ino) {
      throw new Error('ST test history manifest changed while being read');
    }

    return JSON.parse(UTF8_DECODER.decode(contents)) as unknown;
  }
  finally {
    if (descriptor !== undefined) {
      fs.closeSync(descriptor);
    }
  }
}

function recordFromManifest(
  manifest: StTestRunManifest,
  runDirectory: string,
): StTestRunHistoryRecord | undefined {
  const artifacts: CompletedStTestArtifact[] = [];
  const display: StTestRunHistoryRecord['display'] = {};

  for (const artifact of manifest.artifacts) {
    const outputCsvPath = path.resolve(runDirectory, artifact.resultPath);

    if (isPathOutside(runDirectory, outputCsvPath)) {
      return undefined;
    }

    artifacts.push({
      artifactId: artifact.artifactId,
      sequence: artifact.sequence,
      mode: artifact.mode,
      inputCsvPath: path.resolve(runDirectory, artifact.testFile),
      outputCsvPath,
    });
    display[artifact.artifactId] = {
      testFile: artifact.testFile,
      resultFile: artifact.resultFile,
    };
  }

  return {
    runId: manifest.runId,
    operatorName: manifest.operatorName,
    completedAt: manifest.completedAt,
    runDirectory,
    runDirectoryLabel: manifest.runDirectory,
    outcome: manifest.outcome,
    summary: manifest.summary,
    artifacts,
    display,
  };
}

function readRecord(
  runDirectory: string,
  expectedOperatorName?: string,
): StTestRunHistoryRecord | undefined {
  const runId = path.basename(runDirectory);
  const manifestPath = path.join(runDirectory, ST_TEST_RUN_MANIFEST_FILE);

  try {
    const manifest = parseManifest(
      readManifestFile(manifestPath),
      runId,
      expectedOperatorName,
    );

    if (!manifest
      || path.basename(path.dirname(runDirectory)) !== toSafeStTestPathSegment(manifest.operatorName)) {
      return undefined;
    }

    return recordFromManifest(manifest, runDirectory);
  }
  catch {
    return undefined;
  }
}

export function createStTestRunHistoryRecord(
  report: StTestResultReportDto,
  artifacts: readonly CompletedStTestArtifact[],
  runDirectory: string,
  completedAt: string = new Date()
    .toISOString(),
): StTestRunHistoryRecord {
  const filesByArtifactId = new Map(report.files.map((file) => [
    file.artifactId,
    file,
  ]));
  const display: StTestRunHistoryRecord['display'] = {};

  for (const artifact of artifacts) {
    const file = filesByArtifactId.get(artifact.artifactId);

    if (!file) {
      throw new Error(`Missing report file for ST artifact ${artifact.artifactId}`);
    }

    display[artifact.artifactId] = {
      testFile: file.testFile,
      resultFile: file.resultFile,
    };
  }

  return {
    runId: report.runId,
    operatorName: report.operatorName,
    completedAt,
    runDirectory,
    runDirectoryLabel: report.runDirectory,
    outcome: report.outcome,
    summary: { ...report.summary },
    artifacts: [...artifacts],
    display,
  };
}

export function persistStTestRunHistoryRecord(record: StTestRunHistoryRecord): StTestRunHistoryRecord {
  if (path.basename(record.runDirectory) !== record.runId) {
    throw new Error('ST history run directory does not match the report run ID');
  }

  if (!isSafeRelativePath(record.runDirectoryLabel)
    || !Number.isFinite(Date.parse(record.completedAt))
    || !isOutcome(record.outcome)
    || !parseSummary(record.summary)
    || record.artifacts.length > MAX_ST_TEST_HISTORY_ARTIFACTS
    || record.summary.files !== record.artifacts.length) {
    throw new Error('Invalid ST test history metadata');
  }

  const existing = readRecord(record.runDirectory, record.operatorName);

  if (existing) {
    return existing;
  }

  const manifestPath = path.join(record.runDirectory, ST_TEST_RUN_MANIFEST_FILE);

  if (fs.existsSync(manifestPath)) {
    throw new Error('Refusing to overwrite an invalid ST test history manifest');
  }

  const storedArtifacts = record.artifacts.map((artifact) => {
    const artifactDisplay = record.display[artifact.artifactId];
    const resultPath = path.relative(record.runDirectory, artifact.outputCsvPath);

    if (!artifactDisplay
      || !isSafeRelativePath(artifactDisplay.testFile)
      || !isSafeRelativePath(artifactDisplay.resultFile)
      || !isSafeRelativePath(resultPath)
      || path.extname(resultPath)
        .toLowerCase() !== '.csv'
        || isPathOutside(record.runDirectory, artifact.outputCsvPath)) {
      throw new Error(`Invalid ST history artifact ${artifact.artifactId}`);
    }

    return {
      artifactId: artifact.artifactId,
      sequence: artifact.sequence,
      mode: artifact.mode,
      testFile: artifactDisplay.testFile,
      resultFile: artifactDisplay.resultFile,
      resultPath,
    } satisfies StoredStTestArtifact;
  });
  const manifest: StTestRunManifest = {
    version: ST_TEST_RUN_MANIFEST_VERSION,
    runId: record.runId,
    operatorName: record.operatorName,
    completedAt: record.completedAt,
    runDirectory: record.runDirectoryLabel,
    outcome: record.outcome,
    summary: record.summary,
    artifacts: storedArtifacts,
  };
  const serializedManifest = JSON.stringify(manifest);

  if (Buffer.byteLength(serializedManifest, 'utf8') > MAX_ST_TEST_RUN_MANIFEST_BYTES) {
    throw new Error('ST test history metadata exceeds the manifest size limit');
  }

  fs.writeFileSync(
    manifestPath,
    serializedManifest,
    {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    },
  );

  return record;
}

function loadStTestRunHistoryDirectory(
  historyDirectory: string,
  operatorName?: string,
): StTestRunHistoryRecord[] {
  let entries: fs.Dirent[];

  try {
    entries = fs.readdirSync(historyDirectory, { withFileTypes: true });
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    throw error;
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => readRecord(path.join(historyDirectory, entry.name), operatorName))
    .filter((record): record is StTestRunHistoryRecord => record !== undefined)
    .sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt)
      || right.runId.localeCompare(left.runId, 'en'))
    .slice(0, MAX_ST_TEST_HISTORY_RUNS);
}

export function loadStTestRunHistory(
  historyDirectory: string,
  operatorName: string,
): StTestRunHistoryRecord[] {
  return loadStTestRunHistoryDirectory(historyDirectory, operatorName);
}

export function loadStTestRunHistoryFromWorkspace(workspaceRoot: string): StTestWorkspaceRunHistoryRecord[] {
  const resultsRoot = resolveStTestResultsRootDirectory(workspaceRoot);
  let operatorEntries: fs.Dirent[];

  try {
    operatorEntries = fs.readdirSync(resultsRoot, { withFileTypes: true });
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    throw error;
  }

  return operatorEntries
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      try {
        return loadStTestRunHistoryDirectory(path.join(resultsRoot, entry.name))
          .map((record) => ({
            workspaceRoot,
            record,
          }));
      }
      catch {
        return [];
      }
    })
    .sort((left, right) => Date.parse(right.record.completedAt) - Date.parse(left.record.completedAt)
      || right.record.runId.localeCompare(left.record.runId, 'en'));
}

export function buildHistoricalStTestReport(record: StTestRunHistoryRecord): StTestResultReportDto {
  return buildStTestResultReport({
    workspaceRoot: path.dirname(record.runDirectory),
    operatorPath: record.runDirectory,
    operatorName: record.operatorName,
    runId: record.runId,
    runDirectory: record.runDirectory,
    artifacts: record.artifacts,
    display: {
      runDirectory: record.runDirectoryLabel,
      artifacts: record.display,
    },
  });
}
