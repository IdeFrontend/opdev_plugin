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

export type { OperatorProjectType };

export interface ProjectDetectionResult {
  isMatch: boolean;
  /**
   * 'definitive' — unambiguous (e.g. file-content check). Registry stops searching.
   * 'heuristic'  — probabilistic (e.g. file-extension check). Registry keeps searching
   *                for a 'definitive' match but accepts this if none is found.
   */
  confidence: 'definitive' | 'heuristic';
}

/**
 * Project structure detection plugin.
 *
 * Encapsulates filesystem heuristics for detecting a specific OperatorProjectType.
 * Separate from IOperatorPlugin because project types and op types are different
 * classification axes: STANDARD_CUSTOM and TORCH_LIBRARY have no dedicated op_type.
 *
 * Keyed by projectType in OperatorPluginRegistry.
 */
export interface IProjectDetector {
  /** The OperatorProjectType this detector identifies. */
  readonly projectType: OperatorProjectType;

  /**
   * Test whether dirPath is a project of this type.
   * Registration order in OperatorPluginRegistry determines detection priority.
   */
  detectProject(dirPath: string): Promise<ProjectDetectionResult>;
}
