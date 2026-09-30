/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { resolveOpRecord } from '@plugin/domain/models/op-record';

/**
 * Resolved operator entry for a builder/spawn context: the operator path plus
 * the op type that routes the strategy. `undefined` means the operator is
 * unknown in the active source (cache folder state / synthesized root record).
 */
export type ResolvedOpEntry = {
  path?: string;
  opType?: string;
};

/**
 * Resolve the operator entry (path + op type) for a project/opName pair from
 * the synthesized op record: cache folder scan state for standard-custom
 * collections, the root-operator fallback for every other project type. The
 * lookup is path-keyed.
 */
export function resolveOpEntryForProject(
  projectPath: string,
  opName: string,
): ResolvedOpEntry | undefined {
  const op = resolveOpRecord(projectPath, opName);

  if (!op) {
    return undefined;
  }

  return {
    path: op.op_path,
    opType: op.op_type,
  };
}
