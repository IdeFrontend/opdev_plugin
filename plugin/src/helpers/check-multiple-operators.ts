import { t } from 'i18next';
import * as fs from 'fs';
import * as path from 'path';
import {
  OperatorProjectType, OperatorProjectDetector,
} from '@plugin/domain/services/operator-project-detector';
import { getAllProjects, getProjectByPath, type ProjectRecord } from '@plugin/domain/models/project-model';
import { checkBuildShHasBishengConfig } from '@plugin/domain/utils/build-utils';
import { getDevtoolConfigPath, getIdeConfigDirName } from '@plugin/helpers/ide-config-dir';

export type OperatorListEntry = {
  id: number;
  name: string;
  path: string;
  isExperimental: boolean;
  isCompiled?: boolean;
};

export type CheckMultipleOperatorsResult = {
  hasMultiple: boolean;
  operators?: OperatorListEntry[];
  isStandardCustom?: boolean;
  supportsSanitizerAndTuning?: boolean;
};

function findDevtoolConfigOperatorProjectPaths(workspacePath: string): string[] {
  const operatorProjects: string[] = [];
  const ideConfigDirName = getIdeConfigDirName();

  const findOperatorProjects = (dir: string): void => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.name.startsWith('.') && entry.name !== ideConfigDirName) {
          continue;
        }

        if (entry.name === 'node_modules' || entry.name === '.git') {
          continue;
        }

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          const devtoolConfigPath = getDevtoolConfigPath(fullPath);

          if (fs.existsSync(devtoolConfigPath)) {
            operatorProjects.push(fullPath);
          }
          else {
            findOperatorProjects(fullPath);
          }
        }
      }
    }
    catch (error) {
      console.warn(`[checkMultipleOperators] Unable to access directory: ${dir}`, error);
    }
  };

  findOperatorProjects(workspacePath);
  return operatorProjects;
}

function operatorsFromRootStandardCustomProject(rootProject: ProjectRecord): OperatorListEntry[] {
  const opsList = rootProject.ops_list || [];
  const experimentalOpsList = rootProject.experimental_ops_list || [];
  const operators: OperatorListEntry[] = [];

  opsList.forEach((op, index) => {
    operators.push({
      id: rootProject.id * 10000 + index,
      name: op.name,
      path: op.path,
      isExperimental: false,
      isCompiled: op.isCompiled || false,
    });
  });

  experimentalOpsList.forEach((op, index) => {
    operators.push({
      id: rootProject.id * 10000 + 1000 + index,
      name: op.name,
      path: op.path,
      isExperimental: true,
      isCompiled: op.isCompiled || false,
    });
  });

  return operators;
}

/**
 * Resolve multi-operator state for the given workspace folder path.
 * Used by `homeMethods.checkMultipleOperators` and `getSelectedOperators`.
 */
export async function checkMultipleOperatorsCore(
  workspacePath: string,
  options: { includeSupportsSanitizerAndTuning?: boolean } = {},
): Promise<CheckMultipleOperatorsResult> {
  try {
    const rootDetection = await OperatorProjectDetector.detectOperatorProject(workspacePath);
    const isRootStandardCustom = rootDetection.isOperatorProject
      && rootDetection.projectType === OperatorProjectType.STANDARD_CUSTOM;

    const allProjects = getAllProjects();
    const normalizedWorkspace = path.normalize(workspacePath)
      .toLowerCase();
    const standardCustomOperators = allProjects.filter((p) => p.project_type === OperatorProjectType.STANDARD_CUSTOM
      && p.project_path
      && path.normalize(p.project_path)
        .toLowerCase()
        .startsWith(normalizedWorkspace));

    if (isRootStandardCustom) {
      const rootProject = getProjectByPath(workspacePath);

      if (rootProject) {
        const operators = operatorsFromRootStandardCustomProject(rootProject);
        const opsList = rootProject.ops_list || [];
        const experimentalOpsList = rootProject.experimental_ops_list || [];
        const supportsSanitizerAndTuning = options.includeSupportsSanitizerAndTuning
          ? checkBuildShHasBishengConfig(workspacePath)
          : undefined;

        console.log(
          '[checkMultipleOperators] Standard custom operator, read from ops_list:',
          `Regular operators: ${opsList.length}, experimental operators: ${experimentalOpsList.length}`,
          t('home.operatorList'),
          operators.map((op) => `${op.name} (${op.isExperimental ? 'ex' : 'normal'}, compiled: ${op.isCompiled})`),
          ...(supportsSanitizerAndTuning !== undefined
            ? [t('home.supportsSanitizerAndTuning'), supportsSanitizerAndTuning]
            : []),
        );

        return {
          hasMultiple: operators.length > 1,
          operators,
          isStandardCustom: true,
          ...(supportsSanitizerAndTuning !== undefined ? { supportsSanitizerAndTuning } : {}),
        };
      }

      console.warn('[checkMultipleOperators] Root directory is a standard custom operator, but no project record was found');
    }

    if (standardCustomOperators.length > 0) {
      const operators = standardCustomOperators.map((p) => ({
        id: p.id,
        name: path.basename(p.project_path || ''),
        path: p.project_path || '',
        isExperimental: p.is_experimental || false,
      }));

      console.log(
        '[checkMultipleOperators] Standard custom operator, found operator project count:',
        operators.length,
        t('home.operatorList'),
        operators.map((op) => `${op.name} (${op.isExperimental ? 'ex' : 'normal'})`),
      );

      return {
        hasMultiple: operators.length > 1,
        operators,
        isStandardCustom: true,
      };
    }

    const operatorProjects = findDevtoolConfigOperatorProjectPaths(workspacePath);
    const operators = operatorProjects.map((projectPath, index) => ({
      id: 900000 + index,
      name: path.basename(projectPath),
      path: projectPath,
      isExperimental: false,
      isCompiled: false,
    }));

    console.log(
      '[checkMultipleOperators] Found operator project count:',
      operatorProjects.length,
      t('home.path'),
      operatorProjects,
    );

    return {
      hasMultiple: operators.length > 1,
      operators,
      isStandardCustom: false,
    };
  }
  catch (error) {
    console.error('[checkMultipleOperators] Failed to check operator projects:', error);

    return {
      hasMultiple: false,
      isStandardCustom: false,
    };
  }
}
