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
import { isStandardCustomProjectType } from '@shared/project-type-view-id';

/**
 * Decide whether a "create operator" request targets a sub-operator inside an existing
 * standard-custom collection (as opposed to creating a brand-new standalone project).
 *
 * Pure and side-effect free so it can be unit-tested without the filesystem or VS Code:
 * callers pass the current workspace root/type and the requested output directory.
 */
export function isSubOperatorCreation(params: {
  /** Absolute path of the operator directory being created. */
  subOpDir: string;
  /** Current workspace root. The new operator must be created under this root. */
  workspaceRoot?: string | null;
  /** True when the requested project view id is the standard-custom one. */
  isStandardCustomViewId: boolean;
  /** Current opened project type. Standard-custom roots created earlier may be stored as "ascend". */
  currentProjectType?: string | null;
}): boolean {
  return params.isStandardCustomViewId
    && isStandardCustomProjectType(params.currentProjectType)
    && isInsideOrEqual(params.subOpDir, params.workspaceRoot);
}

function normalizePathForCompare(value: string): string {
  return path.normalize(value)
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase();
}

function isInsideOrEqual(childPath: string, maybeParentPath?: string | null): boolean {
  if (!childPath || !maybeParentPath) {
    return false;
  }

  const child = normalizePathForCompare(childPath);
  const parent = normalizePathForCompare(maybeParentPath);

  return child === parent || child.startsWith(`${parent}/`);
}
