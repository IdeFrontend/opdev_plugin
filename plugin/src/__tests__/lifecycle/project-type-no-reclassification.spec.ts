/**
 * Lifecycle test: opening an imported workspace KEEPS its canonical project
 * type (the value the persisted projects.json row carries) — it is never
 * reclassified to 'standard-custom' by the synthesized record, and the
 * view-id 'ascend' stays 'ascend' (no 'ascend' → 'standard-custom' mapping).
 *
 * The per-type table is the canonical stored value (the projects.json row set
 * for each type).
 *
 * After the open flow, the synthesized `getProjectByPath(projectDir)` record
 * must carry the canonical per-type value — read from the REAL modules inside
 * the run callback (the harness snapshot is normalized).
 */
import * as path from 'path';

import { OPEN_CASES } from './fixtures';
import {
  requireFresh,
  runLifecycleCase,
  setupOpenCase,
} from './helpers';

/** Canonical per-type project_type values (persisted projects.json). */
const CANONICAL_TYPES: Record<string, string> = {
  cann: 'cann',
  ascend: 'ascend',
  pyasc: 'pyasc',
  triton: 'triton',
  torch_library: 'cann',
  standard_custom: 'ascend',
};

function projectDirFor(root: string, caseId: string): string {
  return path.join(root, caseId === 'standard_custom' ? 'op_collection' : 'op_project');
}

describe('stored project_type survives open (no reclassification)', () => {
  it.each(Object.keys(CANONICAL_TYPES))(
    'open %s → synthesized project_type is the canonical "%s"',
    async (caseId) => {
      const expectedType = CANONICAL_TYPES[caseId];
      let synthesizedType: string | null | undefined;

      await runLifecycleCase({
        setup: (root) => setupOpenCase(root, caseId),
        workspaceFolder: (root) => projectDirFor(root, caseId),
        run: async (ctx) => {
          const projectDir = projectDirFor(ctx.root, caseId);

          // The open flow: one-time import + workspace registration +
          // welcomeMethods.openProject (mirrors flows.runOpenFlow).
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

          await importLegacyWorkspaceState('1.1.78', { targetProjectPath: projectDir });
          await WorkspaceDetectorService.detectAndRegisterWorkspace(projectDir);
          await welcomeMethods.openProject({ projectPath: projectDir }, true);

          const { getProjectByPath } = requireFresh<{
            getProjectByPath: (projectPath: string)=> { project_type: string | null } | undefined
          }>('@plugin/domain/models/project-model');

          synthesizedType = getProjectByPath(projectDir)?.project_type;
        },
      });

      expect(synthesizedType)
        .toBe(expectedType);
    },
  );
});
