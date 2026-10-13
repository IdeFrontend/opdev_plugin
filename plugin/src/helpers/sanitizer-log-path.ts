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

import { joinIdeConfigPath } from '@plugin/helpers/ide-config-dir';
import { SANITIZER_LOG_DIR_NAMES } from '@plugin/domain/services/command-strategy/sanitizer-option-guards';

/**
 * Newest `mssanitizer_*.log` / `npu-check_*.log` under the workspace IDE config
 * directories (`mindstudio_sanitizer_log` for mssanitizer reports and
 * `npu-check-log` for npu-check reports) by mtime.
 */
export function getLatestSanitizerLogAbsPath(workspaceRoot: string): string | undefined {
  let best: { path: string;
    mtime: number } | undefined;

  for (const dirName of SANITIZER_LOG_DIR_NAMES) {
    const logDir = joinIdeConfigPath(workspaceRoot, dirName);

    if (!fs.existsSync(logDir) || !fs.statSync(logDir)
      .isDirectory()) {
      continue;
    }

    for (const name of fs.readdirSync(logDir)) {
      if (!(name.startsWith('mssanitizer_') || name.startsWith('npu-check_')) || !name.endsWith('.log')) {
        continue;
      }

      const full = path.join(logDir, name);
      const st = fs.statSync(full);

      if (!st.isFile()) {
        continue;
      }

      const mtime = st.mtimeMs;

      if (!best || mtime > best.mtime) {
        best = {
          path: full,
          mtime,
        };
      }
    }
  }

  return best?.path;
}
