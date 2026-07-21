import {
  createHash,
  randomUUID,
} from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { TextDecoder } from 'util';

import { joinIdeConfigPath } from '@plugin/helpers/ide-config-dir';
import type { StTestMode } from '@shared/st-test-results';

export const ST_TEST_ARCH_DIR = 'arch35';

const MAX_ST_TEST_DIRECTORY_SEGMENT_LENGTH = 80;
const MAX_ST_TEST_RESULT_FILE_NAME_LENGTH = 120;
const HASH_SUFFIX_LENGTH = 12;
const PYTHON_LEADING_WHITESPACE = /^[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/u;
const PYTHON_TRAILING_WHITESPACE = /[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/u;
const NO_FOLLOW_FLAG = (fs.constants as typeof fs.constants & {
  O_NOFOLLOW?: number;
}).O_NOFOLLOW ?? 0;
const UTF8_DECODER = new TextDecoder('utf-8', {
  fatal: true,
  ignoreBOM: true,
});

export function resolveStTestInputDir(operatorPath: string): string {
  return path.join(operatorPath, 'tests', 'st', ST_TEST_ARCH_DIR);
}

export type StTestInputCsvFilesByMode = Record<StTestMode, string[]>;

function stripLikePython(value: string): string {
  return value
    .replace(PYTHON_LEADING_WHITESPACE, '')
    .replace(PYTHON_TRAILING_WHITESPACE, '');
}

function visitCsvRows(
  text: string,
  visitor: (row: string[])=> boolean,
): void {
  let row: string[] = [];
  let field = '';
  let fieldStarted = false;
  let inQuotes = false;
  let recordStarted = false;

  const appendField = (): void => {
    row.push(stripLikePython(field));
    field = '';
    fieldStarted = false;
  };
  const appendRow = (): boolean => {
    appendField();
    const shouldContinue = visitor(row);

    row = [];
    recordStarted = false;

    return shouldContinue;
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        }
        else {
          inQuotes = false;
        }
      }
      else {
        field += character;
      }

      continue;
    }

    if (character === '"') {
      if (fieldStarted) {
        field += character;
      }
      else {
        inQuotes = true;
        fieldStarted = true;
      }

      recordStarted = true;
    }
    else if (character === ',') {
      appendField();
      recordStarted = true;
    }
    else if (character === '\r' || character === '\n') {
      if (recordStarted && !appendRow()) {
        return;
      }

      if (character === '\r' && text[index + 1] === '\n') {
        index += 1;
      }
    }
    else {
      field += character;
      fieldStarted = true;
      recordStarted = true;
    }
  }

  if (recordStarted) {
    appendRow();
  }
}

export function classifyStTestInputCsv(
  text: string,
  inputCsvPath: string,
): StTestMode {
  let headerFound = false;
  let apiNameIndex = -1;
  let detectedMode: StTestMode | undefined;

  visitCsvRows(text, (row) => {
    if (!headerFound) {
      headerFound = true;
      apiNameIndex = row.indexOf('api_name');

      if (apiNameIndex === -1) {
        detectedMode = 'kernel';

        return false;
      }

      return true;
    }

    const apiName = row[apiNameIndex] ?? '';

    if (apiName.length > 0) {
      detectedMode = apiName.toLowerCase()
        .startsWith('aclnn')
        ? 'aclnn'
        : 'e2e';

      return false;
    }

    return true;
  });

  if (!headerFound) {
    throw new Error(`ST CSV file is empty: ${inputCsvPath}`);
  }

  return detectedMode ?? 'aclnn';
}

function readRegularStTestInputCsv(inputCsvPath: string): string {
  let descriptor: number;

  try {
    descriptor = fs.openSync(
      inputCsvPath,
      fs.constants.O_RDONLY | NO_FOLLOW_FLAG,
    );
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') {
      throw new Error(`ST CSV input must not be a symbolic link: ${inputCsvPath}`);
    }

    throw error;
  }

  try {
    const openedStat = fs.fstatSync(descriptor);
    const pathStat = fs.lstatSync(inputCsvPath);

    if (!openedStat.isFile()
      || !pathStat.isFile()
      || openedStat.dev !== pathStat.dev
      || openedStat.ino !== pathStat.ino) {
      throw new Error(`ST CSV input changed or is not a regular file: ${inputCsvPath}`);
    }

    const contents = fs.readFileSync(descriptor);
    const currentPathStat = fs.lstatSync(inputCsvPath);

    if (!currentPathStat.isFile()
      || openedStat.dev !== currentPathStat.dev
      || openedStat.ino !== currentPathStat.ino) {
      throw new Error(`ST CSV input changed while being read: ${inputCsvPath}`);
    }

    try {
      return UTF8_DECODER.decode(contents);
    }
    catch {
      throw new Error(`ST CSV file is not valid UTF-8: ${inputCsvPath}`);
    }
  }
  finally {
    fs.closeSync(descriptor);
  }
}

