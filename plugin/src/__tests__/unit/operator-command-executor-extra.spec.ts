/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

jest.mock('@plugin/core/project/project-manager', () => ({ ProjectManager: { getInstance: jest.fn() } }));

jest.mock('@plugin/helpers/operator-project-workspace-config', () => ({
  getConfiguredValue: jest.fn(() => undefined),
  getOpDevtoolsWorkspaceConfiguration: jest.fn(() => ({
    inspect: jest.fn(() => undefined),
    get: jest.fn(),
  })),

  getWorkspaceSimulatorType: jest.fn(() => ''),
  getSocVersionWithWorkspaceOverride: jest.fn(() => 'ascend950'),
  readWorkspaceProjectTypeSetting: jest.fn(() => undefined),
}));

jest.mock('@plugin/domain/utils/global-env-snapshot', () => ({
  getGlobalEnvSnapshot: jest.fn(() => ({
    socVersion: undefined,
    simulatorType: undefined,
    npuArch: undefined,
    ascendEnvScript: undefined,
  })),
}));

jest.mock('@plugin/domain/models/project-model', () => ({
  getProjectByPath: jest.fn(() => ({
    project_type: 'ascend-c',
    project_path: '/ws',
  }))
    .mockName('getProjectByPath'),
}));

jest.mock('@plugin/domain/models/op-record', () => ({ resolveOpRecord: jest.fn(() => undefined) }));

jest.mock('@plugin/service/config-service', () => ({ ConfigService: { readOpDevtoolsSetting: jest.fn(() => undefined) } }));

jest.mock('@plugin/helpers/ascend-soc-warning', () => ({ maybeWarnSocNotDetected: jest.fn(async () => 'continue') }));

jest.mock('i18next', () => ({ t: (key: string) => key }));

import { AscendPlugin } from '@plugin/domain/plugins/ascend.plugin';
import { CannPlugin } from '@plugin/domain/plugins/cann.plugin';
import { TritonPlugin } from '@plugin/domain/plugins/triton.plugin';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import { ProjectManager } from '@plugin/core/project/project-manager';
import { RemoteToolUnavailableError } from '@plugin/helpers/remote-command';
import { getSocVersionWithWorkspaceOverride } from '@plugin/helpers/operator-project-workspace-config';

import {
  buildOperatorSpawnContext,
  commandFailureMessage,
  executeOperatorCommand,
  resolveOpTypeForSpawn,
  resolveOperatorCommandTimeoutMs,
} from '@plugin/service/operator-command-executor';

describe('resolveOpTypeForSpawn', () => {
  const { resolveOpRecord } = jest.requireMock('@plugin/domain/models/op-record') as {
    resolveOpRecord: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resolveOpRecord.mockReturnValue(undefined);
  });

  it('returns undefined without a project path or operator names', () => {
    expect(resolveOpTypeForSpawn(undefined, 'add'))
      .toBeUndefined();
    expect(resolveOpTypeForSpawn('/ws', ''))
      .toBeUndefined();
    expect(resolveOpTypeForSpawn('/ws', '  '))
      .toBeUndefined();
  });

  it('returns undefined when the operator list has no first name', () => {
    expect(resolveOpTypeForSpawn('/ws', ','))
      .toBeUndefined();
  });

  it('normalizes the persisted op type of the first operator', () => {
    resolveOpRecord.mockReturnValueOnce({ op_type: 'cann' });

    expect(resolveOpTypeForSpawn('/ws', 'add,multiply'))
      .toBe('cann');
    expect(resolveOpRecord)
      .toHaveBeenCalledWith('/ws', 'add');
  });

  it('returns undefined when the persisted op type is not recognized', () => {
    resolveOpRecord.mockReturnValueOnce({ op_type: 'legacy-op' });

    expect(resolveOpTypeForSpawn('/ws', 'add'))
      .toBeUndefined();
  });
});

