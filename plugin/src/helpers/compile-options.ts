/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { homeMethods } from '@plugin/controller/home-controller';

/**
 * Returns `--experimental` when any selected standard-custom operator is experimental.
 */
export async function getCompileOptionForSelectedOperators(): Promise<string | undefined> {
  const selectedIds = await homeMethods.getSelectedOperatorIds() || [];

  if (selectedIds.length === 0) {
    return undefined;
  }

  const multiple = await homeMethods.checkMultipleOperators();

  if (!multiple.isStandardCustom || !multiple.operators) {
    return undefined;
  }

  const selectedSet = new Set(selectedIds);
  const hasExperimental = multiple.operators.some((op) => selectedSet.has(op.id) && op.isExperimental);

  return hasExperimental ? '--experimental' : undefined;
}
