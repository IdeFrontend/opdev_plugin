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
import { getProjectByPath } from '@plugin/domain/models/project-model';
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
  }
}
