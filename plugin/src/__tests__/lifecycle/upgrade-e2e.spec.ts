/**
 * Upgrade e2e: opening a stored project (seeded stores) runs the one-time
 * import + registration + openProject. From DISK (real files, JSON-parseable):
 *  - settings.json carries the workspace compile command and the canonical
 *    projectType;
 *  - cache.json carries the per-op sanitizer target and the folder scan state;
 *  - the source stores REMAIN on disk (the import is read-only).
 */
import * as fs from 'fs';
import * as path from 'path';

import {
  requireFresh,
  runLifecycleCase,
  setupOpenCase,
  type LifecycleSnapshot,
} from './helpers';

const CASES = [
  'cann',
  'triton',
] as const;

/**
 * Path values in the hydrated settings/cache may carry either separator
 * (the seeded store rows glue `\` into POSIX paths on non-Windows hosts).
 * Both sides of every path assert are normalized so the comparison holds on
 * every platform; the assertion semantics are unchanged.
 */
const toComparablePath = (value: string): string => value.replace(/\\/g, '/');

type DiskState = {
  snapshot: LifecycleSnapshot;
  projectDir: string;
  cache: Record<string, unknown>;
  settings: Record<string, unknown>;
};

async function runOpenFlowWithDiskReads(caseId: string): Promise<DiskState> {
  let state: Partial<DiskState> | undefined;

  const snapshot = await runLifecycleCase({
    setup: (root) => setupOpenCase(root, caseId),
    workspaceFolder: (root) => path.join(root, caseId === 'standard_custom' ? 'op_collection' : 'op_project'),
    run: async (ctx) => {
      const projectDir = path.join(ctx.root, caseId === 'standard_custom' ? 'op_collection' : 'op_project');

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
      const { normalizeProjectPath } = requireFresh<{
        normalizeProjectPath: (projectPath: string)=> string
      }>('@plugin/domain/models/project-model');

      await importLegacyWorkspaceState('1.1.78', { targetProjectPath: projectDir });
      await WorkspaceDetectorService.detectAndRegisterWorkspace(projectDir);
      await welcomeMethods.openProject({ projectPath: projectDir }, true);

      const settingsPath = path.join(projectDir, '.vscode', 'settings.json');
      const cachePath = path.join(projectDir, '.vscode', 'cache.json');

      // Read the REAL files inside the callback — the harness snapshot
      // normalizes root paths and is not JSON-parseable.
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
      const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as Record<string, unknown>;

      // The importer seeds the folder scan state keyed by the canonical path.
      const rootKey = normalizeProjectPath(projectDir);

      expect(cache.schemaVersion)
        .toBe(1);
      expect(cache.folders)
        .toEqual(expect.objectContaining({
          [rootKey]: expect.objectContaining({
            opsMeet: expect.any(Array),
            opsList: expect.any(Array),
          }),
        }));
      // The importer carries the canonical stored project_type through
      // (no reclassification to 'standard-custom').
      const expectedProjectType = caseId === 'triton' ? 'triton' : 'cann';

      expect(settings['op-devtools.projectType'])
        .toBe(expectedProjectType);

      state = {
        projectDir,
        cache,
        settings,
      };
    },
  });

  return {
    snapshot,
    ...(state as Required<DiskState>),
  };
}

describe('upgrade e2e: source stores → settings + cache.json (importer read-only)', () => {
  it.each(CASES)('%s', async (caseId) => {
    const {
      snapshot, projectDir, cache, settings,
    } = await runOpenFlowWithDiskReads(caseId);

    // The importer keeps the source stores on disk (read-only).
    expect(snapshot.files['data/projects.json'])
      .toBeDefined();
    expect(snapshot.files['data/configs.json'])
      .toBeDefined();
    expect(snapshot.files['data/ops.json'])
      .toBeDefined();

    // Workspace compile command hydrated from the seeded configs.json row.
    const expectedCommand = caseId === 'triton'
      ? 'python3 ./op_project.py'
      : `bash ${path.join(projectDir, 'build.sh')}`;

    expect(toComparablePath(String(settings['op-devtools.compileAndDeploy.buildConfig.compileCommand'])))
      .toBe(toComparablePath(expectedCommand));

    // Per-op sanitizer python target hydrated from the config row's user_options.op.
    const expectedSanitizerTarget = caseId === 'triton'
      ? 'python3 ./op_project.py'
      : path.join(projectDir, 'build', 'op_project');
    const targets = (cache.sanitizerPythonTarget ?? {}) as Record<string, string>;

    expect(Object.keys(targets))
      .toEqual(['op_project']);
    expect(toComparablePath(String(targets.op_project)))
      .toBe(toComparablePath(expectedSanitizerTarget));
  });
});
