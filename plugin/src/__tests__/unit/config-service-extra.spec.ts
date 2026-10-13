/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
jest.mock('i18next', () => ({ t: (key: string) => key }));

jest.mock('@plugin/core/project/project-manager', () => ({ ProjectManager: { getInstance: jest.fn(() => ({ projectPath: undefined })) } }));

jest.mock('@plugin/domain/services/system', () => ({ getFiles: jest.fn() }));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import {
  ConfigService,
  runLegacySettingsStep,
  buildLegacySettingsMigrationWritesFromRows,
  mergeLegacyConfigs,
  dedupeLegacyRowsByTypeAndOp,
  readSettingsJsonFile,
  type LegacyConfigRow,
  type LegacySources,
} from '@plugin/service/config-service';
import { getIdeSettingsFilePath } from '@plugin/helpers/ide-config-dir';
import { getFiles } from '@plugin/domain/services/system';

describe('ConfigService settings no-root guards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (ProjectManagerMock().getInstance as jest.Mock).mockReturnValue({ projectPath: undefined });
    vscode.workspace.workspaceFolders = undefined;
  });

  function ProjectManagerMock(): { getInstance: unknown } {
    return jest.requireMock('@plugin/core/project/project-manager').ProjectManager as never;
  }

  it('clearOpDevtoolsWorkspaceSettings warns and returns false without a workspace root', async () => {
    const warnSpy = jest.spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    await expect(ConfigService.clearOpDevtoolsWorkspaceSettings())
      .resolves
      .toBe(false);
    expect(warnSpy)
      .toHaveBeenCalledWith('[clearOpDevtoolsWorkspaceSettings] no workspace root');
    warnSpy.mockRestore();
  });

  it('writeOpDevtoolsDottedSettings warns and returns false without a workspace root', async () => {
    const warnSpy = jest.spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    await expect(ConfigService.writeOpDevtoolsDottedSettings({ 'buildOp.script': 'x' }))
      .resolves
      .toBe(false);
    expect(warnSpy)
      .toHaveBeenCalledWith('[writeOpDevtoolsDottedSettings] no workspace root');
    warnSpy.mockRestore();
  });

  it('filterPendingWritesByCurrentFile keeps every write when there is no workspace root', () => {
    const cfg = vscode.workspace.getConfiguration('op-devtools') as never;

    const filtered = ConfigService.filterPendingWritesByCurrentFile({ 'buildOp.script': 'build.sh' }, cfg);

    expect(filtered)
      .toEqual({ 'buildOp.script': 'build.sh' });
  });

  it('checkDevtoolConfig returns false without any path to check', async () => {
    await expect(new ConfigService()
      .checkDevtoolConfig())
      .resolves
      .toBe(false);
  });
});

describe('ConfigService.filterPendingWritesByCurrentFile', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-cfg-'));
    jest.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  function cfgWithInspect(inspectResult: unknown): vscode.WorkspaceConfiguration {
    return { inspect: jest.fn(() => inspectResult) } as unknown as vscode.WorkspaceConfiguration;
  }

  it('drops writes that are explicitly set in the configuration layer', () => {
    const filtered = ConfigService.filterPendingWritesByCurrentFile(
      { 'buildOp.script': 'build.sh' },
      cfgWithInspect({ workspaceFolderValue: 'explicit' }),
      tmpRoot,
    );

    expect(filtered)
      .toEqual({});
  });

  it('drops writes whose dotted key already exists in settings.json', () => {
    fs.mkdirSync(path.dirname(getIdeSettingsFilePath(tmpRoot)), { recursive: true });
    fs.writeFileSync(
      getIdeSettingsFilePath(tmpRoot),
      JSON.stringify({ 'op-devtools.buildOp.script': 'existing.sh' }),
      'utf8',
    );

    const filtered = ConfigService.filterPendingWritesByCurrentFile(
      { 'buildOp.script': 'build.sh' },
      cfgWithInspect(undefined),
      tmpRoot,
    );

    expect(filtered)
      .toEqual({});
  });

  it('drops undefined values and keeps the rest', () => {
    const filtered = ConfigService.filterPendingWritesByCurrentFile(
      {
        'buildOp.script': undefined,
        'buildOp.targetFile': './build/op',
      },
      cfgWithInspect(undefined),
      tmpRoot,
    );

    expect(filtered)
      .toEqual({ 'buildOp.targetFile': './build/op' });
  });
});