describe('buildOperatorSpawnContext', () => {
  const { resolveOpRecord } = jest.requireMock('@plugin/domain/models/op-record') as {
    resolveOpRecord: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resolveOpRecord.mockReturnValue(undefined);
  });

  it('takes project, operator, and types from the base context when present', () => {
    const baseContext = {
      config: {},
      project: {
        project_path: '/ws',
        project_type: 'ascend-c',
      },
      operator: {
        op_name: 'sub',
        op_type: 'triton',
      },
      op: 'sub',
    } as Parameters<typeof buildOperatorSpawnContext>[0]['baseContext'];

    const ctx = buildOperatorSpawnContext({ baseContext });

    expect(ctx.projectPath)
      .toBe('/ws');
    expect(ctx.operatorNames)
      .toBeUndefined();
    expect(ctx.opType)
      .toBe('triton');
    expect(ctx.projectType)
      .toBe('ascend-c');
    expect(ctx.sanitizerRun)
      .toBe(false);
    expect(ctx.isSimulator)
      .toBe(false);
  });

  it('prefers the explicit operator names over the base context operator', () => {
    const baseContext = {
      config: {},
      project: {
        project_path: '/ws',
        project_type: 'ascend-c',
      },
      operator: {
        op_name: 'sub',
        op_type: 'triton',
      },
      op: 'sub',
    } as Parameters<typeof buildOperatorSpawnContext>[0]['baseContext'];

    const ctx = buildOperatorSpawnContext({
      baseContext,
      operatorNames: 'mul,two',
    });

    expect(ctx.operatorNames)
      .toBe('mul,two');
  });

  it('falls back to the op record when the first operator type is not recognized', () => {
    resolveOpRecord
      .mockReturnValueOnce({ op_type: 'unknown-type' })
      .mockReturnValueOnce({
        op_path: '/ws/ops/add',
        op_type: 'cann',
      });

    const ctx = buildOperatorSpawnContext({
      projectPath: '/ws',
      operatorNames: 'add,multiply',
    });

    expect(ctx.opType)
      .toBe('cann');
  });
});

