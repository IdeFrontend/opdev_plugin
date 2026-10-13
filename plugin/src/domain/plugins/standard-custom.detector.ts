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
import { OperatorProjectType } from '@plugin/domain/models/operator-project-type';
import {
  IProjectDetector, ProjectDetectionResult,
} from './project-detector.interface';
import {
  buildShHelpSupportsGenop, BuildShGenopSupportChecker, hasAncestorBuildShWithGenop,
  hasAscFiles, hasPyFilesInRoot,
} from './detection-utils';

/**
 * Project detector for STANDARD_CUSTOM operator projects.
 *
 * STANDARD_CUSTOM has no dedicated op_type — operators inside use 'ascend' or 'cann'.
 * `bash build.sh --help` advertising --genop is definitive. Keep the structure
 * heuristic as a compatibility fallback for projects whose help cannot be queried.
 */
export class StandardCustomDetector implements IProjectDetector {
  readonly projectType = OperatorProjectType.STANDARD_CUSTOM;

  constructor(private readonly supportsGenop: BuildShGenopSupportChecker = buildShHelpSupportsGenop) {}

  async detectProject(dirPath: string): Promise<ProjectDetectionResult> {
    if (
      await this.supportsGenop(dirPath)
      || await hasAncestorBuildShWithGenop(dirPath, this.supportsGenop)
    ) {
      return {
        isMatch: true,
        confidence: 'definitive',
      };
    }

    // Compatibility fallback: retain V1's project-layout heuristic when the public
    // build interface did not identify the project.
    const hasCmake = fs.existsSync(path.join(dirPath, 'CMakeLists.txt'));

    if (hasCmake && !hasAscFiles(dirPath) && !hasPyFilesInRoot(dirPath)) {
      const normalizedPath = path.normalize(dirPath)
        .toLowerCase();

      if (
        normalizedPath.includes('experimental')
        || fs.existsSync(path.join(path.dirname(dirPath), 'build.sh'))
        || await hasAncestorBuildShWithGenop(dirPath, this.supportsGenop)
      ) {
        return {
          isMatch: true,
          confidence: 'heuristic',
        };
      }
    }

    return {
      isMatch: false,
      confidence: 'heuristic',
    };
  }
}
