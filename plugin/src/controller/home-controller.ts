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

import { checkBuildShHasBishengConfig } from '@plugin/domain/utils/build-utils';

// First define the checkMultipleOperators function for use in getSelectedOperators
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
    // First check whether the root directory is recognized as a standard custom operator (via the detector)
    const rootDetection = await OperatorProjectDetector.detectOperatorProject(workspacePath);
    const isRootStandardCustom = rootDetection.isOperatorProject &&
      rootDetection.projectType === OperatorProjectType.STANDARD_CUSTOM;

    // Get all registered operator projects
    const allProjects = getAllProjects();

    // Filter out standard custom operators (exclude collection types) and ensure that the operator is within the workspace
    const standardCustomOperators = allProjects.filter(
      p => p.project_type === OperatorProjectType.STANDARD_CUSTOM &&
        p.project_path &&
        // Make sure the operator is within the workspace
        path.normalize(p.project_path).toLowerCase().startsWith(
          path.normalize(workspacePath).toLowerCase()
        )
    );

    // If the root directory is a standard custom operator, read the operator list from the project's ops_list and experimental_ops_list
    if (isRootStandardCustom) {
      // Find the project record corresponding to the root directory
      const rootProject = getProjectByPath(workspacePath);

      if (rootProject) {
        // Read operators from ops_list and experimental_ops_list
        const opsList = rootProject.ops_list || [];
        const experimentalOpsList = rootProject.experimental_ops_list || [];

        // Combine all operators and convert them to the format required by the front end
        // Use the project ID as the base ID to generate a unique ID for each operator
        const operators: Array<{ id: number; name: string; path: string; isExperimental: boolean; isCompiled?: boolean }> = [];

        // Add ordinary operators
        opsList.forEach((op, index) => {
          operators.push({
            id: rootProject.id * 10000 + index, // Generate unique ID
            name: op.name,
            path: op.path,
            isExperimental: false,
            isCompiled: op.isCompiled || false,
          });
        });

        // Add experimental operator
        experimentalOpsList.forEach((op, index) => {
          operators.push({
            id: rootProject.id * 10000 + 1000 + index, // Generate unique ID
            name: op.name,
            path: op.path,
            isExperimental: true,
            isCompiled: op.isCompiled || false,
          });
        });

        const hasMultiple = operators.length > 1;

        console.log(
          '[checkMultipleOperators] Standard custom operator, read from ops_list:',
          `Regular operators: ${opsList.length}, experimental operators: ${experimentalOpsList.length}`,
          t('home.operatorList'),
          operators.map(op => `${op.name} (${op.isExperimental ? 'ex' : 'normal'}, compiled: ${op.isCompiled})`),
        );

        return {
          hasMultiple,
          operators,
          isStandardCustom: true,
        };
      } else {
        console.warn('[checkMultipleOperators] Root directory is a standard custom operator, but no project record was found');
      }
    }

    // If there is a standard custom operator project in the workspace (but not the root directory), use the original logic
    if (standardCustomOperators.length > 0) {
      // Convert to the format required by the front end
      const operators = standardCustomOperators.map(p => ({
        id: p.id,
        name: path.basename(p.project_path || ''),
        path: p.project_path || '',
        isExperimental: p.is_experimental || false,
      }));

      const hasMultiple = operators.length > 1;

      console.log(
        '[checkMultipleOperators] Standard custom operator, found operator project count:',
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

    // Non-standard custom operators, using original logic
    const operatorProjects: string[] = [];

    // Recursively find all directories containing .vscode/devtool_config.json
    const findOperatorProjects = (dir: string): void => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          // Skip common directories such as node_modules and .git
          if (entry.name.startsWith('.') && entry.name !== '.vscode') {
            continue;
          }

          if (entry.name === 'node_modules' || entry.name === '.git') {
            continue;
          }

          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            // Check if there is .vscode/devtool_config.json in this directory
            const devtoolConfigPath = path.join(
              fullPath,
              '.vscode',
              'devtool_config.json',
            );

            if (fs.existsSync(devtoolConfigPath)) {
              operatorProjects.push(fullPath);
            }
            else {
              // Continue recursively searching subdirectories
              findOperatorProjects(fullPath);
            }
          }
        }
      }
      catch (error) {
        // Ignore inaccessible directories
        console.warn(`[checkMultipleOperators] Unable to access directory: ${dir}`, error);
      }
    };

    findOperatorProjects(workspacePath);

    const hasMultiple = operatorProjects.length > 1;

    console.log(
      '[checkMultipleOperators] Found operator project count:',
      operatorProjects.length,
      t('home.path'),
      operatorProjects,
    );

    return { hasMultiple, isStandardCustom: false };
  }
  catch (error) {
    console.error('[checkMultipleOperators] Failed to check operator projects:', error);
    return { hasMultiple: false, isStandardCustom: false };
  }
}

