import * as vscode from 'vscode';

import { ProjectManager } from '../core/project/project-manager';
import {
  InitOpsParams,
  CreateOpsParams,
  CreateOpsByPrototypeParams,
  UpdateShScriptParams,
} from 'shared:/api-types';
import {
  updateShScript,
  generateOpsPrototype,
  generateStructure,
  getProjectById,
} from '../domain';

export class ProjectService {
  /**
   * 获取 ExtensionContext
   */
  private getContext(): vscode.ExtensionContext {
    return (globalThis as unknown as { extensionContext: vscode.ExtensionContext })
      .extensionContext;
  }

  /**
   * 初始化算子项目
   */
  async init(params: InitOpsParams): Promise<string> {
    return await ProjectManager.getInstance().initProject(params);
  }

  /**
   * 创建算子原型文件
   */
  async createOps(params: CreateOpsParams): Promise<string> {
    const pm = ProjectManager.getInstance();
    const info = pm.getProjectInfo();
    const op_name = params.projectName || info.name;
    const project_id = params.projectId || pm.projectId;
    const prototype_name = params.prototypeName || undefined;

    console.log('生成算子原型文件参数', op_name, project_id, prototype_name);

    try {
      const context = this.getContext();
      const result = await generateOpsPrototype(
        Number(project_id),
        op_name,
        prototype_name,
        context.extensionPath,
      );

      vscode.window.showInformationMessage(`新建算子原型文件成功`);

      // 检查并设置 .vscode 目录权限
      await pm.checkVscode();

      return result;
    } catch {
      vscode.window.showErrorMessage(`新建算子原型文件失败`);

      return '';
    }
  }

  /**
   * 通过原型生成算子工程
   */
  async createOpsByPrototype(
    params: CreateOpsByPrototypeParams,
  ): Promise<void> {
    const pm = ProjectManager.getInstance();
    const context = this.getContext();

    try {
      const result = generateStructure(
        {
          ops_prototype_file: params.opsPrototypeFile,
          project_id: Number(pm.projectId),
          op_type: params.opType || 'ascend',
        },
        context.extensionPath,
      );

      console.log(
        '生成算子工程参数',
        {
          ops_prototype_file: params.opsPrototypeFile,
          project_id: pm.projectId,
          op_type: params.opType,
        },
        result,
      );

      vscode.window.showInformationMessage(`新建算子文件成功`);
      await pm.checkVscode();
    } catch (e) {
      vscode.window.showErrorMessage(
        `新建算子文件失败 ${e instanceof Error ? e.message : ''}`,
      );
    }
  }

  /**
   * 更新脚本文件
   */
  async updateShScript(params: UpdateShScriptParams): Promise<string> {
    const pm = ProjectManager.getInstance();
    const info = pm.getProjectInfo();
    const project_name = info.name ?? '';
    const project_path = info.path;

    if (project_path === undefined) {
      return '';
    }

    const ascend_env_script = params.ascendEnvScript || undefined;
    const projectRes = await updateShScript({
      project_name,
      project_path,
      ascend_env_script,
    });

    console.log('projectRes', projectRes);

    return String(projectRes);
  }

  /**
   * 检查 .vscode 目录
   */
  async checkVscode(): Promise<boolean> {
    return ProjectManager.getInstance().checkVscode();
  }

  /**
   * 获取项目脚本
   */
  async getProjectSH(): Promise<Record<string, unknown>> {
    const pm = ProjectManager.getInstance();

    await pm.ensureProjectId();
    const projectId = pm.projectId;

    if (!projectId) {
      return {};
    }

    const project = getProjectById(Number(projectId));

    return { projectSH: project?.ascend_env_script || '' };
  }
}

export const projectService = new ProjectService();
