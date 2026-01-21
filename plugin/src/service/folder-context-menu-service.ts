/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { OperatorProjectDetector, OperatorProjectType, type OperatorProjectDetectionResult } from '@plugin/domain/services/operator-project-detector';
import { createProject, getProjectByPath, getProjectById, deleteProject, getAllProjects } from '@plugin/domain/models/project-model';
import { ProjectManager } from '@plugin/core/project/project-manager';
import { projectService } from './project-service';
import { OperatorProjectIconTheme } from '@plugin/class/operator-project-icon-theme';
import { generateStructure } from '@plugin/domain';
import { getOpsByProjectId } from '@plugin/domain/models/model';
import { getConfig } from '@plugin/domain/services/configuration';

/**
 * 文件夹右键菜单服务
 * 处理文件夹右键菜单的相关操作
 */
export class FolderContextMenuService {
  /**
   * 标记文件夹为算子工程
   * 逻辑与初始化时标记为算子工程的逻辑保持一致：
   * 1. 先检测当前目录本身是否为算子工程（使用 detectOperatorProject）
   * 2. 如果当前目录是算子工程，直接标记
   * 3. 如果当前目录不是算子工程，扫描子目录看是否有多个算子工程
   */
  static async markAsOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;

    try {
      // 1. 先检测当前目录本身是否为算子工程（与初始化逻辑一致）
      const rootDetection = await OperatorProjectDetector.detectOperatorProject(folderPath);

      if (rootDetection.isOperatorProject && rootDetection.projectType) {
        // 当前目录就是算子工程
        // 检查是否已注册
        const existing = getProjectByPath(folderPath);
        if (existing) {
          vscode.window.showInformationMessage('该文件夹已经是算子工程');
          return;
        }

        // 如果是标准自定义算子，需要特殊处理（扫描子目录看是否有多个算子工程）
        if (rootDetection.projectType === OperatorProjectType.STANDARD_CUSTOM) {
          // 标准自定义算子，扫描子目录看是否有多个算子工程
          const detectedProjects = await OperatorProjectDetector.scanForOperatorProjects(
            folderPath,
            3,
          );

          // 如果找到多个算子工程（包括当前目录），自动标记为多算子工程集合
          if (detectedProjects.length > 1) {
            // 检查是否已注册为多算子工程集合
            const existingMulti = getProjectByPath(folderPath);
            if (existingMulti && existingMulti.project_type === OperatorProjectType.MULTI_PROJECT) {
              vscode.window.showInformationMessage('该文件夹已经是算子工程集合');
              return;
            }

            // 注册子项目
            const subProjectIds: number[] = [];
            const initializationTasks: Array<() => Promise<void>> = [];
            for (const detection of detectedProjects) {
              if (!detection.projectType) continue;

              let subProject = getProjectByPath(detection.projectPath);
              if (!subProject) {
                const subId = await createProject({
                  project_name: detection.projectName,
                  project_path: detection.projectPath,
                  project_type: detection.projectType,
                });
                subProjectIds.push(subId);
                // 收集初始化任务，稍后并行执行
                initializationTasks.push(() => this.initializeOperatorProject(detection, subId));
              } else {
                subProjectIds.push(subProject.id);
              }
            }

            // 并行执行所有初始化任务
            if (initializationTasks.length > 0) {
              await Promise.allSettled(
                initializationTasks.map(task => task().catch(error => {
                  throw error;
                }))
              );
            }

            // 注册多算子工程集合
            const projectName = path.basename(folderPath);
            await createProject({
              project_name: projectName,
              project_path: folderPath,
              project_type: OperatorProjectType.MULTI_PROJECT,
              sub_project_ids: subProjectIds,
            });

            // 更新图标主题
            const context1 = (globalThis as unknown as { extensionContext: vscode.ExtensionContext })
              .extensionContext;
            if (context1) {
              const iconTheme = OperatorProjectIconTheme.getInstance(context1);
              iconTheme.fireDecorationUpdate(vscode.Uri.file(folderPath));
            }

            vscode.window.showInformationMessage(`已自动标记为算子工程集合（包含 ${detectedProjects.length} 个算子工程）: ${projectName}`);
            return;
          }
        }

        // 单个算子工程，直接标记
        const projectId = await createProject({
          project_name: rootDetection.projectName,
          project_path: folderPath,
          project_type: rootDetection.projectType,
        });

        // 初始化算子工程配置
        await this.initializeOperatorProject(rootDetection, projectId);

        vscode.window.showInformationMessage(`已标记为算子工程: ${rootDetection.projectName}`);
        return;
      }

      // 2. 当前目录不是算子工程，扫描子目录看是否有多个算子工程
      const detectedProjects = await OperatorProjectDetector.scanForOperatorProjects(
        folderPath,
        3,
      );

      // 如果找到多个算子工程，自动标记为多算子工程集合
      if (detectedProjects.length > 1) {
        // 检查是否已注册为多算子工程集合
        const existing = getProjectByPath(folderPath);
        if (existing && existing.project_type === OperatorProjectType.MULTI_PROJECT) {
          vscode.window.showInformationMessage('该文件夹已经是算子工程集合');
          return;
        }

        // 注册子项目
        const subProjectIds: number[] = [];
        const initializationTasks: Array<() => Promise<void>> = [];
        for (const detection of detectedProjects) {
          if (!detection.projectType) continue;

          let subProject = getProjectByPath(detection.projectPath);
          if (!subProject) {
            const subId = await createProject({
              project_name: detection.projectName,
              project_path: detection.projectPath,
              project_type: detection.projectType,
            });
            subProjectIds.push(subId);
            // 收集初始化任务，稍后并行执行
            initializationTasks.push(() => this.initializeOperatorProject(detection, subId));
          } else {
            subProjectIds.push(subProject.id);
          }
        }

        // 并行执行所有初始化任务
        if (initializationTasks.length > 0) {
          await Promise.allSettled(
            initializationTasks.map(task => task().catch(error => {
              throw error;
            }))
          );
        }

        // 注册多算子工程集合
        const projectName = path.basename(folderPath);
        await createProject({
          project_name: projectName,
          project_path: folderPath,
          project_type: OperatorProjectType.MULTI_PROJECT,
          sub_project_ids: subProjectIds,
        });

        // 更新图标主题
        const context1 = (globalThis as unknown as { extensionContext: vscode.ExtensionContext })
          .extensionContext;
        if (context1) {
          const iconTheme = OperatorProjectIconTheme.getInstance(context1);
          iconTheme.fireDecorationUpdate(vscode.Uri.file(folderPath));
        }

        vscode.window.showInformationMessage(`已自动标记为算子工程集合（包含 ${detectedProjects.length} 个算子工程）: ${projectName}`);
        return;
      }

      // 3. 既不是算子工程，子目录也没有多个算子工程，提示用户
      const result = await vscode.window.showWarningMessage(
        `文件夹 "${path.basename(folderPath)}" 不是算子工程，是否仍要标记？`,
        '是',
        '否',
      );

      if (result !== '是') {
        return;
      }

      // 用户选择强制标记，使用默认类型
      const projectName = path.basename(folderPath);
      const projectId = await createProject({
        project_name: projectName,
        project_path: folderPath,
        project_type: OperatorProjectType.ASCEND_C, // 默认类型
      });

      // 初始化算子工程配置
      const forceDetection: OperatorProjectDetectionResult = {
        isOperatorProject: true,
        projectType: OperatorProjectType.ASCEND_C,
        projectPath: folderPath,
        projectName,
      };
      await this.initializeOperatorProject(forceDetection, projectId);

      // 触发装饰更新
      const context2 = (globalThis as unknown as { extensionContext: vscode.ExtensionContext })
        .extensionContext;
      if (context2) {
        const iconTheme = OperatorProjectIconTheme.getInstance(context2);
        iconTheme.fireDecorationUpdate(vscode.Uri.file(folderPath));
      }

      vscode.window.showInformationMessage(`已标记为算子工程: ${projectName}`);
    } catch (error) {
      vscode.window.showErrorMessage(
        `标记为算子工程失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 标记文件夹为算子工程集合
   * 使用标准自定义算子的扫描规则：
   * 1. 根目录下存在 experimental 文件夹，则将experimental标记为算子工程集合
   * 2. 扫描的文件夹根目录下有CMakeLists.txt文件，则这个文件夹为算子文件
   * 3. 识别出来的所有算子，需要分为2类，在experimental目录下的算子会被归类为experimental算子，其他的为普通算子
   * 4. 当一个目录的下一层目录中有多个算子目录，则将该目录标记成算子工程集合
   */
  static async markAsMultiOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;

    try {
      // 使用标准自定义算子的扫描规则（只识别标准自定义算子）
      const detectedProjects = await OperatorProjectDetector.scanForStandardCustomOperatorProjects( folderPath );

      // 检查根目录下是否存在 experimental 文件夹
      // 如果当前目录本身就是 experimental 目录，则 experimentalPath 就是当前目录
      const folderName = path.basename(folderPath).toLowerCase();
      const isExperimentalFolder = folderName === 'experimental';
      const experimentalPath = isExperimentalFolder
        ? folderPath
        : path.join(folderPath, 'experimental');
      const hasExperimental = isExperimentalFolder ||
        (fs.existsSync(experimentalPath) && fs.statSync(experimentalPath).isDirectory());

      // 分类算子工程：experimental算子和普通算子
      const experimentalOperators: OperatorProjectDetectionResult[] = [];
      const normalOperators: OperatorProjectDetectionResult[] = [];

      for (const detection of detectedProjects) {
        // 如果当前目录本身就是 experimental，那么所有子目录都是 experimental 算子
        // 否则，检查路径是否在 experimental 目录下
        const isExperimental = isExperimentalFolder
          ? true  // 如果当前目录是 experimental，所有子目录都是 experimental 算子
          : detection.projectPath.toLowerCase().startsWith(experimentalPath.toLowerCase());
        if (isExperimental) {
          experimentalOperators.push(detection);
        } else {
          normalOperators.push(detection);
        }
      }

      // 注册所有算子工程（标记experimental属性）
      // 这是关键步骤：确保所有检测到的算子工程都被标记为算子工程
      const subProjectIds: number[] = [];

      // 第一步：先注册所有项目（串行，确保数据库操作安全）
      for (const detection of detectedProjects) {
        if (!detection.projectType) {
          continue;
        }

        // 跳过集合根目录本身，即使它也被检测为算子工程，也不应该初始化
        // 因为它是作为集合被标记的，不应该在集合根目录下创建 .vscode 和 .arts 文件
        const normalizedDetectionPath = path.normalize(detection.projectPath);
        const normalizedFolderPath = path.normalize(folderPath);
        if (normalizedDetectionPath === normalizedFolderPath) {
          continue;
        }

        // 判断是否是 experimental 算子（与上面的分类逻辑保持一致）
        const isExperimental = isExperimentalFolder
          ? true  // 如果当前目录是 experimental，所有子目录都是 experimental 算子
          : detection.projectPath.toLowerCase().startsWith(experimentalPath.toLowerCase());
        let subProject = getProjectByPath(detection.projectPath);

        if (!subProject) {
          // 子目录是算子工程，但还没有被标记，需要标记为算子工程
          const subId = await createProject({
            project_name: detection.projectName,
            project_path: detection.projectPath,
            project_type: detection.projectType,
            is_experimental: isExperimental,
          });
          subProjectIds.push(subId);
        } else {
          // 子目录已经是算子工程，更新experimental标记（如果需要）
          if (subProject.is_experimental !== isExperimental) {
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

      // 手动标记为算子合集时，只标记子目录为算子工程，不会将子目录标记为算子合集
      // 移除将子目录标记为算子合集的逻辑

      // 标记 experimental 文件夹为算子工程集合（如果存在且当前目录不是 experimental 本身）
      if (hasExperimental && !isExperimentalFolder) {
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
        }
      }

      // 注册多算子工程集合
      const projectName = path.basename(folderPath);
      await createProject({
        project_name: projectName,
        project_path: folderPath,
        project_type: OperatorProjectType.MULTI_PROJECT,
        sub_project_ids: subProjectIds,
      });

      // 手动标记为算子合集后，不调用自动检测，避免将子目录标记为算子合集

      // 收集实际被标记的算子工程列表（排除根目录本身）
      const markedProjects = detectedProjects.filter(detection => {
        const normalizedDetectionPath = path.normalize(detection.projectPath);
        const normalizedFolderPath = path.normalize(folderPath);
        return normalizedDetectionPath !== normalizedFolderPath && detection.projectType;
      });

    } catch (error) {
      vscode.window.showErrorMessage(
        `标记为算子工程集合失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 取消标记为算子工程
   */
  static async unmarkAsOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;

    try {
      const project = getProjectByPath(folderPath);
      if (!project) {
        // 不是算子工程，静默返回（不显示提示，因为菜单可能因为上下文变量未更新而显示）
        return;
      }

      // 检查是否是算子工程集合，如果是则提示用户
      if (project.project_type === OperatorProjectType.MULTI_PROJECT) {
        vscode.window.showWarningMessage('该文件夹是算子工程集合，请使用"取消标记为算子工程集合"');
        return;
      }

      // 直接删除项目，不需要二次确认
      const deleted = deleteProject(folderPath);
      if (deleted) {
        // 触发装饰更新
        const context = (globalThis as unknown as { extensionContext: vscode.ExtensionContext })
          .extensionContext;
        if (context) {
          const iconTheme = OperatorProjectIconTheme.getInstance(context);
          iconTheme.fireDecorationUpdate(vscode.Uri.file(folderPath));
        }

        vscode.window.showInformationMessage('已取消标记为算子工程');
      } else {
        vscode.window.showErrorMessage('取消标记失败');
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `取消标记失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 取消标记为算子工程集合
   * 同时取消标记目录下所有已标记为算子的目录
   */
  static async unmarkAsMultiOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;

    try {
      const project = getProjectByPath(folderPath);
      if (!project) {
        // 不是算子工程集合，静默返回（不显示提示，因为菜单可能因为上下文变量未更新而显示）
        return;
      }

      // 检查是否是算子工程集合
      if (project.project_type !== OperatorProjectType.MULTI_PROJECT) {
        vscode.window.showWarningMessage('该文件夹不是算子工程集合，请使用"取消标记为算子工程"');
        return;
      }

      const deletedSubProjects: string[] = [];
      const failedSubProjects: string[] = [];
      const normalizedFolderPath = path.normalize(folderPath);

      // 获取所有项目，找出在目标文件夹下的所有算子工程和算子工程集合
      // 这样可以确保取消标记所有已标记为算子的目录，而不仅仅是扫描检测到的
      const allProjects = getAllProjects();

      // 按路径深度排序，先处理深层嵌套的项目，再处理浅层的
      // 这样可以确保在删除父集合之前，先删除子项目
      const projectsInFolder = allProjects
        .filter(proj => {
          // 跳过当前项目本身
          if (proj.project_path === folderPath) {
            return false;
          }

          // 检查项目路径是否在目标文件夹下
          const normalizedProjPath = path.normalize(proj.project_path);
          return normalizedProjPath.startsWith(normalizedFolderPath);
        })
        .sort((a, b) => {
          // 按路径深度排序（路径越深，排序越靠前）
          // 使用规范化后的路径来计算深度，确保跨平台兼容性
          const normalizedA = path.normalize(a.project_path);
          const normalizedB = path.normalize(b.project_path);
          const depthA = normalizedA.split(/[/\\]/).filter(p => p.length > 0).length;
          const depthB = normalizedB.split(/[/\\]/).filter(p => p.length > 0).length;
          return depthB - depthA;
        });

      // 先取消标记所有算子工程（非集合），再取消标记算子工程集合
      // 这样可以避免在删除集合时，其子项目已经被删除导致的问题
      const operatorProjects = projectsInFolder.filter(
        proj => proj.project_type && proj.project_type !== OperatorProjectType.MULTI_PROJECT
      );
      const multiProjects = projectsInFolder.filter(
        proj => proj.project_type === OperatorProjectType.MULTI_PROJECT
      );

      // 取消标记所有算子工程（非集合）
      for (const proj of operatorProjects) {
        const deleted = deleteProject(proj.project_path);
        if (deleted) {
          deletedSubProjects.push(proj.project_path);
        } else {
          failedSubProjects.push(proj.project_path);
        }
      }

      // 取消标记所有嵌套的算子工程集合（按深度从深到浅）
      for (const proj of multiProjects) {
        const deleted = deleteProject(proj.project_path);
        if (deleted) {
          deletedSubProjects.push(proj.project_path);
        } else {
          failedSubProjects.push(proj.project_path);
        }
      }

      // 最后删除算子工程集合本身
      const deleted = deleteProject(folderPath);

      if (deleted) {
        // 触发装饰更新（更新所有已删除的项目）
        const context = (globalThis as unknown as { extensionContext: vscode.ExtensionContext })
          .extensionContext;
        if (context) {
          const iconTheme = OperatorProjectIconTheme.getInstance(context);
          // 更新所有已删除的项目路径
          const urisToUpdate = [vscode.Uri.file(folderPath), ...deletedSubProjects.map(p => vscode.Uri.file(p))];
          iconTheme.fireDecorationUpdate(urisToUpdate);
        }

        const message = failedSubProjects.length > 0
          ? `已取消标记为算子工程集合，已取消标记 ${deletedSubProjects.length} 个子项目，${failedSubProjects.length} 个子项目取消标记失败`
          : `已取消标记为算子工程集合，已取消标记 ${deletedSubProjects.length} 个子项目`;
        vscode.window.showInformationMessage(message);
      } else {
        vscode.window.showErrorMessage('取消标记算子工程集合失败');
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `取消标记失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 打开算子工程配置
   */
  static async openOperatorProjectConfig(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;
    const project = getProjectByPath(folderPath);

    // 检查是否是算子工程
    if (!project || project.project_type === OperatorProjectType.MULTI_PROJECT) {
      vscode.window.showWarningMessage('该文件夹不是算子工程');
      return;
    }

    await this.switchToProject(uri, async () => {
      // 获取算子名称
      // 对于标准自定义算子，项目名称就是算子名称
      // 对于其他类型，尝试从算子记录中获取
      let opName = project.project_name;
      const ops = getOpsByProjectId(project.id);
      if (ops.length > 0) {
        // 如果有算子记录，使用第一个算子的名称
        opName = ops[0].op_name;
      }

      // 设置目标算子，以便配置页面自动选择
      const { configMethods } = await import('../controller/config-controller.js');
      await configMethods.openConfig({
        configName: 'huawei-op-devtools.config',
        opName,
        projectId: project.id,
      });
    });
  }

  /**
   * 编译部署算子工程
   */
  static async buildOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;
    const project = getProjectByPath(folderPath);

    // 检查是否是算子工程
    if (!project || project.project_type === OperatorProjectType.MULTI_PROJECT) {
      vscode.window.showWarningMessage('该文件夹不是算子工程');
      return;
    }

    await this.switchToProject(uri, async () => {
      // 调用编译命令
      const buildCommand = 'huawei-op-devtools.buildOps';
      await vscode.commands.executeCommand(buildCommand);
    });
  }

  /**
   * 运行验证算子工程
   */
  static async runOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;
    const project = getProjectByPath(folderPath);

    // 检查是否是算子工程
    if (!project || project.project_type === OperatorProjectType.MULTI_PROJECT) {
      vscode.window.showWarningMessage('该文件夹不是算子工程');
      return;
    }

    await this.switchToProject(uri, async () => {
      // 运行验证通过 API 服务器调用，这里先显示提示
      vscode.window.showInformationMessage('请使用操作面板进行运行验证');
      // 打开操作面板
      await vscode.commands.executeCommand('huawei-op-devtools.toggleOpsOperate');
    });
  }

  /**
   * 调试算子工程
   */
  static async debugOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;
    const project = getProjectByPath(folderPath);

    // 检查是否是算子工程
    if (!project || project.project_type === OperatorProjectType.MULTI_PROJECT) {
      vscode.window.showWarningMessage('该文件夹不是算子工程');
      return;
    }

    await this.switchToProject(uri, async () => {
      // 打开调试配置
      const debugConfigCommand = 'huawei-op-devtools.debugConfig';
      await vscode.commands.executeCommand(debugConfigCommand);
    });
  }

  /**
   * 异常检测
   */
  static async sanitizerOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;
    const project = getProjectByPath(folderPath);

    // 检查是否是算子工程
    if (!project || project.project_type === OperatorProjectType.MULTI_PROJECT) {
      vscode.window.showWarningMessage('该文件夹不是算子工程');
      return;
    }

    await this.switchToProject(uri, async () => {
      const sanitizerCommand = 'huawei-op-devtools.sanitizerOptions';
      await vscode.commands.executeCommand(sanitizerCommand);
    });
  }

