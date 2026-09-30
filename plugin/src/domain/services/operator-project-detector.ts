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
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import { OperatorProjectType } from '@plugin/domain/models/operator-project-type';

// Re-export for backward compatibility with all existing callsites.
export { OperatorProjectType };

/**
 * Operator engineering test results
 */
export interface OperatorProjectDetectionResult {
  /** Is it an operator project? */
  isOperatorProject: boolean;
  /** Operator project type */
  projectType?: OperatorProjectType;
  /** Project path */
  projectPath: string;
  /** Project name */
  projectName: string;
}

/**
 * Operator Engineering Detector
 *
 * Thin wrapper around OperatorPluginRegistry.detectProject().
 * Detection heuristics now live in the individual IProjectDetector implementations
 * (StandardCustomDetector, TorchLibraryDetector, TritonPlugin, PyAscPlugin, AscendPlugin).
 */
export class OperatorProjectDetector {
  /**
   * Check whether the directory is an operator project
   */
  static async detectOperatorProject(dirPath: string): Promise<OperatorProjectDetectionResult> {
    const projectName = path.basename(dirPath);
    const match = await OperatorPluginRegistry.detectProject(dirPath);

    if (!match) {
      return {
        isOperatorProject: false,
        projectPath: dirPath,
        projectName,
      };
    }

    return {
      isOperatorProject: true,
      projectType: match.projectType,
      projectPath: dirPath,
      projectName,
    };
  }

  /**
   * Recursively scan directories to find operator projects (up to 3 layers can be scanned)
   */
  static async scanForOperatorProjects(
    rootPath: string,
    maxDepth: number = 3,
  ): Promise<OperatorProjectDetectionResult[]> {
    const results: OperatorProjectDetectionResult[] = [];

    await this.scanDirectory(rootPath, 0, maxDepth, results);

    return results;
  }

  private static async scanDirectory(
    dirPath: string,
    currentDepth: number,
    maxDepth: number,
    results: OperatorProjectDetectionResult[],
  ): Promise<void> {
    if (currentDepth > maxDepth) {
      return;
    }

    try {
      const detection = await this.detectOperatorProject(dirPath);

      if (detection.isOperatorProject) {
        results.push(detection);

        return;
      }

      if (currentDepth < maxDepth) {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          if (!entry.isDirectory()) {
            continue;
          }

          const name = entry.name;

          if (name.startsWith('.') || name === 'node_modules' || name === 'out' || name === 'build') {
            continue;
          }

          await this.scanDirectory(path.join(dirPath, name), currentDepth + 1, maxDepth, results);
        }
      }
    }
    catch {
      // ignore
    }
  }

  /**
   * Scan the first-level folders under the rootPath directory to find standard custom operator projects
   */
  static async scanForStandardCustomOperatorProjects(rootPath: string): Promise<OperatorProjectDetectionResult[]> {
    const results: OperatorProjectDetectionResult[] = [];

    try {
      const entries = fs.readdirSync(rootPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const name = entry.name;

        if (name.startsWith('.') || name === 'node_modules' || name === 'out' || name === 'build') {
          continue;
        }

        const folderPath = path.join(rootPath, name);

        if (fs.existsSync(path.join(folderPath, 'CMakeLists.txt'))) {
          results.push({
            isOperatorProject: true,
            projectType: OperatorProjectType.STANDARD_CUSTOM,
            projectPath: folderPath,
            projectName: path.basename(folderPath),
          });
        }
      }
    }
    catch {
      // ignore
    }

    return results;
  }
}
