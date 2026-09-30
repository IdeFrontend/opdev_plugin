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

/**
 * Resolve a sanitizer stack/code path to an absolute fs path under the workspace when possible.
 * Used for Problems, jump-to-file, and msAgent index alignment.
 */
export function resolveSanitizerSourceFsPath(
  workspaceRoot: string,
  fileLink?: string,
): string | undefined {
  if (!fileLink || fileLink.trim() === '') {
    return undefined;
  }

  const normalized = path.normalize(fileLink.trim());

  if (path.isAbsolute(normalized) && fs.existsSync(normalized)) {
    return normalized;
  }

  const joined = path.join(workspaceRoot, normalized);

  if (fs.existsSync(joined)) {
    return path.normalize(joined);
  }

  const base = path.basename(normalized);
  const byName = path.join(workspaceRoot, base);

  if (fs.existsSync(byName)) {
    return path.normalize(byName);
  }

  return undefined;
}
