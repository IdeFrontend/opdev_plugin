import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ProjectManager } from '@plugin/core/project/project-manager';
import { projectService } from '@plugin/service/project-service';
import { ExplorerRootUtils } from '@plugin/class/explorer-root-utils';
import { RemoteConfig } from '@plugin/helpers/remote-config';
import { getAllProjects, getProjectByPath, getProjectById } from '@plugin/domain/models/project-model';
import { OperatorProjectType, OperatorProjectDetector } from '@plugin/domain/services/operator-project-detector';
import {
  GetProjectIdResult,
  GetHomeResult,
  InitOpsParams,
  GetWorkspaceResult,
  GetLastProjectPathResult,
} from '@shared/api-types';

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
          const typeNameMap: Record<string, string> = {
            [OperatorProjectType.STANDARD_CUSTOM]: '标准自定义算子',
            [OperatorProjectType.ASCEND_C]: '<<<>>>算子',
            [OperatorProjectType.TORCH_LIBRARY]: 'torch_library算子',
            [OperatorProjectType.PYASC]: 'pyasc算子',
          };
          const projectTypeName = typeNameMap[detection.projectType] || detection.projectType;
          return {
            projectType: detection.projectType,
            projectTypeName,
            projectTemplateName: detection.projectType === OperatorProjectType.TORCH_LIBRARY ? 'torch_library_template' : ''
          };
        }
        return { projectType: null, projectTypeName: '' };
      }

      // 如果项目类型是 MULTI_PROJECT（算子工程集合），不显示集合类型
      // 尝试从子项目中获取实际的算子类型，或者直接检测工作区路径
      if (project.project_type === OperatorProjectType.MULTI_PROJECT) {
        // 如果有子项目，尝试获取第一个子项目的类型
        if (project.sub_project_ids && project.sub_project_ids.length > 0) {
          const firstSubProjectId = project.sub_project_ids[0];
          const subProject = getProjectById(firstSubProjectId);
          if (subProject && subProject.project_type && subProject.project_type !== OperatorProjectType.MULTI_PROJECT) {
            const typeNameMap: Record<string, string> = {
              [OperatorProjectType.STANDARD_CUSTOM]: '标准自定义算子',
              [OperatorProjectType.ASCEND_C]: '<<<>>>算子',
              [OperatorProjectType.TORCH_LIBRARY]: 'torch_library算子',
              [OperatorProjectType.PYASC]: 'pyasc算子',
            };
            const projectTypeName = typeNameMap[subProject.project_type] || subProject.project_type;
            return {
              projectType: subProject.project_type,
              projectTypeName,
            };
          }
        }
        
        // 如果无法从子项目获取，直接检测工作区路径
        const detection = await OperatorProjectDetector.detectOperatorProject(workspacePath);
        if (detection.isOperatorProject && detection.projectType) {
          const typeNameMap: Record<string, string> = {
            [OperatorProjectType.STANDARD_CUSTOM]: '标准自定义算子',
            [OperatorProjectType.ASCEND_C]: '<<<>>>算子',
            [OperatorProjectType.TORCH_LIBRARY]: 'torch_library算子',
            [OperatorProjectType.PYASC]: 'pyasc算子',
          };
          const projectTypeName = typeNameMap[detection.projectType] || detection.projectType;
          return {
            projectType: detection.projectType,
            projectTypeName,
          };
        }
        
        // 如果都无法获取，返回空字符串（不显示）
        return { projectType: null, projectTypeName: '' };
      }

      // 将项目类型转换为中文名称（只包括实际的算子类型）
      const typeNameMap: Record<string, string> = {
        [OperatorProjectType.STANDARD_CUSTOM]: '标准自定义算子',
        [OperatorProjectType.ASCEND_C]: '<<<>>>算子',
        [OperatorProjectType.TORCH_LIBRARY]: 'torch_library算子',
        [OperatorProjectType.PYASC]: 'pyasc算子',
      };

      const projectTypeName = typeNameMap[project.project_type] || project.project_type;

      return {
        projectType: project.project_type,
        projectTypeName,
        projectTemplateName: project.project_type === OperatorProjectType.TORCH_LIBRARY ? 'torch_library_template' : ''
      };
    }
    catch (error) {
      console.error('[getProjectType] 获取项目类型失败:', error);
      return { projectType: null, projectTypeName: '' };
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
    return process.env.HOME || process.env.USERPROFILE || '';
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
            '算子列表:',
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
          '算子列表:',
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
        '路径:',
        operatorProjects,
      );

      return { hasMultiple, isStandardCustom: false };
    }
    catch (error) {
      console.error('[checkMultipleOperators] 检查算子工程失败:', error);
      return { hasMultiple: false, isStandardCustom: false };
    }
  },
};
