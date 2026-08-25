import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import * as vscode from 'vscode';
import {
  buildLegacySettingsMigrationWritesFromRows,
  runLegacySettingsStep,
} from '@plugin/service/config-service';

jest.mock('@plugin/core/project/project-manager', () => ({ ProjectManager: { getInstance: jest.fn() } }));

jest.mock('@plugin/controller/home-controller', () => ({
  homeMethods: {
    checkMultipleOperators: jest.fn()
      .mockResolvedValue({
        isStandardCustom: false,
        hasMultiple: false,
      }),
  },
}));

jest.mock('@plugin/service/project-service', () => ({
  projectService: {
    getProjectSH: jest.fn()
      .mockResolvedValue('/etc/profile'),
  },
}));

import {
  getIdeConfigDir, getIdeSettingsFilePath,
} from '@plugin/helpers/ide-config-dir';

/** Rows shaped like the stored configs.json rows (op = 'myop'). */
function legacyRow(id: number, configType: string, userOptions: Record<string, unknown>, projectId = 1): Record<string, unknown> {
  return {
    id,
    config_name: 'myop',
    config_type: configType,
    script: userOptions.script,
    target_file: userOptions.target_file ?? null,
    user_options: {
      op: 'myop',
      config_name: 'myop',
      ...userOptions,
    },
    project_id: projectId,
    op: 'myop',
  };
}

