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
import * as fs from 'fs';

import type { SubOperatorInfo } from '@plugin/domain/models/project-model';

/**
 * Whitelist of operator collections under root
 */
export const ROOT_OPERATOR_COLLECTIONS = new Set([
  'image',
  'objdetect',
  'conversion',
  'math',
  'random',
  'activation',
  'control',
  'conv',
  'foreach',
  'index',
  'loss',
  'matmul',
  'norm',
  'optim',
  'pooling',
  'quant',
  'rnn',
  'vfusion',
  'hash',
  'attention',
  'ffn',
  'gmm',
  'mc2',
  'moe',
  'posembedding',
  'select_attention_operators',
  'examples',
]);

/**
 * Whitelist of operator collections under experimental directory
 */
export const EXPERIMENTAL_OPERATOR_COLLECTIONS = new Set([
  'image',
  'objdetect',
  'conversion',
  'math',
  'npu_ops_math_ext',
  'random',
  'activation',
  'control',
  'conv',
  'foreach',
  'index',
  'loss',
  'matmul',
  'norm',
  'optim',
  'pooling',
  'quant',
  'rnn',
  'vfusion',
  'attention',
  'ffn',
  'gmm',
  'mc2',
  'moe',
  'npu_ops_transformer_ext',
  'posembedding',
  'select_attention_operators',
]);

/**
 * Scan operators under an operator collection directory
 * An operator is a subdirectory that contains CMakeLists.txt; compiled state
 * is derived from the presence of a build/ or out/ directory.
 * @param collectionPath Operator collection path
 * @returns Whether it has operators and the operator list
 */
export function scanOperatorsInCollection(collectionPath: string): {
  hasOperators: boolean;
  operators: SubOperatorInfo[];
} {
  const operators: SubOperatorInfo[] = [];
  let hasOperators = false;

  try {
    const subEntries = fs.readdirSync(collectionPath, { withFileTypes: true });

    for (const subEntry of subEntries) {
      if (!subEntry.isDirectory() || subEntry.name.startsWith('.')) {
        continue;
      }

      const operatorPath = path.join(collectionPath, subEntry.name);
      const operatorCmakeListsPath = path.join(operatorPath, 'CMakeLists.txt');

      if (!fs.existsSync(operatorCmakeListsPath)) {
        continue;
      }

      hasOperators = true;
      const buildDir = path.join(operatorPath, 'build');
      const outDir = path.join(operatorPath, 'out');
      const isCompiled = fs.existsSync(buildDir) || fs.existsSync(outDir);
      const operatorInfo: SubOperatorInfo = {
        name: subEntry.name,
        path: operatorPath,
        isCompiled: isCompiled,
      };

      operators.push(operatorInfo);
    }
  }
  catch {
    // Ignore single-dir scan failure
  }

  return {
    hasOperators,
    operators,
  };
}
