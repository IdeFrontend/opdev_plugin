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
import { createProject, getProjectByPath, deleteProject } from '@plugin/domain/models/project-model';
import { projectService } from './project-service';
import { ProjectManager } from '@plugin/core/project/project-manager';
import { generateStructure } from '@plugin/domain';
import { OperatorProjectIconTheme } from '@plugin/class/operator-project-icon-theme';
import { AutoMultiProjectDetector } from './auto-multi-project-detector';

/**
 * 工作区检测服务
 * 负责检测工作区是否为算子工程，如果不是则扫描子目录
 */
export class WorkspaceDetectorService {
  /**
   * 检测并注册工作区中的算子工程
   * @param workspacePath 工作区路径
   */
  static async detectAndRegisterWorkspace(workspacePath: string): Promise<void> {
    console.log('[WorkspaceDetectorService] 开始检测工作区算子工程');
    console.log('[WorkspaceDetectorService] workspacePath:', workspacePath);

    try {
      // 1. 先检测根目录是否为算子工程
      console.log('[WorkspaceDetectorService] 检测根目录是否为算子工程');
      const rootDetection = await OperatorProjectDetector.detectOperatorProject(workspacePath);
      console.log('[WorkspaceDetectorService] 根目录检测结果:', {
        isOperatorProject: rootDetection.isOperatorProject,
        projectType: rootDetection.projectType,
        projectName: rootDetection.projectName,
      });
      
      if (rootDetection.isOperatorProject && rootDetection.projectType) {
        // 根目录就是算子工程
        if (rootDetection.projectType === OperatorProjectType.STANDARD_CUSTOM) {
          // 标准自定义算子，需要特殊扫描逻辑
          console.log('[WorkspaceDetectorService] 根目录是标准自定义算子，开始特殊扫描');
          await this.scanStandardCustomOperators(workspacePath);
        } else {
          // 其他类型的算子工程，直接标记
          console.log('[WorkspaceDetectorService] 根目录是算子工程，调用手动标记方法');
          const uri = vscode.Uri.file(workspacePath);
          const { FolderContextMenuService } = await import('./folder-context-menu-service.js');
          await FolderContextMenuService.markAsOperatorProject(uri);
          console.log('[WorkspaceDetectorService] 根目录算子工程标记完成');
        }
        return;
      }

      // 2. 根目录不是算子工程，不做任何操作
      console.log('[WorkspaceDetectorService] 根目录不是算子工程，跳过检测');
    } catch (error) {
      console.error('[WorkspaceDetectorService] 检测工作区算子工程失败:', error);
      if (error instanceof Error) {
        console.error('[WorkspaceDetectorService] 错误堆栈:', error.stack);
      }
      vscode.window.showErrorMessage(
        `检测算子工程失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 扫描标准自定义算子（特殊规则）
   * 使用与右键标记算子合集相同的逻辑，确保一致性
   * 1. 根目录下存在 experimental 文件夹，则将experimental标记为算子工程集合
   * 2. 扫描的文件夹根目录下有CMakeLists.txt文件，则这个文件夹为算子文件
   * 3. 识别出来的所有算子，需要分为2类，在experimental目录下的算子会被归类为experimental算子
   * 4. 只标记根目录级的文件夹为算子工程集合（工作区根目录的直接子目录）
   * 5. 合集的子目录不可以再标记成算子合集
   */
  private static async scanStandardCustomOperators(workspacePath: string): Promise<void> {
    console.log('[WorkspaceDetectorService] ========== 开始扫描标准自定义算子 ==========');
    
    const context = (globalThis as unknown as { extensionContext: vscode.ExtensionContext })
      .extensionContext;
    
    if (!context) {
      console.error('[WorkspaceDetectorService] 无法获取扩展上下文');
      return;
    }

    // 使用与右键标记相同的扫描方法
    console.log(`[WorkspaceDetectorService] 使用 scanForStandardCustomOperatorProjects 扫描算子工程`);
    const detectedProjects = await OperatorProjectDetector.scanForStandardCustomOperatorProjects(
      workspacePath,
      3,
    );
    console.log(`[WorkspaceDetectorService] 扫描完成，找到 ${detectedProjects.length} 个标准自定义算子工程`);

    if (detectedProjects.length === 0) {
      console.log('[WorkspaceDetectorService] 未找到算子工程，跳过标记');
      return;
    }

    // 检查根目录下是否存在 experimental 文件夹
    const experimentalPath = path.join(workspacePath, 'experimental');
    const hasExperimental = fs.existsSync(experimentalPath) && fs.statSync(experimentalPath).isDirectory();
    
    console.log(`[WorkspaceDetectorService] experimental 文件夹存在: ${hasExperimental}, 路径: ${experimentalPath}`);

    // 分类算子工程：experimental算子和普通算子
    const experimentalOperators: OperatorProjectDetectionResult[] = [];
    const normalOperators: OperatorProjectDetectionResult[] = [];
    
    for (const detection of detectedProjects) {
      // 检查路径是否在 experimental 目录下
      const isExperimental = detection.projectPath.toLowerCase().startsWith(experimentalPath.toLowerCase());
      if (isExperimental) {
        experimentalOperators.push(detection);
      } else {
        normalOperators.push(detection);
      }
    }
    
    console.log(`[WorkspaceDetectorService] experimental算子: ${experimentalOperators.length} 个`);
    console.log(`[WorkspaceDetectorService] 普通算子: ${normalOperators.length} 个`);

    // 注册所有算子工程（标记experimental属性）
    const subProjectIds: number[] = [];
    console.log(`[WorkspaceDetectorService] 开始注册 ${detectedProjects.length} 个算子工程`);
    for (const detection of detectedProjects) {
      if (!detection.projectType) {
        console.warn(`[WorkspaceDetectorService] 跳过无类型的算子工程: ${detection.projectPath}`);
        continue;
      }
      
      // 判断是否是 experimental 算子
      const isExperimental = detection.projectPath.toLowerCase().startsWith(experimentalPath.toLowerCase());
      let subProject = getProjectByPath(detection.projectPath);
      if (!subProject) {
        // 子目录是算子工程，但还没有被标记，需要标记为算子工程
        console.log(`[WorkspaceDetectorService] 标记算子工程: ${detection.projectName} (${detection.projectPath}), experimental: ${isExperimental}`);
        const subId = await createProject({
          project_name: detection.projectName,
          project_path: detection.projectPath,
          project_type: detection.projectType,
          is_experimental: isExperimental,
        });
        subProjectIds.push(subId);
        console.log(`[WorkspaceDetectorService] 已标记算子工程: ${detection.projectName}, ID: ${subId}`);
      } else {
        // 子目录已经是算子工程，更新experimental标记（如果需要）
        console.log(`[WorkspaceDetectorService] 算子工程已存在: ${detection.projectName} (${detection.projectPath}), ID: ${subProject.id}`);
        if (subProject.is_experimental !== isExperimental) {
          console.log(`[WorkspaceDetectorService] 更新experimental标记: ${detection.projectName}, ${subProject.is_experimental} -> ${isExperimental}`);
          await createProject({
            project_name: detection.projectName,
            project_path: detection.projectPath,
            project_type: detection.projectType,
            is_experimental: isExperimental,
          });
        }
        subProjectIds.push(subProject.id);
      }
    }
    console.log(`[WorkspaceDetectorService] 算子工程注册完成，共 ${subProjectIds.length} 个`);

    // 标记 experimental 文件夹为算子工程集合（如果存在且当前目录不是 experimental 本身）
    if (hasExperimental) {
      const existingExperimental = getProjectByPath(experimentalPath);
      if (!existingExperimental || existingExperimental.project_type !== OperatorProjectType.MULTI_PROJECT) {
        const experimentalProjectIds = experimentalOperators
          .map(p => getProjectByPath(p.projectPath)?.id)
          .filter((id): id is number => id !== undefined);
        
        await createProject({
          project_name: 'experimental',
          project_path: experimentalPath,
          project_type: OperatorProjectType.MULTI_PROJECT,
          sub_project_ids: experimentalProjectIds.length > 0 ? experimentalProjectIds : undefined,
        });
        console.log(`[WorkspaceDetectorService] ✓ 已标记 experimental 为算子工程集合`);
      }
    }

    // 只标记根目录级的文件夹为算子工程集合
    // 获取工作区根目录的直接子目录（深度为1的目录）
    const normalizedWorkspacePath = path.normalize(workspacePath).replace(/\\/g, '/');
    const rootLevelParentDirMap = new Map<string, string[]>();
    
    for (const detection of detectedProjects) {
      const parentDir = path.dirname(detection.projectPath);
      const normalizedParentDir = path.normalize(parentDir).replace(/\\/g, '/');
      
      // 检查父目录是否在工作区根目录下，且深度为1（即根目录的直接子目录）
      if (normalizedParentDir.startsWith(normalizedWorkspacePath)) {
        const relativePath = normalizedParentDir.substring(normalizedWorkspacePath.length).replace(/^[/\\]/, '');
        const depth = relativePath.split(/[/\\]/).filter(p => p.length > 0).length;
        
        // 只处理根目录的直接子目录（深度为1）
        if (depth === 1) {
          // 检查该父目录是否已经是算子工程集合（合集的子目录不能再标记成算子合集）
          const existingParent = getProjectByPath(parentDir);
          if (existingParent && existingParent.project_type === OperatorProjectType.MULTI_PROJECT) {
            console.log(`[WorkspaceDetectorService] 跳过已标记为合集的目录: ${parentDir}`);
            continue;
          }
          
          // 检查该父目录是否已经在某个合集下（合集的子目录不可以再标记成算子合集）
          let isInCollection = false;
          let currentDir = path.dirname(parentDir);
          while (currentDir !== workspacePath && currentDir !== path.dirname(currentDir)) {
            const normalizedCurrentDir = path.normalize(currentDir).replace(/\\/g, '/');
            if (normalizedCurrentDir.startsWith(normalizedWorkspacePath)) {
              const ancestorProject = getProjectByPath(currentDir);
              if (ancestorProject && ancestorProject.project_type === OperatorProjectType.MULTI_PROJECT) {
                console.log(`[WorkspaceDetectorService] 父目录 "${parentDir}" 已经在合集 "${currentDir}" 下，跳过标记为合集`);
                isInCollection = true;
                break;
              }
            }
            const parentOfCurrent = path.dirname(currentDir);
            if (parentOfCurrent === currentDir) {
              break;
            }
            currentDir = parentOfCurrent;
          }
          
          if (isInCollection) {
            continue;
          }
          
          // 检查该父目录是否在 experimental 目录下（experimental 已单独处理）
          if (normalizedParentDir === path.normalize(experimentalPath).replace(/\\/g, '/')) {
            continue;
          }
          
          if (!rootLevelParentDirMap.has(normalizedParentDir)) {
            rootLevelParentDirMap.set(normalizedParentDir, []);
          }
          rootLevelParentDirMap.get(normalizedParentDir)!.push(detection.projectPath);
        }
      }
    }

    // 标记包含多个算子的根目录级父目录为合集
    for (const [parentDir, operatorPaths] of rootLevelParentDirMap.entries()) {
      if (operatorPaths.length > 1) {
        const existing = getProjectByPath(parentDir);
        if (!existing || existing.project_type !== OperatorProjectType.MULTI_PROJECT) {
          const subProjectIds = operatorPaths
            .map(p => getProjectByPath(p)?.id)
            .filter((id): id is number => id !== undefined);
          
          if (subProjectIds.length > 1) {
            const parentDirName = path.basename(parentDir);
            await createProject({
              project_name: parentDirName,
              project_path: parentDir,
              project_type: OperatorProjectType.MULTI_PROJECT,
              sub_project_ids: subProjectIds,
            });
            console.log(`[WorkspaceDetectorService] ✓ 已标记根目录级文件夹 ${parentDirName} 为算子工程集合 (包含 ${subProjectIds.length} 个子算子)`);
          }
        }
      }
    }

    // 触发装饰更新
    const iconTheme = OperatorProjectIconTheme.getInstance(context);
    const allProjectPaths = [
      ...detectedProjects.map(p => p.projectPath),
      ...Array.from(rootLevelParentDirMap.keys()).filter(dir => {
        const existing = getProjectByPath(dir);
        return existing && existing.project_type === OperatorProjectType.MULTI_PROJECT;
      }),
    ];
    if (hasExperimental) {
      allProjectPaths.push(experimentalPath);
    }
    const uris = allProjectPaths.map(p => vscode.Uri.file(p));
    if (uris.length > 0) {
      iconTheme.fireDecorationUpdate(uris);
    }
    
    console.log('[WorkspaceDetectorService] ========== 标准自定义算子扫描完成 ==========');
  }


  /**
   * 注册单个算子工程
   */
  private static async registerOperatorProject(
    detection: OperatorProjectDetectionResult,
    workspacePath: string,
  ): Promise<void> {
    console.log('[WorkspaceDetectorService] 注册单个算子工程');
    console.log('[WorkspaceDetectorService] detection:', {
      isOperatorProject: detection.isOperatorProject,
      projectType: detection.projectType,
      projectPath: detection.projectPath,
      projectName: detection.projectName,
    });

    if (!detection.projectType) {
      console.warn('[WorkspaceDetectorService] 算子工程类型未定义，跳过注册');
      return;
    }

    // 检查是否已注册
    const existing = getProjectByPath(detection.projectPath);
    if (existing) {
      console.log(`[WorkspaceDetectorService] 项目已存在，ID: ${existing.id}, 类型: ${existing.project_type}`);
      // 已存在，更新类型（如果需要）
      if (existing.project_type !== detection.projectType) {
        console.log(`[WorkspaceDetectorService] 更新项目类型: ${existing.project_type} -> ${detection.projectType}`);
        await createProject({
          project_name: detection.projectName,
          project_path: detection.projectPath,
          project_type: detection.projectType,
        });
      }
      return;
    }

    // 注册新项目
    console.log('[WorkspaceDetectorService] 注册新项目');
    const projectId = await createProject({
      project_name: detection.projectName,
      project_path: detection.projectPath,
      project_type: detection.projectType,
    });
    console.log(`[WorkspaceDetectorService] 新项目注册完成，ID: ${projectId}`);
    console.log(`[WorkspaceDetectorService] 项目路径: ${detection.projectPath}`);
    console.log(`[WorkspaceDetectorService] 项目类型: ${detection.projectType}`);
    
  }

  /**
   * 注册多算子工程集合
   */
  private static async registerMultiProject(
    workspacePath: string,
    detectedProjects: OperatorProjectDetectionResult[],
  ): Promise<void> {
    console.log('[WorkspaceDetectorService] 注册多算子工程集合');
    console.log('[WorkspaceDetectorService] workspacePath:', workspacePath);
    console.log(`[WorkspaceDetectorService] 检测到的算子工程数量: ${detectedProjects.length}`);

    const workspaceName = path.basename(workspacePath);

    // 检查是否已注册
    let existing = getProjectByPath(workspacePath);
    let parentProjectId: number | undefined;

    if (existing) {
      console.log(`[WorkspaceDetectorService] 项目已存在，ID: ${existing.id}, 类型: ${existing.project_type}`);
      
      // 如果已存在的项目不是 MULTI_PROJECT 类型，需要先删除再重新创建
      if (existing.project_type !== OperatorProjectType.MULTI_PROJECT) {
        console.log(`[WorkspaceDetectorService] 警告: 项目 "${workspacePath}" 已存在但类型为 "${existing.project_type}"，不是 MULTI_PROJECT`);
        console.log(`[WorkspaceDetectorService] 将删除旧项目并重新创建为 MULTI_PROJECT`);
        // 删除旧项目（deleteProject 接受项目路径）
        const deleted = deleteProject(workspacePath);
        console.log(`[WorkspaceDetectorService] 已删除旧项目，ID: ${existing.id}, 删除结果: ${deleted}`);
        // 继续执行创建新项目的逻辑，将 existing 设为 undefined
        existing = undefined;
      } else {
        // 已经是 MULTI_PROJECT 类型，更新子项目列表
        console.log(`[WorkspaceDetectorService] 多算子工程集合已存在，更新子项目列表`);
        parentProjectId = existing.id;
        const subProjectIds: number[] = [];
        for (const detection of detectedProjects) {
          if (!detection.projectType) {
            console.warn(`[WorkspaceDetectorService] 跳过无类型的算子工程: ${detection.projectPath}`);
            continue;
          }
          
          const subProject = getProjectByPath(detection.projectPath);
          if (subProject) {
            console.log(`[WorkspaceDetectorService] 子项目已存在: ${detection.projectName}, ID: ${subProject.id}`);
            subProjectIds.push(subProject.id);
          } else {
            // 注册子项目
            console.log(`[WorkspaceDetectorService] 注册新子项目: ${detection.projectName}`);
            const subId = await createProject({
              project_name: detection.projectName,
              project_path: detection.projectPath,
              project_type: detection.projectType,
            });
            console.log(`[WorkspaceDetectorService] 子项目注册完成，ID: ${subId}`);
            subProjectIds.push(subId);
          }
        }
        
        console.log(`[WorkspaceDetectorService] 更新多算子工程集合，子项目数量: ${subProjectIds.length}`);
        // 更新父项目
        await createProject({
          project_name: workspaceName,
          project_path: workspacePath,
          project_type: OperatorProjectType.MULTI_PROJECT,
          sub_project_ids: subProjectIds,
        });
        return; // 已更新，直接返回
      }
    }
    
    // 创建新的多算子工程集合（包括 existing 但类型不对的情况）
    if (!existing) {
      console.log('[WorkspaceDetectorService] 创建新的多算子工程集合');
      // 创建新的多算子工程集合
      const subProjectIds: number[] = [];
      
      // 先注册所有子项目
      for (const detection of detectedProjects) {
        if (!detection.projectType) {
          console.warn(`[WorkspaceDetectorService] 跳过无类型的算子工程: ${detection.projectPath}`);
          continue;
        }
        
        console.log(`[WorkspaceDetectorService] 注册子项目: ${detection.projectName}, 类型: ${detection.projectType}`);
        const subId = await createProject({
          project_name: detection.projectName,
          project_path: detection.projectPath,
          project_type: detection.projectType,
        });
        console.log(`[WorkspaceDetectorService] 子项目注册完成，ID: ${subId}`);
        subProjectIds.push(subId);
      }

      console.log(`[WorkspaceDetectorService] 创建父项目（多算子工程集合），子项目数量: ${subProjectIds.length}`);
      // 创建父项目（多算子工程集合）
      parentProjectId = await createProject({
        project_name: workspaceName,
        project_path: workspacePath,
        project_type: OperatorProjectType.MULTI_PROJECT,
        sub_project_ids: subProjectIds,
      });
      console.log(`[WorkspaceDetectorService] 父项目创建完成，ID: ${parentProjectId}`);
    }


    // 初始化所有子项目
    console.log('[WorkspaceDetectorService] 开始初始化所有子项目');
    for (let i = 0; i < detectedProjects.length; i++) {
      const detection = detectedProjects[i];
      if (detection.isOperatorProject && detection.projectType) {
        console.log(`[WorkspaceDetectorService] 初始化子项目 ${i + 1}/${detectedProjects.length}: ${detection.projectName}`);
        try {
          await this.initializeOperatorProject(detection, workspacePath);
          console.log(`[WorkspaceDetectorService] 子项目 ${detection.projectName} 初始化完成`);
        } catch (error) {
          console.error(`[WorkspaceDetectorService] 子项目 ${detection.projectName} 初始化失败:`, error);
          // 继续初始化其他子项目
        }
      }
    }
    console.log('[WorkspaceDetectorService] 所有子项目初始化完成');
    
    // 最终打印算子工程集合信息
    console.log('[WorkspaceDetectorService] ========== 算子工程集合信息 ==========');
    const finalProject = getProjectByPath(workspacePath);
    if (finalProject) {
      console.log(`[WorkspaceDetectorService] 集合名称: ${finalProject.project_name}`);
      console.log(`[WorkspaceDetectorService] 集合路径: ${finalProject.project_path}`);
      console.log(`[WorkspaceDetectorService] 集合类型: ${finalProject.project_type}`);
      console.log(`[WorkspaceDetectorService] 集合ID: ${finalProject.id}`);
      console.log(`[WorkspaceDetectorService] 子项目数量: ${finalProject.sub_project_ids?.length || 0}`);
      if (finalProject.sub_project_ids && finalProject.sub_project_ids.length > 0) {
        console.log(`[WorkspaceDetectorService] 子项目ID列表: ${finalProject.sub_project_ids.join(', ')}`);
      }
    }
    console.log('[WorkspaceDetectorService] =======================================');
  }

  /**
   * 初始化算子工程
   * 参考新增算子的逻辑，但不覆盖已有文件
   */
  private static async initializeOperatorProject(
    detection: OperatorProjectDetectionResult,
    workspacePath: string,
  ): Promise<void> {
    console.log('[WorkspaceDetectorService] 开始初始化算子工程');
    console.log('[WorkspaceDetectorService] detection:', {
      isOperatorProject: detection.isOperatorProject,
      projectType: detection.projectType,
      projectPath: detection.projectPath,
      projectName: detection.projectName,
    });

    if (!detection.isOperatorProject || !detection.projectType) {
      console.warn('[WorkspaceDetectorService] 不是算子工程或类型未定义，跳过初始化');
      return;
    }

    try {
      // 获取项目信息
      const project = getProjectByPath(detection.projectPath);
      if (!project) {
        console.warn(`[WorkspaceDetectorService] 项目未找到: ${detection.projectPath}`);
        return;
      }

      console.log(`[WorkspaceDetectorService] 找到项目，ID: ${project.id}`);

      // 设置 ProjectManager 的项目信息
      const pm = ProjectManager.getInstance();
      pm['_projectId'] = String(project.id);
      pm['_projectName'] = detection.projectName;
      pm['_projectPath'] = detection.projectPath;
      console.log(`[WorkspaceDetectorService] ProjectManager 设置完成: projectId=${pm['_projectId']}, projectName=${pm['_projectName']}`);

      // 根据算子工程类型确定模板名称和类型
      let templateName: string | undefined;
      let opType: string = 'ascend';
      let createOperatorProjectDictoryFileType: number = 1;

      switch (detection.projectType) {
        case OperatorProjectType.ASCEND_C:
          // <<<>>>算子工程，默认使用 hello_world 模板
          templateName = 'hello_world';
          opType = 'ascend';
          createOperatorProjectDictoryFileType = 1;
          console.log('[WorkspaceDetectorService] 算子类型: ASCEND_C, 使用 hello_world 模板');
          break;
        case OperatorProjectType.TORCH_LIBRARY:
          // torch_library算子工程
          templateName = 'torch_library_template';
          opType = 'ascend';
          createOperatorProjectDictoryFileType = 1;
          console.log('[WorkspaceDetectorService] 算子类型: TORCH_LIBRARY, 使用 torch_library_template 模板');
          break;
        case OperatorProjectType.PYASC:
          // pyasc算子工程，不需要模板
          console.log('[WorkspaceDetectorService] 算子类型: PYASC, 跳过初始化');
          return;
        case OperatorProjectType.STANDARD_CUSTOM:
          // 标准自定义算子工程
          opType = 'cann';
          createOperatorProjectDictoryFileType = 2;
          console.log('[WorkspaceDetectorService] 算子类型: STANDARD_CUSTOM, 使用 CANN 类型');
          break;
        default:
          console.warn(`[WorkspaceDetectorService] 未知的算子类型: ${detection.projectType}, 跳过初始化`);
          return;
      }

      console.log('[WorkspaceDetectorService] 初始化参数:', {
        templateName,
        opType,
        createOperatorProjectDictoryFileType,
      });

      // 调用初始化逻辑（参考 welcome-controller.ts 的 createdProject 方法）
      // 这里需要调用类似的初始化逻辑，但不覆盖已有文件
      await this.initializeProjectFiles(
        detection.projectPath,
        detection.projectName,
        templateName,
        opType,
        createOperatorProjectDictoryFileType,
      );
      console.log('[WorkspaceDetectorService] 算子工程初始化完成');
    } catch (error) {
      console.error(`[WorkspaceDetectorService] 初始化算子工程失败 ${detection.projectPath}:`, error);
      if (error instanceof Error) {
        console.error(`[WorkspaceDetectorService] 错误堆栈:`, error.stack);
      }
      throw error;
    }
  }

  /**
   * 初始化项目文件（不覆盖已有文件）
   */
  private static async initializeProjectFiles(
    projectPath: string,
    projectName: string,
    templateName: string | undefined,
    opType: string,
    createOperatorProjectDictoryFileType: number,
  ): Promise<void> {
    console.log('[WorkspaceDetectorService] 开始初始化项目文件');
    console.log('[WorkspaceDetectorService] projectPath:', projectPath);
    console.log('[WorkspaceDetectorService] projectName:', projectName);
    console.log('[WorkspaceDetectorService] templateName:', templateName);
    console.log('[WorkspaceDetectorService] opType:', opType);
    console.log('[WorkspaceDetectorService] createOperatorProjectDictoryFileType:', createOperatorProjectDictoryFileType);

    try {
      const project = getProjectByPath(projectPath);
      if (!project) {
        console.warn(`[WorkspaceDetectorService] 项目未找到: ${projectPath}`);
        return;
      }

      console.log(`[WorkspaceDetectorService] 找到项目，ID: ${project.id}, 类型: ${project.project_type}`);

      // 调用 projectService.init 初始化项目
      console.log('[WorkspaceDetectorService] 开始调用 projectService.init');
      await projectService.init({
        projectPath: path.dirname(projectPath),
        projectName,
      });
      console.log('[WorkspaceDetectorService] projectService.init 完成');

      // 调用 generateStructure，传入 skipExisting: true 以不覆盖已有文件
      const context = (globalThis as unknown as { extensionContext: vscode.ExtensionContext })
        .extensionContext;
      
      console.log('[WorkspaceDetectorService] 开始调用 generateStructure');
      await generateStructure(
        {
          project_id: project.id,
          op_type: opType,
          op_name: projectName,
          template_name: templateName,
          op_path: projectPath,
          skipExisting: true, // 不覆盖已有文件
        } as any,
        context.extensionPath,
      );
      console.log('[WorkspaceDetectorService] generateStructure 完成');

      // 如果需要创建算子文件，调用相应的命令
      if (createOperatorProjectDictoryFileType) {
        console.log(`[WorkspaceDetectorService] 需要创建算子文件，类型: ${createOperatorProjectDictoryFileType}`);
        try {
          // 使用 withProgress 包装命令调用，提供 progress 参数
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: '初始化算子工程文件...',
              cancellable: false,
            },
            async (progress) => {
              progress.report({
                increment: 0,
                message: '创建算子文件...',
              });

              console.log('[WorkspaceDetectorService] 执行创建算子文件命令');
              await vscode.commands.executeCommand(
                'huawei-op-devtools.createDictory',
                {
                  createOperatorProjectDirectoryFileType: createOperatorProjectDictoryFileType,
                },
                progress,
              );
              console.log('[WorkspaceDetectorService] 创建算子文件命令执行完成');
            },
          );
        } catch (error) {
          console.error(`[WorkspaceDetectorService] 创建算子文件失败:`, error);
          throw error;
        }
      } else {
        console.log('[WorkspaceDetectorService] 不需要创建算子文件');
      }

      console.log('[WorkspaceDetectorService] 初始化项目文件完成');
    } catch (error) {
      console.error(`[WorkspaceDetectorService] 初始化项目文件失败:`, error);
      if (error instanceof Error) {
        console.error(`[WorkspaceDetectorService] 错误堆栈:`, error.stack);
      }
      throw error;
    }
  }

  /**
   * 注册完成后刷新资源管理器和更新图标主题
   * 同时更新上下文变量，模拟手动操作的效果
   */
  private static async refreshAfterRegistration(projectPath?: string): Promise<void> {
    try {
      const context = (globalThis as unknown as { extensionContext: vscode.ExtensionContext })
        .extensionContext;
      if (context) {
        // 触发装饰更新
        const iconTheme = OperatorProjectIconTheme.getInstance(context);
        if (projectPath) {
          iconTheme.fireDecorationUpdate(vscode.Uri.file(projectPath));
        } else {
          iconTheme.fireDecorationUpdate();
        }
        
        // 如果有项目路径，更新该路径的上下文变量
        if (projectPath) {
          const uri = vscode.Uri.file(projectPath);
          const { FolderContextMenuService } = await import('./folder-context-menu-service.js');
          const checkResult = await FolderContextMenuService.checkIsOperatorProject(uri);
          
          // 更新上下文变量，模拟手动操作的效果
          await vscode.commands.executeCommand(
            'setContext',
            'operatorProjectMarked',
            checkResult.isOperatorProject && !checkResult.isMultiProject,
          );
          await vscode.commands.executeCommand(
            'setContext',
            'multiOperatorProjectMarked',
            checkResult.isMultiProject,
          );
          await vscode.commands.executeCommand(
            'setContext',
            'operatorProjectType',
            checkResult.projectType || '',
          );
          
          console.log(`[WorkspaceDetectorService] 已更新上下文变量: operatorProjectMarked=${checkResult.isOperatorProject && !checkResult.isMultiProject}, multiOperatorProjectMarked=${checkResult.isMultiProject}`);
        }
        
        // 延迟刷新资源管理器，确保菜单显示正确
        setTimeout(() => {
          vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');
        }, 500);
      }
    } catch (error) {
      console.error('[WorkspaceDetectorService] 刷新资源管理器失败:', error);
    }
  }
}