describe('ConfigService.writeBuildOpDeployTarget', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-cfg-'));
    jest.clearAllMocks();
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: tmpRoot } }];
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  it('persists the deploy target under compileAndDeploy.buildConfig', async () => {
    await ConfigService.writeBuildOpDeployTarget('bash deploy.sh');

    const settings = JSON.parse(fs.readFileSync(getIdeSettingsFilePath(tmpRoot), 'utf8')) as Record<string, unknown>;

    expect(settings['op-devtools.compileAndDeploy.buildConfig.deployCommandOrRunCommand'])
      .toBe('bash deploy.sh');
  });
});

describe('ConfigService.remotePathSearch / checkDevtoolConfig', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-cfg-'));
    jest.clearAllMocks();
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: tmpRoot } }];
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  it('remotePathSearch returns the found files with the requested type', async () => {
    (getFiles as jest.Mock).mockReturnValue([
      '/tmp/a.py',
      '/tmp/b.py',
    ]);

    await expect(new ConfigService()
      .remotePathSearch({
        keyword: 'a',
        type: 'python',
      }))
      .resolves
      .toEqual({
        type: 'python',
        list: [
          '/tmp/a.py',
          '/tmp/b.py',
        ],
      });
    expect(getFiles)
      .toHaveBeenCalledWith('a');
  });

  it('checkDevtoolConfig reports the config file presence', async () => {
    fs.mkdirSync(path.join(tmpRoot, '.vscode'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, '.vscode', 'devtool_config.json'), '{}', 'utf8');

    await expect(new ConfigService()
      .checkDevtoolConfig())
      .resolves
      .toBe(true);
  });

  it('checkDevtoolConfig returns false when the config file is missing', async () => {
    await expect(new ConfigService()
      .checkDevtoolConfig())
      .resolves
      .toBe(false);
  });

  it('checkDevtoolConfig returns false when the existence check throws', async () => {
    const existsSyncSpy = jest.spyOn(jest.requireActual('fs'), 'existsSync')
      .mockImplementation(() => {
        throw new Error('EACCES');
      });
    const errorSpy = jest.spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await expect(new ConfigService()
      .checkDevtoolConfig())
      .resolves
      .toBe(false);

    existsSyncSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe('runLegacySettingsStep guards', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-cfg-'));
    process.env.WORKSPACE_FOLDER = tmpRoot;
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.WORKSPACE_FOLDER;
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  it('returns false without a root', async () => {
    await expect(runLegacySettingsStep(undefined))
      .resolves
      .toBe(false);
  });

  it('returns false when no legacy source store exists', async () => {
    await expect(runLegacySettingsStep(tmpRoot))
      .resolves
      .toBe(false);
  });

  it('returns false when the projects store has no rows', async () => {
    const dataDir = path.join(tmpRoot, 'data');

    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'projects.json'), JSON.stringify({ projects: [] }), 'utf8');
    fs.writeFileSync(path.join(dataDir, 'configs.json'), JSON.stringify({ configs: [] }), 'utf8');

    await expect(runLegacySettingsStep(tmpRoot))
      .resolves
      .toBe(false);
  });

  it('returns false when no project row matches the root', async () => {
    const dataDir = path.join(tmpRoot, 'data');

    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(
      path.join(dataDir, 'projects.json'),
      JSON.stringify({
        projects: [
          {
            id: 1,
            project_path: '/somewhere/else',
          },
        ],
      }),
      'utf8',
    );
    fs.writeFileSync(path.join(dataDir, 'configs.json'), JSON.stringify({ configs: [] }), 'utf8');

    await expect(runLegacySettingsStep(tmpRoot))
      .resolves
      .toBe(false);
  });

  it('tolerates a corrupt projects store (readJsonFile catch)', async () => {
    const warnSpy = jest.spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const dataDir = path.join(tmpRoot, 'data');

    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'projects.json'), '{ not json', 'utf8');

    await expect(runLegacySettingsStep(tmpRoot))
      .resolves
      .toBe(false);
    expect(warnSpy)
      .toHaveBeenCalledWith('[readJsonFile] failed:', expect.anything(), expect.any(Error));
    warnSpy.mockRestore();
  });

  it('returns false when an unexpected error is thrown inside the step', async () => {
    const warnSpy = jest.spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const dataDir = path.join(tmpRoot, 'data');

    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(
      path.join(dataDir, 'projects.json'),
      JSON.stringify({
        projects: [
          {
            id: 1,
            project_path: tmpRoot,
            ascend_env_script: '/etc/profile',
          },
        ],
      }),
      'utf8',
    );
    fs.writeFileSync(path.join(dataDir, 'configs.json'), JSON.stringify({ configs: [] }), 'utf8');
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      inspect: jest.fn(() => {
        throw new Error('inspect exploded');
      }),
    });

    await expect(runLegacySettingsStep(tmpRoot))
      .resolves
      .toBe(false);
    expect(warnSpy)
      .toHaveBeenCalledWith('[runLegacySettingsStep] failed:', tmpRoot, expect.any(Error));
    warnSpy.mockRestore();
  });
});

