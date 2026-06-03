import { t } from 'i18next';
import * as vscode from 'vscode';

import { ProjectManager } from '@plugin/core/project/project-manager';
import {
  InitOpsParams,
  CreateOpsParams,
  CreateOpsByPrototypeParams,
  UpdateShScriptParams,
} from '@shared/api-types';
import {
  updateShScript,
  getProjectById,
} from '@plugin/domain/models/project-model';
import { generateOpsPrototype } from '@plugin/domain/services/ops-prototype';
import { generateStructure } from '@plugin/domain/services/ops';
import {
  getAscendEnvScriptWithWorkspaceOverride,
  getEnvironmentSocVersionFromWorkspace,
  getEnvironmentScriptPathFromWorkspace,
  getSocVersionWithWorkspaceOverride,
} from '@plugin/helpers/operator-project-workspace-config';
import { appendLog } from '@plugin/helpers/output-channel';
import { configService } from '@plugin/service/config-service';

export class ProjectService {
  /**
   * Get ExtensionContext
   */
  private getContext(): vscode.ExtensionContext {
    return (globalThis as unknown as { extensionContext: vscode.ExtensionContext })
      .extensionContext;
  }

  /**
   * Initialize operator project
   */
  async init(params: InitOpsParams): Promise<string> {
    return await ProjectManager.getInstance()
      .initProject(params);
  }

  /**
   * Create operator prototype file
   */
  async createOps(params: CreateOpsParams): Promise<string> {
    const pm = ProjectManager.getInstance();
    const info = pm.getProjectInfo();
    const op_name = params.projectName || info.name;
    const project_id = params.projectId || pm.projectId;
    const prototype_name = params.prototypeName || undefined;

    console.log('Create operator prototype params', op_name, project_id, prototype_name);

    try {
      const context = this.getContext();
      const result = await generateOpsPrototype(
        Number(project_id),
        op_name,
        prototype_name,
        context.extensionPath,
        params.outputPath,
      );

      vscode.window.showInformationMessage(t('project.createPrototypeSuccess'));

      // Check and set .vscode directory permissions
      await pm.checkVscode();

      return result;
    }
    catch {
      vscode.window.showErrorMessage(t('project.createPrototypeFailed'));

      return '';
    }
  }

  /**
   * Generate operator project from prototype
   */
  async createOpsByPrototype(params: CreateOpsByPrototypeParams): Promise<void> {
    const pm = ProjectManager.getInstance();
    const context = this.getContext();

    console.log('createOpsByPrototype: Starting, params:', params);
    console.log('createOpsByPrototype: Current projectId:', pm.projectId);
    console.log('createOpsByPrototype: projectId type:', typeof pm.projectId);

    try {
      const projectId = params.projectId !== undefined
        ? Number(params.projectId)
        : Number(pm.projectId);

      console.log('createOpsByPrototype: Converted projectId:', projectId);

      if (!projectId || isNaN(projectId)) {
        throw new Error(t('project.invalidProjectId', { projectId: params.projectId ?? pm.projectId }));
      }

      console.log('createOpsByPrototype: Calling generateStructure...');
      const resolvedOpName =
        params.opName?.trim()
        || pm.getProjectName()?.trim()
        || undefined;
      const result = await generateStructure(
        {
          ops_prototype_file: params.opsPrototypeFile,
          project_id: projectId,
          op_type: params.opType || 'ascend',
          template_name: params.templateName,
          ...(resolvedOpName ? { op_name: resolvedOpName } : {}),
          ...(params.opPath ? { op_path: params.opPath } : {}),
        },
        context.extensionPath,
        params.skipFileGeneration === true,
      );

      console.log(
        'createOpsByPrototype: Operator project generated',
        {
          ops_prototype_file: params.opsPrototypeFile,
          project_id: pm.projectId,
          op_type: params.opType,
          result,
        },
      );

      vscode.window.showInformationMessage(t('project.createOpFileSuccess'));
      await pm.checkVscode();
      await configService.maybeMigrateLegacySettingsToWorkspace();
    }
    catch (e) {
      console.error('createOpsByPrototype: Failed to create operator', e);
      vscode.window.showErrorMessage(t('project.createOpFileFailed', { error: e instanceof Error ? e.message : '' }));
      throw e; // Re-throw so caller knows it failed
    }
  }

  /**
   * Update script file
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
    const soc_version = params.soc_version || undefined;
    const projectRes = await updateShScript({
      project_name,
      project_path,
      ascend_env_script,
      soc_version,
    });

    console.log('projectRes', projectRes);

    return String(projectRes);
  }

  /**
   * Check .vscode directory
   */
  async checkVscode(): Promise<boolean> {
    return ProjectManager.getInstance()
      .checkVscode();
  }

  /**
   * Get project script
   */
  async getProjectSH(): Promise<string> {
    const pm = ProjectManager.getInstance();

    await pm.ensureProjectId();
    const projectId = pm.projectId;

    if (!projectId) {
      return '';
    }

    const project = getProjectById(Number(projectId));

    return getAscendEnvScriptWithWorkspaceOverride(project?.ascend_env_script || '');
  }

  /**
   * Get project SoC version with workspace override.
   */
  async getProjectSocVersion(): Promise<string> {
    const pm = ProjectManager.getInstance();

    await pm.ensureProjectId();
    const projectId = pm.projectId;

    if (!projectId) {
      return '';
    }

    const project = getProjectById(Number(projectId));

    return getSocVersionWithWorkspaceOverride(project?.soc_version || '');
  }

  /**
   * Mirror workspace environment settings into `projects.json` for the current project.
   * Call when `op-devtools.environment.*` changes.
   */
  async syncAscendEnvScriptFromWorkspaceSettings(): Promise<void> {
    appendLog(
      'op-devtools/project-service',
      'syncAscendEnvScriptFromWorkspaceSettings:start',
    );
    const pm = ProjectManager.getInstance();
    await pm.ensureProjectId();
    const info = pm.getProjectInfo();
    if (!info?.path) {
      appendLog(
        'op-devtools/project-service',
        'syncAscendEnvScriptFromWorkspaceSettings:skip:noProjectPath',
      );
      return;
    }
    const scriptPath = getEnvironmentScriptPathFromWorkspace();
    const socVersion = getEnvironmentSocVersionFromWorkspace();
    appendLog('op-devtools/project-service', 'syncAscendEnvScriptFromWorkspaceSettings:values', {
      projectPath: info.path,
      projectName: info.name,
      scriptPath,
      socVersion,
    });
    await updateShScript({
      project_name: info.name ?? '',
      project_path: info.path,
      ascend_env_script: scriptPath ? scriptPath : null,
      soc_version: socVersion ? socVersion : undefined,
    });
    appendLog(
      'op-devtools/project-service',
      'syncAscendEnvScriptFromWorkspaceSettings:end',
    );
  }
}

export const projectService = new ProjectService();
