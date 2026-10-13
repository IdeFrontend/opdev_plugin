/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import * as fs from 'fs';
import * as path from 'path';

import {
  isPathOutside,
  toDisplayPath,
} from '@plugin/domain/utils/st-test-paths';
import type {
  StTestMode,
  StTestResultErrorCode,
  StTestResultFileDto,
  StTestResultReportDto,
  StTestResultRowDto,
} from '@shared/st-test-results';

export const MAX_ST_TEST_RESULT_FILE_BYTES = 16 * 1024 * 1024;

export const MAX_ST_TEST_RESULT_ROWS = 20_000;

const NO_FOLLOW_FLAG = (fs.constants as typeof fs.constants & {
  O_NOFOLLOW?: number;
}).O_NOFOLLOW ?? 0;

const REQUIRED_HEADERS = [
  'testcase_name',
  'dyn_precision',
  'cst_precision',
  'bin_precision',
  'precision_status',
] as const;

type RequiredHeader = typeof REQUIRED_HEADERS[number];

export interface CompletedStTestArtifact {
  artifactId: string;
  sequence: number;
  mode: StTestMode;
  inputCsvPath: string;
  outputCsvPath: string;
}

export interface BuildStTestResultReportParams {
  workspaceRoot: string;
  operatorPath: string;
  operatorName: string;
  runId: string;
  runDirectory: string;
  artifacts: readonly CompletedStTestArtifact[];
  display?: {
    runDirectory: string;
    artifacts: Readonly<Record<string, {
      testFile: string;
      resultFile: string;
    }>>;
  };
}

type CsvRecord = {
  fields: string[];
  sourceIndex: number;
};

class StTestResultParseError extends Error {
  constructor(
    public readonly code: StTestResultErrorCode,
    public readonly safeDetail?: string,
  ) {
    super(code);
  }
}

function isBlankRecord(record: CsvRecord): boolean {
  return record.fields.every((field) => field.trim() === '');
}

function pushRecord(
  records: CsvRecord[],
  fields: string[],
  field: string,
  sourceIndex: number,
  maxDataRows: number,
): void {
  const record = {
    fields: [
      ...fields,
      field,
    ],
    sourceIndex,
  };

  if (isBlankRecord(record)) {
    return;
  }

  // The first non-blank record is the header. Refuse the next data record as
  // soon as it would exceed the remaining aggregate budget; never truncate.
  if (records.length >= maxDataRows + 1) {
    throw new StTestResultParseError(
      'row_limit_exceeded',
      String(MAX_ST_TEST_RESULT_ROWS),
    );
  }

  records.push(record);
}

export function parseStTestCsv(
  text: string,
  maxDataRows = Number.POSITIVE_INFINITY,
): CsvRecord[] {
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = '';
  let sourceIndex = 1;
  let inQuotedField = false;
  let afterQuotedField = false;
  let recordTouched = false;

  const finishRecord = (): void => {
    pushRecord(records, fields, field, sourceIndex, maxDataRows);
    fields = [];
    field = '';
    sourceIndex += 1;
    recordTouched = false;
    afterQuotedField = false;
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inQuotedField) {
      recordTouched = true;

      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        }
        else {
          inQuotedField = false;
          afterQuotedField = true;
        }
      }
      else {
        field += character;
      }

      continue;
    }

    if (afterQuotedField) {
      if (character === ',') {
        fields.push(field);
        field = '';
        afterQuotedField = false;
        recordTouched = true;

        continue;
      }

      if (character === '\r' || character === '\n') {
        if (character === '\r' && text[index + 1] === '\n') {
          index += 1;
        }

        finishRecord();

        continue;
      }

      throw new StTestResultParseError('malformed_csv', String(sourceIndex));
    }

    if (character === '"') {
      if (field.length > 0) {
        throw new StTestResultParseError('malformed_csv', String(sourceIndex));
      }

      inQuotedField = true;
      recordTouched = true;

      continue;
    }

    if (character === ',') {
      fields.push(field);
      field = '';
      recordTouched = true;

      continue;
    }

    if (character === '\r' || character === '\n') {
      if (character === '\r' && text[index + 1] === '\n') {
        index += 1;
      }

      finishRecord();

      continue;
    }

    field += character;
    recordTouched = true;
  }

  if (inQuotedField) {
    throw new StTestResultParseError('malformed_csv', String(sourceIndex));
  }

  if (recordTouched || fields.length > 0 || field.length > 0 || afterQuotedField) {
    pushRecord(records, fields, field, sourceIndex, maxDataRows);
  }

  return records;
}

function decodeStrictUtf8(buffer: Buffer): string {
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true })
      .decode(buffer);

    return decoded.startsWith('\uFEFF') ? decoded.slice(1) : decoded;
  }
  catch {
    throw new StTestResultParseError('invalid_utf8');
  }
}

