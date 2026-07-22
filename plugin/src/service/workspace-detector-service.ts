/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as path from 'path';
import * as fs from 'fs';
import {
  OperatorProjectDetector,
  OperatorProjectType,
} from '@plugin/domain/services/operator-project-detector';
import {
  createProject,
  getProjectByPath,
  projectPathsEqual,
  updateStandardCustomOperators,
  type ProjectRecord,
  type SubOperatorInfo,
  type OperatorCollectionInfo,
} from '@plugin/domain/models/project-model';
import { viewIdToProjectType } from '@plugin/domain/utils/project-utils';

/**
 * Workspace detector service
 * Detects whether the workspace is an operator project; if not, scans subdirectories
 */
export class WorkspaceDetectorService {
  private static readonly registrationFlights = new Map<string, Promise<void>>();

  private static getRegistrationKey(workspacePath: string): string {
    const normalizedWorkspacePath = path.normalize(workspacePath);
    const rootPath = path.parse(normalizedWorkspacePath).root;

    return (normalizedWorkspacePath.length > rootPath.length
      ? normalizedWorkspacePath.replace(/[\\/]+$/, '')
      : normalizedWorkspacePath)
      .replace(/\\/g, '/')
      .toLowerCase();
  }

  static async whenRegistrationReady(workspacePath: string): Promise<void> {
    const pendingRegistration = this.registrationFlights.get(this.getRegistrationKey(workspacePath));

    if (pendingRegistration) {
      await pendingRegistration;
    }
  }

  /**
   * Detect and register operator projects in the workspace
   * Only handles standard custom operator type
   * @param workspacePath Workspace path
   */
  static async detectAndRegisterWorkspace(workspacePath: string): Promise<void> {
    const registrationKey = this.getRegistrationKey(workspacePath);
    const pendingRegistration = this.registrationFlights.get(registrationKey);

    if (pendingRegistration) {
      await pendingRegistration;

      return;
    }

    const registration = this.detectAndRegisterWorkspaceImpl(workspacePath);

    this.registrationFlights.set(registrationKey, registration);

    try {
      await registration;
    }
    finally {
      if (this.registrationFlights.get(registrationKey) === registration) {
        this.registrationFlights.delete(registrationKey);
      }
    }
  }

  private static async detectAndRegisterWorkspaceImpl(workspacePath: string): Promise<void> {
    const storedProjectType = viewIdToProjectType(OperatorProjectType.STANDARD_CUSTOM);
    let rootPath = path.normalize(workspacePath);
    let rootProject = getProjectByPath(rootPath);

    if (rootProject?.project_type !== storedProjectType) {
      const rootDetection = await OperatorProjectDetector.detectOperatorProject(workspacePath);

      if (
        !rootDetection.isOperatorProject
        || rootDetection.projectType !== OperatorProjectType.STANDARD_CUSTOM
      ) {
        return;
      }

      rootPath = path.normalize(rootDetection.projectPath || workspacePath);
      rootProject = getProjectByPath(rootPath);

      if (!rootProject) {
        await createProject({
          project_name: rootDetection.projectName || path.basename(rootPath),
          project_path: rootPath,
          project_type: storedProjectType,
        });
        rootProject = getProjectByPath(rootPath);
      }
    }

    if (rootProject && rootProject.project_type !== storedProjectType) {
      await createProject({
        project_name: rootProject.project_name,
        project_path: rootProject.project_path,
        project_type: storedProjectType,
      });
      rootProject = getProjectByPath(rootPath);
    }

    if (!rootProject) {
      throw new Error(`Failed to register standard-custom workspace: ${rootPath}`);
    }

    await this.scanStandardCustomOperators(rootPath, rootProject);
  }

  /**
   * Whitelist of operator collections under root
   */
  private static readonly ROOT_OPERATOR_COLLECTIONS = new Set([
    'image',
    'objdetect',
    'conversion',
    'math',
    'random',
    'activation',
    'control',
    'conv',
    'foreach',
    'index',
    'loss',
    'matmul',
    'norm',
    'optim',
    'pooling',
    'quant',
    'rnn',
    'vfusion',
    'hash',
    'attention',
    'ffn',
    'gmm',
    'mc2',
    'moe',
    'posembedding',
    'select_attention_operators',
  ]);

