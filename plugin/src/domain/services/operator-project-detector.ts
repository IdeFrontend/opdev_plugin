/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as path from 'path';
import * as fs from 'fs';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import { OperatorProjectType } from '@plugin/domain/models/operator-project-type';

// Re-export for backward compatibility with all existing callsites.
export { OperatorProjectType };

/**
 * 算子工程检测结果
 */
export interface OperatorProjectDetectionResult {
  /** 是否为算子工程 */
  isOperatorProject: boolean;
  /** 算子工程类型 */
  projectType?: OperatorProjectType;
  /** 项目路径 */
  projectPath: string;
  /** 项目名称 */
  projectName: string;
}

/**
 * 算子工程检测器
 *
 * Thin wrapper around OperatorPluginRegistry.detectProject().
 * Detection heuristics now live in the individual IProjectDetector implementations
 * (StandardCustomDetector, TorchLibraryDetector, PyAscPlugin, AscendPlugin).
 */
export class OperatorProjectDetector {
  /**
   * 检测目录是否为算子工程
   */
  static async detectOperatorProject(dirPath: string): Promise<OperatorProjectDetectionResult> {
    const projectName = path.basename(dirPath);
    const match = await OperatorPluginRegistry.detectProject(dirPath);

    if (!match) {
      return { isOperatorProject: false, projectPath: dirPath, projectName };
    }

    return {
      isOperatorProject: true,
      projectType: match.projectType,
      projectPath: dirPath,
      projectName,
    };
  }

  /**
   * 递归扫描目录，查找算子工程（最多扫描3层）
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
    if (currentDepth > maxDepth) return;

    try {
      const detection = await this.detectOperatorProject(dirPath);
      if (detection.isOperatorProject) {
        results.push(detection);
        return;
      }

      if (currentDepth < maxDepth) {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const name = entry.name;
          if (name.startsWith('.') || name === 'node_modules' || name === 'out' || name === 'build') {
            continue;
          }
          await this.scanDirectory(path.join(dirPath, name), currentDepth + 1, maxDepth, results);
        }
      }
    } catch {
      // ignore
    }
  }

  /**
   * 扫描 rootPath 目录下的第一层文件夹，查找标准自定义算子工程
   */
  static async scanForStandardCustomOperatorProjects(
    rootPath: string,
  ): Promise<OperatorProjectDetectionResult[]> {
    const results: OperatorProjectDetectionResult[] = [];

    try {
      const entries = fs.readdirSync(rootPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
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
    } catch {
      // ignore
    }

    return results;
  }
}
