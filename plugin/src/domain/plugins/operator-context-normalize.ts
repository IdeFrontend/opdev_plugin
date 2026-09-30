/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { OperatorProjectType } from '@plugin/domain/models/operator-project-type';
import {
  OPERATOR_OP_TYPE_VALUES,
  type OperatorOpType,
} from '@shared/operator-op-type';

/**
 * Map persisted `projects.json` `project_type` to {@link OperatorProjectType}.
 * Collections created earlier use `ascend` for standard-custom roots.
 */
export function normalizeProjectTypeForSpawn(stored?: string | null): OperatorProjectType | null {
  const raw = stored?.trim();

  if (!raw) {
    return null;
  }

  if (raw === 'ascend') {
    return OperatorProjectType.STANDARD_CUSTOM;
  }

  // Stored by viewIdToProjectType for CANN / Ascend-C / Torch-Library init; all use cann cmake spawn keys.
  if (raw === 'cann') {
    return OperatorProjectType.ASCEND_C;
  }

  if ((Object.values(OperatorProjectType) as string[]).includes(raw)) {
    return raw as OperatorProjectType;
  }

  return null;
}

/** Map persisted `ops` row `op_type` to {@link OperatorOpType}. */
export function normalizeOpTypeForSpawn(stored?: string | null): OperatorOpType | null {
  const raw = stored?.trim();

  if (!raw) {
    return null;
  }

  if ((OPERATOR_OP_TYPE_VALUES as readonly string[]).includes(raw)) {
    return raw as OperatorOpType;
  }

  return null;
}
