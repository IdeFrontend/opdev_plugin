import { t } from 'i18next';
import * as vscode from 'vscode';
import * as path from 'path';
import { ProjectManager } from '@plugin/core/project/project-manager';
import { ExplorerRootUtils } from '@plugin/class/explorer-root-utils';
import { RemoteConfig } from '@plugin/helpers/remote-config';
import {
  getProjectByPath, getProjectById, createProject,
} from '@plugin/domain/models/project-model';
import {
  OperatorProjectType, OperatorProjectDetector,
} from '@plugin/domain/services/operator-project-detector';
import { getWorkspaceFolder } from '@plugin/domain/models/config';
import {
  GetHomeResult,
  GetWorkspaceResult,
  GetLastProjectPathResult,
} from '@shared/api-types';

import { checkMultipleOperatorsCore } from '@plugin/helpers/check-multiple-operators';
import { hasAnyPythonOperatorActiveContext } from '@plugin/helpers/python-operator-editor-context';

/** Only parses the current workspace project type for use by validatePyascForAnalysis etc. */
async function getProjectTypeValue(): Promise<string | null> {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders || workspaceFolders.length === 0) {
    return null;
  }

  const workspacePath = workspaceFolders[0].uri.fsPath;
  const project = getProjectByPath(workspacePath);

  if (project?.project_type) {
    return project.project_type;
  }

  const detection = await OperatorProjectDetector.detectOperatorProject(workspacePath);

  return (detection.isOperatorProject && detection.projectType) ? detection.projectType : null;
}

