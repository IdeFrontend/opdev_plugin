import { t } from 'i18next';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ProjectManager } from '@plugin/core/project/project-manager';
import { projectService } from '@plugin/service/project-service';
import { ExplorerRootUtils } from '@plugin/class/explorer-root-utils';
import { RemoteConfig } from '@plugin/helpers/remote-config';
import { getAllProjects, getProjectByPath, getProjectById, createProject } from '@plugin/domain/models/project-model';
import { OperatorProjectType, OperatorProjectDetector } from '@plugin/domain/services/operator-project-detector';
import { getWorkspaceFolder } from '@plugin/domain/models/config';
import {
  GetProjectIdResult,
  GetHomeResult,
  InitOpsParams,
  GetWorkspaceResult,
  GetLastProjectPathResult,
} from '@shared/api-types';

/**
 * 检查根目录 build.sh 是否包含 --bisheng_flags
 * 用于判断标准自定义算子是否支持异常检测和调优
 */
function checkBuildShHasBishengConfig(rootPath: string): boolean {
  const buildShPath = path.join(rootPath, 'build.sh');
  if (!fs.existsSync(buildShPath)) return false;
  try {
    const content = fs.readFileSync(buildShPath, 'utf-8');
    return content.includes('--bisheng_flags');
  } catch {
    return false;
  }
}

// 先定义 checkMultipleOperators 函数，以便在 getSelectedOperators 中使用
async function checkMultipleOperatorsInternal(): Promise<{
  hasMultiple: boolean;
  operators?: Array<{ id: number; name: string; path: string; isExperimental: boolean; isCompiled?: boolean }>;
  isStandardCustom?: boolean;
}> {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders || workspaceFolders.length === 0) {
    return { hasMultiple: false };
  }

  const workspacePath = workspaceFolders[0].uri.fsPath;

  try {
    // 先检查根目录是否被识别为标准自定义算子（通过检测器）
    const rootDetection = await OperatorProjectDetector.detectOperatorProject(workspacePath);
    const isRootStandardCustom = rootDetection.isOperatorProject &&
      rootDetection.projectType === OperatorProjectType.STANDARD_CUSTOM;

    // 获取所有已注册的算子工程
    const allProjects = getAllProjects();

    // 过滤出标准自定义算子（排除集合类型），确保算子在工作区内
    const standardCustomOperators = allProjects.filter(
      p => p.project_type === OperatorProjectType.STANDARD_CUSTOM &&
        p.project_path &&
        // 确保算子在工作区内
        path.normalize(p.project_path).toLowerCase().startsWith(
          path.normalize(workspacePath).toLowerCase()
        )
    );

    // 如果根目录是标准自定义算子，从项目的 ops_list 和 experimental_ops_list 读取算子列表
    if (isRootStandardCustom) {
      // 查找根目录对应的项目记录
      const rootProject = getProjectByPath(workspacePath);

      if (rootProject) {
        // 从 ops_list 和 experimental_ops_list 读取算子
        const opsList = rootProject.ops_list || [];
        const experimentalOpsList = rootProject.experimental_ops_list || [];

        // 合并所有算子，并转换为前端需要的格式
        // 使用项目ID作为基础ID，为每个算子生成唯一ID
        const operators: Array<{ id: number; name: string; path: string; isExperimental: boolean; isCompiled?: boolean }> = [];

        // 添加普通算子
        opsList.forEach((op, index) => {
          operators.push({
            id: rootProject.id * 10000 + index, // 生成唯一ID
            name: op.name,
            path: op.path,
            isExperimental: false,
            isCompiled: op.isCompiled || false,
          });
        });

        // 添加experimental算子
        experimentalOpsList.forEach((op, index) => {
          operators.push({
            id: rootProject.id * 10000 + 1000 + index, // 生成唯一ID
            name: op.name,
            path: op.path,
            isExperimental: true,
            isCompiled: op.isCompiled || false,
          });
        });

        const hasMultiple = operators.length > 1;

        console.log(
          '[checkMultipleOperators] 标准自定义算子，从 ops_list 读取:',
          `普通算子: ${opsList.length}, experimental算子: ${experimentalOpsList.length}`,
          t('home.operatorList'),
          operators.map(op => `${op.name} (${op.isExperimental ? 'ex' : 'normal'}, compiled: ${op.isCompiled})`),
        );

        return {
          hasMultiple,
          operators,
          isStandardCustom: true,
        };
      } else {
        console.warn('[checkMultipleOperators] 根目录是标准自定义算子，但未找到项目记录');
      }
    }

    // 如果工作区内有标准自定义算子工程（但不是根目录），使用原有逻辑
    if (standardCustomOperators.length > 0) {
      // 转换为前端需要的格式
      const operators = standardCustomOperators.map(p => ({
        id: p.id,
        name: path.basename(p.project_path || ''),
        path: p.project_path || '',
        isExperimental: p.is_experimental || false,
      }));

      const hasMultiple = operators.length > 1;

      console.log(
        '[checkMultipleOperators] 标准自定义算子，找到算子工程数量:',
        operators.length,
        t('home.operatorList'),
        operators.map(op => `${op.name} (${op.isExperimental ? 'ex' : 'normal'})`),
      );

      return {
        hasMultiple,
        operators,
        isStandardCustom: true,
      };
    }

    // 非标准自定义算子，使用原有逻辑
    const operatorProjects: string[] = [];

    // 递归查找所有包含 .vscode/devtool_config.json 的目录
    const findOperatorProjects = (dir: string): void => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          // 跳过 node_modules、.git 等常见目录
          if (entry.name.startsWith('.') && entry.name !== '.vscode') {
            continue;
          }

          if (entry.name === 'node_modules' || entry.name === '.git') {
            continue;
          }

          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            // 检查该目录下是否有 .vscode/devtool_config.json
            const devtoolConfigPath = path.join(
              fullPath,
              '.vscode',
              'devtool_config.json',
            );

            if (fs.existsSync(devtoolConfigPath)) {
              operatorProjects.push(fullPath);
            }
            else {
              // 继续递归查找子目录
              findOperatorProjects(fullPath);
            }
          }
        }
      }
      catch (error) {
        // 忽略无法访问的目录
        console.warn(`[checkMultipleOperators] 无法访问目录: ${dir}`, error);
      }
    };

    findOperatorProjects(workspacePath);

    const hasMultiple = operatorProjects.length > 1;

    console.log(
      '[checkMultipleOperators] 找到算子工程数量:',
      operatorProjects.length,
      t('home.path'),
      operatorProjects,
    );

    return { hasMultiple, isStandardCustom: false };
  }
  catch (error) {
    console.error('[checkMultipleOperators] 检查算子工程失败:', error);
    return { hasMultiple: false, isStandardCustom: false };
  }
}

