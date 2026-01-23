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
  createProject,
  getProjectByPath,
  getProjectById,
  deleteProject,
  getAllProjects,
  getContainingStandardCustomProject,
  updateStandardCustomOperators,
} from '@plugin/domain/models/project-model';
import { WorkspaceDetectorService } from './workspace-detector-service';
import { ProjectManager } from '@plugin/core/project/project-manager';
import { projectService } from './project-service';
import { OperatorProjectIconTheme } from '@plugin/class/operator-project-icon-theme';
import { generateStructure } from '@plugin/domain';
import { getOpsByProjectId } from '@plugin/domain/models/model';
import { getConfig } from '@plugin/domain/services/configuration';
import { buildService } from './build-service';
import { taskMethods } from '../controller/task-controller';

/**
 * 判断目录是否为标准自定义算子的根目录（含 build.sh 且包含 --genop）
 */
function isStandardCustomRoot(dirPath: string): boolean {
  const buildSh = path.join(dirPath, 'build.sh');
  if (!fs.existsSync(buildSh)) return false;
  try {
    const content = fs.readFileSync(buildSh, 'utf-8');
    return content.includes('--genop');
  } catch {
    return false;
  }
}

/**
 * 向上查找标准自定义算子根目录（含 build.sh --genop），最多查找 5 层
 */
