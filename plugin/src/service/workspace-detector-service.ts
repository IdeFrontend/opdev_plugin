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
   * 根目录下的算子合集白名单
   */
  private static readonly ROOT_OPERATOR_COLLECTIONS = new Set([
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
  ]);

  /**
   * experimental 目录下的算子合集白名单
   */
  private static readonly EXPERIMENTAL_OPERATOR_COLLECTIONS = new Set([
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
   * 扫描根目录下的算子合集(ops_meet)与算子(ops_list/experimental_ops_list)。
   * 供 WorkspaceDetectorService、FolderContextMenuService 等复用。
   *
   * 扫描规则：
   * 1. 根目录下的特定文件夹（ROOT_OPERATOR_COLLECTIONS）标记为算子合集
   * 2. experimental 目录下的特定文件夹（EXPERIMENTAL_OPERATOR_COLLECTIONS）也标记为算子合集
   * 3. experimental 目录下的算子合集里的算子，都是 experimental 的算子
   * 4. 识别算子的逻辑不变：检查子目录是否包含 CMakeLists.txt 文件
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

      // 处理根目录下的算子合集
      if (this.ROOT_OPERATOR_COLLECTIONS.has(dirName)) {
        const {
          hasOperators,
          operators,
        } = this.scanOperatorsInCollection(collectionPath, false);

        if (hasOperators) {
          opsMeet.push({
            name: dirName,
            path: collectionPath,
          });
          operators.forEach((op) => opsList.push(op));
        }
      }
      // 处理 experimental 目录
      else if (dirName.toLowerCase() === 'experimental') {
        try {
          const experimentalEntries = fs.readdirSync(collectionPath, { withFileTypes: true });

          for (const expEntry of experimentalEntries) {
            if (!expEntry.isDirectory() || expEntry.name.startsWith('.')) {
              continue;
            }

            const expCollectionName = expEntry.name;

            // 检查是否在 experimental 算子合集白名单中
            if (this.EXPERIMENTAL_OPERATOR_COLLECTIONS.has(expCollectionName)) {
              const expCollectionPath = path.join(collectionPath, expCollectionName);
              const {
                hasOperators,
                operators,
              } = this.scanOperatorsInCollection(expCollectionPath, true);

              if (hasOperators) {
                // experimental 目录下的算子合集，使用完整路径作为名称（如 experimental/image）
                opsMeet.push({
                  name: `experimental/${expCollectionName}`,
                  path: expCollectionPath,
                });
                operators.forEach((op) => experimentalOpsList.push(op));
              }
            }
          }
        }
        catch {
          // 忽略 experimental 目录扫描失败
        }
      }
    }

    return {
      opsMeet,
      opsList,
      experimentalOpsList,
    };
  }

  /**
   * 扫描算子合集目录下的算子
   * @param collectionPath 算子合集路径
   * @param isExperimental 是否为 experimental 算子（当前未使用，保留用于未来扩展）
   * @returns 是否包含算子及算子列表
   */
  private static scanOperatorsInCollection(
    collectionPath: string,
    isExperimental: boolean,
  ): {
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
      // 忽略单目录扫描失败
    }

    return {
      hasOperators,
      operators,
    };
  }

  /**
   * 扫描标准自定义算子（特殊规则）
   * 只扫描算子合集(ops_meet)和算子(ops_list/experimental_ops_list)，更新根项目信息。
   * 不再为算子集合或子算子在 projects 中新建项目。
   */
  private static async scanStandardCustomOperators(workspacePath: string): Promise<void> {
    try {
      console.log('[scanStandardCustomOperators] 开始扫描算子合集和算子...');
      const {
        opsMeet,
        opsList,
        experimentalOpsList,
      } = this.scanOpsMeetAndOpsLists(workspacePath);

      console.log('[scanStandardCustomOperators] 算子合集列表:', opsMeet.map((m) => m.name));
      console.log('[scanStandardCustomOperators] 普通算子列表:', opsList.map((o) => o.name));
      console.log(
        '[scanStandardCustomOperators] experimental算子列表:',
        experimentalOpsList.map((o) => o.name),
      );
      await updateStandardCustomOperators(workspacePath, opsMeet, opsList, experimentalOpsList);
      console.log(`[scanStandardCustomOperators] 已更新: ${opsMeet.length} 个算子合集, ${opsList.length} 个普通算子, ${experimentalOpsList.length} 个experimental算子`);
    }
    catch (error) {
      console.warn(`[scanStandardCustomOperators] 更新算子信息失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