describe('executeOperatorCommand (extra)', () => {
  const execute = jest.fn()
    .mockResolvedValue({
      code: 0,
      output: '',
      stdout: '',
      stderr: '',
    });
  const readSetting = (): jest.Mock => (
    jest.requireMock('@plugin/service/config-service') as {
      ConfigService: { readOpDevtoolsSetting: jest.Mock };
    }
  ).ConfigService.readOpDevtoolsSetting;
  const maybeWarnSocNotDetected = (): jest.Mock => (
    jest.requireMock('@plugin/helpers/ascend-soc-warning') as {
      maybeWarnSocNotDetected: jest.Mock;
    }
  ).maybeWarnSocNotDetected;

  beforeEach(() => {
    jest.clearAllMocks();
    readSetting()
      .mockReturnValue(undefined);
    OperatorPluginRegistry._reset();
    OperatorPluginRegistry.registerOpPlugin(new CannPlugin());
    OperatorPluginRegistry.registerOpPlugin(new AscendPlugin());
    OperatorPluginRegistry.registerOpPlugin(new TritonPlugin());
    (getSocVersionWithWorkspaceOverride as jest.Mock).mockReturnValue('ascend950');
    maybeWarnSocNotDetected()
      .mockResolvedValue('continue');
    (ProjectManager.getInstance as jest.Mock).mockReturnValue({ getExecutor: () => ({ execute }) });
  });

  it('executes with a fully empty spawn context through the enrich fallbacks', async () => {
    await executeOperatorCommand('echo hi', buildOperatorSpawnContext({}));

    expect(execute)
      .toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0])
      .toBe('echo hi');
  });

  it('skips the reopen-build env sync for simulator runs', async () => {
    await executeOperatorCommand(
      'bash build.sh',
      buildOperatorSpawnContext({
        projectPath: '/ws',
        isSimulator: true,
        scriptField: null,
        script: null,
      }),
    );

    expect(execute)
      .toHaveBeenCalledTimes(1);
    const [command] = execute.mock.calls[0] as [string];

    expect(command)
      .toContain('bash build.sh');
  });

  it('aborts with a failure result when SOC resolution is cancelled', async () => {
    maybeWarnSocNotDetected()
      .mockResolvedValueOnce('cancelled');

    const result = await executeOperatorCommand(
      'echo hi',
      buildOperatorSpawnContext({ projectPath: '/ws' }),
    );

    expect(result)
      .toEqual({
        code: 1,
        output: '',
        stdout: '',
        stderr: '',
        interruptedByUserStop: true,
        timedOut: false,
      });
    expect(execute)
      .not
      .toHaveBeenCalled();
  });

  it('returns a failure result when the transformer reports the remote tool unavailable', async () => {
    const result = await executeOperatorCommand(
      'cd build && ./build.sh',
      buildOperatorSpawnContext({
        projectPath: '/ws',
        scriptField: null,
        script: null,
      }),
      {
        transformCommand: async () => {
          throw new RemoteToolUnavailableError();
        },
      },
    );

    expect(result)
      .toEqual({
        code: 1,
        output: '',
        stdout: '',
        stderr: '',
        interruptedByUserStop: true,
        timedOut: false,
      });
    expect(execute)
      .not
      .toHaveBeenCalled();
  });

  it('propagates non-remote transformer failures', async () => {
    await expect(executeOperatorCommand(
      'cd build && ./build.sh',
      buildOperatorSpawnContext({
        projectPath: '/ws',
        scriptField: null,
        script: null,
      }),
      {
        transformCommand: async () => {
          throw new Error('transformer boom');
        },
      },
    ))
      .rejects
      .toThrow('transformer boom');
    expect(execute)
      .not
      .toHaveBeenCalled();
  });

  it('runs detached with the default ready keyword and skips the timeout', async () => {
    const executeDetached = jest.fn()
      .mockResolvedValue({
        code: 0,
        output: '',
        stdout: '',
        stderr: '',
      });

    (ProjectManager.getInstance as jest.Mock)
      .mockReturnValue({
        getExecutor: () => ({
          execute: jest.fn(),
          executeDetached,
        }),
      });

    const result = await executeOperatorCommand(
      'cd build && ./run.sh',
      buildOperatorSpawnContext({
        projectPath: '/ws',
        scriptField: null,
        script: null,
      }),
      { detached: true },
    );

    expect(executeDetached)
      .toHaveBeenCalledWith(
        expect.stringContaining('cd build && ./run.sh'),
        'ready',
        [],
        { toolOutputLabel: 'tool' },
        true,
      );
    expect(result.code)
      .toBe(0);
  });

  it('passes the configured ready keyword to the detached executor', async () => {
    const executeDetached = jest.fn()
      .mockResolvedValue({
        code: 0,
        output: '',
        stdout: '',
        stderr: '',
      });

    (ProjectManager.getInstance as jest.Mock)
      .mockReturnValue({
        getExecutor: () => ({
          execute: jest.fn(),
          executeDetached,
        }),
      });

    await executeOperatorCommand(
      'cd build && ./run.sh',
      buildOperatorSpawnContext({
        projectPath: '/ws',
        scriptField: null,
        script: null,
      }),
      {
        detached: true,
        readyKeyword: 'listening',
        outputLabel: 'daemon',
      },
    );

    expect(executeDetached)
      .toHaveBeenCalledWith(
        expect.stringContaining('cd build && ./run.sh'),
        'listening',
        [],
        { toolOutputLabel: 'daemon' },
        true,
      );
  });
});

describe('resolveOperatorCommandTimeoutMs', () => {
  const readSetting = (): jest.Mock => (
    jest.requireMock('@plugin/service/config-service') as {
      ConfigService: { readOpDevtoolsSetting: jest.Mock };
    }
  ).ConfigService.readOpDevtoolsSetting;

  beforeEach(() => {
    jest.clearAllMocks();
    readSetting()
      .mockReturnValue(undefined);
  });

  it('disables the timeout for a non-finite setting', () => {
    readSetting()
      .mockReturnValue(NaN);

    expect(resolveOperatorCommandTimeoutMs())
      .toBeUndefined();
  });

  it('caps the timeout at the maximum node timer delay', () => {
    readSetting()
      .mockReturnValue(2147484);

    expect(resolveOperatorCommandTimeoutMs())
      .toBe(2_147_483_647);
  });
});

describe('commandFailureMessage (extra)', () => {
  it('fills the timeout output with an empty string when absent', () => {
    expect(commandFailureMessage({ timedOut: true }, 'build.compileFailed'))
      .toBe('build.commandTimedOut');
  });
});
