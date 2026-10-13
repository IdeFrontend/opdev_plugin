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

jest.mock('@plugin/domain/utils/ascend-util', () => ({ resolveAscendEnv: jest.fn() }));

jest.mock('@plugin/domain/services/profiler-service', () => ({ ProfilerFactory: { getStrategy: jest.fn() } }));

jest.mock('@plugin/service/config-service', () => ({ ConfigService: { readBuildOpDeployTargetFromWorkspace: jest.fn() } }));

jest.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
    getConfiguration: jest.fn(() => ({ get: jest.fn() })),
  },
}), { virtual: true });

jest.mock('fs', () => ({ existsSync: jest.fn(() => false) }));

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  buildPythonDeployTarget,
  buildPythonOnBoardCommand,
  buildPythonOperatorCommandContext,
  buildPythonSimulateCommand,
  getPythonRunTargetFile,
  normalizePythonCommandInterpreter,
  quoteShellTokenIfNeeded,
  resolveProfilerOperatorOrThrow,
  resolvePythonExecutablePath,
} from '@plugin/domain/services/command-strategy/python-operator-strategy-shared';
import { ProfilerFactory } from '@plugin/domain/services/profiler-service';
import { ConfigService } from '@plugin/service/config-service';
import { resolveAscendEnv } from '@plugin/domain/utils/ascend-util';

const workspaceFoldersMock = vscode.workspace as unknown as {
  workspaceFolders?: Array<{ uri: { fsPath: string } }>;
  getConfiguration: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
  (fs.existsSync as jest.Mock).mockImplementation(() => false);
  workspaceFoldersMock.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
  workspaceFoldersMock.getConfiguration.mockImplementation(() => ({ get: jest.fn() }));
  (ProfilerFactory.getStrategy as jest.Mock).mockReturnValue({ generate: jest.fn(() => 'GEN') });
  (resolveAscendEnv as jest.Mock).mockReturnValue({ socVersion: 'ascend910b' });
  (ConfigService.readBuildOpDeployTargetFromWorkspace as jest.Mock).mockReturnValue(undefined);
});

describe('python-operator-strategy-shared shell quoting', () => {
  describe('quoteShellTokenIfNeeded', () => {
    it('quotes paths with spaces', () => {
      expect(quoteShellTokenIfNeeded('operator copy.py'))
        .toBe("'operator copy.py'");
    });

    it('leaves plain paths unquoted', () => {
      expect(quoteShellTokenIfNeeded('./foo.py'))
        .toBe('./foo.py');
    });
  });

  describe('buildPythonDeployTarget', () => {
    it('quotes relative paths with spaces', () => {
      expect(buildPythonDeployTarget('operator copy.py'))
        .toBe("python3 'operator copy.py'");
    });
  });

  describe('normalizePythonCommandInterpreter', () => {
    it('quotes script path with spaces', () => {
      expect(normalizePythonCommandInterpreter('python3 operator copy.py'))
        .toBe("python3 'operator copy.py'");
    });

    it('leaves plain script paths unquoted', () => {
      expect(normalizePythonCommandInterpreter('python3 ./foo.py'))
        .toBe('python3 ./foo.py');
    });
  });
});

describe('buildPythonOperatorCommandContext', () => {
  it('uses the operator op_path and sources the ascend env script', () => {
    const context = buildPythonOperatorCommandContext({
      config: { script: 'build.sh' } as never,
      project: {
        project_name: 'proj',
        project_path: '/projects/proj',
        ascend_env_script: '/opt/env.sh',
      },
      operator: {
        op_path: '/projects/proj/op1',
        op_name: 'op1',
      } as never,
      op: 'op1',
    });

    expect(context.sourceCannCmd)
      .toBe('. /opt/env.sh');
    expect(context.cdCmd)
      .toBe('cd /projects/proj/op1');
    expect(context.cdBuildCmd)
      .toBe('cd /projects/proj/op1');
  });

  it('leaves sourceCannCmd empty when the project has no ascend env script', () => {
    const context = buildPythonOperatorCommandContext({
      config: { script: 'build.sh' } as never,
      project: {
        project_name: 'proj',
        project_path: '/projects/proj',
        ascend_env_script: null,
      },
      operator: {
        op_path: '/projects/proj/op1',
        op_name: 'op1',
      } as never,
      op: 'op1',
    });

    expect(context.sourceCannCmd)
      .toBe('');
  });

  it('leaves sourceCannCmd empty when the project is missing', () => {
    const context = buildPythonOperatorCommandContext({
      config: { script: 'build.sh' } as never,
      project: null,
      operator: {
        op_path: '/projects/proj/op1',
        op_name: 'op1',
      } as never,
      op: 'op1',
    });

    expect(context.sourceCannCmd)
      .toBe('');
    expect(context.cdCmd)
      .toBe('cd /projects/proj/op1');
  });

  it('falls back to the project path when only config.script and project exist', () => {
    const context = buildPythonOperatorCommandContext({
      config: { script: 'build.sh' } as never,
      project: {
        project_name: 'proj',
        project_path: '/projects/proj',
      },
      operator: null,
      op: 'op1',
    });

    expect(context.cdCmd)
      .toBe('cd /projects/proj');
  });

  it('throws when neither operator nor config.script is available', () => {
    expect(() => buildPythonOperatorCommandContext({
      config: { script: '' } as never,
      project: {
        project_name: 'proj',
        project_path: '/projects/proj',
      },
      operator: null,
      op: 'op1',
    }))
      .toThrow('Operator not found: op1');
  });

  it('throws when config.script is present but the project is missing', () => {
    expect(() => buildPythonOperatorCommandContext({
      config: { script: 'build.sh' } as never,
      project: null,
      operator: null,
      op: 'op1',
    }))
      .toThrow('Operator not found: op1');
  });
});

