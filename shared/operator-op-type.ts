/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
/**
 * Runtime `OpRecord.op_type` / command-strategy key.
 * Previously inlined on `CreateOpsByPrototypeParams.opType` in `api-types/ops.d.ts`.
 */
export type OperatorOpType = 'ascend' | 'cann' | 'pyasc' | 'triton';

export const OPERATOR_OP_TYPE_VALUES: readonly OperatorOpType[] = [
  'ascend',
  'cann',
  'pyasc',
  'triton',
];