  /**
   * Whitelist of operator collections under experimental directory
   */
  private static readonly EXPERIMENTAL_OPERATOR_COLLECTIONS = new Set([
    'image',
    'objdetect',
    'conversion',
    'math',
    'npu_ops_math_ext',
    'random',
    'activation',
    'control',
    'conv',
    'foreach',
    'index',
    'loss',
    'matmul',
    'norm',
    'optim',
    'pooling',
    'quant',
    'rnn',
    'vfusion',
    'attention',
    'ffn',
    'gmm',
    'mc2',
    'moe',
    'npu_ops_transformer_ext',
    'posembedding',
    'select_attention_operators',
  ]);

  /**
   * Scan operator collections (ops_meet) and operators (ops_list/experimental_ops_list) under root.
   * Shared by WorkspaceDetectorService, FolderContextMenuService, etc.
   *
   * Scan rules:
   * 1. Folders in ROOT_OPERATOR_COLLECTIONS under root are treated as operator collections
   * 2. Folders in EXPERIMENTAL_OPERATOR_COLLECTIONS under experimental/ are also operator collections
   * 3. Operators under experimental/ collections are all experimental operators
   * 4. Operator detection unchanged: subdir must contain CMakeLists.txt
   */
  static scanOpsMeetAndOpsLists(rootPath: string): {
    opsMeet: OperatorCollectionInfo[];
    opsList: SubOperatorInfo[];
    experimentalOpsList: SubOperatorInfo[];
  } {
    const opsMeet: OperatorCollectionInfo[] = [];
    const opsList: SubOperatorInfo[] = [];
    const experimentalOpsList: SubOperatorInfo[] = [];
    const entries = fs.readdirSync(rootPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const dirName = entry.name;

      if (dirName.startsWith('.') || dirName === 'node_modules' || dirName === 'out' || dirName === 'build') {
        continue;
      }

      const collectionPath = path.join(rootPath, dirName);

      // Process operator collections under root
      if (this.ROOT_OPERATOR_COLLECTIONS.has(dirName)) {
        const {
          hasOperators,
          operators,
        } = this.scanOperatorsInCollection(collectionPath, false);

        if (hasOperators) {
          opsMeet.push({
            name: dirName,
            path: collectionPath,
          });
          operators.forEach((op) => opsList.push(op));
        }
      }
      // Process experimental directory
      else if (dirName.toLowerCase() === 'experimental') {
        try {
          const experimentalEntries = fs.readdirSync(collectionPath, { withFileTypes: true });

          for (const expEntry of experimentalEntries) {
            if (!expEntry.isDirectory() || expEntry.name.startsWith('.')) {
              continue;
            }

            const expCollectionName = expEntry.name;

            // Check if in experimental operator collection whitelist
            if (this.EXPERIMENTAL_OPERATOR_COLLECTIONS.has(expCollectionName)) {
              const expCollectionPath = path.join(collectionPath, expCollectionName);
              const {
                hasOperators,
                operators,
              } = this.scanOperatorsInCollection(expCollectionPath, true);

              if (hasOperators) {
                // Use full path as name for experimental collections (e.g. experimental/image)
                opsMeet.push({
                  name: `experimental/${expCollectionName}`,
                  path: expCollectionPath,
                });
                operators.forEach((op) => experimentalOpsList.push(op));
              }
            }
          }
        }
        catch {
          // Ignore experimental dir scan failure
        }
      }
    }

    return {
      opsMeet,
      opsList,
      experimentalOpsList,
    };
  }