  /**
   * 性能调优
   */
  static async performanceOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;
    const project = getProjectByPath(folderPath);

    // 检查是否是算子工程
    if (!project || project.project_type === OperatorProjectType.MULTI_PROJECT) {
      vscode.window.showWarningMessage('该文件夹不是算子工程');
      return;
    }

    await this.switchToProject(uri, async () => {
      // 打开性能调优配置
      const performanceCommand = 'huawei-op-devtools.simulatorOptions';
      await vscode.commands.executeCommand(performanceCommand);
    });
  }

  /**
   * 切换到指定项目并执行操作
   */
  private static async switchToProject(
    uri: vscode.Uri,
    action: () => Promise<void>,
  ): Promise<void> {
    const folderPath = uri.fsPath;
    const project = getProjectByPath(folderPath);

    if (!project) {
      vscode.window.showErrorMessage('该文件夹不是算子工程');
      return;
    }

    try {
      // 设置 ProjectManager 的项目信息
      const pm = ProjectManager.getInstance();
      pm['_projectId'] = String(project.id);
      pm['_projectName'] = project.project_name;
      pm['_projectPath'] = project.project_path;

      // 执行操作
      await action();
    } catch (error) {
      vscode.window.showErrorMessage(
        `操作失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 检查文件夹是否为算子工程
   */
  static async checkIsOperatorProject(uri: vscode.Uri): Promise<{
    isOperatorProject: boolean;
    isMultiProject: boolean;
    projectType?: string;
  }> {
    const folderPath = uri.fsPath;
    const project = getProjectByPath(folderPath);

    if (!project) {
      return {
        isOperatorProject: false,
        isMultiProject: false,
      };
    }

    return {
      isOperatorProject: true,
      isMultiProject: project.project_type === OperatorProjectType.MULTI_PROJECT,
      projectType: project.project_type || undefined,
    };
  }

  /**
   * 初始化算子工程配置
   * @param detection 算子工程检测结果
   * @param projectId 项目ID
   * @param skipVscodeFiles 是否跳过创建 .vscode 和 .arts 文件（默认 false）
   */
  private static async initializeOperatorProject(
    detection: OperatorProjectDetectionResult,
    projectId: number,
    skipVscodeFiles: boolean = false,
  ): Promise<void> {
    if (!detection.isOperatorProject || !detection.projectType) {
      return;
    }

    try {
      const context = (globalThis as unknown as { extensionContext: vscode.ExtensionContext })
        .extensionContext;

      if (!context) {
        return;
      }

      // 根据算子工程类型确定模板名称和类型
      let templateName: string | undefined;
      let opType: string = 'ascend';

      switch (detection.projectType) {
        case OperatorProjectType.ASCEND_C:
          templateName = 'hello_world';
          opType = 'ascend';
          break;
        case OperatorProjectType.TORCH_LIBRARY:
          templateName = 'torch_library_template';
          opType = 'ascend';
          break;
        case OperatorProjectType.PYASC:
          // pyasc算子工程，使用 pyasc_temple 模板
          templateName = 'pyasc_temple';
          opType = 'pyasc';
          console.log(`[FolderContextMenuService] PYASC类型，使用 pyasc_temple 模板`);
          break;
        case OperatorProjectType.STANDARD_CUSTOM:
          opType = 'cann';
          // 标准自定义算子不需要模板
          break;
        default:
          return;
      }

      // 调用 generateStructure 初始化配置
      // 对于标准自定义算子，如果没有模板，跳过模板解压，只创建配置
      const isSkipUnZip = detection.projectType === OperatorProjectType.STANDARD_CUSTOM && !templateName;
      await generateStructure(
        {
          project_id: projectId,
          op_type: opType,
          op_name: detection.projectName,
          template_name: templateName,
          op_path: detection.projectPath,
          skipExisting: true, // 不覆盖已有文件
        } as any,
        context.extensionPath,
        isSkipUnZip, // 标准自定义算子且无模板时，跳过模板解压
        skipVscodeFiles, // 是否跳过创建 .vscode 和 .arts 文件
      );

      // 验证配置是否创建成功
      const ops = getOpsByProjectId(projectId);
      const buildOpConfigs = getConfig(projectId, 'build_op');
    } catch (error) {
      // 初始化失败不应该阻止标记操作，只记录错误
    }
  }

}
