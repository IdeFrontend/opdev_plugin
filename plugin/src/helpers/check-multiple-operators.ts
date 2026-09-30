/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { t } from 'i18next';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  OperatorProjectType, OperatorProjectDetector,
} from '@plugin/domain/services/operator-project-detector';
import {
  getProjectByPath, normalizeProjectPath,
} from '@plugin/domain/models/project-model';
import { buildShHelpSupportsGenop } from '@plugin/domain/plugins/detection-utils';
import {
  getDevtoolConfigPath, getIdeConfigDirName,
} from '@plugin/helpers/ide-config-dir';
import { readWorkspaceCache } from '@plugin/helpers/workspace-cache';
import { readWorkspaceProjectTypeSetting } from '@plugin/helpers/operator-project-workspace-config';

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

/**
 * Standard-custom in any stored form: the DB row and the workspace setting keep
 * the view id ('ascend'), while the detector reports 'standard-custom'.
 */
function isRootStandardCustomProjectType(projectType: string | null | undefined): boolean {
  return projectType === OperatorProjectType.STANDARD_CUSTOM
    || projectType === 'ascend';
}

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

/**
 * Resolve multi-operator state for the given workspace folder path.
 * Used by `homeMethods.checkMultipleOperators` and `getSelectedOperators`.
 */
export async function checkMultipleOperatorsCore(
  workspacePath: string,
  options: { includeSupportsSanitizerAndTuning?: boolean } = {},
): Promise<CheckMultipleOperatorsResult> {
  try {
    const rootProject = getProjectByPath(workspacePath);
    const rootProjectType = readWorkspaceProjectTypeSetting(vscode.Uri.file(workspacePath))
      ?? rootProject?.project_type;

    let isRootStandardCustom: boolean;

    if (rootProjectType !== undefined && rootProjectType !== null) {
      isRootStandardCustom = isRootStandardCustomProjectType(rootProjectType);
    }
    else {
      const rootDetection = await OperatorProjectDetector.detectOperatorProject(workspacePath);

      isRootStandardCustom = rootDetection.isOperatorProject
        && rootDetection.projectType === OperatorProjectType.STANDARD_CUSTOM;
    }

    if (isRootStandardCustom) {
      const cache = readWorkspaceCache(workspacePath);
      const rootKey = normalizeProjectPath(workspacePath);
      const folderState = cache.folders?.[rootKey];
      const opsList = folderState?.opsList ?? [];
      const experimentalOpsList = folderState?.experimentalOpsList ?? [];
      const compiledOpPaths = cache.project?.compiledOpPaths;

      if (!folderState) {
        console.warn('[checkMultipleOperators] Standard custom operator, but no cache folder scan state was found:', rootKey);
      }

      const operators: OperatorListEntry[] = [];

      opsList.forEach((op, index) => {
        operators.push({
          id: index,
          name: op.name,
          path: op.path,
          isExperimental: false,
          isCompiled: op.isCompiled === true || compiledOpPaths?.[op.path] === true,
        });
      });

      experimentalOpsList.forEach((op, index) => {
        operators.push({
          id: 1000 + index,
          name: op.name,
          path: op.path,
          isExperimental: true,
          isCompiled: op.isCompiled === true || compiledOpPaths?.[op.path] === true,
        });
      });

      if (!rootProject) {
        console.warn('[checkMultipleOperators] Root directory is a standard custom operator, but no project record was found');
      }

      const supportsSanitizerAndTuning = options.includeSupportsSanitizerAndTuning
        ? await buildShHelpSupportsGenop(workspacePath)
        : undefined;

      console.log(
        '[checkMultipleOperators] Standard custom operator, read from cache folder state:',
        `Regular operators: ${opsList.length}, experimental operators: ${experimentalOpsList.length}`,
        t('home.operatorList'),
        operators.map((op) => `${op.name} (${op.isExperimental ? 'ex' : 'normal'}, compiled: ${op.isCompiled})`),
        ...(supportsSanitizerAndTuning !== undefined
          ? [
            t('home.supportsSanitizerAndTuning'),
            supportsSanitizerAndTuning,
          ]
          : []),
      );

      return {
        hasMultiple: operators.length > 1,
        operators,
        isStandardCustom: true,
        ...(supportsSanitizerAndTuning !== undefined ? { supportsSanitizerAndTuning } : {}),
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
