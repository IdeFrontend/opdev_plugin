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

export interface SanitizerRunOutcome {
  ok: boolean;
  /**
   * The mssanitizer stdout line that explains the failure, when one is present.
   * Left undefined when no recognised marker is found so the caller can fall
   * back to the raw command output instead of an invented (untranslated) string.
   */
  reason?: string;
}

/**
 * Stable failure markers mssanitizer prints to stdout (not the --log-file).
 * mssanitizer always exits 0, so these are how a CLI/setup error or an
 * abnormal target exit can be distinguished from a real run.
 */
const FAILURE_MARKERS: RegExp[] = [
  /^\[mssanitizer\] ERROR:.*/m,
  /^\[ERROR\] Failed to open.*/m,
  /^\[mssanitizer\] user program .*exited abnormally.*/m,
  /^\[mssanitizer\] user program .*exited by signal\(\d+\).*/m,
];

function findFailureMarker(output: string): string | undefined {
  for (const marker of FAILURE_MARKERS) {
    const match = marker.exec(output);

    if (match) {
      return match[0].trim();
    }
  }

  return undefined;
}

/**
 * Decides whether an mssanitizer run actually produced a usable report.
 *
 * The process exit code is NOT a reliable signal: mssanitizer.bin returns 0
 * for every outcome (clean run, findings, target crash, even a CLI/arg error),
 * so a run is treated as successful only when the configured --log-file exists
 * and is non-empty. mssanitizer opens that file with O_TRUNC before the target
 * runs, so an aborted/failed run leaves a 0-byte file behind — that is a
 * failure, not a success with an empty results node.
 */
export function evaluateSanitizerRunOutcome(input: {
  code: number | null;
  output: string;
  logPath: string | undefined;
}): SanitizerRunOutcome {
  const {
    code, output, logPath,
  } = input;

  const ran = code === 0
    && !!logPath
    && fs.existsSync(logPath)
    && fs.statSync(logPath).size > 0;

  if (ran) {
    return { ok: true };
  }

  return {
    ok: false,
    reason: findFailureMarker(output),
  };
}
