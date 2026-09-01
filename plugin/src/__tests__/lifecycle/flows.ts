/**
 * Lifecycle flows under parity test.
 *
 * - runCreationFlow: the webview `createdProject` flow — real
 *   welcome-controller.createdProject, real command dispatcher
 *   (handleOperatorProjectDirectoryFile), real OpGeneratorFactory with template
 *   zips packed by the harness.
 * - runOpenFlow: the activation sequence for an existing project on the stored
 *   baseline — the one-time import (extension.ts activate(), before the first
 *   sidebar refresh) + WorkspaceDetectorService.detectAndRegisterWorkspace
 *   (extension workspace-folder change handler) + welcomeMethods.openProject(…, true).
 *   The import seeds settings.json + cache.json from the seeded stores; the
 *   snapshot captures that state.
 */
import * as path from 'path';
import type { CreatedProjectParams } from '@shared/api-types';

import {
  CREATION_CASES,
  OPEN_CASES,
  type CreationCase,
} from './fixtures';
import {
  requireFresh,
  runLifecycleCase,
  setupCreationCase,
  setupOpenCase,
  creationCommandDispatcher,
  type LifecycleSnapshot,
} from './helpers';

function loadCreationCase(caseId: string): CreationCase {
  const fixture = CREATION_CASES.find((c) => c.id === caseId);

  if (!fixture) {
    throw new Error(`unknown creation case: ${caseId}`);
  }

  return fixture;
}

export function runCreationFlow(caseId: string): Promise<LifecycleSnapshot> {
  const fixture = loadCreationCase(caseId);

  return runLifecycleCase({
    setup: (root) => setupCreationCase(root, caseId),
    onCommand: creationCommandDispatcher(),
    run: async (ctx) => {
      const { welcomeMethods } = requireFresh<{
        welcomeMethods: {
          createdProject: (params: CreatedProjectParams)=> Promise<void>
        }
      }>('@plugin/controller/welcome-controller');

      const params: CreatedProjectParams = {
        projectPath: ctx.root,
        projectName: fixture.projectName,
        createOperatorProjectDictoryFileType: fixture.viewId as CreatedProjectParams['createOperatorProjectDictoryFileType'],
      };

      if (fixture.templateName) {
        params.templateName = fixture.templateName;
      }

      await welcomeMethods.createdProject(params);
    },
  });
}

export function runOpenFlow(caseId: string): Promise<LifecycleSnapshot> {
  const openCase = OPEN_CASES.find((c) => c.id === caseId);

  if (!openCase) {
    throw new Error(`unknown open case: ${caseId}`);
  }

  return runLifecycleCase({
    setup: (root) => setupOpenCase(root, caseId),
    workspaceFolder: (root) => pathJoinOpenCase(root, caseId),
    run: async (ctx) => {
      const { importLegacyWorkspaceState } = requireFresh<{
        importLegacyWorkspaceState: (currentVersion: string, opts?: { targetProjectPath?: string })=> Promise<void>
      }>('@plugin/helpers/legacy-state-importer');
      const { WorkspaceDetectorService } = requireFresh<{
        WorkspaceDetectorService: {
          detectAndRegisterWorkspace: (workspacePath: string)=> Promise<void>
        }
      }>('@plugin/service/workspace-detector-service');
      const { welcomeMethods } = requireFresh<{
        welcomeMethods: {
          openProject: (params: { projectPath: string }, isFromSystem?: boolean)=> Promise<void>
        }
      }>('@plugin/controller/welcome-controller');

      const projectDir = pathJoinOpenCase(ctx.root, caseId);

      // extension.ts activate(): one-time import (marker = plugin version)
      // before the first sidebar refresh — seeds settings.json + cache.json
      // from the seeded stores.
      await importLegacyWorkspaceState('1.1.78', { targetProjectPath: projectDir });
      await WorkspaceDetectorService.detectAndRegisterWorkspace(projectDir);
      await welcomeMethods.openProject({ projectPath: projectDir }, true);
    },
  });
}

function pathJoinOpenCase(root: string, caseId: string): string {
  return path.join(root, caseId === 'standard_custom' ? 'op_collection' : 'op_project');
}
