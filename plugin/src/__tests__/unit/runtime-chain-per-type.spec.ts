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
 * Runtime chain per project type: drives the REAL build-service /
 * sanitizer-service entry points against the golden fixtures and asserts the
 * commands actually handed to `executeOperatorCommand` (spied) match the
 * builders' direct output — i.e. the op/operator resolution happens inside the
 * chain (getBaseContext synthesis), not via manually passed context.
 *
 * Only `vscode` is mocked (same wiring as the golden harness); plugin modules
 * are re-required per test after `jest.resetModules()` so the WORKSPACE_FOLDER
 * store location is picked up fresh.
 *
 * Covered:
 *  - per fixture type: startBuild → getBuildOpCommand, startRun → getRunCommand,
 *    runSanitizer → build (requiresBuildBeforeAnalysis) + getSanitizerCommand
 *  - regression: standard_custom WITHOUT ops rows synthesizes an ascend
 *    operator (project root op_path) → build command carries the deploy tail
 *    (RUN_FILE=$(find ...)), run command targets the .run package
 *  - no-selection: startBuild({}) resolves op from the config row
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  fixtures,
  FIXTURE_TYPES,
  FixtureType,
  FixtureState,
} from '../golden/fixtures';

/** configType used by startRun per project type (mirrors buildBehavior.requiresBuildBeforeAnalysis) */
const RUN_CONFIG_TYPE: Record<FixtureType, string> = {
  cann: 'build_example',
  ascend: 'build_example',
  pyasc: 'build_op',
  triton: 'build_op',
  torch_library: 'build_example',
  standard_custom: 'build_example',
};

/** RUN_CONFIG_TYPE === 'build_example' iff requiresBuildBeforeAnalysis */
const NEEDS_SANITIZER_BUILD: Record<FixtureType, boolean> = {
  cann: true,
  ascend: true,
  pyasc: false,
  triton: false,
  torch_library: true,
  standard_custom: true,
};

let execSyncEnvForwarded = false;

/**
 * jest (jest-environment-node) sandboxes `process.env`: env vars set in a test
 * are invisible to child processes spawned by `execSync`, which default to the
 * host env, so forward the sandboxed env. Same stand-in as the golden harness.
 *
 * NOTE: setupFixture pins `WORKSPACE_FOLDER` directly — that is what the store
 * sources actually resolve to (getLegacyUserDataDir), and it makes the tests
 * independent of any probe.
 */
