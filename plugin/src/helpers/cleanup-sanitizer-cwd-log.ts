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

const CWD_LOG_DIR_NAME = 'mindstudio_sanitizer_log';

/**
 * mssanitizer always writes its own runtime log into `./mindstudio_sanitizer_log` relative to its
 * working directory (the operator run path / workspace root). That location is hardcoded in the
 * tool and cannot be disabled via a CLI option or env var, so it clutters the project after a run.
 *
 * Remove that cwd copy once the sanitizer has finished. The IDE report directory lives under
 * `<workspace>/.vscode/mindstudio_sanitizer_log` (a different path that the plugin reads back) and
 * is intentionally left untouched.
 *
 * @param cwdDir The directory mssanitizer ran in (typically the workspace root for Triton).
 * @returns true if a directory was removed.
 */
export function cleanupCwdSanitizerLog(cwdDir: string): boolean {
  if (!cwdDir) {
    return false;
  }

  const dir = path.join(cwdDir, CWD_LOG_DIR_NAME);

  try {
    if (fs.existsSync(dir) && fs.statSync(dir)
      .isDirectory()) {
      fs.rmSync(dir, {
        recursive: true,
        force: true,
      });

      return true;
    }
  }
  catch (error) {
    console.warn('[runSanitizer] Failed to clean up mssanitizer cwd log dir:', error);
  }

  return false;
}