describe('buildLegacySettingsMigrationWritesFromRows mapping details', () => {
  function row(configType: string, userOptions: Record<string, unknown>): Record<string, unknown> {
    return {
      id: 0,
      config_type: configType,
      user_options: userOptions,
    };
  }

  it('normalizes a whitespace-padded execution mode', () => {
    const writes = buildLegacySettingsMigrationWritesFromRows(
      [
        row('build_op', { op: 'add' }),
        row('build_example', { execution_mode: ' eager ' }),
      ],
      [],
      '',
    );

    expect(writes['compileAndDeploy.exampleBuildConfig.executionMode'])
      .toBe('eager');
  });

  it('defaults the example execution mode to eager when the row has none', () => {
    const writes = buildLegacySettingsMigrationWritesFromRows(
      [
        row('build_op', { op: 'add' }),
        row('build_example', { script: 'run.sh' }),
      ],
      [],
      '',
    );

    expect(writes['compileAndDeploy.exampleBuildConfig.executionMode'])
      .toBe('eager');
  });

  it('maps a padded graph execution mode to the graph value', () => {
    const writes = buildLegacySettingsMigrationWritesFromRows(
      [
        row('build_op', { op: 'add' }),
        row('build_example', { execution_mode: ' graph ' }),
      ],
      [],
      '',
    );

    expect(writes['compileAndDeploy.exampleBuildConfig.executionMode'])
      .toBe('graph');
  });

  it('maps advance_param rows into a key/value map, skipping nameless entries', () => {
    const writes = buildLegacySettingsMigrationWritesFromRows(
      [
        row('build_op', { op: 'add' }),
        row('simulate', {
          script: 'sim.sh',
          advance_param: [
            {
              name: 'iter',
              value: 3,
            },
            {
              name: 'mem',
              value: null,
            },
            { name: '   ' },
            'not-an-object',
          ],
        }),
      ],
      [],
      '',
    );

    expect(writes['performanceTuning.simulation.parameters'])
      .toEqual({
        iter: '3',
        mem: '',
      });
  });

  it('maps a non-array advance_param to an empty parameters map', () => {
    const writes = buildLegacySettingsMigrationWritesFromRows(
      [
        row('build_op', { op: 'add' }),
        row('simulate', { advance_param: 'oops' }),
      ],
      [],
      '',
    );

    expect(writes['performanceTuning.simulation.parameters'])
      .toEqual({});
  });

  it('sets operatorMetrics true only when every metric flag is enabled', () => {
    const allOn = buildLegacySettingsMigrationWritesFromRows(
      [
        row('build_op', { op: 'add' }),
        row('on_board', {
          script: 'ob.sh',
          ArithmeticUtilization: true,
          L2Cache: true,
          Memory: true,
          MemoryL0: true,
          MemoryUB: true,
          PipeUtilization: true,
          ResourceConflictRatio: true,
        }),
      ],
      [],
      '',
    );

    expect(allOn['performanceTuning.onBoard.operatorMetrics'])
      .toBe(true);

    const oneOff = buildLegacySettingsMigrationWritesFromRows(
      [
        row('build_op', { op: 'add' }),
        row('on_board', {
          script: 'ob.sh',
          ArithmeticUtilization: true,
          L2Cache: true,
          Memory: true,
          MemoryL0: true,
          MemoryUB: true,
          PipeUtilization: false,
          ResourceConflictRatio: true,
        }),
      ],
      [],
      '',
    );

    expect(oneOff['performanceTuning.onBoard.operatorMetrics'])
      .toBe(false);
  });

  it('passes the operatorMetrics boolean through onBoardUserOptionsToDottedWrites', () => {
    const writes = buildLegacySettingsMigrationWritesFromRows(
      [
        row('build_op', { op: 'add' }),
        row('on_board', {
          script: 'ob.sh',
          operatorMetrics: false,
        }),
      ],
      [],
      '',
    );

    expect(writes['performanceTuning.onBoard.operatorMetrics'])
      .toBe(false);
  });

  it('resolves the sanitizer detection scope and block id from useBlock', () => {
    // A non-boolean useBlock falls back to the global scope.
    const writes = buildLegacySettingsMigrationWritesFromRows(
      [row('build_op', { op: 'add' })],
      [row('sanitizer', { useBlock: 'yes' })],
      '',
    );

    expect(writes['sanitizer.detectionScope'])
      .toBe('global');

    // A boolean useBlock maps to singleBlock/global and keeps the block id.
    const blockWrites = buildLegacySettingsMigrationWritesFromRows(
      [row('build_op', { op: 'add' })],
      [
        row('sanitizer', {
          useBlock: true,
          blockId: 7,
        }),
      ],
      '',
    );

    expect(blockWrites['sanitizer.detectionScope'])
      .toBe('singleBlock');
    expect(blockWrites['sanitizer.blockId'])
      .toBe(7);
  });

  it('uses the empty environment script string verbatim for missing rows', () => {
    const writes = buildLegacySettingsMigrationWritesFromRows([], [], '');

    expect(writes['environment.environmentScript'])
      .toBe('');
  });
});