/** Only parses the current workspace project type for use by validatePyascForAnalysis etc. */
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
   * Get project ID
   * @returns project ID
   */
  async getProjectId(): Promise<GetProjectIdResult> {
    await ProjectManager.getInstance()
      .initProject();

    return ProjectManager.getInstance().projectId;
  },

  /**
   * Get the current project type
   * Only the actual operator type is returned, excluding "operator engineering collection"
   * @returns project type information
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
            projectTemplateName: detection.projectType === OperatorProjectType.TORCH_LIBRARY ? 'torch_library_template' : ''
          };
        }
        return { projectType: null, projectTypeName: '' };
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
        projectTemplateName: project.template_name || ''
      };
    }
    catch (error) {
      console.error('[getProjectType] Failed to get project type:', error);
      return { projectType: null, projectTypeName: '' };
    }
  },

  /**
   * pyasc type simulation analysis/performance tuning pre-verification: triggered before opening the configuration page
   * Verify whether the .py file and workspace are open only when the project is pyasc
   * @returns { valid: true } or { valid: false, message: string }
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
      console.error('[validatePyascForAnalysis] Validation failed:', error);
      return { valid: false, message: (error as Error).message };
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
   * Initialization project
   * @param params - initialization parameters
   * @returns initialization results
   */
  async initOps(params: InitOpsParams): Promise<GetHomeResult> {
    return await projectService.init(params);
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
   * UpdateProject
   */
  async updateProject(): Promise<void> {
    // Refresh project information
    await ProjectManager.getInstance()
      .initProject();
  },

  /**
   * Check whether there are multiple operator projects in the current directory
   * If it is a standard custom operator, a list of all recognized operators is returned.
   * @returns If there are multiple operator projects, return true and operator list, otherwise return false
   */
  async checkMultipleOperators(): Promise<{
    hasMultiple: boolean;
    operators?: Array<{ id: number; name: string; path: string; isExperimental: boolean }>;
    isStandardCustom?: boolean;
    /** When the root directory is a standard custom operator: build.sh contains --bisheng_flags to support anomaly detection and tuning. */
    supportsSanitizerAndTuning?: boolean;
  }> {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
      return { hasMultiple: false };
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;

    try {
      // First check whether the root directory is recognized as a standard custom operator (via the detector)
      const rootDetection = await OperatorProjectDetector.detectOperatorProject(workspacePath);
      const isRootStandardCustom = rootDetection.isOperatorProject &&
        rootDetection.projectType === OperatorProjectType.STANDARD_CUSTOM;

      // Get all registered operator projects
      const allProjects = getAllProjects();

      // Filter out standard custom operators (exclude collection types) and ensure that the operator is within the workspace
      const standardCustomOperators = allProjects.filter(
        p => p.project_type === OperatorProjectType.STANDARD_CUSTOM &&
          p.project_path &&
          // Make sure the operator is within the workspace
          path.normalize(p.project_path).toLowerCase().startsWith(
            path.normalize(workspacePath).toLowerCase()
          )
      );

      // If the root directory is a standard custom operator, read the operator list from the project's ops_list and experimental_ops_list
      if (isRootStandardCustom) {
        // Find the project record corresponding to the root directory
        const rootProject = getProjectByPath(workspacePath);

        if (rootProject) {
          // Read operators from ops_list and experimental_ops_list
          const opsList = rootProject.ops_list || [];
          const experimentalOpsList = rootProject.experimental_ops_list || [];

          // Combine all operators and convert them to the format required by the front end
          // Use the project ID as the base ID to generate a unique ID for each operator
          const operators: Array<{ id: number; name: string; path: string; isExperimental: boolean; isCompiled?: boolean }> = [];

          // Add ordinary operators
          opsList.forEach((op, index) => {
            operators.push({
              id: rootProject.id * 10000 + index, // Generate unique ID
              name: op.name,
              path: op.path,
              isExperimental: false,
              isCompiled: op.isCompiled || false,
            });
          });

          // Add experimental operator
          experimentalOpsList.forEach((op, index) => {
            operators.push({
              id: rootProject.id * 10000 + 1000 + index, // Generate unique ID
              name: op.name,
              path: op.path,
              isExperimental: true,
              isCompiled: op.isCompiled || false,
            });
          });

          const hasMultiple = operators.length > 1;

          const supportsSanitizerAndTuning = checkBuildShHasBishengConfig(workspacePath);
          console.log(
            '[checkMultipleOperators] Standard custom operator, read from ops_list:',
            `Regular operators: ${opsList.length}, experimental operators: ${experimentalOpsList.length}`,
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
          console.warn('[checkMultipleOperators] Root directory is a standard custom operator, but no project record was found');
        }
      }

      // If there is a standard custom operator project in the workspace (but not the root directory), use the original logic
      if (standardCustomOperators.length > 0) {
        // Convert to the format required by the front end
        const operators = standardCustomOperators.map(p => ({
          id: p.id,
          name: path.basename(p.project_path || ''),
          path: p.project_path || '',
          isExperimental: p.is_experimental || false,
        }));

        const hasMultiple = operators.length > 1;

        console.log(
          '[checkMultipleOperators] Standard custom operator, found operator project count:',
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

      // Non-standard custom operators, using original logic
      const operatorProjects: string[] = [];

      // Recursively find all directories containing .vscode/devtool_config.json
      const findOperatorProjects = (dir: string): void => {
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });

          for (const entry of entries) {
            // Skip common directories such as node_modules and .git
            if (entry.name.startsWith('.') && entry.name !== '.vscode') {
              continue;
            }

            if (entry.name === 'node_modules' || entry.name === '.git') {
              continue;
            }

            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
              // Check if there is .vscode/devtool_config.json in this directory
              const devtoolConfigPath = path.join(
                fullPath,
                '.vscode',
                'devtool_config.json',
              );

              if (fs.existsSync(devtoolConfigPath)) {
                operatorProjects.push(fullPath);
              }
              else {
                // Continue recursively searching subdirectories
                findOperatorProjects(fullPath);
              }
            }
          }
        }
        catch (error) {
          // Ignore inaccessible directories
          console.warn(`[checkMultipleOperators] Unable to access directory: ${dir}`, error);
        }
      };

      findOperatorProjects(workspacePath);

      const hasMultiple = operatorProjects.length > 1;

      console.log(
        '[checkMultipleOperators] Found operator project count:',
        operatorProjects.length,
        t('home.path'),
        operatorProjects,
      );

      return { hasMultiple, isStandardCustom: false };
    }
    catch (error) {
      console.error('[checkMultipleOperators] Failed to check operator projects:', error);
      return { hasMultiple: false, isStandardCustom: false };
    }
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
        .map(id => typeof id === 'string' ? Number(id) : id)
        .filter(id => typeof id === 'number' && !isNaN(id));

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
          .map(id => typeof id === 'string' ? Number(id) : id)
          .filter(id => typeof id === 'number' && !isNaN(id));
        console.log('[getSelectedOperatorIds] Converted selected_operator_ids:', selectedOperatorIds);
      } else {
        console.warn('[getSelectedOperatorIds] selected_operator_ids is not an array:', typeof project.selected_operator_ids, project.selected_operator_ids);
        return undefined;
      }
    } else {
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
          .map(id => typeof id === 'string' ? Number(id) : id)
          .filter(id => typeof id === 'number' && !isNaN(id));
        console.log('[getSelectedOperators] Converted selected_operator_ids:', selectedOperatorIds);
      } else {
        // If not an array, try converting (maybe to string or other type)
        console.warn('[getSelectedOperators] selected_operator_ids is not an array:', typeof project.selected_operator_ids, project.selected_operator_ids);
        return undefined;
      }
    } else {
      console.log('[getSelectedOperators] project.selected_operator_ids is empty');
    }

    if (selectedOperatorIds.length === 0) {
      return undefined;
    }

    // Get all operator information
    const result = await checkMultipleOperatorsInternal();
    if (!result.isStandardCustom || !result.operators) {
      return undefined;
    }

    // Match operator name based on ID
    const selectedOperatorNames = result.operators
      .filter(op => selectedOperatorIds.includes(op.id))
      .map(op => op.name);

    return selectedOperatorNames.length > 0 ? selectedOperatorNames.join(',') : undefined;
  },
};
