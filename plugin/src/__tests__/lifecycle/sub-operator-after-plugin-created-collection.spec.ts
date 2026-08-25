/**
 * Lifecycle test: sub-operator creation after the plugin ITSELF created the
 * standard-custom collection (createdProject, isSubOp=false).
 *
 * Regression: createdProject only wrote the workspace `projectType` setting for
 * a new collection — never the cache scan state — so the next createdProject
 * (sub-operator, isSubOp=true) read `cache.folders[rootKey]`, found nothing and
 * threw "standard-custom collection is not registered".
 *
 * The collection creation must seed the initial scan state
 * (`cache.folders[rootKey]` = empty lists, create-if-missing) so the sub-operator
 * flow appends into `opsList` exactly like the base appended into the registry
 * row. Same real-module approach as sub-operator-fresh.spec.ts.
 */
import * as fs from 'fs';
import * as path from 'path';

import {
  runLifecycleCase,
  requireFresh,
} from './helpers';
import type { CreatedProjectParams } from '@shared/api-types';

describe('sub-operator creation after the plugin created the collection', () => {
  it('registers the plugin-created collection scan state and appends the sub-operator (no "not registered" error)', async () => {
    let cache: Record<string, unknown> | undefined;
    let collectionPath: string | undefined;

    const snapshot = await runLifecycleCase({
      run: async (ctx) => {
        const { welcomeMethods } = requireFresh<{
          welcomeMethods: {
            createdProject: (params: CreatedProjectParams)=> Promise<void>
          }
        }>('@plugin/controller/welcome-controller');

        // Step 1: the plugin creates the standard-custom collection itself.
        await welcomeMethods.createdProject({
          projectPath: ctx.root,
          projectName: 'op_collection',
          createOperatorProjectDictoryFileType: 2,
        });

        collectionPath = path.join(ctx.root, 'op_collection');

        // Step 2: the collection is now the workspace — re-point the mocked
        // vscode workspace at it (and its live settings) and create a
        // sub-operator inside it.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const vscode = require('vscode') as {
          workspace: {
            workspaceFolders: Array<{ uri: { fsPath: string } }>;
            getConfiguration: jest.Mock
          }
        };

        vscode.workspace.workspaceFolders = [{ uri: { fsPath: collectionPath } }];
        vscode.workspace.getConfiguration.mockReturnValue(settingsConfig(collectionPath));

        await welcomeMethods.createdProject({
          projectPath: collectionPath,
          projectName: 'add',
          createOperatorProjectDictoryFileType: 2,
        });

        // Read the real cache before the harness cleans the temp root.
        const cachePath = path.join(collectionPath, '.vscode', 'cache.json');

        if (fs.existsSync(cachePath)) {
          cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as Record<string, unknown>;
        }
      },
    });

    // The source stores are never touched by the fresh flow.
    expect(snapshot.files['data/projects.json'])
      .toBeUndefined();
    expect(snapshot.files['data/configs.json'])
      .toBeUndefined();
    expect(snapshot.files['data/ops.json'])
      .toBeUndefined();

    // The collection scan state exists in the workspace cache and carries
    // the appended sub-operator — the flow must NOT have thrown
    // "standard-custom collection is not registered".
    expect(collectionPath)
      .toBeDefined();
    expect(cache)
      .toBeDefined();
    const folders = (cache as Record<string, unknown>).folders as Record<string, {
      opsMeet: unknown[];
      opsList: Array<{ name: string;
        path: string;
        isCompiled?: boolean }>;
      experimentalOpsList: unknown[];
    }>;
    const rootKey = path.normalize(collectionPath as string)
      .replace(/\\/g, '/')
      .toLowerCase();

    expect(folders[rootKey])
      .toBeDefined();
    expect(folders[rootKey].opsMeet)
      .toEqual([]);
    expect(folders[rootKey].experimentalOpsList)
      .toEqual([]);
    expect(folders[rootKey].opsList)
      .toContainEqual(expect.objectContaining({
        name: 'add',
        path: path.join(collectionPath as string, 'add'),
      }));
  });
});

/** Live config backed by the collection's own settings.json (mirrors fresh-creation-torch-library.spec.ts). */
function settingsConfig(projectDir: string): {
  get: jest.Mock;
  inspect: jest.Mock;
  update: jest.Mock
} {
  const settingsFile = path.join(projectDir, '.vscode', 'settings.json');
  const readLive = (): Record<string, unknown> => {
    if (!fs.existsSync(settingsFile)) {
      return {};
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(settingsFile, 'utf8')) as Record<string, unknown>;

      return parsed && typeof parsed === 'object' ? parsed : {};
    }
    catch {
      return {};
    }
  };
  const lookup = (store: Record<string, unknown>, key: string): unknown => {
    if (key in store) {
      return store[key];
    }

    const dotted = `op-devtools.${key}`;

    return dotted in store ? store[dotted] : undefined;
  };

  return {
    get: jest.fn((key: string, def?: unknown) => {
      const store = readLive();
      const value = lookup(store, key);

      return value !== undefined ? value : def;
    }),
    inspect: jest.fn((key: string) => {
      const store = readLive();
      const value = lookup(store, key);

      return value !== undefined
        ? {
          key,
          workspaceFolderValue: value,
        }
        : undefined;
    }),
    update: jest.fn(() => Promise.resolve()),
  };
}
