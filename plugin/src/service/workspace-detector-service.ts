/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as vscode from 'vscode';
import * as path from 'path';
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
import { FolderContextMenuService } from './folder-context-menu-service';

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
        // 根目录就是算子工程，调用手动标记方法（会自动处理图标更新）
        console.log('[WorkspaceDetectorService] 根目录是算子工程，调用手动标记方法');
        const uri = vscode.Uri.file(workspacePath);
        await FolderContextMenuService.markAsOperatorProject(uri);
        console.log('[WorkspaceDetectorService] 根目录算子工程标记完成');
        return;
      }

      // 2. 根目录不是算子工程，扫描子目录（最多3层）
      console.log('[WorkspaceDetectorService] 根目录不是算子工程，开始扫描子目录（最多3层）');
      const detectedProjects = await OperatorProjectDetector.scanForOperatorProjects(
        workspacePath,
        3,
      );
      
      // 过滤：只保留真正是算子工程的项目
      const validProjects = detectedProjects.filter(
        (p) => p.isOperatorProject && p.projectType,
      );
      
      console.log(`[WorkspaceDetectorService] 扫描完成，找到 ${detectedProjects.length} 个项目，其中 ${validProjects.length} 个是有效的算子工程`);
      
      // 详细打印所有扫描到的算子工程
      console.log('[WorkspaceDetectorService] ========== 扫描到的算子工程列表 ==========');
      validProjects.forEach((project, index) => {
        console.log(`[WorkspaceDetectorService] [${index + 1}] 名称: ${project.projectName}`);
        console.log(`[WorkspaceDetectorService] [${index + 1}] 路径: ${project.projectPath}`);
        console.log(`[WorkspaceDetectorService] [${index + 1}] 类型: ${project.projectType || '未知'}`);
        console.log(`[WorkspaceDetectorService] [${index + 1}] 是否为算子工程: ${project.isOperatorProject}`);
      });
      console.log('[WorkspaceDetectorService] ============================================');

      if (validProjects.length === 0) {
        // 没有找到算子工程
        console.log('[WorkspaceDetectorService] 未找到有效的算子工程');
        return;
      }

      if (validProjects.length === 1) {
        // 只有一个算子工程，调用手动标记方法（会自动处理图标更新）
        console.log('[WorkspaceDetectorService] 找到1个算子工程，调用手动标记方法');
        const uri = vscode.Uri.file(validProjects[0].projectPath);
        await FolderContextMenuService.markAsOperatorProject(uri);
        console.log('[WorkspaceDetectorService] 算子工程标记完成');
      } else {
        // 多个算子工程，调用手动标记为算子工程集合的方法（会自动处理图标更新）
        console.log(`[WorkspaceDetectorService] 找到${validProjects.length}个算子工程，调用手动标记为算子工程集合方法`);
        console.log(`[WorkspaceDetectorService] 算子工程集合路径: ${workspacePath}`);
        console.log(`[WorkspaceDetectorService] 算子工程集合名称: ${path.basename(workspacePath)}`);
        const uri = vscode.Uri.file(workspacePath);
        await FolderContextMenuService.markAsMultiOperatorProject(uri);
        console.log('[WorkspaceDetectorService] 多算子工程集合标记完成');
      }
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
        // 更新图标主题
        const iconTheme = OperatorProjectIconTheme.getInstance(context);
        await iconTheme.updateIconTheme();
        
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
