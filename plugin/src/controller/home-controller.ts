import { t } from 'i18next';
import * as vscode from 'vscode';
import * as path from 'path';
import { ProjectManager } from '@plugin/core/project/project-manager';
import { ExplorerRootUtils } from '@plugin/class/explorer-root-utils';
import {
  getProjectByPath, createProject, projectPathsEqual, normalizeProjectPath,
} from '@plugin/domain/models/project-model';
import { ConfigService } from '@plugin/service/config-service';
import type { DebugOperatorRef } from '@plugin/domain/utils/debug-target';
import {
  OperatorProjectType, OperatorProjectDetector,
} from '@plugin/domain/services/operator-project-detector';
import { getWorkspaceFolderFromEnv } from '@plugin/helpers/ide-config-dir';
import {
  GetHomeResult,
  GetWorkspaceResult,
} from '@shared/api-types';

import {
  checkMultipleOperatorsCore, type OperatorListEntry,
} from '@plugin/helpers/check-multiple-operators';
import { readWorkspaceCache } from '@plugin/helpers/workspace-cache';
import { hasAnyPythonOperatorActiveContext } from '@plugin/helpers/python-operator-editor-context';
import { readWorkspaceProjectTypeSetting } from '@plugin/helpers/operator-project-workspace-config';

/** Only parses the current workspace project type for use by validatePyascForAnalysis etc. */
async function getProjectTypeValue(): Promise<string | null> {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders || workspaceFolders.length === 0) {
    return null;
  }

  const workspacePath = workspaceFolders[0].uri.fsPath;
  const project = getProjectByPath(workspacePath);
  const projectType = readWorkspaceProjectTypeSetting(vscode.Uri.file(workspacePath))
    ?? project?.project_type;

  if (projectType) {
    return projectType;
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
    projectTemplateName?: string }> {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;

      if (!workspaceFolders || workspaceFolders.length === 0) {
        return { projectType: null };
      }

      const workspacePath = workspaceFolders[0].uri.fsPath;
      const project = getProjectByPath(workspacePath);
      const projectType = readWorkspaceProjectTypeSetting(vscode.Uri.file(workspacePath))
        ?? project?.project_type;

      if (!projectType) {
        // If there is no registered project, try to detect the workspace path directly
        const detection = await OperatorProjectDetector.detectOperatorProject(workspacePath);

        if (detection.isOperatorProject && detection.projectType) {
          return {
            projectType: detection.projectType,
            projectTemplateName: detection.projectType === OperatorProjectType.TORCH_LIBRARY ? 'torch_library_template' : '',
          };
        }

        return { projectType: null };
      }

      // Only the actual operator type is included (no display name)
      return {
        projectType,
        projectTemplateName: project?.template_name || '',
      };
    }
    catch (error) {
      console.error('[getProjectType] Failed to get project type:', error);

      return { projectType: null };
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
   * Get HOME directory
   * @returns HOME directory
   */
  async getHome(): Promise<GetHomeResult> {
    // Use the encapsulated function to get WORKSPACE_FOLDER through the command
    const workspaceFolder = getWorkspaceFolderFromEnv();

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

      // Make sure operatorIds is a numeric array, without duplicates: a
      // duplicated id would persist duplicated paths and produce duplicate
      // tree rows on the next refresh.
      const numericIds = [
        ...new Set(operatorIds
          .map((id) => typeof id === 'string' ? Number(id) : id)
          .filter((id) => typeof id === 'number' && !isNaN(id))),
      ];

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

    // The selection persists as PATHS in the workspace cache (written by
    // setSelectedOperators → createProject and by the one-time import). Resolve
    // the current scan ids for those paths; fall back to undefined when nothing
    // was ever selected.
    const selectedPaths = readWorkspaceCache(workspacePath).project?.selectedOperatorPaths ?? [];

    if (selectedPaths.length === 0) {
      return undefined;
    }

    const result = await checkMultipleOperatorsCore(workspacePath);
    const operators = result.operators ?? [];

    // Dedupe by normalized path BEFORE resolving: a duplicated persisted
    // selection would otherwise produce duplicate ids and duplicate tree
    // rows (VS Code throws 'Element with id X is already registered').
    const uniquePaths = [...new Set(selectedPaths.map((selectedPath) => normalizeProjectPath(selectedPath)))];

    const selectedOperatorIds = [
      ...new Set(uniquePaths
        .map((selectedPath) => operators.find((op) => projectPathsEqual(op.path, selectedPath))?.id)
        .filter((id): id is number => typeof id === 'number')),
    ];

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

    // The selection persists as PATHS in the workspace cache — match the
    // scan entries by path (case-insensitive), not by numeric ids.
    const selectedPaths = readWorkspaceCache(workspacePath).project?.selectedOperatorPaths ?? [];

    if (selectedPaths.length === 0) {
      return [];
    }

    // Get all operator information
    const result = await checkMultipleOperatorsCore(workspacePath);

    if (!result.isStandardCustom || !result.operators) {
      return [];
    }

    // Match operators based on their paths
    return result.operators.filter((op) => selectedPaths.some((selectedPath) => projectPathsEqual(op.path, selectedPath)));
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
   * a single-operator collection, build_example config op, or lone project op.
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
      // The build_example config rows (one per scanned operator, first row =
      // first operator of the collection) are not persisted — the equivalent
      // is the scan state: the FIRST scanned operator name (opsList order,
      // then experimentalOpsList). No scan state → undefined, exactly as when
      // no build_example rows exist.
      const scanState = readWorkspaceCache(workspacePath).folders?.[normalizeProjectPath(workspacePath)];
      const configOp = scanState?.opsList[0]?.name ?? scanState?.experimentalOpsList[0]?.name;

      if (configOp?.trim()) {
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
   * build_example `target_file` (carried from the persisted configs.json row into
   * the `compileAndDeploy.exampleBuildConfig.targetFile` setting), when set.
   */
  resolveBuildExampleTargetFile(_operatorName: string): string | undefined {
    return ConfigService.readBuildExampleTargetFromWorkspace();
  },
};
