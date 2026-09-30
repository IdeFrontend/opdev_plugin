/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import * as path from 'path';

/** Relative path after stripping a normalized root prefix ('' for the root itself). */
export function stripRootPrefix(normalizedPath: string, normalizedRoot: string): string {
  return normalizedPath.replace(normalizedRoot, '')
    .replace(/^[/\\]/, '');
}

/** True when the normalized path sits under the root's `experimental/` dir. */
export function isUnderExperimentalDir(normalizedPath: string, normalizedRoot: string): boolean {
  return stripRootPrefix(normalizedPath, normalizedRoot)
    .toLowerCase()
    .startsWith('experimental/');
}

/** POSIX-separated path relative to the workspace root. */
export function toWorkspaceRelativePosixPath(workspacePath: string, filePath: string): string {
  return path.relative(workspacePath, filePath)
    .replace(/\\/g, '/');
}
