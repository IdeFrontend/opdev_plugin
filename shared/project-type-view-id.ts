/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
export const OperatorProjectViewId = {
  CANN: 1,
  STANDARD_CUSTOM: 2,
  PYASC: 3,
  TRITON: 4,
} as const;

export type OperatorProjectViewIdValue =
  (typeof OperatorProjectViewId)[keyof typeof OperatorProjectViewId];

const operatorProjectViewIdSet = new Set<number>(Object.values(OperatorProjectViewId));
const standardCustomProjectTypeSet = new Set<string>([
  'standard-custom',
  'ascend',
]);

export function isOperatorProjectViewId(value: number): value is OperatorProjectViewIdValue {
  return operatorProjectViewIdSet.has(value);
}

export function isStandardCustomProjectType(projectType?: string | null): boolean {
  const raw = projectType?.trim();

  return raw ? standardCustomProjectTypeSet.has(raw) : false;
}