describe('resolveProfilerOperatorOrThrow', () => {
  it('returns the operator row when present', () => {
    const operator = {
      op_path: '/projects/proj/op1',
      op_name: 'op1',
    } as never;

    expect(resolveProfilerOperatorOrThrow('op1', null, operator, 'ascend', 'cann.cannotGenerateSimulateCommand'))
      .toBe(operator);
  });

  it('throws the missing-project key when no operator and no project path exist', () => {
    expect(() => resolveProfilerOperatorOrThrow('op1', { project_name: 'p' } as never, null, 'ascend', 'cann.cannotGenerateSimulateCommand'))
      .toThrow('cann.cannotGenerateSimulateCommand');
  });

  it('synthesizes an operator row from the project', () => {
    const synthesized = resolveProfilerOperatorOrThrow('op1', {
      project_name: 'proj',
      project_path: '/projects/proj',
    }, null, 'pyasc', 'cann.cannotGenerateSimulateCommand');

    expect(synthesized)
      .toEqual({
        op_name: 'op1',
        op_type: 'pyasc',
        op_path: '/projects/proj',
      });
  });
});

describe('resolvePythonExecutablePath', () => {
  it('returns python3 when no workspace folder is present', () => {
    workspaceFoldersMock.workspaceFolders = undefined;

    expect(resolvePythonExecutablePath())
      .toBe('python3');
  });

  it('returns the configured defaultInterpreterPath when it exists', () => {
    workspaceFoldersMock.getConfiguration.mockImplementation(() => ({ get: jest.fn((key: string) => (key === 'defaultInterpreterPath' ? '/opt/python3' : undefined)) }));
    (fs.existsSync as jest.Mock).mockImplementation((p: string) => p === '/opt/python3');

    expect(resolvePythonExecutablePath())
      .toBe('/opt/python3');
  });

  it('falls back to the venv python when the configured interpreter does not exist', () => {
    workspaceFoldersMock.getConfiguration.mockImplementation(() => ({ get: jest.fn(() => '/opt/missing-python') }));
    const venvPython = path.join('/workspace', '.venv', 'Scripts', 'python.exe');

    (fs.existsSync as jest.Mock).mockImplementation((p: string) => p === venvPython);

    expect(resolvePythonExecutablePath())
      .toBe(venvPython);
  });

  it('returns python3 when no interpreter or venv is found', () => {
    expect(resolvePythonExecutablePath())
      .toBe('python3');
  });

  it('returns python3 when reading the configuration throws', () => {
    workspaceFoldersMock.getConfiguration.mockImplementation(() => {
      throw new Error('boom');
    });

    expect(resolvePythonExecutablePath())
      .toBe('python3');
  });

  it('prefers the unix venv layout on non-Windows platforms', () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    const venvPython = path.join('/workspace', '.venv', 'bin', 'python');

    try {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      (fs.existsSync as jest.Mock).mockImplementation((p: string) => p === venvPython);

      expect(resolvePythonExecutablePath())
        .toBe(venvPython);
    }
    finally {
      Object.defineProperty(process, 'platform', originalPlatform!);
    }
  });
});

