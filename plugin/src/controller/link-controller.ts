import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { projectService } from '@plugin/service/project-service';
import { configService } from '@plugin/service/config-service';
import { CommandExecutor } from '@plugin/class/command-options';
import { ProjectManager } from '@plugin/core/project/project-manager';
import {
  OperatorProjectDetector,
  OperatorProjectType,
  type OperatorProjectDetectionResult,
} from '@plugin/domain/services/operator-project-detector';
import { generateStructure } from '@plugin/domain';
import {
  OpenFileParams,
  OpenLinkParams,
  OpenProjectParams,
} from '@shared/api-types';
import {
  createProject,
  getProjectByPath,
} from '@plugin/domain/models/project-model';
import { AutoMultiProjectDetector } from '@plugin/service/auto-multi-project-detector';
import { OperatorProjectIconTheme } from '@plugin/class/operator-project-icon-theme';
import { getAllProjects } from '@plugin/domain/models/project-model';
import { FolderContextMenuService } from '@plugin/service/folder-context-menu-service';

/**
 * 初始化已存在的算子工程（不覆盖已有文件）
 */
async function initializeProjectForOpen(
  projectPath: string,
  projectName: string,
  projectSH: string | undefined,
  templateName: string | undefined,
  createOperatorProjectDictoryFileType: number,
  context: vscode.ExtensionContext,
): Promise<void> {
  try {
    vscode.window.showInformationMessage('正在初始化算子工程...');

    const executor = new CommandExecutor();

    // 执行环境变量脚本
    if (projectSH) {
      try {
        await executor.execute(`chmod +x ${projectSH}`);
        await executor.execute(`${projectSH}`);
      }
      catch (error) {
        console.warn(`执行环境变量脚本失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // 初始化项目管理器
    await ProjectManager.getInstance()
      .initProject();

    // 调用 projectService.init
    const parentPath = path.dirname(projectPath);

    await projectService.init({
      ascendEnvScript: projectSH,
      projectPath: parentPath,
      projectName,
    });

    // 获取项目 ID
    const pm = ProjectManager.getInstance();

    if (!pm.projectId) {
      await pm.ensureProjectId();
    }

    const projectId = Number(pm.projectId);

    if (!projectId) {
      throw new Error('无法获取项目 ID');
    }

    // 保存 templateName 到 globalState，以便后续使用
    if (templateName) {
      context.globalState.update('templateName', templateName);
    }

    // 调用 generateStructure，传入 skipExisting: true 以不覆盖已有文件
    await generateStructure(
      {
        project_id: projectId,
        op_type: 'ascend',
        op_name: projectName,
        template_name: templateName,
        op_path: projectPath,
        skipExisting: true, // 不覆盖已有文件
      } as any,
      context.extensionPath,
    );

    // 执行创建算子文件命令（如果需要）
    if (createOperatorProjectDictoryFileType) {
      try {
        await vscode.commands.executeCommand(
          'huawei-op-devtools.createDictory',
          { createOperatorProjectDirectoryFileType: createOperatorProjectDictoryFileType },
        );
      }
      catch (error) {
        console.warn(`创建算子文件失败: ${error instanceof Error ? error.message : String(error)}`);
        // 不抛出错误，因为文件可能已经存在
      }
    }

    // 清理 templateName
    if (templateName) {
      context.globalState.update('templateName', undefined);
    }

    console.log(`[initializeProjectForOpen] 初始化完成: ${projectPath}`);
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error('[initializeProjectForOpen] 初始化失败:', error);
    throw new Error(`初始化算子工程失败: ${errorMessage}`);
  }
}

/**
 * 初始化检测到的算子工程
 */
async function initializeDetectedProject(
  detection: OperatorProjectDetectionResult,
  projectSH: string | undefined,
  context: vscode.ExtensionContext,
): Promise<void> {
  if (!detection.isOperatorProject || !detection.projectType) {
    return;
  }

  // 根据算子类型确定模板名称和类型
  let templateName: string | undefined;
  let createOperatorProjectDictoryFileType: number = 1;

  if (detection.projectType === OperatorProjectType.TORCH_LIBRARY) {
    templateName = 'torch_library_template';
    createOperatorProjectDictoryFileType = 1;
  }
  else if (detection.projectType === OperatorProjectType.ASCEND_C) {
    templateName = 'hello_world';
    createOperatorProjectDictoryFileType = 1;
  }
  else if (detection.projectType === OperatorProjectType.PYASC) {
    // pyasc 算子工程不需要初始化
    return;
  }
  else if (detection.projectType === OperatorProjectType.STANDARD_CUSTOM) {
    // 标准自定义算子工程
    createOperatorProjectDictoryFileType = 2;
  }
  else {
    // 其他类型暂不支持自动初始化
    return;
  }

  console.log(`[openProject] 初始化算子工程: ${detection.projectName}, 类型: ${detection.projectType}`);

  // 初始化项目（不覆盖已有文件）
  await initializeProjectForOpen(
    detection.projectPath,
    detection.projectName,
    projectSH,
    templateName,
    createOperatorProjectDictoryFileType,
    context,
  );
}

/**
 * 注册并标记算子工程
 */
async function registerAndMarkOperatorProject(
  detection: OperatorProjectDetectionResult,
  context: vscode.ExtensionContext,
): Promise<number | null> {
  if (!detection.isOperatorProject || !detection.projectType) {
    return null;
  }

  // 检查是否已注册
  const existing = getProjectByPath(detection.projectPath);

  if (existing) {
    console.log(`[openProject] 算子工程已存在: ${detection.projectName}, ID: ${existing.id}`);
    return existing.id;
  }

  // 注册新项目
  const projectId = await createProject({
    project_name: detection.projectName,
    project_path: detection.projectPath,
    project_type: detection.projectType,
  });

  console.log(`[openProject] 算子工程已注册: ${detection.projectName}, ID: ${projectId}`);

  return projectId;
}

/**
 * 标记根目录为多算子工程集合
 */
async function markAsMultiOperatorProject(
  rootPath: string,
  subProjectIds: number[],
  context: vscode.ExtensionContext,
): Promise<void> {
  const rootName = path.basename(rootPath);

  // 检查是否已注册
  const existing = getProjectByPath(rootPath);

  if (existing && existing.project_type === OperatorProjectType.MULTI_PROJECT) {
    console.log(`[openProject] 多算子工程集合已存在: ${rootName}`);
    // 更新子项目列表
    await createProject({
      project_name: rootName,
      project_path: rootPath,
      project_type: OperatorProjectType.MULTI_PROJECT,
      sub_project_ids: subProjectIds,
    });
  }
  else {
    // 创建新的多算子工程集合
    await createProject({
      project_name: rootName,
      project_path: rootPath,
      project_type: OperatorProjectType.MULTI_PROJECT,
      sub_project_ids: subProjectIds,
    });
    console.log(`[openProject] 多算子工程集合已创建: ${rootName}`);
  }
}

export const linkMethods = {
  /**
   * 打开文件
   * @param params 打开文件参数
   */
  async openFile(params: OpenFileParams): Promise<void> {
    // 兼容以前的逻辑
    const filePath = params.file;
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) {
      return;
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;
    const absolutePath = path.join(workspacePath, filePath);

    if (fs.existsSync(absolutePath)) {
      vscode.commands.executeCommand(
        'vscode.open',
        vscode.Uri.file(absolutePath),
      );
    }
    else {
      vscode.window.showErrorMessage(`文件不存在: ${filePath}`);
    }
  },

  /**
   * 打开链接
   * @param params 打开链接参数
   */
  async openLink(params: OpenLinkParams): Promise<void> {
    vscode.env.openExternal(vscode.Uri.parse(params.url));
  },

  /**
   * 检查 .vscode 文件夹权限
   * @returns 检查结果
   */
  async checkVscodeFolder(): Promise<boolean> {
    return await projectService.checkVscode();
  },

  /**
   * 检查 devtool_config.json
   * @returns 检查结果
   */
  async checkDevtoolConfig(): Promise<boolean> {
    return await configService.checkDevtoolConfig();
  },

  /**
   * 打开算子工程
   * @param params 打开项目参数
   */
  async openProject(params: OpenProjectParams): Promise<void> {
    const {
      projectPath,
      projectSH,
    } = params;

    try {
      // 验证参数
      if (!projectPath || typeof projectPath !== 'string') {
        vscode.window.showErrorMessage('项目路径不能为空');
        console.error('[openProject] 项目路径为空或无效:', projectPath);
        return;
      }

      // 验证路径是否存在
      if (!fs.existsSync(projectPath)) {
        vscode.window.showErrorMessage(`路径不存在: ${projectPath}`);

        return;
      }

      const context = (globalThis as unknown as {
        extensionContext: vscode.ExtensionContext;
      })
        .extensionContext;

      // 如果提供了 projectSH，保存到配置
      if (projectSH) {
        context.globalState.update('lastProjectPath', projectPath);
      }

      // 检测算子工程类型
      vscode.window.showInformationMessage('正在检测算子工程类型...');

      const rootDetection = await OperatorProjectDetector.detectOperatorProject(projectPath);

      // 如果根目录是算子工程，按原逻辑处理
      if (rootDetection.isOperatorProject && rootDetection.projectType) {
        console.log(`[openProject] 根目录是算子工程: ${rootDetection.projectType}`);

        // 根据检测到的算子类型确定模板名称和类型
        let templateName: string | undefined;
        let createOperatorProjectDictoryFileType: number = 1;

        if (rootDetection.projectType === OperatorProjectType.TORCH_LIBRARY) {
          templateName = 'torch_library_template';
          createOperatorProjectDictoryFileType = 1;
        }
        else if (rootDetection.projectType === OperatorProjectType.ASCEND_C) {
          templateName = 'hello_world';
          createOperatorProjectDictoryFileType = 1;
        }
        else {
          // 其他类型暂不支持自动初始化
          await vscode.commands.executeCommand(
            'vscode.openFolder',
            vscode.Uri.file(projectPath),
            false,
          );
          vscode.window.showInformationMessage(`已打开算子工程: ${projectPath}`);

          return;
        }

        console.log(`[openProject] 检测到算子类型: ${rootDetection.projectType}, 模板: ${templateName}`);

        // 初始化项目（类似 createdProject 的逻辑，但不覆盖已有文件）
        await initializeProjectForOpen(
          projectPath,
          rootDetection.projectName,
          projectSH,
          templateName,
          createOperatorProjectDictoryFileType,
          context,
        );

        // 注册并标记算子工程
        await registerAndMarkOperatorProject(rootDetection, context);

        // 打开文件夹
        await vscode.commands.executeCommand(
          'vscode.openFolder',
          vscode.Uri.file(projectPath),
          false,
        );
        vscode.window.showInformationMessage('算子工程初始化完成并已打开');

        return;
      }

      // 根目录不是算子工程，扫描子目录（3层）
      console.log('[openProject] 根目录不是算子工程，开始扫描子目录（3层）');
      vscode.window.showInformationMessage('正在扫描子目录中的算子工程...');

      const detectedProjects = await OperatorProjectDetector.scanForOperatorProjects(
        projectPath,
        3,
      );

      console.log(`[openProject] 扫描完成，找到 ${detectedProjects.length} 个算子工程`);

      if (detectedProjects.length === 0) {
        // 没有找到算子工程，直接打开文件夹
        await vscode.commands.executeCommand(
          'vscode.openFolder',
          vscode.Uri.file(projectPath),
          false,
        );
        vscode.window.showInformationMessage(`已打开目录: ${projectPath}`);

        return;
      }

      // 对找到的算子工程进行初始化和标记
      const subProjectIds: number[] = [];

      for (const detection of detectedProjects) {
        if (!detection.isOperatorProject || !detection.projectType) {
          continue;
        }

        try {
          // 初始化算子工程
          await initializeDetectedProject(detection, projectSH, context);

          // 注册并标记算子工程
          const projectId = await registerAndMarkOperatorProject(detection, context);

          if (projectId) {
            subProjectIds.push(projectId);
          }
        }
        catch (error) {
          console.error(`[openProject] 初始化算子工程失败 ${detection.projectPath}:`, error);
          // 继续处理其他算子工程
        }
      }

      // 如果找到多个算子工程，将根目录标记为多算子工程集合
      if (detectedProjects.length > 1) {
        console.log(`[openProject] 找到 ${detectedProjects.length} 个算子工程，标记根目录为多算子工程集合`);
        await markAsMultiOperatorProject(projectPath, subProjectIds, context);
      }

      // 注意：不在打开项目时自动检测并标记所有算子工程合集
      // 只在当前打开的项目路径下，如果找到多个算子工程，才标记根目录为合集（上面已处理）

      // 触发装饰更新
      const iconTheme = OperatorProjectIconTheme.getInstance(context);
      iconTheme.fireDecorationUpdate();

      // 更新所有已标记项目的上下文变量，模拟手动操作的效果
      const allProjects = getAllProjects();
      for (const project of allProjects) {
        if (project.project_path) {
          const uri = vscode.Uri.file(project.project_path);
          const checkResult = await FolderContextMenuService.checkIsOperatorProject(uri);
          
          // 更新上下文变量
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
        }
      }

      // 刷新资源管理器，确保菜单显示正确
      // 延迟执行，确保所有操作都已完成
      setTimeout(() => {
        vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');
      }, 500);

      // 打开根目录
      await vscode.commands.executeCommand(
        'vscode.openFolder',
        vscode.Uri.file(projectPath),
        false,
      );

      if (detectedProjects.length === 1) {
        vscode.window.showInformationMessage(`已找到并初始化算子工程: ${detectedProjects[0].projectName}`);
      }
      else {
        vscode.window.showInformationMessage(`已找到 ${detectedProjects.length} 个算子工程，根目录已标记为多算子工程集合`);
      }
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      console.error('[openProject] 打开项目失败:', error);
      vscode.window.showErrorMessage(`打开项目失败: ${errorMessage}`);
    }
  },
};