function findStandardCustomRoot(startPath: string): string | null {
  let dir = path.normalize(startPath);
  for (let i = 0; i < 5; i++) {
    if (isStandardCustomRoot(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * 文件夹右键菜单服务
 * 处理文件夹右键菜单的相关操作
 */
export class FolderContextMenuService {
  /**
   * 标记文件夹为算子工程
   * 1. 仅根目录（含 build.sh --genop）可记为标准自定义算子，并在 projects 中新建一项。
   * 2. 算子集合、子算子不再在 projects 中新建；其信息存于根项目的 ops_meet、ops_list、experimental_ops_list。
   */
  static async markAsOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;

    try {
      const rootDetection = await OperatorProjectDetector.detectOperatorProject(folderPath);

      if (rootDetection.isOperatorProject && rootDetection.projectType) {
        const existing = getProjectByPath(folderPath);
        if (existing) {
          vscode.window.showInformationMessage('该文件夹已经是算子工程');
          return;
        }

        if (rootDetection.projectType === OperatorProjectType.STANDARD_CUSTOM) {
          if (!isStandardCustomRoot(folderPath)) {
            vscode.window.showWarningMessage('该目录是标准自定义算子的子目录，请对包含 build.sh 的根目录执行「标记为算子工程」');
            return;
          }
          const projectId = await createProject({
            project_name: rootDetection.projectName,
            project_path: folderPath,
            project_type: OperatorProjectType.STANDARD_CUSTOM,
          });
          const { opsMeet, opsList, experimentalOpsList } = WorkspaceDetectorService.scanOpsMeetAndOpsLists(folderPath);
          await updateStandardCustomOperators(folderPath, opsMeet, opsList, experimentalOpsList);
          await this.initializeOperatorProject(rootDetection, projectId);
          const ctx = (globalThis as unknown as { extensionContext: vscode.ExtensionContext })
            .extensionContext;
          if (ctx) {
            const uris: vscode.Uri[] = [vscode.Uri.file(folderPath)];
            for (const m of opsMeet) { if (m.path) uris.push(vscode.Uri.file(m.path)); }
            for (const o of opsList) { if (o.path) uris.push(vscode.Uri.file(o.path)); }
            for (const o of experimentalOpsList) { if (o.path) uris.push(vscode.Uri.file(o.path)); }
            OperatorProjectIconTheme.getInstance(ctx).fireDecorationUpdate(uris);
          }
          vscode.window.showInformationMessage(`已标记为算子工程: ${rootDetection.projectName}`);
          return;
        }

        const projectId = await createProject({
          project_name: rootDetection.projectName,
          project_path: folderPath,
          project_type: rootDetection.projectType,
        });
        await this.initializeOperatorProject(rootDetection, projectId);
        const ctxSingle = (globalThis as unknown as { extensionContext: vscode.ExtensionContext })
          .extensionContext;
        if (ctxSingle) {
          OperatorProjectIconTheme.getInstance(ctxSingle)
            .fireDecorationUpdate(vscode.Uri.file(folderPath));
        }
        vscode.window.showInformationMessage(`已标记为算子工程: ${rootDetection.projectName}`);
        return;
      }

      const detectedProjects = await OperatorProjectDetector.scanForOperatorProjects(folderPath, 3);

      if (detectedProjects.length > 1) {
        const hasStandardCustom = detectedProjects.some((d) => d.projectType === OperatorProjectType.STANDARD_CUSTOM);
        if (hasStandardCustom) {
          vscode.window.showWarningMessage('该目录下包含标准自定义算子子目录，请对包含 build.sh 的根目录执行「标记为算子工程」');
          return;
        }
        const existing = getProjectByPath(folderPath);
        if (existing && existing.project_type === OperatorProjectType.MULTI_PROJECT) {
          vscode.window.showInformationMessage('该文件夹已经是算子工程集合');
          return;
        }
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
            initializationTasks.push(() => this.initializeOperatorProject(detection, subId));
          } else {
            subProjectIds.push(subProject.id);
          }
        }
        if (initializationTasks.length > 0) {
          await Promise.allSettled(initializationTasks.map((t) => t().catch((e) => { throw e; })));
        }
        const projectName = path.basename(folderPath);
        await createProject({
          project_name: projectName,
          project_path: folderPath,
          project_type: OperatorProjectType.MULTI_PROJECT,
          sub_project_ids: subProjectIds,
        });
        const ctx1 = (globalThis as unknown as { extensionContext: vscode.ExtensionContext }).extensionContext;
        if (ctx1) OperatorProjectIconTheme.getInstance(ctx1).fireDecorationUpdate(vscode.Uri.file(folderPath));
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
   * 不再为算子集合或子算子在 projects 中新建项目；只从根目录全量扫描，更新根项目的 ops_meet、ops_list、experimental_ops_list。
   */
  static async markAsMultiOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;

    try {
      let rootPath: string | null = null;
      const containing = getContainingStandardCustomProject(folderPath);
      if (containing?.project_path) {
        rootPath = containing.project_path;
      }
      if (!rootPath) {
        rootPath = findStandardCustomRoot(folderPath);
      }
      if (!rootPath) {
        vscode.window.showWarningMessage('未找到标准自定义算子根目录，请先对包含 build.sh 的根目录执行「标记为算子工程」');
        return;
      }
      const rootProject = getProjectByPath(rootPath);
      if (!rootProject || rootProject.project_type !== OperatorProjectType.STANDARD_CUSTOM) {
        vscode.window.showWarningMessage('请先在根目录执行「标记为算子工程」');
        return;
      }
      const { opsMeet, opsList, experimentalOpsList } = WorkspaceDetectorService.scanOpsMeetAndOpsLists(rootPath);
      await updateStandardCustomOperators(rootPath, opsMeet, opsList, experimentalOpsList);

      const context = (globalThis as unknown as { extensionContext: vscode.ExtensionContext })
        .extensionContext;
      if (context) {
        const iconTheme = OperatorProjectIconTheme.getInstance(context);
        const urisToUpdate: vscode.Uri[] = [
          vscode.Uri.file(rootPath),
          vscode.Uri.file(folderPath),
        ];
        for (const m of opsMeet) { if (m.path) urisToUpdate.push(vscode.Uri.file(m.path)); }
        for (const o of opsList) { if (o.path) urisToUpdate.push(vscode.Uri.file(o.path)); }
        for (const o of experimentalOpsList) { if (o.path) urisToUpdate.push(vscode.Uri.file(o.path)); }
        iconTheme.fireDecorationUpdate(urisToUpdate);
      }

      vscode.window.showInformationMessage(`已更新算子合集与算子列表（${opsMeet.length} 个算子合集，${opsList.length + experimentalOpsList.length} 个算子）`);
    }
    catch (error) {
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
   * 编译部署算子工程（运行验证）
   * 1. 如果选中的是文件夹，且当前项目根目录是标准自定义算子，则执行编译example操作
   * 2. 如果选中的是 .py 文件，且当前项目根目录是 pyasc 算子，则执行 pyasc 相关操作（暂时留空）
   * 3. 其他情况提示用户
   * @param uri 右键目标（文件夹或文件）
   */
  static async buildOperatorProject(uri: vscode.Uri): Promise<void> {
    // 获取当前打开工程的根目录
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage('未打开工作区，无法运行验证');
      return;
    }
    const workspaceRootPath = workspaceFolders[0].uri.fsPath;

    // 判断当前选中的是文件夹还是文件
    let isFolder = false;
    let isPyFile = false;
    try {
      const stat = fs.statSync(uri.fsPath);
      isFolder = stat.isDirectory();
      if (!isFolder) {
        isPyFile = uri.fsPath.endsWith('.py');
      }
    } catch {
      isFolder = false;
      isPyFile = false;
    }

    // 判断当前项目的根目录是否为标准自定义算子或 pyasc 算子
    // 使用 OperatorProjectDetector.detectOperatorProject 来判断
    const rootDetection = await OperatorProjectDetector.detectOperatorProject(workspaceRootPath);
    const isStandardCustom = rootDetection.isOperatorProject
      && rootDetection.projectType === OperatorProjectType.STANDARD_CUSTOM;
    const isPyasc = rootDetection.isOperatorProject
      && rootDetection.projectType === OperatorProjectType.PYASC;

    // 情况1: 选中的是文件夹，且当前项目根目录是标准自定义算子
    if (isFolder && isStandardCustom) {
      // 获取用户选中的文件夹名称作为 operatorNames
      const operatorNames = path.basename(uri.fsPath);

      // 从根目录找到对应的 projectId
      let projectId: number | undefined;
      const containingProject = getContainingStandardCustomProject(uri.fsPath);
      if (containingProject) {
        projectId = containingProject.id;
      } else {
        // 如果找不到包含的项目，尝试直接通过根目录查找
        const rootProject = getProjectByPath(workspaceRootPath);
        if (rootProject) {
          projectId = rootProject.id;
        }
      }

      if (!projectId) {
        vscode.window.showErrorMessage('未找到对应的项目ID，请先标记为算子工程');
        return;
      }

      // 调用 startBuild，传入 operatorNames、operatorType 和 projectId
      await buildService.startBuild({
        operatorNames,
        operatorType: 'standard-custom',
        projectId,
      });
      return;
    }

    // 情况2: 选中的是 .py 文件，且当前项目根目录是 pyasc 算子
    if (isPyFile && isPyasc) {
      // 暂时留空，后续实现 pyasc 相关操作
      console.log('[buildOperatorProject] pyasc 算子运行验证功能暂未实现');
      return;
    }

    // 其他情况：提示用户
    vscode.window.showWarningMessage('该文件/文件夹无算子可运行验证');
  }

  /**
   * 运行验证算子工程
   * 如果是标准自定义算子，则执行编译example的逻辑；其他算子执行运行验证的现有逻辑
   */
  static async runOperatorProject(uri: vscode.Uri): Promise<void> {
    // 获取当前打开工程的根目录
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage('未打开工作区，无法运行验证');
      return;
    }
    const workspaceRootPath = workspaceFolders[0].uri.fsPath;

    // 判断当前选中的是文件夹还是文件
    let isFolder = false;
    let isPyFile = false;
    try {
      const stat = fs.statSync(uri.fsPath);
      isFolder = stat.isDirectory();
      if (!isFolder) {
        isPyFile = uri.fsPath.endsWith('.py');
      }
    } catch {
      isFolder = false;
      isPyFile = false;
    }

    // 判断当前项目的根目录是否为标准自定义算子或 pyasc 算子
    // 使用 OperatorProjectDetector.detectOperatorProject 来判断
    const rootDetection = await OperatorProjectDetector.detectOperatorProject(workspaceRootPath);
    const isStandardCustom = rootDetection.isOperatorProject
      && rootDetection.projectType === OperatorProjectType.STANDARD_CUSTOM;
    const isPyasc = rootDetection.isOperatorProject
      && rootDetection.projectType === OperatorProjectType.PYASC;

    // 情况1: 选中的是文件夹，且当前项目根目录是标准自定义算子
    if (isFolder && isStandardCustom) {
      // 参考 app.vue 运行验证逻辑：operatorNames 为选中的文件夹名，projectId 从根目录在 projects.json 中查找
      const project = getProjectByPath(workspaceRootPath);
      if (!project) {
        vscode.window.showErrorMessage('根目录未在 projects.json 中注册，无法运行验证');
        return;
      }
      const operatorNames = path.basename(uri.fsPath);
      const operatorType = 'standard-custom';
      await taskMethods.startBuildExample({
        operatorNames,
        operatorType,
        projectId: project.id,
      });
      return;
    }

    // 情况2: 当前项目根目录是 pyasc 算子
    if (isPyasc) {
      await taskMethods.startRun();
      return;
    }

    // 其他情况：提示用户
    vscode.window.showWarningMessage('该文件/文件夹无算子可运行验证');
  }

  /**
   * CPU调试算子工程
   */
  static async cpuDebugOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;
    const project = getProjectByPath(folderPath);

    // 检查是否是算子工程
    if (!project || project.project_type === OperatorProjectType.MULTI_PROJECT) {
      vscode.window.showWarningMessage('该文件夹不是算子工程');
      return;
    }

    await this.switchToProject(uri, async () => {
      // 调用CPU调试，与看板逻辑保持一致
      await taskMethods.runCpuDebug();
    });
  }

  /**
   * NPU调试算子工程
   */
  static async npuDebugOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;
    const project = getProjectByPath(folderPath);

    // 检查是否是算子工程
    if (!project || project.project_type === OperatorProjectType.MULTI_PROJECT) {
      vscode.window.showWarningMessage('该文件夹不是算子工程');
      return;
    }

    await this.switchToProject(uri, async () => {
      // 调用NPU调试，与看板逻辑保持一致
      await taskMethods.runDebug();
    });
  }

  /**
   * CPU调试配置算子工程
   */
  static async cpuDebugConfigOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;
    const project = getProjectByPath(folderPath);

    // 检查是否是算子工程
    if (!project || project.project_type === OperatorProjectType.MULTI_PROJECT) {
      vscode.window.showWarningMessage('该文件夹不是算子工程');
      return;
    }

    await this.switchToProject(uri, async () => {
      // 调用CPU调试配置，与看板逻辑保持一致
      await taskMethods.cpuDebugConfig();
    });
  }

  /**
   * NPU调试配置算子工程
   */
  static async npuDebugConfigOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;
    const project = getProjectByPath(folderPath);

    // 检查是否是算子工程
    if (!project || project.project_type === OperatorProjectType.MULTI_PROJECT) {
      vscode.window.showWarningMessage('该文件夹不是算子工程');
      return;
    }

    await this.switchToProject(uri, async () => {
      // 调用NPU调试配置，与看板逻辑保持一致
      await taskMethods.debugConfig();
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
      // 打开异常检测配置，与看板逻辑保持一致
      const sanitizerCommand = 'huawei-op-devtools.sanitizerOptions';
      await vscode.commands.executeCommand(sanitizerCommand);
    });
  }

  /**
   * 上板分析
   */
  static async onBoardOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;
    const project = getProjectByPath(folderPath);

    // 检查是否是算子工程
    if (!project || project.project_type === OperatorProjectType.MULTI_PROJECT) {
      vscode.window.showWarningMessage('该文件夹不是算子工程');
      return;
    }

    await this.switchToProject(uri, async () => {
      // 打开上板分析配置，与看板逻辑保持一致
      const onBoardCommand = 'huawei-op-devtools.onBoardOptions';
      await vscode.commands.executeCommand(onBoardCommand);
    });
  }

  /**
   * 仿真分析
   */
  static async simulationOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;
    const project = getProjectByPath(folderPath);

    // 检查是否是算子工程
    if (!project || project.project_type === OperatorProjectType.MULTI_PROJECT) {
      vscode.window.showWarningMessage('该文件夹不是算子工程');
      return;
    }

    await this.switchToProject(uri, async () => {
      // 打开仿真分析配置，与看板逻辑保持一致
      const simulationCommand = 'huawei-op-devtools.simulatorOptions';
      await vscode.commands.executeCommand(simulationCommand);
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