describe('ConfigService.readSettingsJsonFile', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-cfg-'));
    jest.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  function writeSettings(content: string): void {
    fs.mkdirSync(path.dirname(getIdeSettingsFilePath(tmpRoot)), { recursive: true });
    fs.writeFileSync(getIdeSettingsFilePath(tmpRoot), content, 'utf8');
  }

  it('parses plain JSON and flattens the nested op-devtools root', () => {
    writeSettings('{"op-devtools": {"projectType": "cann"}, "editor.tabSize": 2}');

    expect(readSettingsJsonFile(getIdeSettingsFilePath(tmpRoot)))
      .toEqual({
        'op-devtools.projectType': 'cann',
        'editor.tabSize': 2,
      });
  });

  it('strips a UTF-8 BOM before parsing', () => {
    writeSettings('﻿{"op-devtools.projectType": "triton"}');

    expect(readSettingsJsonFile(getIdeSettingsFilePath(tmpRoot))['op-devtools.projectType'])
      .toBe('triton');
  });

  it('returns an empty object for a whitespace-only file', () => {
    writeSettings('   \n\t  ');

    expect(readSettingsJsonFile(getIdeSettingsFilePath(tmpRoot)))
      .toEqual({});
  });

  it('falls back to a JSONC-tolerant parse when strict JSON parsing fails', () => {
    writeSettings('{"op-devtools": {"projectType": "cann"},} // trailing comma');

    expect(readSettingsJsonFile(getIdeSettingsFilePath(tmpRoot))['op-devtools.projectType'])
      .toBe('cann');
  });

  it('returns an empty object when neither JSON nor JSONC parsing succeeds', () => {
    writeSettings('{ not json at all');

    expect(readSettingsJsonFile(getIdeSettingsFilePath(tmpRoot)))
      .toEqual({});
  });

  it('returns an empty object and warns when the file cannot be read', () => {
    writeSettings('{"op-devtools.projectType": "cann"}');
    const readSpy = jest.spyOn(jest.requireActual('fs'), 'readFileSync')
      .mockImplementationOnce(() => {
        throw new Error('EACCES');
      });
    const warnSpy = jest.spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    expect(readSettingsJsonFile(getIdeSettingsFilePath(tmpRoot)))
      .toEqual({});
    expect(warnSpy)
      .toHaveBeenCalledWith('[readSettingsJsonFile] failed:', getIdeSettingsFilePath(tmpRoot), expect.any(Error));
    readSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

describe('ConfigService.clearOpDevtoolsWorkspaceSettings with a root', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-cfg-'));
    jest.clearAllMocks();
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: tmpRoot } }];
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  it('returns false when settings.json does not exist', async () => {
    await expect(ConfigService.clearOpDevtoolsWorkspaceSettings())
      .resolves
      .toBe(false);
  });
});

describe('ConfigService.writeOpDevtoolsDottedSettings delete and default arguments', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-cfg-'));
    jest.clearAllMocks();
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: tmpRoot } }];
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  it('deletes a stored key when the update value is undefined (prefixed key passes through)', async () => {
    const settingsPath = getIdeSettingsFilePath(tmpRoot);

    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        'op-devtools.buildOp.script': 'old.sh',
        'op-devtools.buildOp.targetFile': 'run.sh',
      }),
      'utf8',
    );

    const changed = await ConfigService.writeOpDevtoolsDottedSettings({ 'op-devtools.buildOp.script': undefined });

    expect(changed)
      .toBe(true);

    const stored = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;

    expect(stored['op-devtools.buildOp.script'])
      .toBeUndefined();
    expect(stored['op-devtools.buildOp.targetFile'])
      .toBe('run.sh');
  });

  it('is a no-op when called with no updates (default argument)', async () => {
    await expect(ConfigService.writeOpDevtoolsDottedSettings())
      .resolves
      .toBe(false);
  });
});