/** 仅解析当前工作区项目类型，供 validatePyascForAnalysis 等使用 */
async function getProjectTypeValue(): Promise<string | null> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) return null;
  const workspacePath = workspaceFolders[0].uri.fsPath;
  const project = getProjectByPath(workspacePath);
  if (project?.project_type) return project.project_type;
  const detection = await OperatorProjectDetector.detectOperatorProject(workspacePath);
  return (detection.isOperatorProject && detection.projectType) ? detection.projectType : null;
}

export const homeMethods = {
  /**
   * 获取项目ID
   * @returns 项目ID
   */
  async getProjectId(): Promise<GetProjectIdResult> {
    await ProjectManager.getInstance()
      .initProject();

    return ProjectManager.getInstance().projectId;
  },

  /**
   * 获取当前项目类型
   * 只返回实际的算子类型，不包括"算子工程集合"
   * @returns 项目类型信息
   */
  async getProjectType(): Promise<{ projectType: string | null; projectTypeName: string; projectTemplateName?: string }> {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;

      if (!workspaceFolders || workspaceFolders.length === 0) {
        return { projectType: null, projectTypeName: '' };
      }

      const workspacePath = workspaceFolders[0].uri.fsPath;
      const project = getProjectByPath(workspacePath);

      if (!project || !project.project_type) {
        // 如果没有注册的项目，尝试直接检测工作区路径
        const detection = await OperatorProjectDetector.detectOperatorProject(workspacePath);
        if (detection.isOperatorProject && detection.projectType) {
          const typeNameKeyMap: Record<string, string> = {
            [OperatorProjectType.STANDARD_CUSTOM]: 'home.projectTypeStandardCustom',
            [OperatorProjectType.ASCEND_C]: 'home.projectTypeAscendC',
            [OperatorProjectType.TORCH_LIBRARY]: 'home.projectTypeTorchLibrary',
            [OperatorProjectType.PYASC]: 'home.projectTypePyasc',
          };
          const projectTypeName = typeNameKeyMap[detection.projectType] ? t(typeNameKeyMap[detection.projectType]) : detection.projectType;
          return {
            projectType: detection.projectType,
            projectTypeName,
            projectTemplateName: detection.projectType === OperatorProjectType.TORCH_LIBRARY ? 'torch_library_template' : ''
          };
        }
        return { projectType: null, projectTypeName: '' };
      }

      // 将项目类型转换为中文名称（只包括实际的算子类型）
      const typeNameKeyMap: Record<string, string> = {
        [OperatorProjectType.STANDARD_CUSTOM]: 'home.projectTypeStandardCustom',
        [OperatorProjectType.ASCEND_C]: 'home.projectTypeAscendC',
        [OperatorProjectType.TORCH_LIBRARY]: 'home.projectTypeTorchLibrary',
        [OperatorProjectType.PYASC]: 'home.projectTypePyasc',
      };

      const projectTypeName = typeNameKeyMap[project.project_type] ? t(typeNameKeyMap[project.project_type]) : project.project_type;

      return {
        projectType: project.project_type,
        projectTypeName,
        projectTemplateName: project.template_name || ''
      };
    }
    catch (error) {
      console.error('[getProjectType] 获取项目类型失败:', error);
      return { projectType: null, projectTypeName: '' };
    }
  },

  /**
   * pyasc 类型仿真分析/性能调优前置校验：在打开配置页面前触发
   * 仅当项目为 pyasc 时校验是否已打开 .py 文件及工作区
   * @returns { valid: true } 或 { valid: false, message: string }
   */
  async validatePyascForAnalysis(): Promise<{ valid: boolean; message?: string }> {
    try {
      const projectType = await getProjectTypeValue();
      if (projectType !== OperatorProjectType.PYASC) {
        return { valid: true };
      }
      const activeEditor = vscode.window.activeTextEditor;
      const isPyFile = activeEditor?.document.fileName.endsWith('.py');
      if (!isPyFile) {
        return { valid: false, message: t('extension.openPyFirst') };
      }
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        return { valid: false, message: t('task.workspacePathNotFound') };
      }
      return { valid: true };
    }
    catch (error) {
      console.error('[validatePyascForAnalysis] 校验失败:', error);
      return { valid: false, message: (error as Error).message };
    }
  },

  /**
   * 获取工作区路径
   * @returns 工作区路径
   */
  async getWorkspace(): Promise<GetWorkspaceResult> {
    const root = ExplorerRootUtils.getPrimaryRoot();

    return root ? root.path : null;
  },

  /**
   * 获取最后项目路径
   * @returns 最后项目路径
   */
  async getLastProjectPath(): Promise<GetLastProjectPathResult> {
    return RemoteConfig.getLastProjectPath();
  },

  /**
   * 初始化项目
   * @param params - 初始化参数
   * @returns 初始化结果
   */
  async initOps(params: InitOpsParams): Promise<GetHomeResult> {
    return await projectService.init(params);
  },

  /**
   * 获取HOME目录
   * @returns HOME目录
   */
  async getHome(): Promise<GetHomeResult> {
    // 使用封装的函数通过命令获取 WORKSPACE_FOLDER
    const workspaceFolder = getWorkspaceFolder();

    return workspaceFolder || process.env.HOME || process.env.USERPROFILE || '';
  },

  /**
   * 更新Project
   */
  async updateProject(): Promise<void> {
    // 刷新项目信息
    await ProjectManager.getInstance()
      .initProject();
  },

  /**
   * 检查当前目录下是否有多个算子工程
   * 如果是标准自定义算子，返回所有已识别的算子列表
   * @returns 如果有多个算子工程返回 true 和算子列表，否则返回 false
   */
  async checkMultipleOperators(): Promise<{
    hasMultiple: boolean;
    operators?: Array<{ id: number; name: string; path: string; isExperimental: boolean }>;
    isStandardCustom?: boolean;
    /** 根目录为标准自定义算子时：build.sh 含 --bisheng_flags 则支持异常检测与调优 */
    supportsSanitizerAndTuning?: boolean;
  }> {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
      return { hasMultiple: false };
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;

    try {
      // 先检查根目录是否被识别为标准自定义算子（通过检测器）
      const rootDetection = await OperatorProjectDetector.detectOperatorProject(workspacePath);
      const isRootStandardCustom = rootDetection.isOperatorProject &&
        rootDetection.projectType === OperatorProjectType.STANDARD_CUSTOM;

      // 获取所有已注册的算子工程
      const allProjects = getAllProjects();

      // 过滤出标准自定义算子（排除集合类型），确保算子在工作区内
      const standardCustomOperators = allProjects.filter(
        p => p.project_type === OperatorProjectType.STANDARD_CUSTOM &&
          p.project_path &&
          // 确保算子在工作区内
          path.normalize(p.project_path).toLowerCase().startsWith(
            path.normalize(workspacePath).toLowerCase()
          )
      );

      // 如果根目录是标准自定义算子，从项目的 ops_list 和 experimental_ops_list 读取算子列表
      if (isRootStandardCustom) {
        // 查找根目录对应的项目记录
        const rootProject = getProjectByPath(workspacePath);

        if (rootProject) {
          // 从 ops_list 和 experimental_ops_list 读取算子
          const opsList = rootProject.ops_list || [];
          const experimentalOpsList = rootProject.experimental_ops_list || [];

          // 合并所有算子，并转换为前端需要的格式
          // 使用项目ID作为基础ID，为每个算子生成唯一ID
          const operators: Array<{ id: number; name: string; path: string; isExperimental: boolean; isCompiled?: boolean }> = [];

          // 添加普通算子
          opsList.forEach((op, index) => {
            operators.push({
              id: rootProject.id * 10000 + index, // 生成唯一ID
              name: op.name,
              path: op.path,
              isExperimental: false,
              isCompiled: op.isCompiled || false,
            });
          });

          // 添加experimental算子
          experimentalOpsList.forEach((op, index) => {
            operators.push({
              id: rootProject.id * 10000 + 1000 + index, // 生成唯一ID
              name: op.name,
              path: op.path,
              isExperimental: true,
              isCompiled: op.isCompiled || false,
            });
          });

          const hasMultiple = operators.length > 1;

          const supportsSanitizerAndTuning = checkBuildShHasBishengConfig(workspacePath);
          console.log(
            '[checkMultipleOperators] 标准自定义算子，从 ops_list 读取:',
            `普通算子: ${opsList.length}, experimental算子: ${experimentalOpsList.length}`,
            t('home.operatorList'),
            operators.map(op => `${op.name} (${op.isExperimental ? 'ex' : 'normal'}, compiled: ${op.isCompiled})`),
            t('home.supportsSanitizerAndTuning'),
            supportsSanitizerAndTuning,
          );

          return {
            hasMultiple,
            operators,
            isStandardCustom: true,
            supportsSanitizerAndTuning,
          };
        } else {
          console.warn('[checkMultipleOperators] 根目录是标准自定义算子，但未找到项目记录');
        }
      }

      // 如果工作区内有标准自定义算子工程（但不是根目录），使用原有逻辑
      if (standardCustomOperators.length > 0) {
        // 转换为前端需要的格式
        const operators = standardCustomOperators.map(p => ({
          id: p.id,
          name: path.basename(p.project_path || ''),
          path: p.project_path || '',
          isExperimental: p.is_experimental || false,
        }));

        const hasMultiple = operators.length > 1;

        console.log(
          '[checkMultipleOperators] 标准自定义算子，找到算子工程数量:',
          operators.length,
          t('home.operatorList'),
          operators.map(op => `${op.name} (${op.isExperimental ? 'ex' : 'normal'})`),
        );

        return {
          hasMultiple,
          operators,
          isStandardCustom: true,
        };
      }

      // 非标准自定义算子，使用原有逻辑
      const operatorProjects: string[] = [];

      // 递归查找所有包含 .vscode/devtool_config.json 的目录
      const findOperatorProjects = (dir: string): void => {
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });

          for (const entry of entries) {
            // 跳过 node_modules、.git 等常见目录
            if (entry.name.startsWith('.') && entry.name !== '.vscode') {
              continue;
            }

            if (entry.name === 'node_modules' || entry.name === '.git') {
              continue;
            }

            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
              // 检查该目录下是否有 .vscode/devtool_config.json
              const devtoolConfigPath = path.join(
                fullPath,
                '.vscode',
                'devtool_config.json',
              );

              if (fs.existsSync(devtoolConfigPath)) {
                operatorProjects.push(fullPath);
              }
              else {
                // 继续递归查找子目录
                findOperatorProjects(fullPath);
              }
            }
          }
        }
        catch (error) {
          // 忽略无法访问的目录
          console.warn(`[checkMultipleOperators] 无法访问目录: ${dir}`, error);
        }
      };

      findOperatorProjects(workspacePath);

      const hasMultiple = operatorProjects.length > 1;

      console.log(
        '[checkMultipleOperators] 找到算子工程数量:',
        operatorProjects.length,
        t('home.path'),
        operatorProjects,
      );

      return { hasMultiple, isStandardCustom: false };
    }
    catch (error) {
      console.error('[checkMultipleOperators] 检查算子工程失败:', error);
      return { hasMultiple: false, isStandardCustom: false };
    }
  },

  /**
   * 设置已选择的算子ID列表（用于标准自定义算子场景）
   * @param params 包含 operatorIds 的参数对象
   */
  async setSelectedOperators(params: { operatorIds: number[] } = { operatorIds: [] }): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return;
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;
    const project = getProjectByPath(workspacePath);

    if (project) {
      // 从 params 中获取 operatorIds，并确保是数组
      let operatorIds = params?.operatorIds || [];

      // 如果 operatorIds 不是数组，尝试转换
      if (!Array.isArray(operatorIds)) {
        console.warn('[setSelectedOperators] operatorIds 不是数组:', typeof operatorIds, operatorIds);
        operatorIds = [];
      }

      // 确保 operatorIds 是数字数组
      const numericIds = operatorIds
        .map(id => typeof id === 'string' ? Number(id) : id)
        .filter(id => typeof id === 'number' && !isNaN(id));

      console.log('[setSelectedOperators] 保存算子ID:', numericIds);

      await createProject({
        project_name: project.project_name,
        project_path: project.project_path,
        selected_operator_ids: numericIds,
      });
    }
  },

  /**
   * 获取已选择的算子ID列表（用于标准自定义算子场景）
   * @returns 算子ID列表，如果没有则返回 undefined
   */
  async getSelectedOperatorIds(): Promise<number[] | undefined> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return undefined;
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;
    const project = getProjectByPath(workspacePath);

    if (!project) {
      return undefined;
    }

    // 确保 selected_operator_ids 是数组类型
    let selectedOperatorIds: number[] = [];
    if (project.selected_operator_ids) {
      if (Array.isArray(project.selected_operator_ids)) {
        // 确保数组中的元素都是数字
        selectedOperatorIds = project.selected_operator_ids
          .map(id => typeof id === 'string' ? Number(id) : id)
          .filter(id => typeof id === 'number' && !isNaN(id));
        console.log('[getSelectedOperatorIds] 转换后的 selected_operator_ids:', selectedOperatorIds);
      } else {
        console.warn('[getSelectedOperatorIds] selected_operator_ids 不是数组类型:', typeof project.selected_operator_ids, project.selected_operator_ids);
        return undefined;
      }
    } else {
      console.log('[getSelectedOperatorIds] project.selected_operator_ids 为空');
    }

    return selectedOperatorIds.length > 0 ? selectedOperatorIds : undefined;
  },

  /**
   * 获取已选择的算子名称列表（用于标准自定义算子场景）
   * @returns 算子名称列表，多个用逗号分隔，如果没有则返回 undefined
   */
  async getSelectedOperators(): Promise<string | undefined> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return undefined;
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;
    const project = getProjectByPath(workspacePath);

    if (!project) {
      return undefined;
    }

    // 确保 selected_operator_ids 是数组类型
    let selectedOperatorIds: number[] = [];
    if (project.selected_operator_ids) {
      if (Array.isArray(project.selected_operator_ids)) {
        // 确保数组中的元素都是数字
        selectedOperatorIds = project.selected_operator_ids
          .map(id => typeof id === 'string' ? Number(id) : id)
          .filter(id => typeof id === 'number' && !isNaN(id));
        console.log('[getSelectedOperators] 转换后的 selected_operator_ids:', selectedOperatorIds);
      } else {
        // 如果不是数组，尝试转换（可能是字符串或其他类型）
        console.warn('[getSelectedOperators] selected_operator_ids 不是数组类型:', typeof project.selected_operator_ids, project.selected_operator_ids);
        return undefined;
      }
    } else {
      console.log('[getSelectedOperators] project.selected_operator_ids 为空');
    }

    if (selectedOperatorIds.length === 0) {
      return undefined;
    }

    // 获取所有算子信息
    const result = await checkMultipleOperatorsInternal();
    if (!result.isStandardCustom || !result.operators) {
      return undefined;
    }

    // 根据ID匹配算子名称
    const selectedOperatorNames = result.operators
      .filter(op => selectedOperatorIds.includes(op.id))
      .map(op => op.name);

    return selectedOperatorNames.length > 0 ? selectedOperatorNames.join(',') : undefined;
  },
};
