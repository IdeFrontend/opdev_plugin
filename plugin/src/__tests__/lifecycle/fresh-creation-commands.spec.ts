/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
/**
 * Full creation-matrix command parity.
 *
 * After a FRESH creation of EVERY operator type (cann / ascend / pyasc /
 * triton / torch_library / standard-custom sub-op) the run / simulate /
 * on-board / sanitize commands built by the REAL chain must equal the golden
 * etalon — golden/expected/golden.json — up to project location and operator
 * name: the created project's directory and op name are substituted into the
 * actual command and the result is compared byte-for-byte with the committed
 * etalon.
 *
 * The etalon encodes the seeded defaults (model.ts:704-739 completeProjectConfigs
 * / getDefaultPath): build_op/sanitizer target 'python ../run.py' for
 * torch_library_template (:720-722), 'python3 ./<op>.py' python targets,
 * `build/<op>` for cann, deploy chain for ascend, msprof/mssanitizer tails
 * with the seeded metric/tool options. The creation seeder must reproduce
 * those seeds so the freshly created project yields the
 * same commands — a fresh creation needs no active-file sync or manual
 * configuration to produce the commands.
 *
 * Comparison semantics mirror the golden harness exactly: a builder that
 * throws is captured as {command: '', error: <message>} — and in the jest env
 * i18next `t()` returns undefined, so `new Error(t(key))` has an EMPTY
 * message, which the golden baseline records as error ''. The golden pyasc
 * sanitize block is '' (buildSanitizerCommand is unsupported for pyasc) and
 * the fresh-created project must reproduce the same outcome.
 *
 * ONE documented deviation — standard_custom only. The golden fixture is an
 * IMPORTED collection whose persisted ops.json rows carried op_type 'cann',
 * so the etalon encodes the cann command forms. A FRESH creation is the
 * creation flow, which wrote op_type viewIdToProjectType(2) = 'ascend' into
 * its rows — the ascend command forms (run from the op dir with the deploy
 * tail, profiler/sanitizer targeting build/test_aclnn_<op>). The op_type
 * discriminator is preserved through the cache scan state (the import
 * attaches the row op_type). The fresh-created standard_custom block is
 * therefore asserted against the creation-seed command
 * (freshStandardCustomSeedCommand below, verified against the
 * welcome-controller.ts:581 op_type assignment and ascend-strategy.ts /
 * ascend.plugin.ts).
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

/** Live config backed by one settings.json file (mirrors the harness helper). */
function liveSettingsConfig(settingsFile: string): {
  get: jest.Mock;
  inspect: jest.Mock;
  update: jest.Mock;
} {
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
          workspaceValue: value,
        }
        : undefined;
    }),
    update: jest.fn(() => Promise.resolve()),
  };
}

type GoldenBlock = {
  commands: {
    getRunCommand: string
    getSimulateCommand: string
    getOnBoardCommand: string
    getSanitizerCommand: string
  }
  errors: Record<string, string>
};

const GOLDEN = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../golden/expected/golden.json'), 'utf8')) as Record<string, GoldenBlock>;

const CASES = [
  {
    id: 'cann',
    viewId: 1,
    projectName: 'op_add',
    templateName: 'hello_world',
    goldenProjectPath: '/workspace/projects/cann_hello',
    goldenOp: 'cann_hello',
  },
  {
    id: 'ascend',
    viewId: 2,
    projectName: 'op_add',
    templateName: 'add_custom',
    goldenProjectPath: '/workspace/projects/ascend_add_custom',
    goldenOp: 'add_custom',
  },
  {
    id: 'pyasc',
    viewId: 3,
    projectName: 'op_add',
    templateName: undefined,
    goldenProjectPath: '/workspace/projects/pyasc_demo',
    goldenOp: 'pyasc_demo',
  },
  {
    id: 'triton',
    viewId: 4,
    projectName: 'op_add',
    templateName: 'triton_vector_add',
    goldenProjectPath: '/workspace/projects/triton_vector_add',
    goldenOp: 'triton_vector_add',
  },
  {
    id: 'torch_library',
    viewId: 1,
    projectName: 'op_add',
    templateName: 'torch_library_template',
    goldenProjectPath: '/workspace/projects/torch_lib',
    goldenOp: 'torch_lib',
  },
  {
    id: 'standard_custom',
    viewId: 2,
    projectName: 'add',
    templateName: undefined,
    goldenProjectPath: '/workspace/projects/ops_math/math/add',
    goldenOp: 'add',
  },
] as const;