describe('ConfigService.filterPendingWritesByCurrentFile workspace-scope inspection', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-cfg-'));
    jest.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  it('drops writes explicitly set at the workspace scope', () => {
    const cfg = { inspect: jest.fn(() => ({ workspaceValue: 'explicit' })) } as unknown as vscode.WorkspaceConfiguration;

    expect(ConfigService.filterPendingWritesByCurrentFile({ 'buildOp.script': 'build.sh' }, cfg, tmpRoot))
      .toEqual({});
  });
});

describe('ConfigService.mergeLegacyConfigs / dedupeLegacyRowsByTypeAndOp', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-cfg-'));
    jest.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  function hostRows(): LegacyConfigRow[] {
    return [
      {
        id: 1,
        config_type: 'build_op',
      },
      {
        id: 2,
        config_type: 'simulate',
      },
    ];
  }

  function sources(configsFile: string, workspaceConfigsFile: string): LegacySources {
    return {
      configsFile,
      workspaceConfigsFile,
    } as LegacySources;
  }

  it('merges host rows first and drops workspace rows with colliding ids', () => {
    const configsFile = path.join(tmpRoot, 'configs.json');
    const workspaceConfigsFile = path.join(tmpRoot, 'workspace-configs.json');

    fs.writeFileSync(configsFile, JSON.stringify({ configs: hostRows() }), 'utf8');
    fs.writeFileSync(
      workspaceConfigsFile,
      JSON.stringify({
        configs: [
          {
            id: 2,
            config_type: 'on_board',
          },
          {
            id: 3,
            config_type: 'sanitizer',
          },
        ],
      }),
      'utf8',
    );

    const merged = mergeLegacyConfigs(sources(configsFile, workspaceConfigsFile));

    expect(merged.map((row) => row.id))
      .toEqual([
        1,
        2,
        3,
      ]);
  });

  it('treats a missing host store as an empty store', () => {
    const configsFile = path.join(tmpRoot, 'missing-configs.json');
    const workspaceConfigsFile = path.join(tmpRoot, 'workspace-configs.json');

    fs.writeFileSync(workspaceConfigsFile, JSON.stringify({ configs: [{ id: 5 }] }), 'utf8');

    expect(mergeLegacyConfigs(sources(configsFile, workspaceConfigsFile))
      .map((row) => row.id))
      .toEqual([5]);
  });

  it('treats a missing workspace store as an empty store', () => {
    const configsFile = path.join(tmpRoot, 'configs.json');
    const workspaceConfigsFile = path.join(tmpRoot, 'missing-workspace-configs.json');

    fs.writeFileSync(configsFile, JSON.stringify({ configs: hostRows() }), 'utf8');

    expect(mergeLegacyConfigs(sources(configsFile, workspaceConfigsFile))
      .map((row) => row.id))
      .toEqual([
        1,
        2,
      ]);
  });

  it('treats an empty-raw workspace store as an empty store', () => {
    const configsFile = path.join(tmpRoot, 'configs.json');
    const workspaceConfigsFile = path.join(tmpRoot, 'empty-workspace-configs.json');

    fs.writeFileSync(configsFile, JSON.stringify({ configs: hostRows() }), 'utf8');
    fs.writeFileSync(workspaceConfigsFile, '   ', 'utf8');

    expect(mergeLegacyConfigs(sources(configsFile, workspaceConfigsFile))
      .map((row) => row.id))
      .toEqual([
        1,
        2,
      ]);
  });

  it('dedupes by (config_type, op) first-wins and tolerates missing fields', () => {
    const rows: LegacyConfigRow[] = [
      {
        id: 1,
        config_type: 'build_op',
        user_options: { op: 'add' },
      },
      {
        id: 2,
        config_type: 'build_op',
        user_options: { op: 'add' },
      },
      {
        id: 3,
        config_type: 'simulate',
      },
      {
        id: 4,
        user_options: { op: 'mul' },
      },
      {
        id: 5,
        config_type: 'on_board',
      },
    ];

    const deduped = dedupeLegacyRowsByTypeAndOp(rows);

    expect(deduped.map((row) => row.id))
      .toEqual([
        1,
        3,
        4,
        5,
      ]);
  });
});
