import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import * as vscode from 'vscode';
import {
  ConfigService,
  SETTINGS_MIGRATED_FROM_LEGACY_KEY,
  resetLegacySettingsMigrationFlightForTest,
} from '@plugin/service/config-service';

jest.mock('@plugin/core/project/project-manager', () => ({
  ProjectManager: {
    getInstance: jest.fn(),
  },
}));

jest.mock('@plugin/domain/services/configuration', () => ({
  getConfig: jest.fn(),
  postConfig: jest.fn(),
  getConfigById: jest.fn(),
}));

jest.mock('@plugin/controller/home-controller', () => ({
  homeMethods: {
    checkMultipleOperators: jest.fn().mockResolvedValue({
      isStandardCustom: false,
      hasMultiple: false,
    }),
  },
}));

jest.mock('@plugin/service/project-service', () => ({
  projectService: {
    getProjectSH: jest.fn().mockResolvedValue('/etc/profile'),
  },
}));

import { getIdeConfigDir, getIdeSettingsFilePath } from '@plugin/helpers/ide-config-dir';
import { getConfig } from '@plugin/domain/services/configuration';
import { ProjectManager } from '@plugin/core/project/project-manager';

describe('ConfigService legacy settings migration', () => {
  let tmpRoot: string;
  let settingsPath: string;
  const getStore: Record<string, unknown> = {};
  const service = new ConfigService();

  beforeEach(() => {
    resetLegacySettingsMigrationFlightForTest();
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'op-devtools-migrate-'));
    fs.mkdirSync(getIdeConfigDir(tmpRoot), { recursive: true });
    settingsPath = getIdeSettingsFilePath(tmpRoot);
    Object.keys(getStore).forEach((k) => delete getStore[k]);
    (ProjectManager.getInstance as jest.Mock).mockReturnValue({
      projectId: '1',
      getProjectInfo: () => ({ path: tmpRoot }),
    });
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: tmpRoot } } as vscode.WorkspaceFolder];
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      inspect: jest.fn(),
      get: <T>(key: string) => getStore[key] as T | undefined,
    });
    jest.clearAllMocks();
    (getConfig as jest.Mock).mockImplementation((_projectId: number, type: string) => {
      if (type === 'build_op') {
        return [{
          config_type: 'build_op',
          user_options: {
            op: 'myop',
            script: 'bash build.sh',
            target_file: 'python run.py',
          },
        }];
      }
      if (type === 'sanitizer') {
        return [{
          config_type: 'sanitizer',
          user_options: {
            script: 'bash build.sh --sanitizer',
            logLevel: 'warn',
            tool: { memcheck: true },
          },
        }];
      }
      return [{
        config_type: type,
        user_options: { script: `script-${type}` },
      }];
    });
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  it('writes migration flag and compile command from legacy DB', async () => {
    await service.migrateLegacySettingsToWorkspace();

    getStore[SETTINGS_MIGRATED_FROM_LEGACY_KEY] = true;
    expect(ConfigService.isSettingsMigratedFromLegacy()).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
    expect(parsed[`op-devtools.${SETTINGS_MIGRATED_FROM_LEGACY_KEY}`]).toBe(true);
    expect(parsed['op-devtools.compileAndDeploy.buildConfig.compileCommand']).toBe('bash build.sh');
    expect(parsed['op-devtools.sanitizer.reportLogLevel']).toBe('warn');
  });

  it('seeds all runtime-critical settings from generateStructure-like legacy rows (no empty commands)', async () => {
    const ascendBase = 'bash build.sh --pkg --soc={soc_version} --vendor_name=custom --ops={operatorNames}';
    const legacyScripts = {
      compileCommand: ascendBase,
      cpuDebugCompileCommand: `${ascendBase} --simulator {simulator_type}`,
      npuDebugCompileCommand: `${ascendBase} --debug`,
      utTestCompileCommand: 'bash build.sh --soc={soc_version} --ops={operatorNames} -u',
      onBoardCompileCommand: `${ascendBase} --onboard`,
      simulationCompileCommand: `${ascendBase} --simulator {simulator_type}`,
      sanitizerCompileCommand: `${ascendBase} --mssanitizer`,
    };

    (getConfig as jest.Mock).mockImplementation((_projectId: number, type: string) => {
      const rows: Record<string, { config_type: string; user_options: Record<string, unknown> }> = {
        build_op: {
          config_type: 'build_op',
          user_options: {
            op: 'myop',
            script: legacyScripts.compileCommand,
            target_file: './build/myop',
            cpu_debug_script: legacyScripts.cpuDebugCompileCommand,
            npu_debug_script: legacyScripts.npuDebugCompileCommand,
          },
        },
        build_example: {
          config_type: 'build_example',
          user_options: {
            op: 'myop',
            script: 'bash build.sh run',
            execution_mode: 'eager',
          },
        },
        ut_test: {
          config_type: 'ut_test',
          user_options: { op: 'myop', script: legacyScripts.utTestCompileCommand },
        },
        sanitizer: {
          config_type: 'sanitizer',
          user_options: {
            script: legacyScripts.sanitizerCompileCommand,
            logLevel: 'warn',
            maxDebuglogSize: 1024,
            tool: { memcheck: true, racecheck: false, initcheck: false },
            memcheckOption: { 'leak-check': false, 'check-unused-memory': false },
            fileMapList: [],
          },
        },
        on_board: {
          config_type: 'on_board',
          user_options: {
            op: 'myop',
            script: legacyScripts.onBoardCompileCommand,
            Occupancy: true,
            Roofline: true,
            Source: true,
            MemoryDetail: true,
            KernelScale: false,
            advance_param: [],
            fileMapList: [],
          },
        },
        simulate: {
          config_type: 'simulate',
          user_options: {
            op: 'myop',
            script: legacyScripts.simulationCompileCommand,
            PMSampling: true,
            ResourceConflictRatio: true,
            advance_param: [],
            fileMapList: [],
          },
        },
      };
      return rows[type] ? [rows[type]] : [];
    });

    await service.migrateLegacySettingsToWorkspace();

    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
    const requiredKeys = [
      'op-devtools.compileAndDeploy.buildConfig.compileCommand',
      'op-devtools.compileAndDeploy.buildConfig.deployCommandOrRunCommand',
      'op-devtools.compileAndDeploy.buildConfig.onBoardCompileCommand',
      'op-devtools.compileAndDeploy.buildConfig.simulationCompileCommand',
      'op-devtools.compileAndDeploy.buildConfig.utTestCompileCommand',
      'op-devtools.compileAndDeploy.exampleBuildConfig.runCommand',
      'op-devtools.compileAndDeploy.exampleBuildConfig.executionMode',
      'op-devtools.sanitizer.reportLogLevel',
      'op-devtools.performanceTuning.onBoard.interCoreLoad',
      'op-devtools.performanceTuning.simulation.memoryThroughputWaveform',
      'op-devtools.environment.environmentScript',
    ];
    for (const key of requiredKeys) {
      expect(parsed[key]).toBeDefined();
      expect(parsed[key]).not.toBe('');
    }
    expect(parsed['op-devtools.compileAndDeploy.buildConfig.compileCommand'])
      .toBe(legacyScripts.compileCommand);
    expect(parsed['op-devtools.compileAndDeploy.buildConfig.deployCommandOrRunCommand']).toBe('./build/myop');
    expect(parsed['op-devtools.compileAndDeploy.buildConfig.cpuDebugCompileCommand'])
      .toBe(legacyScripts.cpuDebugCompileCommand);
    expect(parsed['op-devtools.compileAndDeploy.buildConfig.npuDebugCompileCommand'])
      .toBe(legacyScripts.npuDebugCompileCommand);
    expect(parsed['op-devtools.compileAndDeploy.buildConfig.utTestCompileCommand'])
      .toBe(legacyScripts.utTestCompileCommand);
    expect(parsed['op-devtools.compileAndDeploy.buildConfig.onBoardCompileCommand'])
      .toBe(legacyScripts.onBoardCompileCommand);
    expect(parsed['op-devtools.compileAndDeploy.buildConfig.simulationCompileCommand'])
      .toBe(legacyScripts.simulationCompileCommand);
    expect(parsed['op-devtools.compileAndDeploy.buildConfig.sanitizerCompileCommand'])
      .toBe(legacyScripts.sanitizerCompileCommand);
  });

  it('migrates exampleBuildConfig whenever build_example row exists', async () => {
    (getConfig as jest.Mock).mockImplementation((_projectId: number, type: string) => {
      if (type === 'build_op') {
        return [{
          config_type: 'build_op',
          user_options: { op: 'add', script: 'bash build.sh --pkg' },
        }];
      }
      if (type === 'build_example') {
        return [{
          config_type: 'build_example',
          user_options: {
            script: 'bash build.sh --vendor_name=custom --run_example',
            execution_mode: 'eager',
          },
        }];
      }
      if (type === 'sanitizer') {
        return [{ config_type: 'sanitizer', user_options: { script: 'bash build.sh --mssanitizer' } }];
      }
      return [{ config_type: type, user_options: { script: `script-${type}` } }];
    });

    await service.migrateLegacySettingsToWorkspace();

    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
    expect(parsed['op-devtools.compileAndDeploy.exampleBuildConfig.runCommand'])
      .toBe('bash build.sh --vendor_name=custom --run_example');
    expect(parsed['op-devtools.compileAndDeploy.exampleBuildConfig.executionMode']).toBe('eager');
  });

  it('maybeMigrate single-flights concurrent callers into one migrate', async () => {
    const migrateSpy = jest.spyOn(service, 'migrateLegacySettingsToWorkspace');

    await Promise.all([
      service.maybeMigrateLegacySettingsToWorkspace(),
      service.maybeMigrateLegacySettingsToWorkspace(),
    ]);

    expect(migrateSpy).toHaveBeenCalledTimes(1);
    migrateSpy.mockRestore();
  });

  it('maybeMigrate is a no-op when migration flag already set', async () => {
    getStore[SETTINGS_MIGRATED_FROM_LEGACY_KEY] = true;
    await ConfigService.writeOpDevtoolsDottedSettings({
      [SETTINGS_MIGRATED_FROM_LEGACY_KEY]: true,
    }, tmpRoot);

    await service.maybeMigrateLegacySettingsToWorkspace();

    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
    expect(parsed['op-devtools.compileAndDeploy.buildConfig.compileCommand']).toBeUndefined();
    expect(parsed['op-devtools.compileAndDeploy.exampleBuildConfig.runCommand']).toBeUndefined();
  });

  it('maybeMigrate skips when build_op row is missing', async () => {
    (getConfig as jest.Mock).mockReturnValue([]);

    await service.maybeMigrateLegacySettingsToWorkspace();

    expect(fs.existsSync(settingsPath)).toBe(false);
  });

  it('still seeds missing keys and sets flag when only some settings are pre-filled', async () => {
    fs.writeFileSync(
      settingsPath,
      `${JSON.stringify({
        'op-devtools.compileAndDeploy.buildConfig.compileCommand': 'user-prefilled',
        'op-devtools.compileAndDeploy.buildConfig.sanitizerCompileCommand': 'user-sanitizer',
      }, null, 2)}\n`,
      'utf8',
    );

    await service.migrateLegacySettingsToWorkspace();

    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
    expect(parsed[`op-devtools.${SETTINGS_MIGRATED_FROM_LEGACY_KEY}`]).toBe(true);
    expect(parsed['op-devtools.compileAndDeploy.buildConfig.compileCommand']).toBe('user-prefilled');
    expect(parsed['op-devtools.compileAndDeploy.buildConfig.sanitizerCompileCommand']).toBe('user-sanitizer');
    expect(parsed['op-devtools.compileAndDeploy.buildConfig.deployCommandOrRunCommand']).toBe('python run.py');
  });

  it('does not set migration flag when all seed keys already exist in settings.json', async () => {
    await service.migrateLegacySettingsToWorkspace();
    const afterFirst = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
    delete afterFirst[`op-devtools.${SETTINGS_MIGRATED_FROM_LEGACY_KEY}`];
    fs.writeFileSync(settingsPath, `${JSON.stringify(afterFirst, null, 2)}\n`, 'utf8');
    delete getStore[SETTINGS_MIGRATED_FROM_LEGACY_KEY];

    await service.migrateLegacySettingsToWorkspace();

    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
    expect(parsed[`op-devtools.${SETTINGS_MIGRATED_FROM_LEGACY_KEY}`]).toBeUndefined();
    expect(ConfigService.isSettingsMigratedFromLegacy()).toBe(false);
  });

  it('does not set migration flag when settings write returns false', async () => {
    const writeSpy = jest.spyOn(ConfigService, 'writeOpDevtoolsDottedSettings').mockResolvedValue(false);

    await service.migrateLegacySettingsToWorkspace();
    expect(ConfigService.isSettingsMigratedFromLegacy()).toBe(false);

    writeSpy.mockRestore();
  });

  it('does not overwrite keys already present in settings.json at write time', async () => {
    fs.writeFileSync(
      settingsPath,
      `${JSON.stringify({ 'op-devtools.sanitizer.memory': false }, null, 2)}\n`,
      'utf8',
    );

    await service.migrateLegacySettingsToWorkspace();

    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
    expect(parsed['op-devtools.sanitizer.memory']).toBe(false);
    expect(parsed['op-devtools.compileAndDeploy.buildConfig.compileCommand']).toBe('bash build.sh');
    expect(parsed[`op-devtools.${SETTINGS_MIGRATED_FROM_LEGACY_KEY}`]).toBe(true);
  });
});
