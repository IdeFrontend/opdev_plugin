jest.mock('@plugin/core/project/project-manager', () => ({
  ProjectManager: {
    getInstance: jest.fn(),
  },
}));

jest.mock('@plugin/helpers/operator-project-workspace-config', () => ({
  getWorkspaceSimulatorType: jest.fn(() => ''),
  getSocVersionWithWorkspaceOverride: jest.fn(),
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
  getProjectById: jest.fn(() => ({ project_type: 'ascend-c' })),
}));

import { AscendPlugin } from '@plugin/domain/plugins/ascend.plugin';
import { CannPlugin } from '@plugin/domain/plugins/cann.plugin';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import { ProjectManager } from '@plugin/core/project/project-manager';
import { deriveOperatorToolOutputLabel } from '@plugin/helpers/output-channel';
import {
  getSocVersionWithWorkspaceOverride,
} from '@plugin/helpers/operator-project-workspace-config';
import { executeOperatorCommand } from '@plugin/service/operator-command-executor';

describe('executeOperatorCommand', () => {
  const execute = jest.fn().mockResolvedValue({ code: 0, output: '', stdout: '', stderr: '' });

  beforeEach(() => {
    jest.clearAllMocks();
    OperatorPluginRegistry._reset();
    OperatorPluginRegistry.registerOpPlugin(new CannPlugin());
    OperatorPluginRegistry.registerOpPlugin(new AscendPlugin());
    (getSocVersionWithWorkspaceOverride as jest.Mock).mockReturnValue('ascend950');
    (ProjectManager.getInstance as jest.Mock).mockReturnValue({
      getExecutor: () => ({ execute }),
    });
  });

  it('embeds export prefixes in the command and does not pass options.env', async () => {
    await executeOperatorCommand('cd build && ./build.sh', {
      projectId: 1,
      configType: 'build_op',
      scriptField: null,
      script: null,
    });

    expect(execute).toHaveBeenCalledTimes(1);
    const [command, , , options, isOpenTerminal] = execute.mock.calls[0] as [
      string,
      string[],
      string[],
      { toolOutputLabel?: string; env?: Record<string, string> },
      boolean,
    ];

    expect(command).toMatch(
      /^export SOC_VERSION='ascend950' && export NPU_ARCH='dav-3510' && cd build && \.\/build\.sh$/,
    );
    expect(command).not.toContain('SUPPORT_COMPUTE_UNIT');
    expect(command).not.toContain('SUPPORT_TILING_DIR');
    expect(options.env).toBeUndefined();
    expect(isOpenTerminal).toBe(true);
  });

  it('derives toolOutputLabel from spawn context when meta omits outputLabel', async () => {
    (deriveOperatorToolOutputLabel as jest.Mock).mockReturnValueOnce('compile');

    await executeOperatorCommand('cd build && ./build.sh', {
      projectId: 1,
      configType: 'build_op',
      scriptField: null,
      script: null,
    });

    expect(deriveOperatorToolOutputLabel).toHaveBeenCalledWith(
      expect.objectContaining({
        configType: 'build_op',
        script: 'cd build && ./build.sh',
      }),
    );
    expect(execute.mock.calls[0][3]).toEqual({ toolOutputLabel: 'compile' });
  });

  it('inserts exports before ascend_env_script source prefix', async () => {
    await executeOperatorCommand('. /cann/set_env.sh && cd build && ./build.sh', {
      projectId: 1,
      configType: 'build_op',
      scriptField: null,
      script: null,
    });

    const [command] = execute.mock.calls[0] as [string];

    expect(command).toMatch(
      /^export SOC_VERSION='ascend950' && export NPU_ARCH='dav-3510' && /,
    );
    expect(command).toMatch(
      / && \. \/cann\/set_env\.sh && cd build && \.\/build\.sh$/,
    );
  });

  it('substitutes placeholders before injecting exports', async () => {
    await executeOperatorCommand(
      'bash build.sh --soc={soc_version}',
      {
        projectId: 1,
        configType: 'build_op',
        scriptField: null,
        script: null,
      },
    );

    const [command] = execute.mock.calls[0] as [string];

    expect(command).toContain('bash build.sh --soc=ascend950');
    expect(command).not.toContain('{soc_version}');
    expect(command).toMatch(/^export SOC_VERSION='/);
  });

  it('does not export SOC_VERSION or NPU_ARCH for standard-custom projects', async () => {
    const { getProjectById } = jest.requireMock('@plugin/domain/models/project-model') as {
      getProjectById: jest.Mock;
    };

    getProjectById.mockReturnValueOnce({ project_type: 'ascend' });

    await executeOperatorCommand('bash build.sh --soc={soc_version}', {
      projectId: 2,
      configType: 'build_op',
      scriptField: null,
      script: null,
    });

    const [command] = execute.mock.calls[0] as [string];

    expect(command).toBe('bash build.sh --soc=ascend950');
    expect(command).not.toContain('export SOC_VERSION');
    expect(command).not.toContain('export NPU_ARCH');
  });

  it('uses outputLabel from meta when provided', async () => {
    await executeOperatorCommand(
      'cd build && ./run.sh',
      {
        projectId: 1,
        configType: 'on_board',
        scriptField: null,
        script: null,
      },
      { outputLabel: 'run' },
    );

    expect(execute.mock.calls[0][3]).toEqual({ toolOutputLabel: 'run' });
  });
});
