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
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import {
  OperatorProjectDetector,
  OperatorProjectType,
  type OperatorProjectDetectionResult,
} from '@plugin/domain/services/operator-project-detector';
import {
  buildShHelpSupportsGenop,
  buildShHelpSupportsOption,
} from '@plugin/domain/plugins/detection-utils';
import {
  getProjectByPath,
  normalizeProjectPath,
  type SubOperatorInfo,
} from '@plugin/domain/models/project-model';
import { resolveOpRecord } from '@plugin/domain/models/op-record';
import {
  isUnderExperimentalDir,
  stripRootPrefix,
} from '@plugin/domain/utils/path-utils';
import {
  EXPERIMENTAL_OPERATOR_COLLECTIONS,
  ROOT_OPERATOR_COLLECTIONS,
  scanOperatorsInCollection,
} from '@plugin/domain/utils/operator-collections';
import { ProjectManager } from '@plugin/core/project/project-manager';
import {
  readWorkspaceCache,
  updateFolderScanState,
  updateWorkspaceCache,
} from '@plugin/helpers/workspace-cache';
import { OperatorProjectIconTheme } from '@plugin/class/operator-project-icon-theme';
import { buildPythonDeployTarget } from '@plugin/domain/services/command-strategy/python-operator-strategy-shared';
import { ConfigService } from '@plugin/service/config-service';
import { taskMethods } from '../controller/task-controller';
import { homeMethods } from '../controller/home-controller';
import {
  COMMAND_FLASH_MS_SANITIZER_RUN_DATA,
  COMMAND_FLASH_PERFORMANCE_RUN_DATA,
  COMMAND_ON_BOARD_OPTIONS,
  COMMAND_SANITIZER_OPTIONS,
  COMMAND_SIMULATOR_OPTIONS,
  COMMAND_DATA_COLLECTION_CONFIG,
} from '@plugin/constants';
import { setPendingDataCollectionType } from '@plugin/controller/config-controller';

/** Check if directory is a standard-custom root through its public build interface. */
async function isStandardCustomRoot(dirPath: string): Promise<boolean> {
  return buildShHelpSupportsGenop(dirPath);
}

/**
 * Check if directory is a standard custom sub-operator (contains CMakeLists.txt)
 */
function isStandardCustomSubOperator(dirPath: string): boolean {
  const cmakeListsPath = path.join(dirPath, 'CMakeLists.txt');

  return fs.existsSync(cmakeListsPath);
}

/**
 * Walk up to find a standard-custom root whose build.sh help exposes --genop, max 5 levels.
 */
async function findStandardCustomRoot(startPath: string): Promise<string | null> {
  let dir = path.normalize(startPath);

  for (let i = 0; i < 5; i++) {
    if (await isStandardCustomRoot(dir)) {
      return dir;
    }

    const parent = path.dirname(dir);

    if (parent === dir) {
      break;
    }

    dir = parent;
  }

  return null;
}

/**
 * Check if standard custom operator supports sanitizer and tuning
 * By checking whether root build.sh help exposes --bisheng_flags.
 */
async function checkSupportsSanitizerAndTuning(rootPath: string): Promise<boolean> {
  return buildShHelpSupportsOption(rootPath, '--bisheng_flags');
}

/**
 * Get operator project type by path
 * Prefer getProjectType API, then registered projects, then detector
 */
async function getOperatorProjectTypeByPath(folderPath: string): Promise<OperatorProjectType | undefined> {
  // 1. Prefer getProjectType API (handles workspace root type detection)
  try {
    const projectTypeResult = await homeMethods.getProjectType();

    if (projectTypeResult?.projectType) {
      return projectTypeResult.projectType as OperatorProjectType;
    }
  }
  catch {
    // Ignore API failure, try other means
  }

  // 2. Try reading from projects.json (for given path)
  try {
    const project = getProjectByPath(folderPath);

    if (project?.project_type) {
      return project.project_type as OperatorProjectType;
    }
  }
  catch {
    // Ignore read failure, use detector
  }

  // 3. Use detector on this directory
  try {
    const detection = await OperatorProjectDetector.detectOperatorProject(folderPath);

    if (detection.isOperatorProject && detection.projectType) {
      return detection.projectType;
    }
  }
  catch {
    // Ignore detection failure, try workspace root
  }

  // 4. Fallback to workspace root
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (workspaceFolders && workspaceFolders.length > 0) {
    const workspaceRootPath = workspaceFolders[0].uri.fsPath;

    try {
      const project = getProjectByPath(workspaceRootPath);

      if (project?.project_type) {
        return project.project_type as OperatorProjectType;
      }
    }
    catch {
      // Ignore read failure
    }

    try {
      const detection = await OperatorProjectDetector.detectOperatorProject(workspaceRootPath);

      if (detection.isOperatorProject && detection.projectType) {
        return detection.projectType;
      }
    }
    catch {
      // Ignore detection failure
    }
  }

  return undefined;
}

function isAscendLikeOperator(type?: OperatorProjectType): boolean {
  return type === OperatorProjectType.ASCEND_C
    || type === OperatorProjectType.TORCH_LIBRARY;
}

/**
 * Folder context menu service
 * Handles folder right-click menu actions
 */
export class FolderContextMenuService {
  /**
   * Mark folder as operator project
   * 1. Only root (with build.sh --genop) is registered as standard custom and gets a project entry.
   * 2. Collections and sub-operators are not new projects; info lives in the root's cache folders scan state
   *    (ops_meet, ops_list, experimental_ops_list).
   */
  static async markAsOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;

