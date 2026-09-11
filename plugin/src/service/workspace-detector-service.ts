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
  getProjectByPath,
  normalizeProjectPath,
  projectPathsEqual,
  type SubOperatorInfo,
  type OperatorCollectionInfo,
} from '@plugin/domain/models/project-model';
import { viewIdToProjectType } from '@plugin/domain/utils/project-utils';
import {
  EXPERIMENTAL_OPERATOR_COLLECTIONS,
  ROOT_OPERATOR_COLLECTIONS,
  scanOperatorsInCollection,
} from '@plugin/domain/utils/operator-collections';
import { updateWorkspaceCache } from '@plugin/helpers/workspace-cache';
import { ConfigService } from '@plugin/service/config-service';

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
    const rootProject = getProjectByPath(rootPath);

    if (rootProject?.project_type !== storedProjectType) {
      const rootDetection = await OperatorProjectDetector.detectOperatorProject(workspacePath);

      if (
        !rootDetection.isOperatorProject
        || rootDetection.projectType !== OperatorProjectType.STANDARD_CUSTOM
      ) {
        return;
      }

      rootPath = path.normalize(rootDetection.projectPath || workspacePath);
    }

    // Mirror the registered root project type into the workspace `projectType`
    // setting (view id form, e.g. 'ascend') so consumers can read it without a
    // DB record (settings + cache.json only).
    await ConfigService.writeOpDevtoolsDottedSettings({ projectType: storedProjectType }, rootPath);

    await this.scanStandardCustomOperators(rootPath);
  }

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
      if (ROOT_OPERATOR_COLLECTIONS.has(dirName)) {
        const {
          hasOperators,
          operators,
        } = scanOperatorsInCollection(collectionPath);

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
            if (EXPERIMENTAL_OPERATOR_COLLECTIONS.has(expCollectionName)) {
              const expCollectionPath = path.join(collectionPath, expCollectionName);
              const {
                hasOperators,
                operators,
              } = scanOperatorsInCollection(expCollectionPath);

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
   * Scan standard custom operators (special rules)
   * Only scans collections (ops_meet) and operators (ops_list/experimental_ops_list), updates the
   * workspace cache scan state (folders[rootKey]).
   * `isCompiled` of previously scanned operators is preserved (sticky).
   */
  private static async scanStandardCustomOperators(workspacePath: string): Promise<void> {
    console.log('[scanStandardCustomOperators] Scanning operator collections and operators...');
    const {
      opsMeet,
      opsList,
      experimentalOpsList,
    } = this.scanOpsMeetAndOpsLists(workspacePath);
    const rootKey = normalizeProjectPath(workspacePath);

    await updateWorkspaceCache(workspacePath, (cache) => {
      const existing = cache.folders?.[rootKey];
      const mergedOpsList = this.mergeOperators(existing?.opsList || [], opsList)
        .filter((operator) => !experimentalOpsList.some((experimentalOperator) =>
          projectPathsEqual(operator.path, experimentalOperator.path)));
      const mergedExperimentalOpsList = this.mergeOperators(
        existing?.experimentalOpsList || [],
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

      cache.folders = {
        ...(cache.folders ?? {}),
        [rootKey]: {
          opsMeet,
          opsList: mergedOpsList,
          experimentalOpsList: mergedExperimentalOpsList,
        },
      };
    });
    console.log(`[scanStandardCustomOperators] Updated: ${opsMeet.length} collections, ${opsList.length} operators, ${experimentalOpsList.length} experimental`);
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

    // Canonical path-sorted order: the operator ids handed out to the tree
    // (check-multiple-operators) and decoded by project-model are positional
    // indices into this list, so the persisted order must be deterministic.
    // readdir order is not — an unsorted merge re-indexes operators between
    // scans, which re-targets tree clicks and churns row identities.
    // Bytewise comparison on the normalized path keeps the order identical
    // across machines and locales.
    mergedOperators.sort((a, b) => {
      const ap = normalizeProjectPath(a.path);
      const bp = normalizeProjectPath(b.path);

      return ap < bp ? -1 : ap > bp ? 1 : 0;
    });

    return mergedOperators;
  }
}