export const homeMethods = {
  /**
   * Get the current project type
   * Only the actual operator type is returned, excluding "operator engineering collection"
   * @returns project type information
   */
  async getProjectType(): Promise<{ projectType: string | null;
    projectTypeName: string;
    projectTemplateName?: string }> {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;

      if (!workspaceFolders || workspaceFolders.length === 0) {
        return {
          projectType: null,
          projectTypeName: '',
        };
      }

      const workspacePath = workspaceFolders[0].uri.fsPath;
      const project = getProjectByPath(workspacePath);

      if (!project || !project.project_type) {
        // If there is no registered project, try to detect the workspace path directly
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
            projectTemplateName: detection.projectType === OperatorProjectType.TORCH_LIBRARY ? 'torch_library_template' : '',
          };
        }

        return {
          projectType: null,
          projectTypeName: '',
        };
      }

      // Convert item type to Chinese name (only actual operator type included)
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
        projectTemplateName: project.template_name || '',
      };
    }
    catch (error) {
      console.error('[getProjectType] Failed to get project type:', error);

      return {
        projectType: null,
        projectTypeName: '',
      };
    }
  },

  /**
   * Pre-check for simulation / on-board flows before opening their config UIs.
   * For types that require an active source file (e.g. pyasc), verifies the editor
   * has the suffix from the op plugin’s build behavior.
   */
  async validatePyascForAnalysis(): Promise<{ valid: boolean;
    message?: string }> {
    try {
      const projectType = await getProjectTypeValue();

      if (projectType !== OperatorProjectType.PYASC && projectType !== OperatorProjectType.TRITON) {
        return { valid: true };
      }

      const workspaceFolders = vscode.workspace.workspaceFolders;

      if (!workspaceFolders || workspaceFolders.length === 0) {
        return {
          valid: false,
          message: t('task.workspacePathNotFound'),
        };
      }

      const workspacePath = workspaceFolders[0].uri.fsPath;

      if (!hasAnyPythonOperatorActiveContext('.py', workspacePath)) {
        return {
          valid: false,
          message: t('extension.openPyFirst'),
        };
      }

      return { valid: true };
    }
    catch (error) {
      console.error('[validatePyascForAnalysis] Validation failed:', error);

      return {
        valid: false,
        message: (error as Error).message,
      };
    }
  },

  /**
   * Get workspace path
   * @returns workspace path
   */
  async getWorkspace(): Promise<GetWorkspaceResult> {
    const root = ExplorerRootUtils.getPrimaryRoot();

    return root ? root.path : null;
  },

  /**
   * Get the last project path
   * @returns last project path
   */
  async getLastProjectPath(): Promise<GetLastProjectPathResult> {
    return RemoteConfig.getLastProjectPath();
  },

  /**
   * Get HOME directory
   * @returns HOME directory
   */
  async getHome(): Promise<GetHomeResult> {
    // Use the encapsulated function to get WORKSPACE_FOLDER through the command
    const workspaceFolder = getWorkspaceFolder();

    return workspaceFolder || process.env.HOME || process.env.USERPROFILE || '';
  },

  /**
   * Check whether there are multiple operator projects in the current directory
   * If it is a standard custom operator, a list of all recognized operators is returned.
   * @returns If there are multiple operator projects, return true and operator list, otherwise return false
   */
  async checkMultipleOperators(): Promise<{
    hasMultiple: boolean;
    operators?: Array<{ id: number;
      name: string;
      path: string;
      isExperimental: boolean }>;
    isStandardCustom?: boolean;
    /** When the root directory is a standard custom operator: build.sh contains --bisheng_flags to support anomaly detection and tuning. */
    supportsSanitizerAndTuning?: boolean;
  }> {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
      return { hasMultiple: false };
    }

    return checkMultipleOperatorsCore(workspaceFolders[0].uri.fsPath, {
      includeSupportsSanitizerAndTuning: true,
    });
  },

  /**
   * Set the selected operator ID list (for standard custom operator scenarios)
   * @param params parameter object containing operatorIds
   */
  async setSelectedOperators(params: { operatorIds: number[] } = { operatorIds: [] }): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
      return;
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;
    const project = getProjectByPath(workspacePath);

    if (project) {
      // Get operatorIds from params and make sure it is an array
      let operatorIds = params?.operatorIds || [];

      // If operatorIds is not an array, try converting
      if (!Array.isArray(operatorIds)) {
        console.warn('[setSelectedOperators] operatorIds is not an array:', typeof operatorIds, operatorIds);
        operatorIds = [];
      }

      // Make sure operatorIds is a numeric array
      const numericIds = operatorIds
        .map((id) => typeof id === 'string' ? Number(id) : id)
        .filter((id) => typeof id === 'number' && !isNaN(id));

      console.log('[setSelectedOperators] Saved operator IDs:', numericIds);

      await createProject({
        project_name: project.project_name,
        project_path: project.project_path,
        selected_operator_ids: numericIds,
      });
    }
  },

  /**
   * Get the selected operator ID list (for standard custom operator scenarios)
   * @returns Operator ID list, if not, return undefined
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

    // Make sure selected_operator_ids is an array type
    let selectedOperatorIds: number[] = [];

    if (project.selected_operator_ids) {
      if (Array.isArray(project.selected_operator_ids)) {
        // Make sure the elements in the array are all numbers
        selectedOperatorIds = project.selected_operator_ids
          .map((id) => typeof id === 'string' ? Number(id) : id)
          .filter((id) => typeof id === 'number' && !isNaN(id));
        // console.log('[getSelectedOperatorIds] Converted selected_operator_ids:', selectedOperatorIds);
      }
      else {
        // console.warn('[getSelectedOperatorIds] selected_operator_ids is not an array:', typeof project.selected_operator_ids, project.selected_operator_ids);

        return undefined;
      }
    }
    else {
      console.log('[getSelectedOperatorIds] project.selected_operator_ids is empty');
    }

    return selectedOperatorIds.length > 0 ? selectedOperatorIds : undefined;
  },

  /**
   * Get the selected operator name list (for standard custom operator scenarios)
   * @returns list of operator names, multiple ones separated by commas, if not, return undefined
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

    // Make sure selected_operator_ids is an array type
    let selectedOperatorIds: number[] = [];

    if (project.selected_operator_ids) {
      if (Array.isArray(project.selected_operator_ids)) {
        // Make sure the elements in the array are all numbers
        selectedOperatorIds = project.selected_operator_ids
          .map((id) => typeof id === 'string' ? Number(id) : id)
          .filter((id) => typeof id === 'number' && !isNaN(id));
        // console.log('[getSelectedOperators] Converted selected_operator_ids:', selectedOperatorIds);
      }
      else {
        // If not an array, try converting (maybe to string or other type)
        // console.warn('[getSelectedOperators] selected_operator_ids is not an array:', typeof project.selected_operator_ids, project.selected_operator_ids);

        return undefined;
      }
    }
    else {
      // console.log('[getSelectedOperators] project.selected_operator_ids is empty');
    }

    if (selectedOperatorIds.length === 0) {
      return undefined;
    }

    // Get all operator information
    const result = await checkMultipleOperatorsCore(workspacePath);

    if (!result.isStandardCustom || !result.operators) {
      return undefined;
    }

    // Match operator name based on ID
    const selectedOperatorNames = result.operators
      .filter((op) => selectedOperatorIds.includes(op.id))
      .map((op) => op.name);

    return selectedOperatorNames.length > 0 ? selectedOperatorNames.join(',') : undefined;
  },
};
