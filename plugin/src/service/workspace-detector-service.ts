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
import { getOpsByProjectId } from '@plugin/domain/models/model';
import { getConfig, postConfig } from '@plugin/domain/services/configuration';

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
   * 当识别为自定义算子目录后，标记指定的文件夹为算子工程集合
   * 标记的逻辑和鼠标右键标记的逻辑一致
   */
  private static async scanStandardCustomOperators(workspacePath: string): Promise<void> {
    console.log('[WorkspaceDetectorService] ========== 开始标记标准自定义算子集合 ==========');

    const context = (globalThis as unknown as { extensionContext: vscode.ExtensionContext })
      .extensionContext;

    if (!context) {
      console.error('[WorkspaceDetectorService] 无法获取扩展上下文');
      return;
    }

    // 获取根目录名称
    const rootDirName = path.basename(workspacePath);

    // 使用进度条显示标记过程
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `正在扫描 ${rootDirName} 的文件`,
        cancellable: false,
      },
      async (progress) => {
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

        // 计算总文件夹数量（用于进度显示）
        const totalFolders = experimentalFolders.length + rootFolders.length;
        let processedFolders = 0;

        // 标记 experimental 目录下的文件夹
        const experimentalPath = path.join(workspacePath, 'experimental');
        const hasExperimental = fs.existsSync(experimentalPath)
          && fs.statSync(experimentalPath).isDirectory();

        if (hasExperimental) {
          console.log('[WorkspaceDetectorService] experimental 目录存在，开始标记其下的文件夹');
          progress.report({
            message: '正在扫描 experimental 目录...',
            increment: 0,
          });

          for (const folderName of experimentalFolders) {
            const folderPath = path.join(experimentalPath, folderName);

            if (fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory()) {
              const folderUri = vscode.Uri.file(folderPath);
              const existing = getProjectByPath(folderPath);

              if (!existing || existing.project_type !== OperatorProjectType.MULTI_PROJECT) {
                processedFolders++;
                progress.report({
                  message: `正在标记 experimental/${folderName}...`,
                  increment: (90 / totalFolders),
                });
                console.log(`[WorkspaceDetectorService] 标记 experimental/${folderName} 为算子工程集合`);
                await FolderContextMenuService.markAsMultiOperatorProject(folderUri);
                console.log(`[WorkspaceDetectorService] ✓ 已标记 experimental/${folderName} 为算子工程集合`);
                urisToUpdate.push(folderUri);
              }
              else {
                console.log(`[WorkspaceDetectorService] experimental/${folderName} 已经是算子工程集合，跳过`);
              }
            }
            else {
              console.log(`[WorkspaceDetectorService] experimental/${folderName} 不存在，忽略`);
            }
          }
        }
        else {
          console.log('[WorkspaceDetectorService] experimental 目录不存在，跳过');
        }

        // 标记根目录下的文件夹
        console.log('[WorkspaceDetectorService] 开始标记根目录下的文件夹');
        progress.report({
          message: '正在扫描根目录...',
        });

        for (const folderName of rootFolders) {
          const folderPath = path.join(workspacePath, folderName);

          if (fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory()) {
            const folderUri = vscode.Uri.file(folderPath);
            const existing = getProjectByPath(folderPath);

            if (!existing || existing.project_type !== OperatorProjectType.MULTI_PROJECT) {
              processedFolders++;
              progress.report({
                message: `正在标记 ${folderName}...`,
                increment: (90 / totalFolders),
              });
              console.log(`[WorkspaceDetectorService] 标记 ${folderName} 为算子工程集合`);
              await FolderContextMenuService.markAsMultiOperatorProject(folderUri);
              console.log(`[WorkspaceDetectorService] ✓ 已标记 ${folderName} 为算子工程集合`);
              urisToUpdate.push(folderUri);
            }
            else {
              console.log(`[WorkspaceDetectorService] ${folderName} 已经是算子工程集合，跳过`);
            }
          }
          else {
            console.log(`[WorkspaceDetectorService] ${folderName} 不存在，忽略`);
          }
        }

        // 触发装饰更新
        progress.report({
          message: '正在更新图标...',
          increment: 5,
        });

        if (urisToUpdate.length > 0) {
          iconTheme.fireDecorationUpdate(urisToUpdate);
        }

        progress.report({
          message: '标记完成',
          increment: 5,
        });

        console.log(`[WorkspaceDetectorService] ========== 标准自定义算子集合标记完成，共标记 ${urisToUpdate.length} 个文件夹 ==========`);
      },
    );
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
          // 获取项目的 projectId
          const project = getProjectByPath(detection.projectPath);
          if (project) {
            await this.initializeOperatorProject(detection, project.id);
            console.log(`[WorkspaceDetectorService] 子项目 ${detection.projectName} 初始化完成`);
          } else {
            console.warn(`[WorkspaceDetectorService] 子项目未找到: ${detection.projectPath}`);
          }
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
   * @param detection 算子工程检测结果
   * @param projectId 项目ID
   */
  private static async initializeOperatorProject(
    detection: OperatorProjectDetectionResult,
    projectId: number,
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
      // 使用传入的 projectId
      console.log(`[WorkspaceDetectorService] 开始初始化算子工程，projectId: ${projectId}`);

      // 获取项目信息
      const project = getProjectByPath(detection.projectPath);
      if (!project) {
        console.warn(`[WorkspaceDetectorService] 项目未找到: ${detection.projectPath}`);
        return;
      }

      // 设置 ProjectManager 的项目信息
      const pm = ProjectManager.getInstance();
      pm['_projectId'] = String(projectId);
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

      // 对于标准自定义算子，如果没有模板，跳过模板解压，只创建配置
      const isSkipUnZip = project.project_type === OperatorProjectType.STANDARD_CUSTOM && !templateName;
      console.log('[WorkspaceDetectorService] 开始调用 generateStructure, isSkipUnZip:', isSkipUnZip);
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
        isSkipUnZip, // 标准自定义算子且无模板时，跳过模板解压
      );
      console.log('[WorkspaceDetectorService] generateStructure 完成');

      // 对于标准自定义算子，根据官方文档配置编译部署命令行
      if (project.project_type === OperatorProjectType.STANDARD_CUSTOM) {
        await this.configureStandardCustomOperatorBuildCommands(project, projectName, projectPath);
      }

      // 如果需要创建算子文件，调用相应的命令
      if (createOperatorProjectDictoryFileType) {
        console.log(`[WorkspaceDetectorService] 需要创建算子文件，类型: ${createOperatorProjectDictoryFileType}`);
        try {
          // 使用 withProgress 包装命令调用，提供 progress 参数
          await vscode.commands.executeCommand(
            'huawei-op-devtools.createDictory',
            {
              createOperatorProjectDirectoryFileType: createOperatorProjectDictoryFileType,
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
   * 为标准自定义算子配置编译部署命令行
   * 根据官方文档配置编译和运行验证命令
   * @param project 项目信息
   * @param projectName 算子名称
   * @param projectPath 算子路径
   */
  private static async configureStandardCustomOperatorBuildCommands(
    project: ReturnType<typeof getProjectByPath>,
    projectName: string,
    projectPath: string,
  ): Promise<void> {
    if (!project) {
      console.warn('[WorkspaceDetectorService] 项目不存在，跳过配置编译部署命令行');
      return;
    }

    console.log('[WorkspaceDetectorService] 开始为标准自定义算子配置编译部署命令行');
    console.log('[WorkspaceDetectorService] 项目信息:', {
      projectId: project.id,
      projectName,
      projectPath,
      isExperimental: project.is_experimental,
    });

    try {
      // 获取工作区根目录（项目根目录）
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        console.warn('[WorkspaceDetectorService] 无法获取工作区根目录，跳过配置');
        return;
      }
      const workspaceRoot = workspaceFolders[0].uri.fsPath;

      // 判断是否是experimental算子
      const isExperimental = project.is_experimental || false;

      // 获取build_op配置
      const buildOpConfigs = getConfig(project.id, 'build_op', projectName);
      let buildOpConfig = buildOpConfigs.length > 0 ? buildOpConfigs[0] : null;

      // 根据官方文档配置编译命令
      // 编译命令：bash build.sh --pkg --soc=ascend910b [--vendor_name=${vendor_name}] [--ops=${op_list}] [--experimental]
      // 默认使用ascend910b，可以根据需要调整
      const socVersion = 'ascend910b';
      const opName = projectName.toLowerCase().replace(/_/g, '-'); // 转换为小写，下划线转横线
      const experimentalFlag = isExperimental ? '--experimental' : '';
      
      // 构建编译命令
      const buildScript = `bash build.sh --pkg --soc=${socVersion} --ops=${opName} ${experimentalFlag}`.trim();

      // 根据官方文档配置运行验证命令
      // 运行验证命令：bash build.sh --run_example ${op} eager cust [--vendor_name=${vendor_name}] [--soc=${soc_version}] [--experimental]
      const runCommand = `bash build.sh --run_example ${opName} eager cust --soc=${socVersion} ${experimentalFlag}`.trim();

      console.log('[WorkspaceDetectorService] 编译命令:', buildScript);
      console.log('[WorkspaceDetectorService] 运行验证命令:', runCommand);

      // 更新或创建build_op配置
      if (buildOpConfig) {
        // 更新现有配置
        const userOptions = (buildOpConfig.user_options as Record<string, unknown>) || {};
        userOptions.script = buildScript;
        userOptions.target_file = runCommand;
        userOptions.op = projectName;
        userOptions.config_name = projectName;

        await postConfig('build_op', [{
          config_id: buildOpConfig.config_id,
          project_id: project.id,
          user_options: userOptions,
        }]);
        console.log('[WorkspaceDetectorService] 已更新build_op配置');
      } else {
        // 创建新配置
        await postConfig('build_op', [{
          project_id: project.id,
          user_options: {
            op: projectName,
            script: buildScript,
            config_name: projectName,
            target_file: runCommand,
          },
        }]);
        console.log('[WorkspaceDetectorService] 已创建build_op配置');
      }

      console.log('[WorkspaceDetectorService] 标准自定义算子编译部署命令行配置完成');
    } catch (error) {
      console.error('[WorkspaceDetectorService] 配置编译部署命令行失败:', error);
      if (error instanceof Error) {
        console.error('[WorkspaceDetectorService] 错误详情:', error.message);
        console.error('[WorkspaceDetectorService] 错误堆栈:', error.stack);
      }
      // 配置失败不应该阻止初始化，只记录错误
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

  /**
   * 检查算子是否已初始化，如果没有则初始化
   * @param detection 算子工程检测结果
   * @param projectId 项目ID
   */
  private static async checkAndInitializeOperatorProject(
    detection: OperatorProjectDetectionResult,
    projectId: number,
  ): Promise<void> {
    console.log(`[WorkspaceDetectorService] 检查算子是否已初始化: ${detection.projectName}, projectId: ${projectId}`);

    try {
      // 检查是否有算子记录
      const ops = getOpsByProjectId(projectId);
      const hasOpRecord = ops.length > 0;

      // 检查是否有配置（至少有一个配置类型）
      const buildOpConfigs = getConfig(projectId, 'build_op');
      const hasConfig = buildOpConfigs.length > 0;

      console.log(`[WorkspaceDetectorService] 算子初始化检查结果: hasOpRecord=${hasOpRecord}, hasConfig=${hasConfig}`);

      // 如果既没有算子记录也没有配置，说明未初始化，需要初始化
      if (!hasOpRecord && !hasConfig) {
        console.log(`[WorkspaceDetectorService] 算子未初始化，开始初始化: ${detection.projectName}`);
        await this.initializeOperatorProject(detection, projectId);
      } else {
        console.log(`[WorkspaceDetectorService] 算子已初始化，跳过: ${detection.projectName}`);
      }
    } catch (error) {
      console.error(`[WorkspaceDetectorService] 检查算子初始化状态失败: ${detection.projectPath}`, error);
      // 检查失败时，尝试初始化（避免遗漏）
      try {
        await this.initializeOperatorProject(detection, projectId);
      } catch (initError) {
        console.error(`[WorkspaceDetectorService] 初始化算子失败: ${detection.projectPath}`, initError);
      }
    }
  }
}
