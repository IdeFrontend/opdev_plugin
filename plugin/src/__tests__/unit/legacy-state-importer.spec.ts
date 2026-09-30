/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// os.homedir is a non-configurable getter on the node core module (neither
// spyOn nor replaceProperty can patch it) — mock the module with a jfn so the
// locate stays hermetic in every test (the importer reads the source
// stores from os.homedir() + <ide-server>/data/ms-op-suite).
jest.mock('os', () => {
  const actual = jest.requireActual('os') as typeof import('os');

  return {
    ...actual,
    homedir: jest.fn(() => actual.homedir()),
  };
});

import * as vscode from 'vscode';
import {
  MIGRATION_STEPS,
  MigrationStep,
  compareSemver,
  importLegacyWorkspaceState,
  resetLegacyImportFlightForTest,
} from '@plugin/helpers/legacy-state-importer';
import {
  CACHE_SCHEMA_VERSION,
  getCacheFilePath,
  updateWorkspaceCache,
} from '@plugin/helpers/workspace-cache';
import {
  getIdeConfigDir, getIdeSettingsFilePath, joinIdeServerRelative,
} from '@plugin/helpers/ide-config-dir';
import { normalizeProjectPath } from '@plugin/domain/models/project-model';
import {
  createStoreDir,
  writeLegacyStore,
} from '../lifecycle/helpers';