function forwardExecSyncEnv(): void {
  if (execSyncEnvForwarded) {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const childProcess = require('child_process') as { execSync: typeof import('child_process').execSync };
  const originalExecSync = childProcess.execSync;

  childProcess.execSync = ((command: string, options?: import('child_process').ExecSyncOptions) => {
    const merged = options
      ? {
        ...options,
        env: process.env,
      }
      : { env: process.env };

    return originalExecSync(command, merged);
  }) as typeof childProcess.execSync;
  execSyncEnvForwarded = true;
}

const OP_DEVTOOLS_PREFIX = 'op-devtools.';

function stripPrefix(fullKey: string): string {
  return fullKey.startsWith(OP_DEVTOOLS_PREFIX)
    ? fullKey.slice(OP_DEVTOOLS_PREFIX.length)
    : fullKey;
}

function makeSettingsConfiguration(settings: Record<string, unknown>): {
  get: (key: string, def?: unknown)=> unknown;
  inspect: (key: string)=> { key: string;
    workspaceFolderValue: unknown } | undefined;
  update: ()=> Promise<void>;
} {
  const store: Record<string, unknown> = {};

  for (const [
    fullKey,
    value,
  ] of Object.entries(settings)) {
    store[stripPrefix(fullKey)] = value;
  }

  return {
    get: (key: string, def?: unknown) => (key in store ? store[key] : def),
    inspect: (key: string) => (key in store
      ? {
        key,
        workspaceFolderValue: store[key],
      }
      : undefined),
    update: () => Promise.resolve(),
  };
}

function writeStore(dir: string, name: string, rows: unknown[]): void {
  const payload = name === 'projects.json'
    ? {
      lastId: 1,
      projects: rows,
    }
    : name === 'configs.json'
      ? {
        lastId: 1,
        configs: rows,
      }
      : {
        lastId: 1,
        ops: rows,
      };

  fs.writeFileSync(path.join(dir, name), JSON.stringify(payload, null, 2), 'utf8');
}

/** Sanitizer log file names embed `new Date().valueOf()` — strip the epoch so comparisons are deterministic. */
function normalizeCaptured(value: string): string {
  return value.replace(/mssanitizer_\d+\.log/g, 'mssanitizer_<ts>.log');
}

const FIXTURE_PATH_PREFIX = '/workspace/projects/';

/**
 * Hermeticity: rewrite every fixture path under `/workspace/projects/`
 * to the tmpRoot path (forward-slashed). Without this the spec wrote
 * `.vscode/cache.json` into the REAL fixture dirs (`C:\workspace\projects\*`
 * on win32), which leaked into subsequent golden compare runs. After the
 * remap, everything the spec touches lives under tmpRoot, which teardown
 * removes. Expected commands are derived from the REMAPPED fixture, so the
 * captured-vs-expected comparison stays consistent.
 */
function remapToTmpRoot<T>(value: T, tmpRoot: string): T {
  const tmp = tmpRoot.replace(/\\/g, '/');

  const remap = (node: unknown): unknown => {
    if (typeof node === 'string') {
      return node.startsWith(FIXTURE_PATH_PREFIX)
        ? `${tmp}/${node.slice(FIXTURE_PATH_PREFIX.length)}`
        : node;
    }

    if (Array.isArray(node)) {
      return node.map(remap);
    }

    if (node !== null && typeof node === 'object') {
      return Object.fromEntries(Object.entries(node)
        .map(([
          key,
          val,
        ]) => [
          key,
          remap(val),
        ]));
    }

    return node;
  };

  return remap(value) as T;
}

interface ChainModules {
  command: Record<string, (...args: unknown[])=> unknown>;
  buildService: {
    startBuild: (params?: Record<string, unknown>)=> Promise<boolean>;
    startRun: (params?: Record<string, unknown>)=> Promise<void>;
  };
  sanitizerService: {
    runSanitizer: (params?: Record<string, unknown>)=> Promise<void>;
  };
  execMock: jest.Mock;
}

async function setupFixture(
  state: FixtureState,
  opts: { ops?: unknown[] } = {},
): Promise<{ modules: ChainModules;
  tmpRoot: string;
  /** The fixture with every `/workspace/projects/*` path remapped to tmpRoot. */
  fixture: FixtureState }> {
  forwardExecSyncEnv();
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opdevtools-runtime-chain-'));
  // Remap ALL fixture paths to tmpRoot — the spec must never write into
  // the real fixture dirs (C:\workspace\projects\* on win32).
  const fixture = remapToTmpRoot(state, tmpRoot);
  const storeDir = path.join(tmpRoot, 'data');

  fs.mkdirSync(storeDir, { recursive: true });
  writeStore(storeDir, 'projects.json', fixture.projects);
  writeStore(storeDir, 'configs.json', fixture.configs);
  writeStore(storeDir, 'ops.json', opts.ops ?? fixture.ops);

  const workspaceFolder = String((fixture.projects[0] as Record<string, unknown>).project_path);

  process.env.WORKSPACE_FOLDER = tmpRoot;
  jest.resetModules();

  // Wire the vscode mock BEFORE any plugin module is required.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const vscodeMock = require('vscode') as {
    workspace: {
      workspaceFolders: Array<{ uri: { fsPath: string } }> | undefined;
      getConfiguration: jest.Mock;
    };
  };

  vscodeMock.workspace.workspaceFolders = [{ uri: { fsPath: workspaceFolder } }];

  // The project record is synthesized from workspace state — the
  // `op-devtools.projectType` marker (written by the detector at workspace open)
  // is what makes `getProjectByPath` recognize the fixture project.
  const projectType = (fixture.projects[0] as Record<string, unknown>).project_type;
  const effectiveSettings = projectType === undefined
    ? fixture.settings
    : {
      ...fixture.settings,
      'op-devtools.projectType': String(projectType),
    };

  vscodeMock.workspace.getConfiguration = jest.fn(() => makeSettingsConfiguration(effectiveSettings));

  // `resolveOpRecord` reads the workspace cache scan state
  // (`cache.folders[key].opsList`) and the sanitizer Python target lives in
  // `cache.sanitizerPythonTarget[op]`. Both are seeded in production by the
  // one-time import; mirror that seeding from the fixture rows (same as the
  // golden harness) so sub-operator resolution (cd math/add) and the
  // active-file target check / target_file lookup (triton/pyasc) match the
  // stores the fixtures encode.
  const projectRow = fixture.projects[0] as Record<string, unknown> & {
    ops_meet?: Array<{ name: string;
      path: string }>;
    ops_list?: Array<{ name: string;
      path: string;
      isCompiled?: boolean }>;
    experimental_ops_list?: Array<{ name: string;
      path: string;
      isCompiled?: boolean }>;
  };
  const cache: Record<string, unknown> = { schemaVersion: 1 };

  // `opts.ops` controls the "operator rows exist" knob (the test passes
  // `{ ops: [] }` to simulate a workspace with no operators) — with no rows the
  // cache scan state stays absent so `resolveOpRecord` synthesizes the root
  // record, exactly like a fresh workspace that never scanned.
  const hasOpsRows = (opts.ops ?? fixture.ops).length > 0;

  if (hasOpsRows && (projectRow.ops_meet || projectRow.ops_list || projectRow.experimental_ops_list)) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { normalizeProjectPath } = require('@plugin/domain/models/project-model') as {
      normalizeProjectPath: (p: string)=> string;
    };

    cache.folders = {
      [normalizeProjectPath(workspaceFolder)]: {
        opsMeet: projectRow.ops_meet ?? [],
        opsList: projectRow.ops_list ?? [],
        experimentalOpsList: projectRow.experimental_ops_list ?? [],
      },
    };
  }

  const sanitizerPythonTarget: Record<string, string> = {};

  for (const row of fixture.configs) {
    const userOptions = (row as Record<string, unknown>).user_options as
      Record<string, unknown> | undefined;
    const op = userOptions?.op;
    const targetFile = userOptions?.target_file;

    if (typeof op === 'string' && op.trim() && typeof targetFile === 'string' && targetFile.trim()) {
      sanitizerPythonTarget[op] = targetFile;
    }
  }

  if (Object.keys(sanitizerPythonTarget).length > 0) {
    cache.sanitizerPythonTarget = sanitizerPythonTarget;
  }

  fs.mkdirSync(path.join(workspaceFolder, '.vscode'), { recursive: true });
  fs.writeFileSync(
    path.join(workspaceFolder, '.vscode', 'cache.json'),
    `${JSON.stringify(cache, null, 2)}\n`,
    'utf8',
  );

  // `WORKSPACE_FOLDER` (set above) is the user data dir every consumer reads.

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { OperatorPluginRegistry } = require('@plugin/domain/plugins/operator-plugin.registry') as {
    OperatorPluginRegistry: {
      _reset: ()=> void;
      registerOpPlugin: (plugin: unknown)=> void;
    };
  };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { CannPlugin } = require('@plugin/domain/plugins/cann.plugin') as { CannPlugin: new ()=> unknown };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AscendPlugin } = require('@plugin/domain/plugins/ascend.plugin') as { AscendPlugin: new ()=> unknown };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PyAscPlugin } = require('@plugin/domain/plugins/pyasc.plugin') as { PyAscPlugin: new ()=> unknown };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { TritonPlugin } = require('@plugin/domain/plugins/triton.plugin') as { TritonPlugin: new ()=> unknown };

  OperatorPluginRegistry._reset();
  OperatorPluginRegistry.registerOpPlugin(new CannPlugin());
  OperatorPluginRegistry.registerOpPlugin(new AscendPlugin());
  OperatorPluginRegistry.registerOpPlugin(new PyAscPlugin());
  OperatorPluginRegistry.registerOpPlugin(new TritonPlugin());

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ProjectManager } = require('@plugin/core/project/project-manager') as {
    ProjectManager: {
      getInstance: ()=> { setProjectContext: (projectPath: string, projectName?: string)=> void };
    };
  };

  // No `initProject` registry creation — the context is path-only.
  ProjectManager.getInstance()
    .setProjectContext(workspaceFolder);

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const commandMod = require('@plugin/domain/services/command') as Record<string, (...args: unknown[])=> unknown>;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const buildServiceMod = require('@plugin/service/build-service') as {
    buildService: ChainModules['buildService'];
  };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sanitizerServiceMod = require('@plugin/service/sanitizer-service') as {
    sanitizerService: ChainModules['sanitizerService'];
  };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const execMod = require('@plugin/service/operator-command-executor') as {
    executeOperatorCommand: unknown;
  };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const tritonMod = require('@plugin/domain/services/command-strategy/triton-strategy') as {
    probeTritonPythonDependencies: unknown;
  };

  const execMock = jest.fn(async () => ({
    code: 0,
    output: '',
    interruptedByUserStop: false,
  }));

  // Replace the live function on the module object: every importer calls it via
  // property access (CJS interop), so one swap covers all call sites.
  (execMod as { executeOperatorCommand: unknown }).executeOperatorCommand = execMock;
  (tritonMod as { probeTritonPythonDependencies: unknown }).probeTritonPythonDependencies =
    jest.fn(async () => ({ ok: true }));

  return {
    modules: {
      command: commandMod,
      buildService: buildServiceMod.buildService,
      sanitizerService: sanitizerServiceMod.sanitizerService,
      execMock,
    },
    tmpRoot,
    fixture,
  };
}