/**
 * The golden baseline was captured on win32 with POSIX fixture project paths,
 * so its command strings carry the code's literal separators: raw win32
 * path.join outputs come out backslash (`--log-file=\...`), string-spliced
 * paths forward (`cd /workspace/projects/x/build`). The lifecycle-created
 * project has a REAL win32 path — the same code splices it raw — so the actual
 * command mixes separators in the same places with different characters.
 * Normalizing separators to forward on BOTH sides collapses exactly that
 * input-style noise; every code-literal token, seed value and option stays.
 */
function separatorsToForward(value: string): string {
  return value.replace(/\\/g, '/');
}

function normalizeActual(command: string, actualProjectDir: string, actualOp: string, goldenProjectPath: string, goldenOp: string): string {
  const actualFwd = separatorsToForward(actualProjectDir);

  return separatorsToForward(command)
    .replace(/mssanitizer_\d+\.log/g, 'mssanitizer_<ts>.log')
    .replace(/npu-check_\d+\.log/g, 'npu-check_<ts>.log')
    .split(actualFwd)
    .join(goldenProjectPath)
    .split(actualOp)
    .join(goldenOp);
}

/**
 * The golden etalon commands were captured from projects whose rows carried an
 * explicit '/etc/profile' env script, so they start with `. /etc/profile && `.
 * A fresh creation (no explicit projectSH) has a null record — the base
 * strategies source nothing — so the expected command is the golden command
 * without that prefix.
 */
function stripGoldenSourcePrefix(command: string): string {
  const prefix = '. /etc/profile && ';

  return command.startsWith(prefix)
    ? command.slice(prefix.length)
    : command;
}

/**
 * Creation-seed commands for a FRESH standard-custom project (see the file
 * doc): the creation flow assigned op_type 'ascend' to its rows
 * (welcome-controller.ts:581, viewIdToProjectType(2)), so the ascend command
 * forms apply — run from the op dir with the deploy tail, profiler/sanitizer
 * targeting `build/test_aclnn_<op>` via the ascend plugin default paths.
 */
function freshStandardCustomSeedCommand(
  kind: 'run' | 'simulate' | 'onBoard' | 'sanitize',
  p: string,
  op: string,
): string {
  const deployTail = `RUN_FILE=$(find ${p}/build_out/*.run) && chmod +x "$RUN_FILE" && RUN_FILE_HELP=$("$RUN_FILE" --help 2>&1 || true) && case "$RUN_FILE_HELP" in *--force*) "$RUN_FILE" --force ;; *) "$RUN_FILE" ;; esac`;
  const target = `${p}/build/test_aclnn_${op}`;
  const opprof = `${p}/.vscode/opprof`;

  switch (kind) {
    case 'run':
      return `cd ${p} && ${deployTail}`;
    case 'simulate':
      return `mkdir -p ${p}/build && cd ${p}/build && msprof op simulator --soc-version=Ascend910B3 --output=${opprof} --aic-metrics=PipeUtilization ${target}`;
    case 'onBoard':
      return `mkdir -p ${p}/build && cd ${p}/build && msprof op --output=${opprof} --aic-metrics=Occupancy,Roofline,Source,MemoryDetail,Default ${target}`;
    case 'sanitize':
      return `cd ${p} && mssanitizer --tool=memcheck --tool=racecheck --tool=initcheck --leak-check=yes --check-unused-memory=yes --log-level=warn --max-debuglog-size=1024 --log-file=${p}/.vscode/mindstudio_sanitizer_log/mssanitizer_<ts>.log ${target}`;
  }
}

/**
 * Capture a builder exactly like the golden harness does: success → the
 * command plus error '', throw → command '' plus the message.
 */
