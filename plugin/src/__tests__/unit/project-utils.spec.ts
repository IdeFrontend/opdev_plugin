/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import fs from 'fs-extra';
import os from 'os';
import path from 'path';

jest.mock('i18next', () => ({ t: (key: string) => key }));
jest.mock('child_process', () => ({
  exec: jest.fn(),
  execSync: jest.fn(),
}));
jest.mock('@plugin/domain/utils/npu-hardware-probe', () => ({ startNpuHardwareProbe: jest.fn() }));
jest.mock('@plugin/helpers/remote-command', () => ({ getRemoteToolHost: jest.fn() }));
jest.mock('@plugin/domain/utils/msdebug-ide-settings', () => {
  const actual = jest.requireActual('@plugin/domain/utils/msdebug-ide-settings');

  return {
    ...actual,
    ensureMsdebugBreakpointFileAssociations: jest.fn(actual.ensureMsdebugBreakpointFileAssociations),
  };
});
jest.mock('@plugin/domain/utils/msdebug-env', () => {
  const actual = jest.requireActual('@plugin/domain/utils/msdebug-env');

  return {
    ...actual,
    ensureMsdebugLibInEnvFile: jest.fn(actual.ensureMsdebugLibInEnvFile),
  };
});

import { exec } from 'child_process';
import {
  ensureLaunchJsonExists,
  getDefaultDirectory,
  viewIdToProjectType,
} from '@plugin/domain/utils/project-utils';
import { ensureMsdebugBreakpointFileAssociations } from '@plugin/domain/utils/msdebug-ide-settings';
import { ensureMsdebugLibInEnvFile } from '@plugin/domain/utils/msdebug-env';
import { getRemoteToolHost } from '@plugin/helpers/remote-command';
import { OperatorProjectViewId } from '@shared/project-type-view-id';

