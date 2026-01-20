/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { OperatorProjectDetector, OperatorProjectType } from '@plugin/domain/services/operator-project-detector';
import { createProject, getProjectByPath, getProjectById, deleteProject } from '@plugin/domain/models/project-model';
import { WorkspaceDetectorService } from './workspace-detector-service';
import { ProjectManager } from '@plugin/core/project/project-manager';
import { projectService } from './project-service';
import { AutoMultiProjectDetector } from './auto-multi-project-detector';
import { OperatorProjectIconTheme } from '@plugin/class/operator-project-icon-theme';

/**
 * 文件夹右键菜单服务
 * 处理文件夹右键菜单的相关操作
 */
export class FolderContextMenuService {
  /**
   * 标记文件夹为算子工程
   */
  static async markAsOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;
    
    try {
      // 先检查目录下是否有多个算子工程
      const detectedProjects = await OperatorProjectDetector.scanForOperatorProjects(
        folderPath,
        3,
      );
      
      // 如果找到多个算子工程，自动标记为多算子工程集合
      if (detectedProjects.length > 1) {
        console.log(`[markAsOperatorProject] 检测到 ${detectedProjects.length} 个算子工程，自动标记为多算子工程集合`);
        
        // 检查是否已注册为多算子工程集合
        const existing = getProjectByPath(folderPath);
        if (existing && existing.project_type === OperatorProjectType.MULTI_PROJECT) {
          vscode.window.showInformationMessage('该文件夹已经是算子工程集合');
          return;
        }
        
        // 注册子项目
        const subProjectIds: number[] = [];
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
          } else {
            subProjectIds.push(subProject.id);
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
        
        // 初始化所有子项目
        console.log(`[markAsOperatorProject] 开始初始化 ${detectedProjects.length} 个子项目`);
        for (const detection of detectedProjects) {
          if (detection.isOperatorProject && detection.projectType) {
            try {
              console.log(`[markAsOperatorProject] 初始化子项目: ${detection.projectName}`);
              await WorkspaceDetectorService['initializeOperatorProject'](detection, folderPath);
              console.log(`[markAsOperatorProject] 子项目 ${detection.projectName} 初始化完成`);
            } catch (error) {
              console.error(`[markAsOperatorProject] 子项目 ${detection.projectName} 初始化失败:`, error);
              // 继续初始化其他子项目
            }
          }
        }
        console.log(`[markAsOperatorProject] 所有子项目初始化完成`);
        
        // 更新图标主题
        const context1 = (globalThis as unknown as { extensionContext: vscode.ExtensionContext })
          .extensionContext;
        if (context1) {
          const iconTheme = OperatorProjectIconTheme.getInstance(context1);
          // 触发装饰更新
          iconTheme.fireDecorationUpdate(vscode.Uri.file(folderPath));
        }
        
        vscode.window.showInformationMessage(`已自动标记为算子工程集合（包含 ${detectedProjects.length} 个算子工程）: ${projectName}`);
        return;
      }
      
      // 检测文件夹是否为算子工程
      const detection = await OperatorProjectDetector.detectOperatorProject(folderPath);
      
      if (!detection.isOperatorProject || !detection.projectType) {
        // 如果不是算子工程，提示用户
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
        await createProject({
          project_name: projectName,
          project_path: folderPath,
          project_type: OperatorProjectType.ASCEND_C, // 默认类型
        });
        
        // 触发装饰更新
        const context2 = (globalThis as unknown as { extensionContext: vscode.ExtensionContext })
          .extensionContext;
        if (context2) {
          const iconTheme = OperatorProjectIconTheme.getInstance(context2);
          iconTheme.fireDecorationUpdate(vscode.Uri.file(folderPath));
        }
        
        vscode.window.showInformationMessage(`已标记为算子工程: ${projectName}`);
        return;
      }
      
      // 检查是否已注册
      const existing = getProjectByPath(folderPath);
      if (existing) {
        vscode.window.showInformationMessage('该文件夹已经是算子工程');
        return;
      }
      
      // 注册算子工程
      await createProject({
        project_name: detection.projectName,
        project_path: folderPath,
        project_type: detection.projectType,
      });
      
      // 自动检测并标记算子工程合集
      const context = (globalThis as unknown as { extensionContext: vscode.ExtensionContext })
        .extensionContext;
      if (context) {
        await AutoMultiProjectDetector.detectAndMarkMultiProjects(context);
        
        // 更新图标主题（确保在自动检测后更新）
        const iconTheme = OperatorProjectIconTheme.getInstance(context);
        // 触发装饰更新
        iconTheme.fireDecorationUpdate(vscode.Uri.file(folderPath));
      }
      
      // 初始化算子工程
      await WorkspaceDetectorService['initializeOperatorProject'](detection, folderPath);
      
      vscode.window.showInformationMessage(`已标记为算子工程: ${detection.projectName}`);
    } catch (error) {
      vscode.window.showErrorMessage(
        `标记为算子工程失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 标记文件夹为算子工程集合
   */
  static async markAsMultiOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;
    
    try {
      // 扫描子目录查找算子工程
      const detectedProjects = await OperatorProjectDetector.scanForOperatorProjects(
        folderPath,
        3,
      );
      
      if (detectedProjects.length === 0) {
        const result = await vscode.window.showWarningMessage(
          `文件夹 "${path.basename(folderPath)}" 下未发现算子工程，是否仍要标记为算子工程集合？`,
          '是',
          '否',
        );
        
        if (result !== '是') {
          return;
        }
      }
      
      // 检查是否已注册
      const existing = getProjectByPath(folderPath);
      if (existing && existing.project_type === OperatorProjectType.MULTI_PROJECT) {
        vscode.window.showInformationMessage('该文件夹已经是算子工程集合');
        return;
      }
      
      // 注册子项目
      const subProjectIds: number[] = [];
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
        } else {
          subProjectIds.push(subProject.id);
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
      
      // 初始化所有子项目
      console.log(`[markAsMultiOperatorProject] 开始初始化 ${detectedProjects.length} 个子项目`);
      for (const detection of detectedProjects) {
        if (detection.isOperatorProject && detection.projectType) {
          try {
            console.log(`[markAsMultiOperatorProject] 初始化子项目: ${detection.projectName}`);
            await WorkspaceDetectorService['initializeOperatorProject'](detection, folderPath);
            console.log(`[markAsMultiOperatorProject] 子项目 ${detection.projectName} 初始化完成`);
          } catch (error) {
            console.error(`[markAsMultiOperatorProject] 子项目 ${detection.projectName} 初始化失败:`, error);
            // 继续初始化其他子项目
          }
        }
      }
      console.log(`[markAsMultiOperatorProject] 所有子项目初始化完成`);
      
      // 自动检测并标记算子工程合集（可能会发现更高层级的合集）
      const context = (globalThis as unknown as { extensionContext: vscode.ExtensionContext })
        .extensionContext;
      if (context) {
        await AutoMultiProjectDetector.detectAndMarkMultiProjects(context);
        
        // 更新图标主题
        const iconTheme = OperatorProjectIconTheme.getInstance(context);
        // 触发装饰更新
        iconTheme.fireDecorationUpdate(vscode.Uri.file(folderPath));
      }

      vscode.window.showInformationMessage(`已标记为算子工程集合: ${projectName}`);
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
        
        vscode.window.showInformationMessage('已取消标记为算子工程集合');
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
      const configCommand = 'huawei-op-devtools.config';
      await vscode.commands.executeCommand(configCommand);
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
}