  /**
   * Scan operators under an operator collection directory
   * @param collectionPath Operator collection path
   * @param isExperimental Whether experimental (currently unused, reserved for future)
   * @returns Whether it has operators and the operator list
   */
  private static scanOperatorsInCollection(
    collectionPath: string,
    _isExperimental: boolean,
  ): {
    hasOperators: boolean;
    operators: SubOperatorInfo[];
  } {
    const operators: SubOperatorInfo[] = [];
    let hasOperators = false;

    try {
      const subEntries = fs.readdirSync(collectionPath, { withFileTypes: true });

      for (const subEntry of subEntries) {
        if (!subEntry.isDirectory() || subEntry.name.startsWith('.')) {
          continue;
        }

        const operatorPath = path.join(collectionPath, subEntry.name);
        const operatorCmakeListsPath = path.join(operatorPath, 'CMakeLists.txt');

        if (!fs.existsSync(operatorCmakeListsPath)) {
          continue;
        }

        hasOperators = true;
        const buildDir = path.join(operatorPath, 'build');
        const outDir = path.join(operatorPath, 'out');
        const isCompiled = fs.existsSync(buildDir) || fs.existsSync(outDir);
        const operatorInfo: SubOperatorInfo = {
          name: subEntry.name,
          path: operatorPath,
          isCompiled: isCompiled,
        };

        operators.push(operatorInfo);
      }
    }
    catch {
      // Ignore single-dir scan failure
    }

    return {
      hasOperators,
      operators,
    };
  }

  /**
   * Scan standard custom operators (special rules)
   * Only scans collections (ops_meet) and operators (ops_list/experimental_ops_list), updates root project info.
   * Does not create new projects in projects for collections or sub-operators.
   */
  private static async scanStandardCustomOperators(
    workspacePath: string,
    rootProject: ProjectRecord,
  ): Promise<void> {
    console.log('[scanStandardCustomOperators] Scanning operator collections and operators...');
    const {
      opsMeet,
      opsList,
      experimentalOpsList,
    } = this.scanOpsMeetAndOpsLists(workspacePath);
    const mergedOpsList = this.mergeOperators(rootProject.ops_list || [], opsList)
      .filter((operator) => !experimentalOpsList.some((experimentalOperator) =>
        projectPathsEqual(operator.path, experimentalOperator.path)));
    const mergedExperimentalOpsList = this.mergeOperators(
      rootProject.experimental_ops_list || [],
      experimentalOpsList,
    )
      .filter((operator) => !opsList.some((regularOperator) =>
        projectPathsEqual(operator.path, regularOperator.path)));

    console.log('[scanStandardCustomOperators] Operator collections:', opsMeet.map((m) => m.name));
    console.log('[scanStandardCustomOperators] Operators:', mergedOpsList.map((o) => o.name));
    console.log(
      '[scanStandardCustomOperators] Experimental operators:',
      mergedExperimentalOpsList.map((o) => o.name),
    );
    await updateStandardCustomOperators(
      workspacePath,
      opsMeet,
      mergedOpsList,
      mergedExperimentalOpsList,
    );
    console.log(`[scanStandardCustomOperators] Updated: ${opsMeet.length} collections, ${mergedOpsList.length} operators, ${mergedExperimentalOpsList.length} experimental`);
  }

  private static mergeOperators(
    existingOperators: SubOperatorInfo[],
    scannedOperators: SubOperatorInfo[],
  ): SubOperatorInfo[] {
    const mergedOperators: SubOperatorInfo[] = [];

    for (const scannedOperator of scannedOperators) {
      const existingOperator = existingOperators.find((operator) =>
        projectPathsEqual(operator.path, scannedOperator.path));
      const mergedOperator = existingOperator
        ? {
          ...existingOperator,
          ...scannedOperator,
          isCompiled: existingOperator.isCompiled === true || scannedOperator.isCompiled === true,
        }
        : scannedOperator;

      if (!mergedOperators.some((operator) =>
        projectPathsEqual(operator.path, mergedOperator.path))) {
        mergedOperators.push(mergedOperator);
      }
    }

    for (const existingOperator of existingOperators) {
      if (!mergedOperators.some((operator) =>
        projectPathsEqual(operator.path, existingOperator.path))) {
        mergedOperators.push(existingOperator);
      }
    }

    return mergedOperators;
  }
}