export function discoverStTestInputCsvFiles(operatorPath: string): StTestInputCsvFilesByMode {
  const inputDir = resolveStTestInputDir(operatorPath);
  const inputsByMode: StTestInputCsvFilesByMode = {
    kernel: [],
    aclnn: [],
    e2e: [],
  };
  let entries: fs.Dirent[];

  try {
    entries = fs.readdirSync(inputDir, { withFileTypes: true });
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return inputsByMode;
    }

    throw error;
  }

  const inputPaths = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith('.csv'))
    .sort((a, b) => a.localeCompare(b, 'en'))
    .map((name) => path.join(inputDir, name));

  for (const inputCsvPath of inputPaths) {
    const mode = classifyStTestInputCsv(
      readRegularStTestInputCsv(inputCsvPath),
      inputCsvPath,
    );

    inputsByMode[mode].push(inputCsvPath);
  }

  return inputsByMode;
}

export function resolveStTestPluginDir(operatorPath: string): string | undefined {
  const candidates = [
    path.join(operatorPath, 'tests', 'assets'),
    path.join(operatorPath, 'tests'),
  ];

  return candidates.find((candidate) => {
    try {
      return fs.statSync(candidate)
        .isDirectory();
    }
    catch {
      return false;
    }
  });
}

export function toSafeStTestPathSegment(
  value: string,
  maxLength: number = MAX_ST_TEST_DIRECTORY_SEGMENT_LENGTH,
): string {
  const normalized = value.trim()
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^\.+/, '_');
  const safe = normalized || '_';

  if (safe.length <= maxLength) {
    return safe;
  }

  const hash = createHash('sha256')
    .update(value)
    .digest('hex')
    .slice(0, HASH_SUFFIX_LENGTH);
  const prefixLength = Math.max(1, maxLength - hash.length - 1);

  return `${safe.slice(0, prefixLength)}-${hash}`;
}

export function createStTestRunId(
  now: number = Date.now(),
  entropy: string = randomUUID(),
): string {
  const timestamp = new Date(now)
    .toISOString()
    .replace(/[:.]/g, '-');

  return toSafeStTestPathSegment(`${timestamp}-${entropy}`);
}

export function resolveStTestResultsRootDirectory(workspaceRoot: string): string {
  return joinIdeConfigPath(workspaceRoot, 'st-results');
}

export function resolveStTestOperatorHistoryDirectory(
  workspaceRoot: string,
  operatorName: string,
): string {
  return path.join(
    resolveStTestResultsRootDirectory(workspaceRoot),
    toSafeStTestPathSegment(operatorName),
  );
}

export function resolveStTestRunDirectory(params: {
  workspaceRoot: string;
  operatorName: string;
  runId: string;
}): string {
  return path.join(
    resolveStTestOperatorHistoryDirectory(params.workspaceRoot, params.operatorName),
    toSafeStTestPathSegment(params.runId),
  );
}

export function resolveStTestOutputCsvPath(params: {
  workspaceRoot: string;
  operatorName: string;
  mode: StTestMode;
  inputCsvPath: string;
  runId: string;
  sequence: number;
}): string {
  const stem = path.basename(params.inputCsvPath, path.extname(params.inputCsvPath));
  const sequence = String(params.sequence)
    .padStart(3, '0');
  const resultSuffix = '-result.csv';
  const maxStemLength = MAX_ST_TEST_RESULT_FILE_NAME_LENGTH
    - sequence.length
    - 1
    - resultSuffix.length;
  const fileName = `${sequence}-${toSafeStTestPathSegment(stem, maxStemLength)}${resultSuffix}`;

  return path.join(
    resolveStTestRunDirectory(params),
    params.mode,
    fileName,
  );
}

export function ensureStTestOutputDirectory(outputCsvPath: string): void {
  fs.mkdirSync(path.dirname(outputCsvPath), { recursive: true });
}

export function isPathOutside(basePath: string, targetPath: string): boolean {
  const relative = path.relative(path.resolve(basePath), path.resolve(targetPath));

  return path.isAbsolute(relative)
    || relative === '..'
    || relative.startsWith(`..${path.sep}`);
}

export function validateStTestOperatorDirectory(
  workspaceRoot: string,
  operatorPath: string,
): void {
  const workspace = path.resolve(workspaceRoot);
  const operator = path.resolve(operatorPath);

  if (isPathOutside(workspace, operator)) {
    throw new Error(`Selected operator is outside the current workspace: ${operator}`);
  }

  let operatorStat: fs.Stats;

  try {
    operatorStat = fs.statSync(operator);
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Selected operator directory does not exist: ${operator}`);
    }

    throw error;
  }

  if (!operatorStat.isDirectory()) {
    throw new Error(`Selected operator directory does not exist: ${operator}`);
  }

  const workspaceRealPath = fs.realpathSync(workspace);
  const operatorRealPath = fs.realpathSync(operator);

  if (isPathOutside(workspaceRealPath, operatorRealPath)) {
    throw new Error(`Selected operator resolves outside the current workspace: ${operator}`);
  }
}