describe('normalizePythonCommandInterpreter edge cases', () => {
  it('returns an empty string for an empty command', () => {
    expect(normalizePythonCommandInterpreter(''))
      .toBe('');
  });

  it('returns an empty string for a nullish command', () => {
    expect(normalizePythonCommandInterpreter(undefined as unknown as string))
      .toBe('');
  });

  it('leaves non-python commands unchanged', () => {
    expect(normalizePythonCommandInterpreter('bash ./run.sh'))
      .toBe('bash ./run.sh');
  });

  it('rewrites python.exe commands to the resolved interpreter', () => {
    expect(normalizePythonCommandInterpreter('python.exe run.py'))
      .toBe('python3 run.py');
  });

  it('quotes the resolved interpreter when it contains spaces', () => {
    workspaceFoldersMock.getConfiguration.mockImplementation(() => ({ get: jest.fn((key: string) => (key === 'defaultInterpreterPath' ? '/Program Files/python3' : undefined)) }));
    (fs.existsSync as jest.Mock).mockImplementation((p: string) => p === '/Program Files/python3');

    expect(normalizePythonCommandInterpreter('python3 run.py'))
      .toBe("'/Program Files/python3' run.py");
  });
});

describe('buildPythonSimulateCommand', () => {
  const baseParams = {
    config: { script: 'build.sh' } as never,
    project: {
      project_name: 'proj',
      project_path: '/projects/proj',
      ascend_env_script: '/opt/env.sh',
    },
    operator: {
      op_path: '/projects/proj/op1',
      op_name: 'op1',
    } as never,
    cdBuildCmd: 'cd /projects/proj/op1',
    cdCmd: 'cd /projects/proj/op1',
    sourceCannCmd: '. /opt/env.sh',
    exampleTargetFile: 'run.py',
    op: 'op1',
  };

  it('joins the source, cd and simulator commands for the given operator', () => {
    const command = buildPythonSimulateCommand(baseParams, 'ascend');

    expect(ProfilerFactory.getStrategy)
      .toHaveBeenCalledWith('simulator');
    expect(ProfilerFactory.getStrategy('simulator').generate)
      .toHaveBeenCalledWith(baseParams.config, baseParams.operator, 'run.py');
    expect(command)
      .toBe('. /opt/env.sh && cd /projects/proj/op1 && GEN');
  });

  it('synthesizes an operator row when the operator is missing', () => {
    const command = buildPythonSimulateCommand({
      ...baseParams,
      operator: null,
    }, 'pyasc');

    expect(ProfilerFactory.getStrategy('simulator').generate)
      .toHaveBeenCalledWith(baseParams.config, {
        op_name: 'op1',
        op_type: 'pyasc',
        op_path: '/projects/proj',
      }, 'run.py');
    expect(command)
      .toContain('GEN');
  });

  it('throws when no operator and no project path exist', () => {
    expect(() => buildPythonSimulateCommand({
      ...baseParams,
      operator: null,
      project: { project_name: 'proj' } as never,
    }, 'ascend'))
      .toThrow('cann.cannotGenerateSimulateCommand');
  });
});

describe('buildPythonOnBoardCommand', () => {
  const baseParams = {
    config: { script: 'run.sh' } as never,
    project: {
      project_name: 'proj',
      project_path: '/projects/proj',
    },
    operator: {
      op_path: '/projects/proj/op1',
      op_name: 'op1',
    } as never,
    cdBuildCmd: 'cd /projects/proj/op1',
    cdCmd: 'cd /projects/proj/op1',
    sourceCannCmd: '',
    exampleTargetFile: 'run.py',
    op: 'op1',
  };

  it('joins the source, cd and onboard commands with the cann soc', () => {
    const command = buildPythonOnBoardCommand(baseParams, 'cann');

    expect(resolveAscendEnv)
      .toHaveBeenCalledWith({ isSimulator: false });
    expect(ProfilerFactory.getStrategy)
      .toHaveBeenCalledWith('onboard');
    expect(ProfilerFactory.getStrategy('onboard').generate)
      .toHaveBeenCalledWith(baseParams.config, baseParams.operator, 'run.py', { onboardCannSoc: 'ascend910b' });
    expect(command)
      .toBe('cd /projects/proj/op1 && GEN');
  });

  it('throws when no operator and no project path exist', () => {
    expect(() => buildPythonOnBoardCommand({
      ...baseParams,
      operator: null,
      project: null,
    }, 'cann'))
      .toThrow('cann.cannotGenerateOnBoardCommand');
  });
});

describe('getPythonRunTargetFile', () => {
  it('returns the workspace deploy target', () => {
    (ConfigService.readBuildOpDeployTargetFromWorkspace as jest.Mock).mockReturnValue('python3 ./run.py');

    expect(getPythonRunTargetFile())
      .toBe('python3 ./run.py');
  });

  it('returns an empty string when no deploy target is configured', () => {
    expect(getPythonRunTargetFile())
      .toBe('');
  });
});
