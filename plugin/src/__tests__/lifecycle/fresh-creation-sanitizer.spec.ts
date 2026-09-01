/**
 * Lifecycle test: creating a Python-typed operator (pyasc / triton)
 * seeds `cache.sanitizerPythonTarget[op] = 'python3 ./<name>.py'` (the
 * default `targetOpFile`) in the CREATED project's cache — so a
 * fresh creation needs no active-file sync to produce the sanitizer
 * command. The runtime reader (ConfigService.getSanitizerConfig with
 * an EMPTY op) resolves the same canonical key and surfaces the seeded target.
 *
 * The cache and the runtime row are read from the real files inside the run
 * callback (the harness snapshot is normalized and not JSON-parseable).
 */
import * as fs from 'fs';
import * as path from 'path';
import type { CreatedProjectParams } from '@shared/api-types';

import {
  creationCommandDispatcher,
  requireFresh,
  runLifecycleCase,
  setupCreationCase,
} from './helpers';

const CASES = [
  {
    id: 'pyasc',
    viewId: 3,
    templateName: undefined,
  },
  {
    id: 'triton',
    viewId: 4,
    templateName: 'triton_vector_add',
  },
] as const;

describe('fresh creation seeds the sanitizer python target for pyasc/triton', () => {
  it.each(CASES.map((c) => c.id))(
    'creation of %s writes sanitizerPythonTarget["op_add"] = "python3 ./op_add.py" and the runtime row reads it back with an empty op',
    async (caseId) => {
      const fixture = CASES.find((c) => c.id === caseId)!;
      let cacheTarget: string | undefined;
      let runtimeTarget: string | undefined;

      await runLifecycleCase({
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
            projectName: 'op_add',
            createOperatorProjectDictoryFileType: fixture.viewId as CreatedProjectParams['createOperatorProjectDictoryFileType'],
          };

          if (fixture.templateName) {
            params.templateName = fixture.templateName;
          }

          await welcomeMethods.createdProject(params);

          // A cann creation does not materialize a cache at all — no
          // sanitizer Python target is seeded (single-operator python types
          // only) and the last project path lives in the extension global
          // state, not in cache.json.
          const cachePath = path.join(ctx.root, 'op_add', '.vscode', 'cache.json');

          cacheTarget = fs.existsSync(cachePath)
            ? (JSON.parse(fs.readFileSync(cachePath, 'utf8')) as {
              sanitizerPythonTarget?: Record<string, string>
            }).sanitizerPythonTarget?.['op_add']
            : undefined;

          // Runtime-side read: the canonical key must resolve with an EMPTY op
          // (no active-file sync is required on a fresh creation).
          const { ConfigService } = requireFresh<{
            ConfigService: {
              getSanitizerConfig: (projectPath: string, op?: string)=> {
                targetFile: string | null
              }
            }
          }>('@plugin/service/config-service');

          const config = ConfigService.getSanitizerConfig(
            path.join(ctx.root, 'op_add'),
            '',
          );

          runtimeTarget = config.targetFile ?? undefined;
        },
      });

      expect(cacheTarget)
        .toBe('python3 ./op_add.py');
      expect(runtimeTarget)
        .toBe('python3 ./op_add.py');
    },
  );

  // torch_library is a python-typed creation too — the generateStructure
  // sanitizer row used the same targetFile as build_op, which is
  // 'python ../run.py' for torch_library_template (model.ts:405-409 and
  // :720-722). The seed must cover it with that value, not 'python3 ./<name>.py'.
  it('torch_library creation writes sanitizerPythonTarget["op_add"] = "python ../run.py" and the runtime row reads it back', async () => {
    let cacheTarget: string | undefined;
    let runtimeTarget: string | undefined;

    await runLifecycleCase({
      setup: (root) => setupCreationCase(root, 'cann'),
      onCommand: creationCommandDispatcher(),
      run: async (ctx) => {
        const { welcomeMethods } = requireFresh<{
          welcomeMethods: {
            createdProject: (params: CreatedProjectParams)=> Promise<void>
          }
        }>('@plugin/controller/welcome-controller');

        await welcomeMethods.createdProject({
          projectPath: ctx.root,
          projectName: 'op_add',
          createOperatorProjectDictoryFileType: 1,
          templateName: 'torch_library_template',
        });

        const cachePath = path.join(ctx.root, 'op_add', '.vscode', 'cache.json');
        const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as {
          sanitizerPythonTarget?: Record<string, string>
        };

        cacheTarget = cache.sanitizerPythonTarget?.['op_add'];

        const { ConfigService } = requireFresh<{
          ConfigService: {
            getSanitizerConfig: (projectPath: string, op?: string)=> {
              targetFile: string | null
            }
          }
        }>('@plugin/service/config-service');

        const config = ConfigService.getSanitizerConfig(
          path.join(ctx.root, 'op_add'),
          '',
        );

        runtimeTarget = config.targetFile ?? undefined;
      },
    });

    expect(cacheTarget)
      .toBe('python ../run.py');
    expect(runtimeTarget)
      .toBe('python ../run.py');
  });

  it('cann creation does NOT seed a sanitizer target (single-operator python types only)', async () => {
    let cacheTarget: unknown = 'unset';

    await runLifecycleCase({
      setup: (root) => setupCreationCase(root, 'cann'),
      onCommand: creationCommandDispatcher(),
      run: async (ctx) => {
        const { welcomeMethods } = requireFresh<{
          welcomeMethods: {
            createdProject: (params: CreatedProjectParams)=> Promise<void>
          }
        }>('@plugin/controller/welcome-controller');

        await welcomeMethods.createdProject({
          projectPath: ctx.root,
          projectName: 'op_add',
          createOperatorProjectDictoryFileType: 1,
          templateName: 'hello_world',
        });

        // A cann creation materializes no cache at all — no sanitizer Python
        // target is seeded (single-operator python types only) and the last
        // project path lives in the extension global state.
        const cachePath = path.join(ctx.root, 'op_add', '.vscode', 'cache.json');

        cacheTarget = fs.existsSync(cachePath)
          ? (JSON.parse(fs.readFileSync(cachePath, 'utf8')) as { sanitizerPythonTarget?: Record<string, string> }).sanitizerPythonTarget
          : undefined;
      },
    });

    expect(cacheTarget)
      .toBeUndefined();
  });
});