function resolveRealDirectory(directoryPath: string): string {
  try {
    const entry = fs.lstatSync(directoryPath);

    if (entry.isSymbolicLink() || !entry.isDirectory()) {
      throw new StTestResultParseError('file_unreadable');
    }

    return fs.realpathSync.native(directoryPath);
  }
  catch (error) {
    if (error instanceof StTestResultParseError) {
      throw error;
    }

    throw new StTestResultParseError('file_unreadable');
  }
}

function hasSameIdentity(left: fs.Stats, right: fs.Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function validateResultPath(
  outputCsvPath: string,
  runDirectory: string,
  openedStat?: fs.Stats,
): fs.Stats {
  try {
    const pathStat = fs.lstatSync(outputCsvPath);

    if (pathStat.isSymbolicLink()
      || !pathStat.isFile()
      || (openedStat !== undefined && !hasSameIdentity(openedStat, pathStat))) {
      throw new StTestResultParseError('file_unreadable');
    }

    const realRunDirectory = resolveRealDirectory(runDirectory);
    const realOutputPath = fs.realpathSync.native(outputCsvPath);

    if (isPathOutside(realRunDirectory, realOutputPath)) {
      throw new StTestResultParseError('file_unreadable');
    }

    return pathStat;
  }
  catch (error) {
    if (error instanceof StTestResultParseError) {
      throw error;
    }

    throw new StTestResultParseError('file_unreadable');
  }
}

export function isSafeStTestResultFile(
  outputCsvPath: string,
  runDirectory: string,
): boolean {
  try {
    validateResultPath(outputCsvPath, runDirectory);

    return true;
  }
  catch {
    return false;
  }
}

function readBoundedResultFile(descriptor: number): Buffer {
  const buffer = Buffer.allocUnsafe(MAX_ST_TEST_RESULT_FILE_BYTES + 1);
  let offset = 0;

  while (offset < buffer.length) {
    const bytesRead = fs.readSync(
      descriptor,
      buffer,
      offset,
      buffer.length - offset,
      null,
    );

    if (bytesRead === 0) {
      break;
    }

    offset += bytesRead;
  }

  if (offset > MAX_ST_TEST_RESULT_FILE_BYTES) {
    throw new StTestResultParseError(
      'file_too_large',
      String(offset),
    );
  }

  return buffer.subarray(0, offset);
}

function readResultFile(outputCsvPath: string, runDirectory: string): string {
  validateResultPath(outputCsvPath, runDirectory);

  let descriptor: number | undefined;

  try {
    descriptor = fs.openSync(
      outputCsvPath,
      fs.constants.O_RDONLY | NO_FOLLOW_FLAG,
    );
    const openedStat = fs.fstatSync(descriptor);

    if (!openedStat.isFile()) {
      throw new StTestResultParseError('file_unreadable');
    }

    validateResultPath(outputCsvPath, runDirectory, openedStat);

    if (openedStat.size > MAX_ST_TEST_RESULT_FILE_BYTES) {
      throw new StTestResultParseError(
        'file_too_large',
        String(openedStat.size),
      );
    }

    const contents = readBoundedResultFile(descriptor);

    // A no-follow flag is not available on every runtime (notably Windows),
    // so verify that the pathname still resolves to the opened regular file.
    validateResultPath(outputCsvPath, runDirectory, openedStat);

    return decodeStrictUtf8(contents);
  }
  catch (error) {
    if (error instanceof StTestResultParseError) {
      throw error;
    }

    throw new StTestResultParseError('file_unreadable');
  }
  finally {
    if (descriptor !== undefined) {
      fs.closeSync(descriptor);
    }
  }
}

function locateHeaders(header: CsvRecord): Record<RequiredHeader, number> {
  const indices = {} as Record<RequiredHeader, number>;
  const normalizedHeaders = header.fields.map((value) => value.trim());

  for (const requiredHeader of REQUIRED_HEADERS) {
    const matches: number[] = [];

    normalizedHeaders.forEach((value, index) => {
      if (value === requiredHeader) {
        matches.push(index);
      }
    });

    if (matches.length === 0) {
      throw new StTestResultParseError('missing_header', requiredHeader);
    }

    if (matches.length > 1) {
      throw new StTestResultParseError('duplicate_header', requiredHeader);
    }

    indices[requiredHeader] = matches[0];
  }

  return indices;
}

function parseArtifactRows(
  artifact: CompletedStTestArtifact,
  params: BuildStTestResultReportParams,
  maxRows: number,
): {
  file: StTestResultFileDto;
  rows: StTestResultRowDto[];
} {
  const artifactDisplay = params.display?.artifacts[artifact.artifactId];
  const testFile = artifactDisplay?.testFile
    ?? toDisplayPath(params.operatorPath, artifact.inputCsvPath);
  const resultFile = artifactDisplay?.resultFile
    ?? toDisplayPath(params.workspaceRoot, artifact.outputCsvPath);
  const fileBase: StTestResultFileDto = {
    artifactId: artifact.artifactId,
    sequence: artifact.sequence,
    mode: artifact.mode,
    testFile,
    resultFile,
    rowCount: 0,
  };

  try {
    const text = readResultFile(artifact.outputCsvPath, params.runDirectory);
    const records = parseStTestCsv(text, maxRows);

    if (records.length === 0) {
      throw new StTestResultParseError('empty_result');
    }

    const header = records[0];
    const headerIndices = locateHeaders(header);

    if (records.length === 1) {
      throw new StTestResultParseError('empty_result');
    }

    let firstInvalidDetail: string | undefined;
    const rows: StTestResultRowDto[] = [];

    for (let index = 1; index < records.length; index += 1) {
      const record = records[index];
      const values = record.fields;
      const requiredIndices = Object.values(headerIndices);
      const ragged = values.length > header.fields.length
        || requiredIndices.some((index) => index >= values.length);
      const testcaseName = (values[headerIndices.testcase_name] ?? '').trim();
      const dynPrecision = (values[headerIndices.dyn_precision] ?? '').trim();
      const cstPrecision = (values[headerIndices.cst_precision] ?? '').trim();
      const binPrecision = (values[headerIndices.bin_precision] ?? '').trim();
      const rawStatus = (values[headerIndices.precision_status] ?? '').trim();
      const isPass = /^[Pp][Aa][Ss][Ss]$/.test(rawStatus);
      const isFail = /^[Ff][Aa][Ii][Ll]$/.test(rawStatus);
      const recognizedStatus = isPass || isFail;
      const normalizedStatus = isPass ? 'PASS' : isFail ? 'FAIL' : rawStatus;
      const invalid = ragged
        || testcaseName.length === 0
        || dynPrecision.length === 0
        || cstPrecision.length === 0
        || binPrecision.length === 0
        || rawStatus.length === 0
        || !recognizedStatus;

      if (invalid && firstInvalidDetail === undefined) {
        firstInvalidDetail = String(record.sourceIndex);
      }

      rows.push({
        id: `${artifact.artifactId}:${String(record.sourceIndex)}`,
        artifactId: artifact.artifactId,
        mode: artifact.mode,
        testFile,
        testcaseName,
        dynPrecision,
        cstPrecision,
        binPrecision,
        precisionStatus: recognizedStatus ? normalizedStatus : rawStatus,
        outcome: invalid
          ? 'invalid'
          : normalizedStatus === 'PASS'
            ? 'pass'
            : 'fail',
      });
    }

    const file: StTestResultFileDto = {
      ...fileBase,
      rowCount: rows.length,
      ...(firstInvalidDetail
        ? {
          error: {
            code: 'invalid_row' as const,
            detail: firstInvalidDetail,
          },
        }
        : {}),
    };

    return {
      file,
      rows,
    };
  }
  catch (error) {
    if (!(error instanceof StTestResultParseError)) {
      throw error;
    }

    return {
      file: {
        ...fileBase,
        error: {
          code: error.code,
          ...(error.safeDetail ? { detail: error.safeDetail } : {}),
        },
      },
      rows: [],
    };
  }
}

export function buildStTestResultReport(params: BuildStTestResultReportParams): StTestResultReportDto {
  const rows: StTestResultRowDto[] = [];
  const files: StTestResultFileDto[] = [];
  const orderedArtifacts = [...params.artifacts]
    .sort((left, right) => left.sequence - right.sequence);

  for (const artifact of orderedArtifacts) {
    const parsed = parseArtifactRows(
      artifact,
      params,
      MAX_ST_TEST_RESULT_ROWS - rows.length,
    );

    files.push(parsed.file);
    rows.push(...parsed.rows);
  }

  const passed = rows.filter((row) => row.outcome === 'pass').length;
  const failed = rows.filter((row) => row.outcome === 'fail').length;
  const invalid = rows.filter((row) => row.outcome === 'invalid').length;
  const invalidFiles = files.filter((file) => file.error !== undefined).length;
  const outcome = invalidFiles > 0 || invalid > 0 || rows.length === 0
    ? 'invalid'
    : failed > 0
      ? 'failed'
      : 'passed';

  return {
    runId: params.runId,
    operatorName: params.operatorName,
    runDirectory: params.display?.runDirectory
      ?? toDisplayPath(params.workspaceRoot, params.runDirectory),
    outcome,
    summary: {
      total: rows.length,
      passed,
      failed,
      invalid,
      files: files.length,
      invalidFiles,
    },
    files,
    rows,
  };
}
