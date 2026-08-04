import { t } from 'i18next';
import * as vscode from 'vscode';
import * as path from 'path';
import { ProjectManager } from '@plugin/core/project/project-manager';
import { ExplorerRootUtils } from '@plugin/class/explorer-root-utils';
import { RemoteConfig } from '@plugin/helpers/remote-config';
import {
  getProjectByPath, getProjectById, createProject,
} from '@plugin/domain/models/project-model';
import { getConfig } from '@plugin/domain/models/config-model';
import type { DebugOperatorRef } from '@plugin/domain/utils/debug-target';
import {
  OperatorProjectType, OperatorProjectDetector,
} from '@plugin/domain/services/operator-project-detector';
import { getWorkspaceFolder } from '@plugin/domain/models/config';
import {
  GetHomeResult,
  GetWorkspaceResult,
  GetLastProjectPathResult,
} from '@shared/api-types';

import {
  checkMultipleOperatorsCore, type OperatorListEntry,
} from '@plugin/helpers/check-multiple-operators';
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
    /** When the root standard-custom build interface exposes --genop, enable anomaly detection and tuning. */
    supportsSanitizerAndTuning?: boolean;
  }> {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
      return { hasMultiple: false };
    }

    return checkMultipleOperatorsCore(workspaceFolders[0].uri.fsPath, { includeSupportsSanitizerAndTuning: true });
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
   * Get the selected operators (for standard custom operator scenarios), each
   * carrying its name and absolute path. Returns an empty array when the project
   * is not standard-custom or nothing is selected.
   */
  async getSelectedOperatorEntries(): Promise<OperatorListEntry[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
      return [];
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;
    const project = getProjectByPath(workspacePath);

    if (!project) {
      return [];
    }

    // Make sure selected_operator_ids is an array type
    let selectedOperatorIds: number[] = [];

    if (project.selected_operator_ids) {
      if (Array.isArray(project.selected_operator_ids)) {
        // Make sure the elements in the array are all numbers
        selectedOperatorIds = project.selected_operator_ids
          .map((id) => typeof id === 'string' ? Number(id) : id)
          .filter((id) => typeof id === 'number' && !isNaN(id));
      }
      else {
        return [];
      }
    }

    if (selectedOperatorIds.length === 0) {
      return [];
    }

    // Get all operator information
    const result = await checkMultipleOperatorsCore(workspacePath);

    if (!result.isStandardCustom || !result.operators) {
      return [];
    }

    // Match operators based on ID
    return result.operators.filter((op) => selectedOperatorIds.includes(op.id));
  },

  /**
   * Get the selected operator name list (for standard custom operator scenarios)
   * @returns list of operator names, multiple ones separated by commas, if not, return undefined
   */
  async getSelectedOperators(): Promise<string | undefined> {
    // Reference homeMethods (not `this`): this method is passed as an unbound
    // value through api-routes, so `this` is not guaranteed at call time.
    const selectedOperatorNames = (await homeMethods.getSelectedOperatorEntries())
      .map((op) => op.name);

    return selectedOperatorNames.length > 0 ? selectedOperatorNames.join(',') : undefined;
  },

  /**
   * Resolve the operator msdebug should attach to: explicit selection first, then
   * a single-operator collection, build_example config op, or lone project op (#17).
   */
  async resolveDebugOperatorEntry(): Promise<DebugOperatorRef | undefined> {
    const selected = await homeMethods.getSelectedOperatorEntries();

    if (selected[0]) {
      return {
        name: selected[0].name,
        path: selected[0].path,
      };
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
      return undefined;
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;
    const multi = await checkMultipleOperatorsCore(workspacePath);

    if (multi.isStandardCustom && multi.operators?.length === 1) {
      const only = multi.operators[0];

      return {
        name: only.name,
        path: only.path,
      };
    }

    const project = getProjectByPath(workspacePath);

    if (project && multi.operators?.length) {
      const exampleConfigs = getConfig(project.id, 'build_example');
      const configOp = exampleConfigs.find((c) => c.op)?.op
        ?? (exampleConfigs[0]?.user_options as Record<string, unknown> | null | undefined)?.op;

      if (typeof configOp === 'string' && configOp.trim()) {
        const match = multi.operators.find((op) => op.name === configOp.trim());

        if (match) {
          return {
            name: match.name,
            path: match.path,
          };
        }
      }
    }

    if (project?.ops_list?.length === 1) {
      const op = project.ops_list[0];

      return {
        name: op.name,
        path: op.path,
      };
    }

    // 如果找不到算子，默认项目根目录就是算子目录
    if (!multi.isStandardCustom
      && !multi.operators?.length
      && project?.project_path
      && project?.project_name) {
      return {
        name: project.project_name,
        path: project.project_path,
      };
    }

    return undefined;
  },

  /**
   * build_example `target_file` for an operator (legacy configs.json), when set.
   */
  resolveBuildExampleTargetFile(operatorName: string): string | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders?.length) {
      return undefined;
    }

    const project = getProjectByPath(workspaceFolders[0].uri.fsPath);

    if (!project) {
      return undefined;
    }

    const configs = getConfig(project.id, 'build_example', operatorName);
    const row = configs[0];
    const userOptions = row?.user_options as Record<string, unknown> | null | undefined;
    const targetFile = userOptions?.target_file;

    return typeof targetFile === 'string' && targetFile.trim() ? targetFile.trim() : undefined;
  },
};
