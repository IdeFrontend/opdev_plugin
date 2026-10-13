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
import { hasPyFilesInRoot } from './detection-utils';

/**
 * Project detector for TORCH_LIBRARY operator projects (torch_library extension pattern).
 *
 * Like STANDARD_CUSTOM, TORCH_LIBRARY has no dedicated op_type — its operators
 * use 'ascend' or 'cann'. Detection-only; does not implement IOperatorPlugin.
 *
 * Mirrors V1 detection: CMakeLists.txt exists AND .py files present at root.
 */
export class TorchLibraryDetector implements IProjectDetector {
  readonly projectType = OperatorProjectType.TORCH_LIBRARY;

  async detectProject(dirPath: string): Promise<ProjectDetectionResult> {
    const hasCmake = fs.existsSync(path.join(dirPath, 'CMakeLists.txt'));
    const hasPy = hasPyFilesInRoot(dirPath);

    return {
      isMatch: hasCmake && hasPy,
      confidence: 'heuristic',
    };
  }
}