    try {
      const operatorType = await getOperatorProjectTypeByPath(folderPath);

      // <<<>>> type: context menu not supported (except report visualization)
      if (isAscendLikeOperator(operatorType)) {
        vscode.window.showWarningMessage(t('folderContext.angleOpsNotSupported'));

        return;
      }

      // pyasc: mark/unmark operator or collection not supported
      if (operatorType === OperatorProjectType.PYASC) {
        vscode.window.showWarningMessage(t('folderContext.pyascNoMarkUnmark'));

        return;
      }

      // 1. Find root (standard custom operator)
      const rootPath = await findStandardCustomRoot(folderPath);

      if (!rootPath) {
        vscode.window.showWarningMessage(t('folderContext.noOperatorRoot'));

        return;
      }

      // 2. Get project info (project already created by default)
      const rootProject = getProjectByPath(rootPath);

      if (!rootProject) {
        vscode.window.showErrorMessage(t('folderContext.noProjectInfo'));

        return;
      }

      // 3. Check selected dir is operator (has CMakeLists.txt)
      if (!isStandardCustomSubOperator(folderPath)) {
        vscode.window.showWarningMessage(t('folderContext.notOperatorDir'));

        return;
      }

      // 4. Check if under experimental directory
      const normalizedFolderPath = normalizeProjectPath(folderPath);
      const normalizedRootPath = normalizeProjectPath(rootPath);
      const isExperimental = isUnderExperimentalDir(normalizedFolderPath, normalizedRootPath);

      // 5. Get current project info from the workspace cache scan state
      const scanState = readWorkspaceCache(rootPath).folders?.[normalizeProjectPath(rootPath)];
      const currentOpsList = scanState?.opsList || [];
      const currentExperimentalOpsList = scanState?.experimentalOpsList || [];
      const operatorName = path.basename(folderPath);

      // 6. Check if already exists
      const targetList = isExperimental ? currentExperimentalOpsList : currentOpsList;
      const existing = targetList.find((op) => op.path === folderPath || op.name === operatorName);

      if (existing) {
        vscode.window.showInformationMessage(t('folderContext.operatorAlreadyMarked'));

        return;
      }

      // 7. Check build status
      const buildDir = path.join(folderPath, 'build');
      const outDir = path.join(folderPath, 'out');
      const isCompiled = fs.existsSync(buildDir) || fs.existsSync(outDir);

      // 8. Create operator info
      const operatorInfo: SubOperatorInfo = {
        name: operatorName,
        path: folderPath,
        isCompiled,
      };

      // 9. Add to corresponding list
      if (isExperimental) {
        currentExperimentalOpsList.push(operatorInfo);
      }
      else {
        currentOpsList.push(operatorInfo);
      }

      // 10. Persist the scan state into the workspace cache (keep ops_meet unchanged)
      // The success message is only shown when the cache write really
      // happened (updateFolderScanState boolean); on a failed write an error
      // message is shown instead.
      const written = await updateFolderScanState(rootPath, {
        opsMeet: scanState?.opsMeet || [],
        opsList: currentOpsList,
        experimentalOpsList: currentExperimentalOpsList,
      });

      if (!written) {
        vscode.window.showErrorMessage(t('folderContext.markAsOperatorFailed', { error: 'cache write failed' }));

        return;
      }

      // 11. Update folder icon decoration
      const ctx = (globalThis as unknown as { extensionContext: vscode.ExtensionContext })
        .extensionContext;

      if (ctx) {
        OperatorProjectIconTheme.getInstance(ctx)
          .fireDecorationUpdate(uri);
      }

      vscode.window.showInformationMessage(t('folderContext.markedAsOperator', { name: operatorName }));
    }
    catch (error) {
      vscode.window.showErrorMessage(t('folderContext.markAsOperatorFailed', { error: error instanceof Error ? error.message : String(error) }));
    }
  }

  /**
   * Mark folder as operator collection
   * No new project entries for collections/sub-operators; full scan from root, update root's ops_meet, ops_list, experimental_ops_list.
   */
  static async markAsMultiOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;

    try {
      const operatorType = await getOperatorProjectTypeByPath(folderPath);

      // <<<>>> type: context menu not supported (except report visualization)
      if (isAscendLikeOperator(operatorType)) {
        vscode.window.showWarningMessage(t('folderContext.angleOpsNotSupported'));

        return;
      }

      // pyasc: mark/unmark not supported
      if (operatorType === OperatorProjectType.PYASC) {
        vscode.window.showWarningMessage(t('folderContext.pyascNoMarkUnmark'));

        return;
      }

      // 1. Find root (standard custom operator)
      const rootPath = await findStandardCustomRoot(folderPath);

      if (!rootPath) {
        vscode.window.showWarningMessage(t('folderContext.noOperatorRoot'));

        return;
      }

      // 2. Get project info (project already created by default)
      const rootProject = getProjectByPath(rootPath);

      if (!rootProject) {
        vscode.window.showErrorMessage(t('folderContext.noProjectInfo'));

        return;
      }

      // 3. Check selected dir is operator collection (in whitelist)
      const normalizedFolderPath = normalizeProjectPath(folderPath);
      const normalizedRootPath = normalizeProjectPath(rootPath);
      const relativePath = stripRootPrefix(normalizedFolderPath, normalizedRootPath);

      let collectionName: string;
      let collectionPath: string;
      let isExperimental: boolean;

      // Determine if root-level collection or under experimental/
      if (isUnderExperimentalDir(normalizedFolderPath, normalizedRootPath)) {
        // Operator collection under experimental
        const parts = relativePath.split('/');

        if (parts.length < 2) {
          vscode.window.showWarningMessage(t('folderContext.notValidCollection'));

          return;
        }

        collectionName = parts[1];
        collectionPath = folderPath;
        isExperimental = true;

        // Check if in experimental operator collection whitelist
        if (!EXPERIMENTAL_OPERATOR_COLLECTIONS.has(collectionName)) {
          vscode.window.showWarningMessage(t('folderContext.notInExperimentalWhitelist', { name: collectionName }));

          return;
        }
      }
      else {
        // Operator collection under root
        collectionName = path.basename(folderPath);
        collectionPath = folderPath;
        isExperimental = false;

        // Check if in root operator collection whitelist
        if (!ROOT_OPERATOR_COLLECTIONS.has(collectionName)) {
          vscode.window.showWarningMessage(t('folderContext.notInWhitelist', { name: collectionName }));

          return;
        }
      }

      // 4. Scan operators under this directory
      const {
        hasOperators,
        operators,
      } = scanOperatorsInCollection(collectionPath);

      if (!hasOperators) {
        vscode.window.showWarningMessage(t('folderContext.noOperatorsInDir'));

        return;
      }

      // 5. Get current project info from the workspace cache scan state
      const scanState = readWorkspaceCache(rootPath).folders?.[normalizeProjectPath(rootPath)];
      const currentOpsMeet = scanState?.opsMeet || [];
      const currentOpsList = scanState?.opsList || [];
      const currentExperimentalOpsList = scanState?.experimentalOpsList || [];

      // 6. Check if collection already exists
      const meetName = isExperimental ? `experimental/${collectionName}` : collectionName;
      const existingMeet = currentOpsMeet.find((m) => m.path === collectionPath || m.name === meetName);

      if (existingMeet) {
        vscode.window.showInformationMessage(t('folderContext.collectionAlreadyMarked'));

        return;
      }

      // 7. Add to operator collection list
      currentOpsMeet.push({
        name: meetName,
        path: collectionPath,
      });

      // 8. Add operators to corresponding lists (preserve existing compile status)
      const updatedOpsList = [...currentOpsList];
      const updatedExperimentalOpsList = [...currentExperimentalOpsList];

      operators.forEach((op) => {
        const targetList = isExperimental ? updatedExperimentalOpsList : updatedOpsList;
        const existing = targetList.find((existingOp) => existingOp.path === op.path || existingOp.name === op.name);

        if (!existing) {
          targetList.push(op);
        }
        else {
          // Preserve existing operator compile status
          if (existing.isCompiled) {
            op.isCompiled = true;
          }

          // Update path if changed
          const index = targetList.indexOf(existing);

          targetList[index] = op;
        }
      });

      // 9. Persist the scan state into the workspace cache
      await updateFolderScanState(rootPath, {
        opsMeet: currentOpsMeet,
        opsList: updatedOpsList,
        experimentalOpsList: updatedExperimentalOpsList,
      });

      // 10. Update folder icon decoration
      const ctx = (globalThis as unknown as { extensionContext: vscode.ExtensionContext })
        .extensionContext;

      if (ctx) {
        const urisToUpdate: vscode.Uri[] = [uri];

        operators.forEach((op) => {
          if (op.path) {
            urisToUpdate.push(vscode.Uri.file(op.path));
          }
        });
        OperatorProjectIconTheme.getInstance(ctx)
          .fireDecorationUpdate(urisToUpdate);
      }

      vscode.window.showInformationMessage(t('folderContext.markedAsCollection', {
        name: meetName,
        count: operators.length,
      }));
    }
    catch (error) {
      vscode.window.showErrorMessage(t('folderContext.markAsCollectionFailed', { error: error instanceof Error ? error.message : String(error) }));
    }
  }

  /**
   * Unmark folder as operator project
   */
  static async unmarkAsOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;

    try {
      const operatorType = await getOperatorProjectTypeByPath(folderPath);

      // <<<>>> type: context menu not supported (except report visualization)
      if (isAscendLikeOperator(operatorType)) {
        vscode.window.showWarningMessage(t('folderContext.angleOpsNotSupported'));

        return;
      }

      // pyasc: mark/unmark not supported
      if (operatorType === OperatorProjectType.PYASC) {
        vscode.window.showWarningMessage(t('folderContext.pyascNoMarkUnmark'));

        return;
      }

      // 1. Find root (standard custom operator)
      const rootPath = await findStandardCustomRoot(folderPath);

      if (!rootPath) {
        vscode.window.showWarningMessage(t('folderContext.noOperatorRootShort'));

        return;
      }

      // 2. Verify root is standard custom operator
      if (!await isStandardCustomRoot(rootPath)) {
        vscode.window.showWarningMessage(t('folderContext.rootNotStandardOperator'));

        return;
      }

      // 3. Get project info (project already created by default)
      const rootProject = getProjectByPath(rootPath);

      if (!rootProject) {
        vscode.window.showErrorMessage(t('folderContext.noProjectInfo'));

        return;
      }

      // 4. Check if this dir is marked as operator (workspace cache scan state)
      const scanState = readWorkspaceCache(rootPath).folders?.[normalizeProjectPath(rootPath)];
      const currentOpsList = scanState?.opsList || [];
      const currentExperimentalOpsList = scanState?.experimentalOpsList || [];
      const operatorName = path.basename(folderPath);

      // Look up in ops_list
      const opsListIndex = currentOpsList.findIndex((op) => op.path === folderPath || op.name === operatorName);
      // Look up in experimental_ops_list
      const experimentalOpsListIndex = currentExperimentalOpsList.findIndex((op) => op.path === folderPath || op.name === operatorName);

      if (opsListIndex === -1 && experimentalOpsListIndex === -1) {
        vscode.window.showInformationMessage(t('folderContext.dirNotMarkedAsOperator'));

        return;
      }

      // 5. Remove from corresponding list
      if (opsListIndex !== -1) {
        currentOpsList.splice(opsListIndex, 1);
      }

      if (experimentalOpsListIndex !== -1) {
        currentExperimentalOpsList.splice(experimentalOpsListIndex, 1);
      }

      // 6. Persist the scan state into the workspace cache (keep ops_meet unchanged)
      // The success message is only shown when the cache write really
      // happened (updateFolderScanState boolean); on a failed write an error
      // message is shown instead.
      const written = await updateFolderScanState(rootPath, {
        opsMeet: scanState?.opsMeet || [],
        opsList: currentOpsList,
        experimentalOpsList: currentExperimentalOpsList,
      });

      if (!written) {
        vscode.window.showErrorMessage(t('folderContext.unmarkFailed', { error: 'cache write failed' }));

        return;
      }

      // 7. Update folder icon decoration
      const ctx = (globalThis as unknown as { extensionContext: vscode.ExtensionContext })
        .extensionContext;

      if (ctx) {
        OperatorProjectIconTheme.getInstance(ctx)
          .fireDecorationUpdate(uri);
      }

      vscode.window.showInformationMessage(t('folderContext.unmarkedAsOperator', { name: operatorName }));
    }
    catch (error) {
      vscode.window.showErrorMessage(t('folderContext.unmarkFailed', { error: error instanceof Error ? error.message : String(error) }));
    }
  }

  /**
   * Unmark folder as operator collection
   * Also unmarks all operators under that directory
   */
  static async unmarkAsMultiOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;

    try {
      const operatorType = await getOperatorProjectTypeByPath(folderPath);

      // <<<>>> type: context menu not supported (except report visualization)
      if (isAscendLikeOperator(operatorType)) {
        vscode.window.showWarningMessage(t('folderContext.angleOpsNotSupported'));

        return;
      }

      // pyasc: mark/unmark not supported
      if (operatorType === OperatorProjectType.PYASC) {
        vscode.window.showWarningMessage(t('folderContext.pyascNoMarkUnmark'));

        return;
      }

      // 1. Find root (standard custom operator)
      const rootPath = await findStandardCustomRoot(folderPath);

      if (!rootPath) {
        vscode.window.showWarningMessage(t('folderContext.noOperatorRootShort'));

        return;
      }

      // 2. Verify root is standard custom operator
      if (!await isStandardCustomRoot(rootPath)) {
        vscode.window.showWarningMessage(t('folderContext.rootNotStandardOperator'));

        return;
      }

      // 3. Get project info (project already created by default)
      const rootProject = getProjectByPath(rootPath);

      if (!rootProject) {
        vscode.window.showErrorMessage(t('folderContext.noProjectInfo'));

        return;
      }

      // 4. Check if this dir is marked as operator collection (workspace cache scan state)
      const scanState = readWorkspaceCache(rootPath).folders?.[normalizeProjectPath(rootPath)];
      const currentOpsMeet = scanState?.opsMeet || [];
      const meetIndex = currentOpsMeet.findIndex((m) => m.path === folderPath);

      if (meetIndex === -1) {
        vscode.window.showInformationMessage(t('folderContext.dirNotMarkedAsCollection'));

        return;
      }

      const meetInfo = currentOpsMeet[meetIndex];

      // 5. Remove from operator collection list
      currentOpsMeet.splice(meetIndex, 1);

      // 6. Remove all operators under this collection
      const currentOpsList = scanState?.opsList || [];
      const currentExperimentalOpsList = scanState?.experimentalOpsList || [];
      const {
        opsList: updatedOpsList, experimentalOpsList: updatedExperimentalOpsList,
      } =
        this.partitionOpsByFolder(folderPath, currentOpsList, currentExperimentalOpsList);

      // 7. Persist the scan state into the workspace cache
      await updateFolderScanState(rootPath, {
        opsMeet: currentOpsMeet,
        opsList: updatedOpsList,
        experimentalOpsList: updatedExperimentalOpsList,
      });

      // 8. Update folder icon decoration
      const ctx = (globalThis as unknown as { extensionContext: vscode.ExtensionContext })
        .extensionContext;

      if (ctx) {
        OperatorProjectIconTheme.getInstance(ctx)
          .fireDecorationUpdate(uri);
      }

      vscode.window.showInformationMessage(t('folderContext.unmarkedAsCollection', { name: meetInfo.name }));
    }
    catch (error) {
      vscode.window.showErrorMessage(t('folderContext.unmarkFailed', { error: error instanceof Error ? error.message : String(error) }));
    }
  }

  /**
   * Build/deploy operator project (run verification)
   * 1. If folder selected and root is standard custom: build example
   * 2. If .py file selected and root is pyasc: pyasc flow (placeholder for now)
   * 3. Otherwise prompt user
   * @param uri Context menu target (folder or file)
   */
  static async buildOperatorProject(uri: vscode.Uri): Promise<void> {
    // Get current workspace root
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage(t('folderContext.noWorkspaceCannotRun'));

      return;
    }

    const workspaceRootPath = workspaceFolders[0].uri.fsPath;

    // Determine whether the currently selected folder or file is
    let isFolder = false;
    let isPyFile = false;

    try {
      const stat = fs.statSync(uri.fsPath);

      isFolder = stat.isDirectory();

      if (!isFolder) {
        isPyFile = uri.fsPath.endsWith('.py');
      }
    }
    catch {
      isFolder = false;
      isPyFile = false;
    }

    // Check if workspace root is standard custom or pyasc
    // Use OperatorProjectDetector.detectOperatorProject
    const rootDetection = await OperatorProjectDetector.detectOperatorProject(workspaceRootPath);
    const isStandardCustom = rootDetection.isOperatorProject
      && rootDetection.projectType === OperatorProjectType.STANDARD_CUSTOM;
    const isPyasc = rootDetection.isOperatorProject
      && rootDetection.projectType === OperatorProjectType.PYASC;

    // <<<>>> type: context menu not supported (except report visualization)
    if (isAscendLikeOperator(rootDetection.projectType)) {
      vscode.window.showWarningMessage(t('folderContext.angleOpsNotSupported'));

      return;
    }

    // Case 1: folder selected and root is standard custom
    if (isFolder && isStandardCustom) {
      // Use selected folder name as operatorNames
      const operatorNames = path.basename(uri.fsPath);

      // Check if under experimental directory
      const normalizedUriPath = normalizeProjectPath(uri.fsPath);
      const normalizedRootPath = normalizeProjectPath(workspaceRootPath);
      const isExperimental = isUnderExperimentalDir(normalizedUriPath, normalizedRootPath);

      // Check the folder belongs to a registered standard-custom project.
      // The mark/unmark writers persist the scan state into the CACHE OF THE
      // STANDARD-CUSTOM ROOT (findStandardCustomRoot), so the read must look in
      // the same cache — a workspace opened above the collection root would
      // otherwise never see the marked operators. Normalized keys,
      // prefix-match + longest wins; fall back to the workspace root record.
      const normalizedUri = normalizeProjectPath(uri.fsPath);
      const scanRoot = (await findStandardCustomRoot(uri.fsPath)) ?? workspaceRootPath;
      const folderKeys = Object.keys(readWorkspaceCache(scanRoot).folders ?? {});
      const containingRoot = folderKeys
        .filter((key) => normalizedUri === key || normalizedUri.startsWith(`${key}/`))
        .sort((a, b) => b.length - a.length)[0];

      const hasRegisteredProject = containingRoot !== undefined
        || getProjectByPath(workspaceRootPath) !== undefined;

      if (!hasRegisteredProject) {
        vscode.window.showErrorMessage(t('folderContext.noProjectIdMarkFirst'));

        return;
      }

      // If under experimental, add --experimental
      const compileOption = isExperimental ? '--experimental' : undefined;

      // Call startBuild with operatorNames, operatorType, compileOption (id-free:
      // startBuild resolves the project from the workspace root).
      await taskMethods.startBuild({
        operatorNames,
        operatorType: 'standard-custom',
        compileOption,
      });

      return;
    }

    // Case 2: .py file selected and root is pyasc
    if (isPyFile && isPyasc) {
      // Placeholder; pyasc run verification to be implemented
      console.log('[buildOperatorProject] pyasc run verification not implemented yet');

      return;
    }

    // Other cases: prompt user
    vscode.window.showWarningMessage(t('folderContext.noOperatorsToValidate'));
  }

  /**
   * Run verification for operator project
   * Standard custom: build example logic; others: existing run verification logic
   */
  static async runOperatorProject(uri: vscode.Uri): Promise<void> {
    // Get current workspace root
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage(t('folderContext.noWorkspaceCannotRun'));

      return;
    }

    const workspaceRootPath = workspaceFolders[0].uri.fsPath;

    // Determine if selection is folder or file
    let isFolder = false;
    let isPyFile = false;

    try {
      const stat = fs.statSync(uri.fsPath);

      isFolder = stat.isDirectory();

      if (!isFolder) {
        isPyFile = uri.fsPath.endsWith('.py');
      }
    }
    catch {
      isFolder = false;
      isPyFile = false;
    }

    // Check if workspace root is standard custom or pyasc
    // Use OperatorProjectDetector.detectOperatorProject
    const rootDetection = await OperatorProjectDetector.detectOperatorProject(workspaceRootPath);
    const isStandardCustom = rootDetection.isOperatorProject
      && rootDetection.projectType === OperatorProjectType.STANDARD_CUSTOM;
    const isPyasc = rootDetection.isOperatorProject
      && rootDetection.projectType === OperatorProjectType.PYASC;

    // <<<>>> type: context menu not supported (except report visualization)
    if (isAscendLikeOperator(rootDetection.projectType)) {
      vscode.window.showWarningMessage(t('folderContext.angleOpsNotSupported'));

      return;
    }

    // Case 1: folder selected and root is standard custom
    if (isFolder && isStandardCustom) {
      // Same as app.vue: operatorNames = selected folder name; the synthesized
      // project record (path-keyed) gates the standard-custom action.
      const project = getProjectByPath(workspaceRootPath);

      if (!project) {
        vscode.window.showErrorMessage(t('folderContext.rootNotRecognized'));

        return;
      }

      // Check if under experimental directory
      const normalizedUriPath = normalizeProjectPath(uri.fsPath);
      const normalizedRootPath = normalizeProjectPath(workspaceRootPath);
      const isExperimental = isUnderExperimentalDir(normalizedUriPath, normalizedRootPath);

      const operatorNames = path.basename(uri.fsPath);
      const operatorType = 'standard-custom';

      // If under experimental, add --experimental
      const compileOption = isExperimental ? '--experimental' : undefined;

      await taskMethods.startBuildExample({
        operatorNames,
        operatorType,
        compileOption,
      });

      return;
    }

    // Case 2: workspace root is pyasc
    if (isPyasc) {
      // If .py file selected, update deploy target file
      if (isPyFile) {
        try {
          const project = getProjectByPath(workspaceRootPath);

          if (project) {
            // Resolve the run path from the op record (settings/cache, id-free)
            const operator = resolveOpRecord(project.project_path, path.basename(project.project_path));
            const runPath = operator?.op_path || project.project_path;

            // Compute relative path of selected file to run path
            const selectedFilePath = uri.fsPath;
            const relativePath = path.relative(runPath, selectedFilePath);
            // Normalize path separators to / and ensure ./ prefix if not at root
            const normalizedRelativePath = relativePath.replace(/\\/g, '/');
            const targetPath = normalizedRelativePath.startsWith('.')
              ? normalizedRelativePath
              : `./${normalizedRelativePath}`;

            const newTargetFile = buildPythonDeployTarget(targetPath);

            await ConfigService.writeBuildOpDeployTarget(newTargetFile);
          }
        }
        catch (error) {
          console.error('[runOperatorProject] Failed to update config:', error);
          // Continue run even if config update fails
        }
      }

      // If .py file selected, pass file path
      const filePath = isPyFile ? path.basename(uri.fsPath) : undefined;

      await taskMethods.startRun({ filePath });

      return;
    }

    // Other cases: prompt user
    vscode.window.showWarningMessage(t('folderContext.noOperatorsToValidate'));
  }

  /**
   * CPU debug operator project
   */
  static async cpuDebugOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;

    const operatorType = await getOperatorProjectTypeByPath(folderPath);

    // <<<>>> type: context menu not supported (except report visualization)
    if (isAscendLikeOperator(operatorType)) {
      vscode.window.showWarningMessage(t('folderContext.angleOpsNotSupported'));

      return;
    }

    // Standard custom: CPU debug not supported
    if (operatorType === OperatorProjectType.STANDARD_CUSTOM) {
      vscode.window.showWarningMessage(t('folderContext.standardOpsNoCpuDebug'));

      return;
    }

    const project = getProjectByPath(folderPath);

    // Check if operator project
    if (!project) {
      vscode.window.showWarningMessage(t('folderContext.folderNotOperatorProject'));

      return;
    }

    await this.switchToProject(uri, async () => {
      // Invoke CPU debug, same as dashboard logic
      await taskMethods.runCpuDebug();
    });
  }

  /**
   * NPU debug operator project
   */
  static async npuDebugOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;

    const operatorType = await getOperatorProjectTypeByPath(folderPath);

    // <<<>>> type: context menu not supported (except report visualization)
    if (isAscendLikeOperator(operatorType)) {
      vscode.window.showWarningMessage(t('folderContext.angleOpsNotSupported'));

      return;
    }

    const project = getProjectByPath(folderPath);

    // Check if operator project
    if (!project) {
      vscode.window.showWarningMessage(t('folderContext.folderNotOperatorProject'));

      return;
    }

    await this.switchToProject(uri, async () => {
      // Invoke NPU debug, same as dashboard logic
      await taskMethods.runDebug();
    });
  }

  /**
   * CPU debug config for operator project
   */
  static async cpuDebugConfigOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;

    const operatorType = await getOperatorProjectTypeByPath(folderPath);

    // <<<>>> type: context menu not supported (except report visualization)
    if (isAscendLikeOperator(operatorType)) {
      vscode.window.showWarningMessage(t('folderContext.angleOpsNotSupported'));

      return;
    }

    // Standard custom: CPU debug not supported
    if (operatorType === OperatorProjectType.STANDARD_CUSTOM) {
      vscode.window.showWarningMessage(t('folderContext.standardOpsNoCpuDebug'));

      return;
    }

    const project = getProjectByPath(folderPath);

    // Check if operator project
    if (!project) {
      vscode.window.showWarningMessage(t('folderContext.folderNotOperatorProject'));

      return;
    }

    await this.switchToProject(uri, async () => {
      // Invoke CPU debug config, same as dashboard logic
      await taskMethods.cpuDebugConfig();
    });
  }

  /**
   * NPU debug config for operator project
   */
  static async npuDebugConfigOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;

    const operatorType = await getOperatorProjectTypeByPath(folderPath);

    // <<<>>> type: context menu not supported (except report visualization)
    if (isAscendLikeOperator(operatorType)) {
      vscode.window.showWarningMessage(t('folderContext.angleOpsNotSupported'));

      return;
    }

    const project = getProjectByPath(folderPath);

    // Check if operator project
    if (!project) {
      vscode.window.showWarningMessage(t('folderContext.folderNotOperatorProject'));

      return;
    }

    await this.switchToProject(uri, async () => {
      // Invoke NPU debug config, same as dashboard logic
      await taskMethods.debugConfig();
    });
  }

  /**
   * Anomaly detection (sanitizer)
   */
  static async sanitizerOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;

    const operatorType = await getOperatorProjectTypeByPath(folderPath);

    // <<<>>> type: context menu not supported (except report visualization)
    if (isAscendLikeOperator(operatorType)) {
      vscode.window.showWarningMessage(t('folderContext.angleOpsNotSupported'));

      return;
    }

    // Check if sanitizer/tuning supported (standard custom: build.sh must contain --bisheng_flags)
    const rootPath = await findStandardCustomRoot(folderPath);

    if (rootPath) {
      const supportsSanitizerAndTuning = await checkSupportsSanitizerAndTuning(rootPath);

      if (!supportsSanitizerAndTuning) {
        vscode.window.showWarningMessage(t('folderContext.needBishengFlags'));

        return;
      }
    }

    await this.switchToProject(uri, async () => {
      // Open sanitizer config, same as dashboard logic
      const sanitizerCommand = COMMAND_SANITIZER_OPTIONS;

      await vscode.commands.executeCommand(sanitizerCommand);
    });
  }

  /**
   * On-board analysis
   */
  static async onBoardOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;

    const operatorType = await getOperatorProjectTypeByPath(folderPath);

    // <<<>>> type: context menu not supported (except report visualization)
    if (isAscendLikeOperator(operatorType)) {
      vscode.window.showWarningMessage(t('folderContext.angleOpsNotSupported'));

      return;
    }

    // Standard custom: performance tuning not supported
    if (operatorType === OperatorProjectType.STANDARD_CUSTOM) {
      vscode.window.showWarningMessage(t('folderContext.standardOpsNoTuning'));

      return;
    }

    // Check sanitizer/tuning support (standard custom: build.sh must have --bisheng_flags)
    const rootPath = await findStandardCustomRoot(folderPath);

    if (rootPath) {
      const supportsSanitizerAndTuning = await checkSupportsSanitizerAndTuning(rootPath);

      if (!supportsSanitizerAndTuning) {
        vscode.window.showWarningMessage(t('folderContext.needBishengFlags'));

        return;
      }
    }

    await this.switchToProject(uri, async () => {
      // A5 + npu-compute: open the unified data-collection dialog (keep parity
      // with the sidebar on-board entry); otherwise the legacy options panel.
      if (ConfigService.shouldUseNewOnBoardTool()) {
        setPendingDataCollectionType('onboard');
        await vscode.commands.executeCommand(COMMAND_DATA_COLLECTION_CONFIG);

        return;
      }

      // Open on-board analysis config, same as dashboard logic
      const onBoardCommand = COMMAND_ON_BOARD_OPTIONS;

      await vscode.commands.executeCommand(onBoardCommand);
    });
  }

  /**
   * Simulation analysis
   */
  static async simulationOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;

    const operatorType = await getOperatorProjectTypeByPath(folderPath);

    // <<<>>> type: context menu not supported (except report visualization)
    if (isAscendLikeOperator(operatorType)) {
      vscode.window.showWarningMessage(t('folderContext.angleOpsNotSupported'));

      return;
    }

    // Standard custom: performance tuning not supported
    if (operatorType === OperatorProjectType.STANDARD_CUSTOM) {
      vscode.window.showWarningMessage(t('folderContext.standardOpsNoTuning'));

      return;
    }

    // Check sanitizer/tuning support (standard custom: build.sh must have --bisheng_flags)
    const rootPath = await findStandardCustomRoot(folderPath);

    if (rootPath) {
      const supportsSanitizerAndTuning = await checkSupportsSanitizerAndTuning(rootPath);

      if (!supportsSanitizerAndTuning) {
        vscode.window.showWarningMessage(t('folderContext.needBishengFlags'));

        return;
      }
    }

    await this.switchToProject(uri, async () => {
      // A5 + npu-emulate (formerly npusim): open the unified data-collection dialog
      // (keep parity with the sidebar simulation entry); otherwise the legacy options panel.
      if (ConfigService.shouldUseNewSimulationTool()) {
        setPendingDataCollectionType('simulate');
        await vscode.commands.executeCommand(COMMAND_DATA_COLLECTION_CONFIG);

        return;
      }

      // Open the simulation analysis configuration and keep it consistent with the Kanban logic
      const simulationCommand = COMMAND_SIMULATOR_OPTIONS;

      await vscode.commands.executeCommand(simulationCommand);
    });
  }

  /**
   * Switch to the specified project and perform the operation
   */
  private static async switchToProject(
    uri: vscode.Uri,
    action: ()=> Promise<void>,
  ): Promise<void> {
    const folderPath = uri.fsPath;
    const project = getProjectByPath(folderPath);

    if (!project) {
      vscode.window.showErrorMessage(t('folderContext.folderNotOperatorProject'));

      return;
    }

    try {
      // Set project context for ProjectManager (path-keyed)
      const pm = ProjectManager.getInstance();

      pm.setProjectContext(project.project_path, project.project_name);

      // perform operations
      await action();
    }
    catch (error) {
      vscode.window.showErrorMessage(t('folderContext.actionFailed', { error: error instanceof Error ? error.message : String(error) }));
    }
  }

  /**
   * Check whether the folder is an operator project
   */
  static async checkIsOperatorProject(uri: vscode.Uri): Promise<{
    isOperatorProject: boolean;
    isMultiProject: boolean;
    projectType?: string;
  }> {
    const folderPath = uri.fsPath;
    const project = getProjectByPath(folderPath);

    if (!project) {
      return {
        isOperatorProject: false,
        isMultiProject: false,
      };
    }

    return {
      isOperatorProject: true,
      isMultiProject: false,
      projectType: project.project_type || undefined,
    };
  }

  /**
   * Normalized paths are used for deduplication comparisons (unify delimiters, remove trailing slashes, resolve to absolute paths)
   */
  private static normalizePathForCompare(p: string): string {
    try {
      const resolved = path.resolve(p);

      return path.normalize(resolved)
        .replace(/[/\\]+$/, '')
        .toLowerCase();
    }
    catch {
      return path.normalize(p)
        .replace(/[/\\]+$/, '')
        .toLowerCase();
    }
  }

  /**
   * Drop operators located under the given folder from both scan-state lists.
   */
  private static partitionOpsByFolder(
    folderPath: string,
    opsList: SubOperatorInfo[],
    experimentalOpsList: SubOperatorInfo[],
  ): { opsList: SubOperatorInfo[];
    experimentalOpsList: SubOperatorInfo[] } {
    const normalizedFolderPath = normalizeProjectPath(folderPath);
    const isOutsideFolder = (op: SubOperatorInfo): boolean => !normalizeProjectPath(op.path)
      .startsWith(normalizedFolderPath + '/');

    return {
      opsList: opsList.filter(isOutsideFolder),
      experimentalOpsList: experimentalOpsList.filter(isOutsideFolder),
    };
  }

  /**
   * Add files/folders to configured fileMapList
   * @param uri file or folder URI
   * @param configType Configuration type: 'sanitizer' | 'on_board' | 'simulate'
   */
  static async addReportToFileMapList(uri: vscode.Uri, configType: 'sanitizer' | 'on_board' | 'simulate'): Promise<void> {
    try {
      const filePath = uri.fsPath;
      const stat = await vscode.workspace.fs.stat(uri);
      const isFile = stat.type === vscode.FileType.File;
      const isDirectory = stat.type === vscode.FileType.Directory;

      // Anomaly detection only supports files
      if (configType === 'sanitizer' && !isFile) {
        vscode.window.showErrorMessage(t('folderContext.sanitizerSelectFile'));

        return;
      }

      // On-board analysis and simulation analysis support folders
      if ((configType === 'on_board' || configType === 'simulate') && !isDirectory && !isFile) {
        vscode.window.showErrorMessage(t('folderContext.selectFileOrFolder'));

        return;
      }

      const projectRoot = ProjectManager.getInstance().projectPath;

      if (!projectRoot) {
        vscode.window.showErrorMessage(t('folderContext.noProjectId'));

        return;
      }

      // The file-map list lives in the workspace cache (id-free).
      const cachedFileMapList = readWorkspaceCache(projectRoot).fileMapLists?.[configType];
      let fileMapList = cachedFileMapList ?? [];

      // Path deduplication: Compare according to standardized paths (unify separators, capitalization, etc.) to avoid repeated additions
      const normalizedNewPath = this.normalizePathForCompare(filePath);
      const exists = fileMapList.some((item) => this.normalizePathForCompare(item.filePath) === normalizedNewPath);

      if (exists) {
        vscode.window.showInformationMessage(t('folderContext.alreadyInConfig'));

        return;
      }

      // Add new items after removing duplicate paths in existing list
      const seen = new Set<string>();

      fileMapList = fileMapList.filter((item) => {
        const norm = this.normalizePathForCompare(item.filePath);

        if (seen.has(norm)) {
          return false;
        }

        seen.add(norm);

        return true;
      });

      // Add new file mapping
      const newFileMap = {
        filePath,
        reportTime: Date.now(),
      };

      fileMapList.push(newFileMap);

      // Persist the file-map list into the workspace cache, atomically — all
      // three per-type lists are kept, only the target type changes.
      await updateWorkspaceCache(projectRoot, (cache) => {
        cache.fileMapLists = {
          sanitizer: cache.fileMapLists?.sanitizer ?? [],
          simulate: cache.fileMapLists?.simulate ?? [],
          on_board: cache.fileMapLists?.on_board ?? [],
          [configType]: fileMapList,
        };
      });

      vscode.window.showInformationMessage(t('folderContext.addedToReportList'));

      // Refresh the corresponding panel
      try {
        if (configType === 'sanitizer') {
          // Refresh the anomaly detection panel
          await vscode.commands.executeCommand(COMMAND_FLASH_MS_SANITIZER_RUN_DATA);
        }
        else if (configType === 'on_board' || configType === 'simulate') {
          // Refresh the performance tuning panel
          await vscode.commands.executeCommand(COMMAND_FLASH_PERFORMANCE_RUN_DATA);
        }
      }
      catch (refreshError) {
        console.error('Failed to refresh panel:', refreshError);
        // No error is displayed because the configuration has been added successfully
      }
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      vscode.window.showErrorMessage(t('folderContext.addFailed', { error: errorMessage }));
      console.error('addReportToFileMapList error:', error);
    }
  }

}
