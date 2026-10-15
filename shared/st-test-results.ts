/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
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
  id: string;
  artifactId: string;
  mode: StTestMode;
  testFile: string;
  testcaseName: string;
  dynPrecision: string;
  cstPrecision: string;
  binPrecision: string;
  precisionStatus: string;
  outcome: StTestRowOutcome;
}

export function formatStTestResultStatus(
  row: Pick<StTestResultRowDto, 'outcome' | 'precisionStatus'>,
  outcomeLabel: string,
  invalidWithCsv: (status: string)=> string,
): string {
  if (row.outcome === 'invalid') {
    return row.precisionStatus
      ? invalidWithCsv(row.precisionStatus)
      : outcomeLabel;
  }

  return row.precisionStatus || outcomeLabel;
}

export interface StTestResultFileDto {
  artifactId: string;
  sequence: number;
  mode: StTestMode;
  testFile: string;
  resultFile: string;
  rowCount: number;
  error?: {
    code: StTestResultErrorCode;
    detail?: string;
  };
}

export interface StTestResultReportDto {
  runId: string;
  operatorName: string;
  runDirectory: string;
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

export interface StTestRunHistoryItemDto {
  runId: string;
  completedAt: string;
  outcome: StTestReportOutcome;
  summary: StTestResultReportDto['summary'];
}

export interface StTestResultsPanelDto {
  report: StTestResultReportDto;
}

export type StTestResultsWebviewAction = {
  type: 'openResultFile';
  artifactId: string;
};

export const ST_TEST_RESULTS_CONNECT_CHANNEL = 'stTestResults' as const;