function teardownFixture(tmpRoot: string): void {
  delete process.env.WORKSPACE_FOLDER;
  fs.rmSync(tmpRoot, {
    recursive: true,
    force: true,
  });
}

function capturedCommands(execMock: jest.Mock): string[] {
  return execMock.mock.calls.map((call) => call[0] as string);
}

describe('runtime chain per project type (real build-service / sanitizer-service)', () => {
  describe.each(FIXTURE_TYPES)('%s', (fixtureType: FixtureType) => {
    const fixture = fixtures[fixtureType];

    it('startBuild hands getBuildOpCommand output to executeOperatorCommand', async () => {
      const {
        modules, tmpRoot, fixture: remapped,
      } = await setupFixture(fixture);

      try {
        const {
          command, buildService, execMock,
        } = modules;
        const meta = remapped.meta;

        if (fixtureType === 'pyasc') {
          // Parity: pyasc build op is not supported → no command is executed.
          await expect(buildService.startBuild({
            projectId: meta.projectId,
            configId: meta.buildOpConfigId,
            operatorNames: meta.operatorNames,
          })).resolves.toBe(false);
          expect(execMock).not.toHaveBeenCalled();

          return;
        }

        const ok = await buildService.startBuild({
          projectId: meta.projectId,
          configId: meta.buildOpConfigId,
          compileOption: meta.compileOption,
          operatorNames: meta.operatorNames,
        });

        expect(ok)
          .toBe(true);

        const expected = normalizeCaptured(String(command.getBuildOpCommand(
          command.resolveBuildOpBaseContext(meta.projectPath, meta.operatorNames),
          meta.compileOption,
          meta.operatorNames,
        )));

        expect(capturedCommands(execMock)
          .map(normalizeCaptured))
          .toEqual([expected]);
      }
      finally {
        teardownFixture(tmpRoot);
      }
    });

    it('startRun hands getRunCommand output to executeOperatorCommand', async () => {
      const {
        modules, tmpRoot, fixture: remapped,
      } = await setupFixture(fixture);

      try {
        const {
          command, buildService, execMock,
        } = modules;
        const meta = remapped.meta;
        const filePath = (fixtureType === 'pyasc' || fixtureType === 'triton')
          ? path.join(meta.projectPath, `${meta.opName}.py`)
          : undefined;

        await buildService.startRun({ filePath });

        const expected = normalizeCaptured(String(command.getRunCommand(RUN_CONFIG_TYPE[fixtureType] === 'build_example'
          ? command.resolveBuildExampleBaseContext(meta.projectPath)
          : command.resolveBuildOpBaseContext(meta.projectPath))));

        expect(capturedCommands(execMock)
          .map(normalizeCaptured))
          .toEqual([expected]);
      }
      finally {
        teardownFixture(tmpRoot);
      }
    });

    it('runSanitizer hands the build + sanitizer commands to executeOperatorCommand', async () => {
      const {
        modules, tmpRoot, fixture: remapped,
      } = await setupFixture(fixture);

      try {
        const {
          command, sanitizerService, execMock,
        } = modules;
        const meta = remapped.meta;

        await sanitizerService.runSanitizer({ operatorNames: meta.operatorNames });

        if (fixtureType === 'pyasc') {
          // PyAsc sanitizer is not supported → no command is executed.
          expect(execMock).not.toHaveBeenCalled();

          return;
        }

        const expected: string[] = [];

        if (NEEDS_SANITIZER_BUILD[fixtureType]) {
          expected.push(String(command.getBuildOpCommand(
            command.resolveSanitizerBaseContext(meta.projectPath, meta.operatorNames),
            '',
            meta.operatorNames,
          )));
        }

        expected.push(String(command.getSanitizerCommand(
          command.resolveSanitizerBaseContext(meta.projectPath, meta.operatorNames),
          command.resolveBuildExampleBaseContext(meta.projectPath, meta.operatorNames),
          meta.operatorNames,
        )));

        expect(capturedCommands(execMock)
          .map(normalizeCaptured))
          .toEqual(expected.map(normalizeCaptured));
      }
      finally {
        teardownFixture(tmpRoot);
      }
    });
  });

  it('standard_custom without ops rows synthesizes an ascend operator with the deploy tail', async () => {
    const base = fixtures.standard_custom;
    const {
      modules, tmpRoot, fixture,
    } = await setupFixture(base, { ops: [] });

    try {
      const {
        buildService, execMock,
      } = modules;
      const projectPath = fixture.meta.projectPath;

      // No operator row exists → getBaseContext synthesizes the root operator
      // { op_type: 'ascend', op_path: project_path } — the root-op seed falls
      // back to op_type = project.project_type ('ascend'), so the ascend
      // command forms apply (deploy tail on build, run from the project dir).
      const ok = await buildService.startBuild({
        projectId: 1,
        configId: 1,
        operatorNames: 'add,sub',
      });

      expect(ok)
        .toBe(true);

      const build = capturedCommands(execMock)[0];

      expect(build)
        .toContain('. /etc/profile');
      expect(build)
        .toContain(`cd ${projectPath}`);
      expect(build)
        .toContain('--ops=add,sub');
      // The deploy target is the ROOT build_out package — a standard-custom
      // collection has one root-keyed config set.
      expect(build)
        .toContain(`RUN_FILE=$(find ${projectPath}/build_out/*.run)`);

      // startRun → ascend run target = workspace deploy setting (.run package).
      execMock.mockClear();
      await buildService.startRun({});

      const run = capturedCommands(execMock)[0];

      expect(run)
        .toContain(`cd ${projectPath}`);
      expect(run)
        .toContain('RUN_FILE=$(find');
      expect(run)
        .toContain('build_out/*.run');
    }
    finally {
      teardownFixture(tmpRoot);
    }
  });

  it('no-selection: startBuild({}) resolves op via the synthesized root record (ascend)', async () => {
    const base = fixtures.ascend;
    const {
      modules, tmpRoot, fixture,
    } = await setupFixture(base);

    try {
      const {
        command, buildService, execMock,
      } = modules;
      const meta = fixture.meta;

      const ok = await buildService.startBuild({});

      expect(ok)
        .toBe(true);

      const expected = normalizeCaptured(String(command.getBuildOpCommand(
        command.resolveBuildOpBaseContext(meta.projectPath),
        undefined,
        undefined,
      )));

      expect(capturedCommands(execMock)
        .map(normalizeCaptured))
        .toEqual([expected]);
    }
    finally {
      teardownFixture(tmpRoot);
    }
  });
});
