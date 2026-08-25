/**
 * Lifecycle+unit test: operator selection persists in the workspace
 * cache as PATHS (`cache.project.selectedOperatorPaths`), not in the
 * `selected_operator_ids` field:
 *  1. createProject accepts a selection seed (id → path, resolved against the
 *     scan state) and writes it to the cache;
 *  2. homeMethods.setSelectedOperators → getSelectedOperatorIds /
 *     getSelectedOperatorEntries round-trip the SAME paths across cache
 *     reloads (selection survives a restart).
 *
 * The persisted-field side is covered by the importer (deriveSelectedOperatorPaths
 * re-keys `selected_operator_ids`); this spec covers the runtime writers and
 * readers (fallback: empty when nothing was ever selected).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  requireFresh,
  runLifecycleCase,
  setupOpenCase,
} from './helpers';

describe('createProject persists the selection seed as cache paths', () => {
  let root: string;
  let subPath: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'opdevtools-sel-'));
    subPath = path.join(root, 'math', 'sub');
    const normalized = root.replace(/\\/g, '/')
      .toLowerCase();
    const cacheDir = path.join(root, '.vscode');

    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, 'cache.json'), `${JSON.stringify({
      schemaVersion: 1,
      folders: {
        [normalized]: {
          opsMeet: [],
          opsList: [
            {
              name: 'add',
              path: path.join(root, 'math', 'add'),
              isCompiled: true,
            },
            {
              name: 'sub',
              path: subPath,
              isCompiled: false,
            },
          ],
          experimentalOpsList: [],
        },
      },
      project: {
        selectedOperatorPaths: [],
        compiledOpPaths: { [path.join(root, 'math', 'add')]: true },
      },
    }, null, 2)}\n`, 'utf8');
  });

  afterEach(() => {
    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
  });

  it('writes cache.project.selectedOperatorPaths from the seed ids (id = scan index)', async () => {
    const { createProject } = requireFresh<{
      createProject: (data: {
        project_name: string
        project_path: string
        selected_operator_ids?: number[]
      })=> Promise<void>
    }>('@plugin/domain/models/project-model');

    await createProject({
      project_name: 'op_collection',
      project_path: root,
      selected_operator_ids: [1],
    });

    const { readWorkspaceCache } = requireFresh<{
      readWorkspaceCache: (projectPath: string)=> {
        project?: { selectedOperatorPaths?: string[];
          compiledOpPaths?: Record<string, boolean> }
      }
    }>('@plugin/helpers/workspace-cache');
    const cache = readWorkspaceCache(root);

    expect(cache.project?.selectedOperatorPaths)
      .toEqual([subPath]);
    // The path re-key never clobbers sibling cache state.
    expect(cache.project?.compiledOpPaths)
      .toEqual({ [path.join(root, 'math', 'add')]: true });
  });
});

describe('selection round-trip through homeMethods persists paths (restart-safe)', () => {
  it('open standard_custom → getSelectedOperatorEntries returns the imported selection; setSelectedOperators writes paths that getSelectedOperatorIds reads back', async () => {
    let entries: Array<{ name: string;
      path: string }> | undefined;
    let idsAfterSet: number[] | undefined;
    let persistedPaths: string[] | undefined;

    await runLifecycleCase({
      setup: (root) => setupOpenCase(root, 'standard_custom'),
      workspaceFolder: (root) => path.join(root, 'op_collection'),
      run: async (ctx) => {
        const projectDir = path.join(ctx.root, 'op_collection');

        // The open flow: one-time import + workspace registration + openProject.
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

        // Reader 1: the importer re-keyed the stored seed [10001] (the 'sub' row)
        // into cache.project.selectedOperatorPaths — the entries surface it.
        const { homeMethods } = requireFresh<{
          homeMethods: {
            getSelectedOperatorEntries: ()=> Promise<Array<{ name: string;
              path: string }>>
            setSelectedOperators: (params: { operatorIds: number[] })=> Promise<void>
            getSelectedOperatorIds: ()=> Promise<number[] | undefined>
          }
        }>('@plugin/controller/home-controller');

        entries = (await homeMethods.getSelectedOperatorEntries())
          .map((op) => ({
            name: op.name,
            path: op.path,
          }));

        // Writer: select BOTH operators (ids are scan indexes, root id = 0).
        await homeMethods.setSelectedOperators({
          operatorIds: [
            0,
            1,
          ],
        });

        // Reader 2 (a fresh call — same as after a restart): the same paths.
        const { readWorkspaceCache } = requireFresh<{
          readWorkspaceCache: (projectPath: string)=> {
            project?: { selectedOperatorPaths?: string[] }
          }
        }>('@plugin/helpers/workspace-cache');

        persistedPaths = readWorkspaceCache(projectDir).project?.selectedOperatorPaths;
        idsAfterSet = await homeMethods.getSelectedOperatorIds();
      },
    });

    // Imported selection: the seeded [10001] maps to the 'sub' sub-operator.
    expect(entries)
      .toEqual([
        {
          name: 'sub',
          path: expect.stringMatching(/op_collection[\\/]math[\\/]sub$/),
        },
      ]);

    // setSelectedOperators persists BOTH paths in order (regular then experimental
    // scan order) — restart-safe.
    expect(persistedPaths)
      .toEqual([
        expect.stringMatching(/op_collection[\\/]math[\\/]add$/),
        expect.stringMatching(/op_collection[\\/]math[\\/]sub$/),
      ]);
    expect(idsAfterSet)
      .toEqual([
        0,
        1,
      ]);
  });
});