function capture(builder: ()=> string): { command: string;
  error: string } {
  try {
    return {
      command: builder(),
      error: '',
    };
  }
  catch (e: unknown) {
    return {
      command: '',
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

describe('fresh creation of every type yields the golden run/simulate/on-board/sanitize commands', () => {
  it.each(CASES.map((c) => c.id))(
    'creation of %s produces the golden etalon commands for run/simulate/on-board/sanitize',
    async (caseId) => {
      const fixture = CASES.find((c) => c.id === caseId)!;
      const golden = GOLDEN[fixture.id];
      const actual: Record<string, { command: string;
        error: string }> = {};
      let projectDir = '';

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
            projectName: fixture.projectName,
            createOperatorProjectDictoryFileType: fixture.viewId as CreatedProjectParams['createOperatorProjectDictoryFileType'],
          };

          if (fixture.templateName) {
            params.templateName = fixture.templateName;
          }

          await welcomeMethods.createdProject(params);

          projectDir = path.join(ctx.root, fixture.projectName);

          // Re-point the mocked configuration API at the CREATED project's
          // settings.json so the runtime read-back and the real command chain
          // read the seeded values (the harness default mock watches the
          // workspace root only).
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const vscode = require('vscode') as { workspace: { workspaceFolders?: Array<{ uri: { fsPath: string } }>;
            getConfiguration: jest.Mock } };

          vscode.workspace.getConfiguration.mockReturnValue(liveSettingsConfig(path.join(projectDir, '.vscode', 'settings.json')));

          // Mirror the golden harness context: its workspace folder IS the
          // fixture project path, and the cann/triton sanitizer builds the
          // mssanitizer --log-file path from workspaceFolders[0].uri.fsPath.
          // Without this the actual log lands in `<root>/.vscode/...` (the
          // lifecycle harness default folder = temp root) and only the sanitize
          // command diverges. resolveOpRecord keys cache by projectPath, so the
          // re-point changes nothing else in the chain.
          vscode.workspace.workspaceFolders = [{ uri: { fsPath: projectDir } }];

          const {
            resolveBuildOpBaseContext, resolveBuildExampleBaseContext, resolveSimulateBaseContext, resolveOnBoardBaseContext, resolveSanitizerBaseContext, getRunCommand, getSimulateCommand, getOnBoardCommand, getSanitizerCommand,
          } = requireFresh<{
            resolveBuildOpBaseContext: (projectPath: string, operatorNames?: string)=> unknown
            resolveBuildExampleBaseContext: (projectPath: string, operatorNames?: string)=> unknown
            resolveSimulateBaseContext: (projectPath: string, operatorNames?: string)=> unknown
            resolveOnBoardBaseContext: (projectPath: string, operatorNames?: string)=> unknown
            resolveSanitizerBaseContext: (projectPath: string, operatorNames?: string)=> unknown
            getRunCommand: (baseContext: unknown)=> string
            getSimulateCommand: (baseContext: unknown, exampleBaseContext: unknown)=> string
            getOnBoardCommand: (baseContext: unknown, exampleBaseContext: unknown)=> string
            getSanitizerCommand: (baseContext: unknown, exampleBaseContext: unknown)=> string
          }>('@plugin/domain');

          const op = caseId === 'standard_custom' ? 'add' : '';

          actual.run = capture(() => getRunCommand(resolveBuildOpBaseContext(projectDir, op || undefined)));
          actual.simulate = capture(() => getSimulateCommand(
            resolveSimulateBaseContext(projectDir, op || undefined),
            resolveBuildExampleBaseContext(projectDir, op || undefined),
          ));
          actual.onBoard = capture(() => getOnBoardCommand(
            resolveOnBoardBaseContext(projectDir, op || undefined),
            resolveBuildExampleBaseContext(projectDir, op || undefined),
          ));
          actual.sanitize = capture(() => getSanitizerCommand(
            resolveSanitizerBaseContext(projectDir, op || undefined),
            resolveBuildExampleBaseContext(projectDir, op || undefined),
          ));
        },
      });

      const normalized = {
        run: {
          command: normalizeActual(actual.run.command, projectDir, fixture.projectName, fixture.goldenProjectPath, fixture.goldenOp),
          error: actual.run.error,
        },
        simulate: {
          command: normalizeActual(actual.simulate.command, projectDir, fixture.projectName, fixture.goldenProjectPath, fixture.goldenOp),
          error: actual.simulate.error,
        },
        onBoard: {
          command: normalizeActual(actual.onBoard.command, projectDir, fixture.projectName, fixture.goldenProjectPath, fixture.goldenOp),
          error: actual.onBoard.error,
        },
        sanitize: {
          command: normalizeActual(actual.sanitize.command, projectDir, fixture.projectName, fixture.goldenProjectPath, fixture.goldenOp),
          error: actual.sanitize.error,
        },
      };

      const expectedForKey = (
        builderKey: 'run' | 'simulate' | 'onBoard' | 'sanitize',
        goldenKey: 'getRunCommand' | 'getSimulateCommand' | 'getOnBoardCommand' | 'getSanitizerCommand',
      ): { command: string;
        error: string } => {
        if (fixture.id === 'standard_custom') {
          // Fresh-creation ascend forms (see the file doc); the golden etalon
          // encodes the migrated 'cann' forms.
          return {
            command: freshStandardCustomSeedCommand(builderKey, fixture.goldenProjectPath, fixture.goldenOp),
            error: '',
          };
        }

        return {
          command: stripGoldenSourcePrefix(separatorsToForward(golden.commands[goldenKey])),
          error: golden.errors[goldenKey],
        };
      };

      expect(normalized)
        .toEqual({
          run: expectedForKey('run', 'getRunCommand'),
          simulate: expectedForKey('simulate', 'getSimulateCommand'),
          onBoard: expectedForKey('onBoard', 'getOnBoardCommand'),
          sanitize: expectedForKey('sanitize', 'getSanitizerCommand'),
        });
    },
  );
});