/** Write the host-global source stores for the temp root. */
function seedLegacyStores(root: string, configRows: Record<string, unknown>[], projectOverrides: Record<string, unknown> = {}): void {
  const dataDir = path.join(root, 'data');

  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(
    path.join(dataDir, 'projects.json'),
    `${JSON.stringify({
      lastId: 1,
      projects: [
        {
          id: 1,
          project_name: 'myop',
          project_path: root,
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
      ],
    }, null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(dataDir, 'configs.json'),
    `${JSON.stringify({
      lastId: 6,
      configs: configRows,
    }, null, 2)}\n`,
    'utf8',
  );
}

const ascendBase = 'bash build.sh --pkg --soc={soc_version} --vendor_name=custom --ops={operatorNames}';

/** Full per-type row set (generateStructure-like). */
function fullRows(): Record<string, unknown>[] {
  return [
    legacyRow(1, 'build_op', {
      script: ascendBase,
      target_file: './build/myop',
      cpu_debug_script: `${ascendBase} --cpudebug`,
      npu_debug_script: `${ascendBase} --debug`,
    }),
    legacyRow(2, 'build_example', {
      script: 'bash build.sh --vendor_name=custom --run_example',
      execution_mode: 'eager',
    }),
    legacyRow(3, 'ut_test', { script: 'bash build.sh --soc={soc_version} --ops={operatorNames} -u' }),
    legacyRow(4, 'sanitizer', {
      script: `${ascendBase} --mssanitizer`,
      logLevel: 'warn',
      maxDebuglogSize: 1024,
      tool: {
        memcheck: true,
        racecheck: false,
        initcheck: false,
      },
      memcheckOption: {
        'leak-check': false,
        'check-unused-memory': false,
      },
      fileMapList: [],
    }),
    legacyRow(5, 'on_board', {
      script: `${ascendBase} --onboard`,
      Occupancy: true,
      Roofline: true,
      MemoryDetail: true,
      KernelScale: false,
      advance_param: [],
      fileMapList: [],
    }),
    legacyRow(6, 'simulate', {
      script: `${ascendBase} --simulator {simulator_type}`,
      PMSampling: true,
      ResourceConflictRatio: true,
      advance_param: [],
      fileMapList: [],
    }),
  ];
}

describe('ConfigService settings migration (flagless, path-scoped)', () => {
  let tmpRoot: string;
  let settingsPath: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'op-devtools-migrate-'));
    fs.mkdirSync(getIdeConfigDir(tmpRoot), { recursive: true });
    settingsPath = getIdeSettingsFilePath(tmpRoot);
    // The user data dir is the `WORKSPACE_FOLDER` env var.
    process.env.WORKSPACE_FOLDER = tmpRoot;
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

  it('seeds all runtime-critical settings from stored rows (no empty commands)', async () => {
    seedLegacyStores(tmpRoot, fullRows());
    const wrote = await runLegacySettingsStep(tmpRoot);

    expect(wrote)
      .toBe(true);
    const parsed = readSettings();
    // The stored row's `op` never becomes a settings key.
    const requiredKeys = [
      'op-devtools.compileAndDeploy.buildConfig.deployCommandOrRunCommand',
      'op-devtools.compileAndDeploy.buildConfig.compileCommand',
      'op-devtools.compileAndDeploy.buildConfig.cpuDebugCompileCommand',
      'op-devtools.compileAndDeploy.buildConfig.npuDebugCompileCommand',
      'op-devtools.compileAndDeploy.buildConfig.onBoardCompileCommand',
      'op-devtools.compileAndDeploy.buildConfig.simulationCompileCommand',
      'op-devtools.compileAndDeploy.buildConfig.utTestCompileCommand',
      'op-devtools.compileAndDeploy.buildConfig.sanitizerCompileCommand',
      'op-devtools.compileAndDeploy.exampleBuildConfig.runCommand',
      'op-devtools.compileAndDeploy.exampleBuildConfig.executionMode',
      'op-devtools.sanitizer.reportLogLevel',
      'op-devtools.sanitizer.showQuickOptions',
      'op-devtools.performanceTuning.simulation.showQuickOptions',
      'op-devtools.performanceTuning.onBoard.showQuickOptions',
      'op-devtools.environment.environmentScript',
    ];

    for (const key of requiredKeys) {
      expect(parsed[key])
        .toBeDefined();
      expect(parsed[key]).not.toBe('');
    }

    expect(parsed['op-devtools.compileAndDeploy.buildConfig.compileCommand'])
      .toBe(ascendBase);
    expect(parsed['op-devtools.compileAndDeploy.buildConfig.deployCommandOrRunCommand'])
      .toBe('./build/myop');
    expect(parsed['op-devtools.compileAndDeploy.buildConfig.sanitizerCompileCommand'])
      .toBe(`${ascendBase} --mssanitizer`);
    expect(parsed['op-devtools.environment.environmentScript'])
      .toBe('/etc/profile');
  });

  it('migrates exampleBuildConfig whenever build_example row exists', async () => {
    seedLegacyStores(tmpRoot, [
      legacyRow(1, 'build_op', { script: 'bash build.sh --pkg' }),
      legacyRow(2, 'build_example', {
        script: 'bash build.sh --vendor_name=custom --run_example',
        execution_mode: 'eager',
      }),
    ]);

    await runLegacySettingsStep(tmpRoot);
    const parsed = readSettings();

    expect(parsed['op-devtools.compileAndDeploy.exampleBuildConfig.runCommand'])
      .toBe('bash build.sh --vendor_name=custom --run_example');
    expect(parsed['op-devtools.compileAndDeploy.exampleBuildConfig.executionMode'])
      .toBe('eager');
  });

  it('skips the config-row seed when build_op row is missing but still seeds the project row environment fields', async () => {
    seedLegacyStores(tmpRoot, [legacyRow(1, 'sanitizer', { script: 'bash build.sh --mssanitizer' })]);

    const wrote = await runLegacySettingsStep(tmpRoot);

    expect(wrote)
      .toBe(true);
    const parsed = readSettings();

    // The row's env script lands in settings even when the DB has no config
    // rows — without it the SOC chain falls through to blocking host probes.
    expect(parsed['op-devtools.environment.environmentScript'])
      .toBe('/etc/profile');
    // No build_op row → no compile/deploy seed at all.
    expect(parsed['op-devtools.compileAndDeploy.buildConfig.compileCommand'])
      .toBeUndefined();
  });

  it('seeds environment.socVersion from the project row when it is set', async () => {
    seedLegacyStores(tmpRoot, fullRows(), { soc_version: 'ascend910b' });

    await runLegacySettingsStep(tmpRoot);
    const parsed = readSettings();

    expect(parsed['op-devtools.environment.socVersion'])
      .toBe('ascend910b');
  });

  it('seeds environment.socVersion even when the DB has no config rows', async () => {
    seedLegacyStores(tmpRoot, [], { soc_version: 'ascend910b' });

    await runLegacySettingsStep(tmpRoot);
    const parsed = readSettings();

    expect(parsed['op-devtools.environment.socVersion'])
      .toBe('ascend910b');
    expect(parsed['op-devtools.compileAndDeploy.buildConfig.compileCommand'])
      .toBeUndefined();
  });

  it('does not seed empty environment fields from a null-valued project row', async () => {
    seedLegacyStores(tmpRoot, [], {
      ascend_env_script: null,
      soc_version: null,
    });

    const wrote = await runLegacySettingsStep(tmpRoot);

    expect(wrote)
      .toBe(false);
    expect(fs.existsSync(settingsPath))
      .toBe(false);
  });

  it('does not overwrite environment keys already present in settings.json', async () => {
    seedLegacyStores(tmpRoot, fullRows(), { soc_version: 'ascend910b' });
    fs.writeFileSync(
      settingsPath,
      `${JSON.stringify({ 'op-devtools.environment.socVersion': 'ascend950' }, null, 2)}\n`,
      'utf8',
    );

    await runLegacySettingsStep(tmpRoot);
    const parsed = readSettings();

    expect(parsed['op-devtools.environment.socVersion'])
      .toBe('ascend950');
    expect(parsed['op-devtools.environment.environmentScript'])
      .toBe('/etc/profile');
  });

  it('skips when no source store exists (locate = null)', async () => {
    const wrote = await runLegacySettingsStep(tmpRoot);

    expect(wrote)
      .toBe(false);
    expect(fs.existsSync(settingsPath))
      .toBe(false);
  });

  it('does not overwrite keys already present in settings.json at write time', async () => {
    seedLegacyStores(tmpRoot, fullRows());
    fs.writeFileSync(
      settingsPath,
      `${JSON.stringify({ 'op-devtools.sanitizer.memory': false }, null, 2)}\n`,
      'utf8',
    );

    await runLegacySettingsStep(tmpRoot);
    const parsed = readSettings();

    expect(parsed['op-devtools.sanitizer.memory'])
      .toBe(false);
    expect(parsed['op-devtools.compileAndDeploy.buildConfig.compileCommand'])
      .toBe(ascendBase);
  });

  it('still seeds missing keys when only some settings are pre-filled', async () => {
    seedLegacyStores(tmpRoot, fullRows());
    fs.writeFileSync(
      settingsPath,
      `${JSON.stringify({ 'op-devtools.compileAndDeploy.buildConfig.compileCommand': 'user-prefilled' }, null, 2)}\n`,
      'utf8',
    );

    await runLegacySettingsStep(tmpRoot);
    const parsed = readSettings();

    expect(parsed['op-devtools.compileAndDeploy.buildConfig.compileCommand'])
      .toBe('user-prefilled');
    expect(parsed['op-devtools.compileAndDeploy.buildConfig.deployCommandOrRunCommand'])
      .toBe('./build/myop');
  });

  it('imports the current project even when another project shares the same operator name', async () => {
    // The merge must NOT dedup by (config_type, op) globally — with the other
    // project's row first (lower id, same op name) a global dedup would drop
    // the CURRENT project's row and the import would silently skip it.
    // Semantics: project_id filter FIRST, then first-wins per (config_type, op).
    const dataDir = path.join(tmpRoot, 'data');

    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(
      path.join(dataDir, 'projects.json'),
      `${JSON.stringify({
        lastId: 2,
        projects: [
          {
            id: 1,
            project_name: 'myop',
            project_path: tmpRoot,
            template_name: null,
            project_type: 'cann',
            ascend_env_script: null,
            soc_version: null,
            ops_meet: null,
            ops_list: null,
            experimental_ops_list: null,
            selected_operator_ids: null,
          },
          {
            id: 2,
            project_name: 'other',
            project_path: path.join(tmpRoot, '..', 'other'),
            template_name: null,
            project_type: 'cann',
            ascend_env_script: null,
            soc_version: null,
            ops_meet: null,
            ops_list: null,
            experimental_ops_list: null,
            selected_operator_ids: null,
          },
        ],
      }, null, 2)}\n`,
      'utf8',
    );
    fs.writeFileSync(
      path.join(dataDir, 'configs.json'),
      `${JSON.stringify({
        lastId: 3,
        configs: [
          legacyRow(1, 'build_op', {
            script: 'bash other.sh',
            target_file: './build/other',
          }, 2),
          legacyRow(2, 'build_op', {
            script: ascendBase,
            target_file: './build/myop',
          }, 1),
        ],
      }, null, 2)}\n`,
      'utf8',
    );

    const wrote = await runLegacySettingsStep(tmpRoot);

    expect(wrote)
      .toBe(true);
    expect(readSettings()['op-devtools.compileAndDeploy.buildConfig.compileCommand'])
      .toBe(ascendBase);
  });

  it('host-global row wins over a workspace row with the same (project, type, op) but a different id', async () => {
    // The merge puts host rows FIRST and appends non-conflicting workspace
    // rows — the host row wins regardless of ids. An id-sorted dedup would
    // pick the LOWEST id, letting a lower-id workspace row shadow the host row.
    seedLegacyStores(tmpRoot, [
      legacyRow(2, 'build_op', {
        script: 'bash host.sh',
        target_file: './build/host',
      }),
    ]);
    const wsStoreDir = path.join(tmpRoot, '.vscode', 'op_devtools', 'data');

    fs.mkdirSync(wsStoreDir, { recursive: true });
    fs.writeFileSync(
      path.join(wsStoreDir, 'configs.json'),
      `${JSON.stringify({
        lastId: 1,
        configs: [
          legacyRow(1, 'build_op', {
            script: 'bash ws.sh',
            target_file: './build/ws',
          }),
        ],
      }, null, 2)}\n`,
      'utf8',
    );

    const wrote = await runLegacySettingsStep(tmpRoot);

    expect(wrote)
      .toBe(true);
    expect(readSettings()['op-devtools.compileAndDeploy.buildConfig.compileCommand'])
      .toBe('bash host.sh');
    expect(readSettings()['op-devtools.compileAndDeploy.buildConfig.deployCommandOrRunCommand'])
      .toBe('./build/host');
  });

  it('is a no-op (returns false) when all seed keys already exist in settings.json', async () => {
    seedLegacyStores(tmpRoot, fullRows());
    await runLegacySettingsStep(tmpRoot);
    const before = readSettings();

    const second = await runLegacySettingsStep(tmpRoot);

    expect(second)
      .toBe(false);
    expect(readSettings())
      .toEqual(before);
  });

  it('buildLegacySettingsMigrationWritesFromRows produces raw writes (unfiltered)', () => {
    const writes = buildLegacySettingsMigrationWritesFromRows(fullRows(), [], '/etc/profile');

    expect(writes['compileAndDeploy.buildConfig.deployCommandOrRunCommand'])
      .toBe('./build/myop');
    expect(writes['sanitizer.showQuickOptions'])
      .toBe(true);
    expect(writes['performanceTuning.simulation.showQuickOptions'])
      .toBe(true);
    expect(writes['performanceTuning.onBoard.showQuickOptions'])
      .toBe(true);
    expect(writes['environment.environmentScript'])
      .toBe('/etc/profile');
  });

  it('buildLegacySettingsMigrationWritesFromRows passes an empty environmentScript through (parity)', () => {
    const writes = buildLegacySettingsMigrationWritesFromRows(fullRows(), [], '');

    expect(writes['environment.environmentScript'])
      .toBe('');
  });
});