describe('ensureLaunchJsonExists', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    jest.clearAllMocks();
    (exec as jest.Mock).mockImplementation((_cmd: unknown, _opts: unknown, callback: (error: Error | null, result?: { stdout?: string })=> void) =>
      callback(null, {
        stdout: '',
        stderr: '',
      }));
    (getRemoteToolHost as jest.Mock).mockResolvedValue(undefined);
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'project-utils-'));
  });

  afterEach(() => {
    fs.removeSync(workspaceRoot);
  });

  it('skips config creation when op_path is missing', async () => {
    await ensureLaunchJsonExists(undefined);

    expect(fs.existsSync(path.join(workspaceRoot, '.vscode')))
      .toBe(false);
    expect(exec).not.toHaveBeenCalled();
  });

  it('skips config creation when op_path is not a string', async () => {
    await ensureLaunchJsonExists(42 as unknown as string);

    expect(fs.existsSync(path.join(workspaceRoot, '.vscode')))
      .toBe(false);
    expect(exec).not.toHaveBeenCalled();
  });

  it('throws InvalidRequest when the project directory does not exist', async () => {
    const missingDir = path.join(workspaceRoot, 'not-there');

    await expect(ensureLaunchJsonExists(missingDir))
      .rejects.toMatchObject({
        name: 'InvalidRequest',
        message: 'project.projectDirNotExist',
      });
  });

  it('keeps an existing devtool_config.json and only ensures file associations', async () => {
    fs.mkdirSync(path.join(workspaceRoot, '.vscode'), { recursive: true });
    fs.writeFileSync(
      path.join(workspaceRoot, '.vscode', 'devtool_config.json'),
      JSON.stringify({ type: '2' }),
    );

    await ensureLaunchJsonExists(workspaceRoot, '2');

    expect(JSON.parse(fs.readFileSync(path.join(workspaceRoot, '.vscode', 'devtool_config.json'), 'utf8')))
      .toEqual({ type: '2' });
    expect(fs.existsSync(path.join(workspaceRoot, '.vscode', 'launch.json')))
      .toBe(false);
    expect(fs.existsSync(path.join(workspaceRoot, '.vscode', 'settings.json')))
      .toBe(true);
    expect(exec).not.toHaveBeenCalled();
  });

  it('tolerates file-association failures on the existing-config path', async () => {
    fs.mkdirSync(path.join(workspaceRoot, '.vscode'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, '.vscode', 'devtool_config.json'), '{}');
    (ensureMsdebugBreakpointFileAssociations as jest.Mock).mockRejectedValueOnce(new Error('boom'));

    await expect(ensureLaunchJsonExists(workspaceRoot)).resolves.toBeUndefined();
  });

  it('creates devtool_config.json and launch.json and updates the remote-debug host', async () => {
    (getRemoteToolHost as jest.Mock).mockResolvedValue('10.0.0.8');

    await ensureLaunchJsonExists(workspaceRoot, '1');

    const devtoolConfig = JSON.parse(fs.readFileSync(path.join(workspaceRoot, '.vscode', 'devtool_config.json'), 'utf8'));

    expect(devtoolConfig)
      .toEqual({ type: '1' });

    const launchJson = JSON.parse(fs.readFileSync(path.join(workspaceRoot, '.vscode', 'launch.json'), 'utf8')) as { configurations: Array<{ name: string;
      remoteConfig?: { host: string;
        remoteWorkspaceFolder: string } }> };

    expect(launchJson.configurations.find((c) => c.name === 'remote-debug')?.remoteConfig)
      .toEqual({
        host: '10.0.0.8',
        port: 55555,
        remoteWorkspaceFolder: workspaceRoot,
      });
    expect(exec)
      .toHaveBeenCalled();
  });

  it('keeps the remote-debug host empty when no remote host is configured', async () => {
    (getRemoteToolHost as jest.Mock).mockResolvedValue(undefined);

    await ensureLaunchJsonExists(workspaceRoot);

    const launchJson = JSON.parse(fs.readFileSync(path.join(workspaceRoot, '.vscode', 'launch.json'), 'utf8')) as { configurations: Array<{ name: string;
      remoteConfig?: { host: string } }> };

    expect(launchJson.configurations.find((c) => c.name === 'remote-debug')?.remoteConfig?.host)
      .toBe('');
  });

  it('tolerates a failed remote-debug update but still exports the environment', async () => {
    (getRemoteToolHost as jest.Mock).mockRejectedValueOnce(new Error('no remote tool'));

    await expect(ensureLaunchJsonExists(workspaceRoot)).resolves.toBeUndefined();

    expect(fs.existsSync(path.join(workspaceRoot, '.vscode', 'launch.json')))
      .toBe(true);
  });

  it('keeps an existing launch.json when creating devtool_config.json', async () => {
    fs.mkdirSync(path.join(workspaceRoot, '.vscode'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, '.vscode', 'launch.json'), '{"keep":true}');

    await ensureLaunchJsonExists(workspaceRoot);

    expect(fs.readFileSync(path.join(workspaceRoot, '.vscode', 'launch.json'), 'utf8'))
      .toBe('{"keep":true}');
  });

  it('tolerates file-association failures during creation', async () => {
    (ensureMsdebugBreakpointFileAssociations as jest.Mock).mockRejectedValueOnce(new Error('boom'));

    await expect(ensureLaunchJsonExists(workspaceRoot)).resolves.toBeUndefined();

    expect(fs.existsSync(path.join(workspaceRoot, '.vscode', 'launch.json')))
      .toBe(true);
  });

  it('tolerates an environment export failure', async () => {
    (exec as jest.Mock).mockImplementation((_cmd: unknown, _opts: unknown, callback: (error: Error | null)=> void) =>
      callback(new Error('bash unavailable')));

    await expect(ensureLaunchJsonExists(workspaceRoot)).resolves.toBeUndefined();

    expect(fs.existsSync(path.join(workspaceRoot, '.vscode', 'launch.json')))
      .toBe(true);
  });

  it('tolerates a failed msdebug lib splice inside the environment export', async () => {
    (ensureMsdebugLibInEnvFile as jest.Mock).mockRejectedValueOnce(new Error('read failed'));

    await expect(ensureLaunchJsonExists(workspaceRoot)).resolves.toBeUndefined();
  });
});

describe('getDefaultDirectory', () => {
  it('joins the home directory with the downloads folder name', () => {
    expect(getDefaultDirectory())
      .toBe(path.join(os.homedir(), 'OpDevtoolsDownloads'));
  });
});

describe('viewIdToProjectType', () => {
  const cases: Array<[string | number | undefined, string]> = [
    [
      undefined,
      'cann',
    ],
    [
      OperatorProjectViewId.CANN,
      'cann',
    ],
    [
      OperatorProjectViewId.STANDARD_CUSTOM,
      'ascend',
    ],
    [
      OperatorProjectViewId.PYASC,
      'pyasc',
    ],
    [
      OperatorProjectViewId.TRITON,
      'triton',
    ],
    [
      'standard-custom',
      'ascend',
    ],
    [
      'ascend-c',
      'cann',
    ],
    [
      'torch-library',
      'cann',
    ],
    [
      'pyasc',
      'pyasc',
    ],
    [
      'triton',
      'triton',
    ],
    [
      'cann',
      'cann',
    ],
    [
      'unknown-id',
      'cann',
    ],
  ];

  it.each(cases)('maps %s to %s', (id, expected) => {
    expect(viewIdToProjectType(id))
      .toBe(expected);
  });
});
