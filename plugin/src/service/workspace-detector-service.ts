/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as path from 'path';
import * as fs from 'fs';
import {
  OperatorProjectDetector,
  OperatorProjectType,
} from '@plugin/domain/services/operator-project-detector';
import {
  updateStandardCustomOperators,
  type SubOperatorInfo,
  type OperatorCollectionInfo,
} from '@plugin/domain/models/project-model';

/**
 * 工作区检测服务
 * 负责检测工作区是否为算子工程，如果不是则扫描子目录
 */
export class WorkspaceDetectorService {
  /**
   * 检测并注册工作区中的算子工程
   * 只处理标准自定义算子类型
   * @param workspacePath 工作区路径
   */
  static async detectAndRegisterWorkspace(workspacePath: string): Promise<void> {
    try {
      // 检测根目录是否为算子工程
      const rootDetection = await OperatorProjectDetector.detectOperatorProject(workspacePath);

      // 只处理标准自定义算子类型
      if (
        rootDetection.isOperatorProject
        && rootDetection.projectType === OperatorProjectType.STANDARD_CUSTOM
      ) {
        await this.scanStandardCustomOperators(workspacePath);
      }
    }
    catch (error) {
      // 忽略错误
    }
  }

  /**
   * 扫描根目录下的算子合集(ops_meet)与算子(ops_list/experimental_ops_list)。
   * 供 WorkspaceDetectorService、FolderContextMenuService 等复用。
   */
  static scanOpsMeetAndOpsLists(rootPath: string): {
    opsMeet: OperatorCollectionInfo[];
    opsList: SubOperatorInfo[];
    experimentalOpsList: SubOperatorInfo[];
  } {
    const opsMeet: OperatorCollectionInfo[] = [];
    const opsList: SubOperatorInfo[] = [];
    const experimentalOpsList: SubOperatorInfo[] = [];
    const entries = fs.readdirSync(rootPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const dirName = entry.name;
      if (dirName.startsWith('.') || dirName === 'node_modules' || dirName === 'out' || dirName === 'build') {
        continue;
      }

      const collectionPath = path.join(rootPath, dirName);
      let hasOperators = false;
      const isExperimentalCollection = dirName.toLowerCase() === 'experimental';

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
            isCompiled,
          };
          if (isExperimentalCollection) {
            experimentalOpsList.push(operatorInfo);
          }
          else {
            opsList.push(operatorInfo);
          }
        }
      }
      catch {
        // 忽略单目录扫描失败
      }

      if (hasOperators) {
        opsMeet.push({
          name: dirName,
          path: collectionPath,
        });
      }
    }
    return { opsMeet, opsList, experimentalOpsList };
  }

  /**
   * 扫描标准自定义算子（特殊规则）
   * 只扫描算子合集(ops_meet)和算子(ops_list/experimental_ops_list)，更新根项目信息。
   * 不再为算子集合或子算子在 projects 中新建项目。
   */
  private static async scanStandardCustomOperators(workspacePath: string): Promise<void> {
    try {
      console.log('[scanStandardCustomOperators] 开始扫描算子合集和算子...');
      const { opsMeet, opsList, experimentalOpsList } = this.scanOpsMeetAndOpsLists(workspacePath);

      console.log('[scanStandardCustomOperators] 算子合集列表:', opsMeet.map((m) => m.name));
      console.log('[scanStandardCustomOperators] 普通算子列表:', opsList.map((o) => o.name));
      console.log('[scanStandardCustomOperators] experimental算子列表:', experimentalOpsList.map((o) => o.name));
      await updateStandardCustomOperators(workspacePath, opsMeet, opsList, experimentalOpsList);
      console.log(`[scanStandardCustomOperators] 已更新: ${opsMeet.length} 个算子合集, ${opsList.length} 个普通算子, ${experimentalOpsList.length} 个experimental算子`);
    }
    catch (error) {
      console.warn(`[scanStandardCustomOperators] 更新算子信息失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