describe('one-time state importer', () => {
  const VERSION = '1.1.78';
  let tmpRoot: string;
  let settingsPath: string;
  let cachePath: string;

  beforeEach(() => {
    resetLegacyImportFlightForTest();
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'op-devtools-importer-'));
    fs.mkdirSync(getIdeConfigDir(tmpRoot), { recursive: true });
    settingsPath = getIdeSettingsFilePath(tmpRoot);
    cachePath = getCacheFilePath(tmpRoot);
    // The user data dir is the `WORKSPACE_FOLDER` env var — the stores only.
    // The RemoteConfig file lives under the IDE server home: mock homedir to
    // the temp root so the importer's homedir-based locate stays hermetic and
    // finds the seeded file.
    process.env.WORKSPACE_FOLDER = tmpRoot;
    (os.homedir as jest.Mock).mockReturnValue(tmpRoot);
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: tmpRoot } } as vscode.WorkspaceFolder];
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      inspect: jest.fn(),
      get: jest.fn(),
      update: jest.fn(),
    });
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.WORKSPACE_FOLDER;
    jest.restoreAllMocks();
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  function readSettings(): Record<string, unknown> {
    if (!fs.existsSync(settingsPath)) {
      return {};
    }

    return JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
  }

  function readCache(): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8')) as Record<string, unknown>;
  }

  /** Realistic per-type rows for a project registered at `projectDir`. */
  function configRows(projectDir: string): Record<string, unknown>[] {
    return [
      {
        id: 1,
        config_name: 'op_project',
        config_type: 'build_op',
        script: `bash ${projectDir}\\build.sh`,
        target_file: `${projectDir}\\build\\op_project`,
        user_options: {
          op: 'op_project',
          script: `bash ${projectDir}\\build.sh`,
          config_name: 'op_project',
          target_file: `${projectDir}\\build\\op_project`,
          cpu_debug_script: `bash ${projectDir}\\build.sh --cpudebug`,
          npu_debug_script: `bash ${projectDir}\\build.sh --debug`,
        },
        project_id: 1,
        op: 'op_project',
      },
      {
        id: 2,
        config_name: 'op_project',
        config_type: 'build_example',
        script: `bash ${projectDir}\\build.sh`,
        target_file: `${projectDir}\\build\\op_project`,
        user_options: {
          op: 'op_project',
          script: `bash ${projectDir}\\build.sh`,
          execution_mode: 'eager',
        },
        project_id: 1,
        op: 'op_project',
      },
      {
        id: 4,
        config_name: 'op_project',
        config_type: 'sanitizer',
        script: `bash ${projectDir}\\build.sh --mssanitizer`,
        user_options: {
          op: 'op_project',
          script: `bash ${projectDir}\\build.sh --mssanitizer`,
          logLevel: 'warn',
          tool: { memcheck: true },
          fileMapList: [
            {
              filePath: 'report1.json',
              reportTime: 1,
            },
          ],
          target_file: 'python3 run.py',
        },
        project_id: 1,
        op: 'op_project',
      },
    ];
  }

  /** Seed the current-project legacy baseline: projects/configs/ops.json + remote config. */
  function seedLegacyBaseline(projectDir: string, projectOverrides: Record<string, unknown> = {}): void {
    createStoreDir(tmpRoot);
    writeLegacyStore(tmpRoot, 'projects.json', [
      {
        id: 1,
        project_name: 'op_project',
        project_path: projectDir,
        template_name: null,
        project_type: 'cann',
        ascend_env_script: '/etc/profile',
        soc_version: null,
        ops_meet: null,
        ops_list: null,
        experimental_ops_list: null,
        selected_operator_ids: null,
        ...projectOverrides,
      },
      {
        id: 2,
        project_name: 'other_project',
        project_path: path.join(projectDir, '..', 'other_project'),
        template_name: null,
        project_type: 'cann',
        ascend_env_script: '/etc/profile',
        soc_version: null,
        ops_meet: null,
        ops_list: null,
        experimental_ops_list: null,
        selected_operator_ids: null,
      },
    ]);
    writeLegacyStore(tmpRoot, 'configs.json', configRows(projectDir));
    writeLegacyStore(tmpRoot, 'ops.json', [
      {
        id: 1,
        project_id: 1,
        op_name: 'op_project',
        op_type: 'cann',
        op_path: projectDir,
        template_name: null,
      },
    ]);
  }

  describe('compareSemver', () => {
    it.each([
      [
        '1.1.78',
        '1.1.78',
        0,
      ],
      [
        '1.1.78',
        '1.2.0',
        -1,
      ],
      [
        '1.10.0',
        '1.9.99',
        1,
      ],
      [
        '0.0.1',
        '0.0.1',
        0,
      ],
      [
        '1.1.78-alpha',
        '1.1.78',
        0,
      ],
      [
        '',
        '0.0.1',
        -1,
      ],
      [
        'garbage',
        '0.0.0',
        0,
      ],
    ])('%s vs %s', (a, b, expected) => {
      expect(compareSemver(a, b))
        .toBe(expected);
    });
  });

  describe('importLegacyWorkspaceState', () => {
    it('fresh workspace (no stores): writes the version marker only, no cache.json', async () => {
      await importLegacyWorkspaceState(VERSION, { targetProjectPath: tmpRoot });

      expect(readSettings()['op-devtools.internal.settingsVersion'])
        .toBe(VERSION);
      expect(fs.existsSync(cachePath))
        .toBe(false);
    });

    it('seeds settings + cache.json from the legacy stores of the current project and writes the marker', async () => {
      seedLegacyBaseline(tmpRoot);
      await importLegacyWorkspaceState(VERSION, { targetProjectPath: tmpRoot });

      const settings = readSettings();

      expect(settings['op-devtools.internal.settingsVersion'])
        .toBe(VERSION);
      // The legacy row's `op` migrates into
      // `compileAndDeploy.buildConfig.operatorNameToCompile` (mapping covered
      // in config-service-settings.spec.ts); the deploy target and env script
      // keys are what this end-to-end run asserts here.
      expect(settings['op-devtools.compileAndDeploy.buildConfig.deployCommandOrRunCommand'])
        .toBe(`${tmpRoot}\\build\\op_project`);
      expect(settings['op-devtools.environment.environmentScript'])
        .toBe('/etc/profile');

      const cache = readCache();

      expect(cache.schemaVersion)
        .toBe(CACHE_SCHEMA_VERSION);
      expect(cache.project)
        .toEqual({
          selectedOperatorPaths: [],
          compiledOpPaths: {},
        });
      expect(cache.folders)
        .toEqual({
          [normalizeProjectPath(tmpRoot)]: {
            opsMeet: [],
            opsList: [],
            experimentalOpsList: [],
          },
        });
      expect(cache.fileMapLists)
        .toEqual({
          sanitizer: [
            {
              filePath: 'report1.json',
              reportTime: 1,
            },
          ],
          simulate: [],
          on_board: [],
        });
      expect(cache.sanitizerPythonTarget)
        .toEqual({ op_project: 'python3 run.py' });
      // The remote config lastProjectPath field is unused (its only writer had
      // zero callers) — nothing is seeded anywhere for it.
      expect((cache as unknown as Record<string, unknown>).lastProjectPath)
        .toBeUndefined();
    });

    it('carries the project row soc_version into environment.socVersion', async () => {
      seedLegacyBaseline(tmpRoot, { soc_version: 'ascend910b' });
      await importLegacyWorkspaceState(VERSION, { targetProjectPath: tmpRoot });

      expect(readSettings()['op-devtools.environment.socVersion'])
        .toBe('ascend910b');
    });

    it('hydrates standard-custom scan state: selected/compiled paths via the id formula', async () => {
      const math = path.join(tmpRoot, 'math');
      const addPath = path.join(math, 'add');
      const subPath = path.join(math, 'sub');
      const expPath = path.join(math, 'exp');

      seedLegacyBaseline(tmpRoot, {
        project_type: 'ascend',
        ops_meet: [
          {
            name: 'math',
            path: math,
          },
        ],
        ops_list: [
          {
            name: 'add',
            path: addPath,
            isCompiled: true,
          },
          {
            name: 'sub',
            path: subPath,
            isCompiled: false,
          },
        ],
        experimental_ops_list: [
          {
            name: 'exp',
            path: expPath,
            isCompiled: true,
          },
        ],
        selected_operator_ids: [
          10001,
          11000,
        ],
      });

      await importLegacyWorkspaceState(VERSION, { targetProjectPath: tmpRoot });
      const cache = readCache();

      expect(cache.project)
        .toEqual({
          selectedOperatorPaths: [
            subPath,
            expPath,
          ],
          compiledOpPaths: {
            [addPath]: true,
            [expPath]: true,
          },
        });
      expect(cache.folders)
        .toEqual({
          [normalizeProjectPath(tmpRoot)]: {
            opsMeet: [
              {
                name: 'math',
                path: math,
              },
            ],
            opsList: [
              {
                name: 'add',
                path: addPath,
                isCompiled: true,
              },
              {
                name: 'sub',
                path: subPath,
                isCompiled: false,
              },
            ],
            experimentalOpsList: [
              {
                name: 'exp',
                path: expPath,
                isCompiled: true,
              },
            ],
          },
        });
    });

    it('legacy stores are read-only: byte-identical after the import', async () => {
      seedLegacyBaseline(tmpRoot);
      const snapshot: Record<string, string> = {};

      for (const name of [
        'projects.json',
        'configs.json',
        'ops.json',
      ]) {
        snapshot[name] = fs.readFileSync(path.join(tmpRoot, 'data', name), 'utf8');
      }

      await importLegacyWorkspaceState(VERSION, { targetProjectPath: tmpRoot });

      for (const name of [
        'projects.json',
        'configs.json',
        'ops.json',
      ]) {
        expect(fs.readFileSync(path.join(tmpRoot, 'data', name), 'utf8'))
          .toBe(snapshot[name]);
      }

    });

    it('a second import with the same version is a no-op (byte-identical files)', async () => {
      seedLegacyBaseline(tmpRoot);
      await importLegacyWorkspaceState(VERSION, { targetProjectPath: tmpRoot });

      const before = fs.readFileSync(cachePath, 'utf8');
      const settingsBefore = fs.readFileSync(settingsPath, 'utf8');

      await importLegacyWorkspaceState(VERSION, { targetProjectPath: tmpRoot });

      expect(fs.readFileSync(cachePath, 'utf8'))
        .toBe(before);
      expect(fs.readFileSync(settingsPath, 'utf8'))
        .toBe(settingsBefore);
    });

    it('a version bump does not re-run steps whose since is <= the stored version', async () => {
      seedLegacyBaseline(tmpRoot);
      await importLegacyWorkspaceState('1.1.78', { targetProjectPath: tmpRoot });

      const settingsBefore = fs.readFileSync(settingsPath, 'utf8');
      const cacheBefore = fs.readFileSync(cachePath, 'utf8');

      await importLegacyWorkspaceState('1.2.0', { targetProjectPath: tmpRoot });

      expect(readSettings()['op-devtools.internal.settingsVersion'])
        .toBe('1.2.0');
      // settings seeding did not re-run: only the marker line changed
      expect(fs.readFileSync(settingsPath, 'utf8'))
        .not.toBe(settingsBefore);
      const cacheAfter = fs.readFileSync(cachePath, 'utf8');

      expect(cacheAfter)
        .toBe(cacheBefore);
    });

    it('a downgrade (stored > current) is a full no-op: marker untouched', async () => {
      seedLegacyBaseline(tmpRoot);
      await importLegacyWorkspaceState('2.0.0', { targetProjectPath: tmpRoot });

      const before = fs.readFileSync(cachePath, 'utf8');
      const settingsBefore = fs.readFileSync(settingsPath, 'utf8');

      await importLegacyWorkspaceState(VERSION, { targetProjectPath: tmpRoot });

      expect(readSettings()['op-devtools.internal.settingsVersion'])
        .toBe('2.0.0');
      expect(fs.readFileSync(settingsPath, 'utf8'))
        .toBe(settingsBefore);
      expect(fs.readFileSync(cachePath, 'utf8'))
        .toBe(before);
    });

    it('a partial import marker (0.0.1) skips the already-done step but updates the marker', async () => {
      seedLegacyBaseline(tmpRoot);
      fs.writeFileSync(
        settingsPath,
        `${JSON.stringify({ 'op-devtools.internal.settingsVersion': '0.0.1' }, null, 2)}\n`,
        'utf8',
      );

      await importLegacyWorkspaceState(VERSION, { targetProjectPath: tmpRoot });

      // step since 0.0.1 is NOT < stored 0.0.1 → settings not seeded
      expect(readSettings()['op-devtools.compileAndDeploy.buildConfig.compileCommand'])
        .toBeUndefined();
      expect(readSettings()['op-devtools.internal.settingsVersion'])
        .toBe(VERSION);
      expect(fs.existsSync(cachePath))
        .toBe(false);
    });

    it('runtime cache state is never clobbered by a re-import (crash-between-steps convergence)', async () => {
      seedLegacyBaseline(tmpRoot);
      await importLegacyWorkspaceState(VERSION, { targetProjectPath: tmpRoot });

      // Runtime writers mutate the cache after the initial import…
      await updateWorkspaceCache(tmpRoot, (cache) => {
        cache.fileMapLists = {
          sanitizer: [
            {
              filePath: 'runtime-report.json',
              reportTime: 42,
            },
          ],
          simulate: [],
          on_board: [],
        };
        cache.sanitizerPythonTarget = { op_project: 'python3 /runtime/path.py' };
      });

      // …then the marker is lost (crash between steps) and the import re-runs
      // with the same legacy sources.
      const settings = readSettings();

      delete settings['op-devtools.internal.settingsVersion'];
      fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');

      await importLegacyWorkspaceState(VERSION, { targetProjectPath: tmpRoot });

      const cache = readCache();

      expect(cache.fileMapLists)
        .toEqual({
          sanitizer: [
            {
              filePath: 'runtime-report.json',
              reportTime: 42,
            },
          ],
          simulate: [],
          on_board: [],
        });
      expect(cache.sanitizerPythonTarget)
        .toEqual({ op_project: 'python3 /runtime/path.py' });
      expect(readSettings()['op-devtools.internal.settingsVersion'])
        .toBe(VERSION);
    });

    it('imports only the current project: other-project rows are ignored', async () => {
      seedLegacyBaseline(tmpRoot);
      // Add a build_op row belonging to the OTHER project
      writeLegacyStore(tmpRoot, 'configs.json', [
        ...configRows(tmpRoot),
        {
          id: 10,
          config_name: 'other',
          config_type: 'build_op',
          script: 'bash other.sh',
          target_file: 'other.out',
          user_options: {
            op: 'other',
            script: 'bash other.sh',
            target_file: 'other.out',
          },
          project_id: 2,
          op: 'other',
        },
      ]);

      await importLegacyWorkspaceState(VERSION, { targetProjectPath: tmpRoot });
      const settings = readSettings();

      expect(settings['op-devtools.compileAndDeploy.buildConfig.compileCommand'])
        .toBe(`bash ${tmpRoot}\\build.sh`);
      expect(settings['op-devtools.compileAndDeploy.buildConfig.compileCommand'])
        .not.toBe('bash other.sh');
    });

    it('no matching project row: nothing seeded and NO marker (import incomplete → retried next launch)', async () => {
      createStoreDir(tmpRoot);
      writeLegacyStore(tmpRoot, 'projects.json', [
        {
          id: 1,
          project_name: 'elsewhere',
          project_path: path.join(tmpRoot, 'elsewhere'),
          template_name: null,
          project_type: 'cann',
          ascend_env_script: null,
          soc_version: null,
          ops_meet: null,
          ops_list: null,
          experimental_ops_list: null,
          selected_operator_ids: null,
        },
      ]);
      writeLegacyStore(tmpRoot, 'configs.json', configRows(path.join(tmpRoot, 'elsewhere')));
      writeLegacyStore(tmpRoot, 'ops.json', []);

      await importLegacyWorkspaceState(VERSION, { targetProjectPath: tmpRoot });

      // Sources exist, the step wrote nothing → the marker is NOT written so
      // the import is retried on the next launch (a project row may appear
      // after the workspace is opened as the project).
      expect(readSettings()['op-devtools.internal.settingsVersion'])
        .toBeUndefined();
      expect(readSettings()['op-devtools.compileAndDeploy.buildConfig.compileCommand'])
        .toBeUndefined();
      expect(fs.existsSync(cachePath))
        .toBe(false);
    });

    it('corrupt legacy stores are tolerated (never throws), marker NOT written', async () => {
      createStoreDir(tmpRoot);
      fs.writeFileSync(path.join(tmpRoot, 'data', 'projects.json'), '{ not json', 'utf8');
      fs.writeFileSync(path.join(tmpRoot, 'data', 'configs.json'), '{ not json', 'utf8');

      await expect(importLegacyWorkspaceState(VERSION, { targetProjectPath: tmpRoot }))
        .resolves
        .toBeUndefined();
      // The step produced nothing — a marker here would permanently skip the
      // import once the user fixes the stores. No marker → retried.
      expect(readSettings()['op-devtools.internal.settingsVersion'])
        .toBeUndefined();
    });

    it('a failing step suppresses the marker; a fixed re-run imports and marks', async () => {
      seedLegacyBaseline(tmpRoot);
      const failingStep: MigrationStep = {
        since: '0.0.2',
        run: jest.fn(async () => {
          throw new Error('boom');
        }),
      };

      MIGRATION_STEPS.push(failingStep);

      try {
        await importLegacyWorkspaceState(VERSION, { targetProjectPath: tmpRoot });

        // Step 0.0.1 seeded settings + cache, but step 0.0.2 FAILED → the
        // import is incomplete → no marker (retried next launch).
        expect(readSettings()['op-devtools.internal.settingsVersion'])
          .toBeUndefined();
        expect(fs.existsSync(cachePath))
          .toBe(true);
      }
      finally {
        MIGRATION_STEPS.pop();
      }

      // The failing step no longer runs → the re-run completes and marks.
      await importLegacyWorkspaceState(VERSION, { targetProjectPath: tmpRoot });

      expect(readSettings()['op-devtools.internal.settingsVersion'])
        .toBe(VERSION);
    });

    it('targetProjectPath defaults to the first workspace folder', async () => {
      seedLegacyBaseline(tmpRoot);
      await importLegacyWorkspaceState(VERSION);

      expect(readSettings()['op-devtools.internal.settingsVersion'])
        .toBe(VERSION);
      expect(fs.existsSync(cachePath))
        .toBe(true);
    });

    it('MIGRATION_STEPS is a versioned list starting at 0.0.1', () => {
      expect(MIGRATION_STEPS[0]?.since)
        .toBe('0.0.1');
    });
  });
});
