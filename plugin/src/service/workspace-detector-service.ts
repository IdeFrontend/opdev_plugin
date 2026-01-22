/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
  OperatorProjectDetector,
  OperatorProjectType,
  type OperatorProjectDetectionResult,
} from '@plugin/domain/services/operator-project-detector';
import {
  getProjectByPath,
  updateStandardCustomOperators,
  type SubOperatorInfo,
  type OperatorCollectionInfo,
} from '@plugin/domain/models/project-model';
import { OperatorProjectIconTheme } from '@plugin/class/operator-project-icon-theme';

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
   * 扫描标准自定义算子（特殊规则）
   * 当识别为自定义算子目录后，标记指定的文件夹为算子工程集合
   * 标记的逻辑和鼠标右键标记的逻辑一致
   * 同时扫描算子合集和算子，更新项目信息
   */
  private static async scanStandardCustomOperators(workspacePath: string): Promise<void> {
    const context = (globalThis as unknown as { extensionContext: vscode.ExtensionContext })
      .extensionContext;

    if (!context) {
      return;
    }

    // 定义需要标记为算子工程集合的文件夹列表
    // experimental目录下的文件夹
    const experimentalFolders = [
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
    ];

    // 根目录下的文件夹
    const rootFolders = [
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
    ];

    // 使用与右键标记相同的逻辑
    const { FolderContextMenuService } = await import('./folder-context-menu-service.js');
    const iconTheme = OperatorProjectIconTheme.getInstance(context);
    const urisToUpdate: vscode.Uri[] = [];

    // 标记 experimental 目录下的文件夹
    const experimentalPath = path.join(workspacePath, 'experimental');
    const hasExperimental =
      fs.existsSync(experimentalPath)
      && fs.statSync(experimentalPath)
        .isDirectory();

    if (hasExperimental) {
      for (const folderName of experimentalFolders) {
        const folderPath = path.join(experimentalPath, folderName);

        const folderUri = vscode.Uri.file(folderPath);

        await FolderContextMenuService.markAsMultiOperatorProject(folderUri);
        urisToUpdate.push(folderUri);
      }
    }

    // 标记根目录下的文件夹
    for (const folderName of rootFolders) {
      const folderPath = path.join(workspacePath, folderName);

      const folderUri = vscode.Uri.file(folderPath);

      await FolderContextMenuService.markAsMultiOperatorProject(folderUri);
      urisToUpdate.push(folderUri);
    }

    // 触发装饰更新
    if (urisToUpdate.length > 0) {
      iconTheme.fireDecorationUpdate(urisToUpdate);
    }

    // 扫描算子合集和算子，更新项目信息
    try {
      console.log('[scanStandardCustomOperators] 开始扫描算子合集和算子...');

      // 1. 扫描第一层目录，找到算子合集（如 common、math、experimental 等）
      const opsMeet: OperatorCollectionInfo[] = [];
      const opsList: SubOperatorInfo[] = [];
      const experimentalOpsList: SubOperatorInfo[] = [];

      const entries = fs.readdirSync(workspacePath, { withFileTypes: true });

      for (const entry of entries) {
        // 只处理目录
        if (!entry.isDirectory()) {
          continue;
        }

        // 跳过隐藏目录和常见非算子工程目录
        const dirName = entry.name;

        if (
          dirName.startsWith('.')
          || dirName === 'node_modules'
          || dirName === 'out'
          || dirName === 'build'
        ) {
          continue;
        }

        const collectionPath = path.join(workspacePath, dirName);

        // 2. 扫描算子合集下的子目录，找到算子（如 abs、add 等）
        let hasOperators = false;
        const isExperimentalCollection = dirName.toLowerCase() === 'experimental';

        try {
          const subEntries = fs.readdirSync(collectionPath, { withFileTypes: true });

          for (const subEntry of subEntries) {
            if (!subEntry.isDirectory() || subEntry.name.startsWith('.')) {
              continue;
            }

            const operatorPath = path.join(collectionPath, subEntry.name);

            // 检查是否是算子（有 CMakeLists.txt）
            const operatorCmakeListsPath = path.join(operatorPath, 'CMakeLists.txt');

            if (fs.existsSync(operatorCmakeListsPath)) {
              hasOperators = true; // 标记这个目录包含算子

              // 检查是否已编译（检查是否有 build 目录或 out 目录）
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
        }
        catch (error) {
          console.warn(`[scanStandardCustomOperators] 扫描算子合集 ${dirName} 下的算子失败: ${error instanceof Error ? error.message : String(error)}`);
        }

        // 算子合集：只有包含算子的目录才作为算子合集，放到 ops_meet
        if (hasOperators) {
          opsMeet.push({
            name: dirName,
            path: collectionPath,
          });
        }
      }

      // 更新项目的算子信息
      console.log(`[scanStandardCustomOperators] 准备更新项目算子信息: ${workspacePath}`);
      console.log('[scanStandardCustomOperators] 算子合集列表:', opsMeet.map((m) => m.name));
      console.log('[scanStandardCustomOperators] 普通算子列表:', opsList.map((o) => o.name));
      console.log('[scanStandardCustomOperators] experimental算子列表:', experimentalOpsList.map((o) => o.name));

      await updateStandardCustomOperators(workspacePath, opsMeet, opsList, experimentalOpsList);
      console.log(`[scanStandardCustomOperators] 已更新: ${opsMeet.length} 个算子合集, ${opsList.length} 个普通算子, ${experimentalOpsList.length} 个experimental算子`);
    }
    catch (error) {
      console.warn(`[scanStandardCustomOperators] 更新算子信息失败: ${error instanceof Error ? error.message : String(error)}`);
      // 不影响主流程，只记录警告
    }
  }
}
