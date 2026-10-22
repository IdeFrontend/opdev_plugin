/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
export type ReportCommandArg = string | {
  id?: string;
  command?: { arguments?: unknown[] };
} | undefined;

/** Decode a tree report command argument into a stable report key. */
export function resolveReportCommandKey(arg: ReportCommandArg, reportIdPrefix: string): string {
  const raw = typeof arg === 'string'
    ? arg
    : String(arg?.command?.arguments?.[0] ?? arg?.id ?? '');

  if (raw.startsWith(reportIdPrefix)) {
    return decodeURIComponent(raw.replace(new RegExp(`^${reportIdPrefix}`), ''));
  }

  return raw;
}

export function resolvePerformanceReportCommandKey(arg: ReportCommandArg): string {
  return resolveReportCommandKey(arg, 'performance-report:');
}

export function resolveDumpTensorReportCommandKey(arg: ReportCommandArg): string {
  return resolveReportCommandKey(arg, 'dump-tensor-report:');
}

/** Resolve dump tensor file tree item context into path and type. */
export function resolveDumpTensorFileCommandArgs(
  arg: ReportCommandArg,
  fileIdPrefix = 'dump-tensor-file:',
): { filePath: string;
  fileType: string } | undefined {
  const commandArgs = typeof arg === 'object' ? arg?.command?.arguments : undefined;

  if (Array.isArray(commandArgs) && commandArgs.length >= 2) {
    const filePath = String(commandArgs[0] ?? '');
    const fileType = String(commandArgs[1] ?? '');

    if (filePath) {
      return {
        filePath,
        fileType,
      };
    }
  }

  const raw = typeof arg === 'string'
    ? arg
    : String(arg?.id ?? '');

  if (raw.startsWith(fileIdPrefix)) {
    return {
      filePath: decodeURIComponent(raw.slice(fileIdPrefix.length)),
      fileType: 'bin',
    };
  }

  return undefined;
}
