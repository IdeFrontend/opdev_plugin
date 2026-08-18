jest.mock('@plugin/core/project/project-manager', () => ({ ProjectManager: { getInstance: jest.fn() } }));

jest.mock('@plugin/helpers/operator-project-workspace-config', () => ({
  getWorkspaceSimulatorType: jest.fn(() => ''),
  getSocVersionWithWorkspaceOverride: jest.fn(),
  getWorkspaceNpuArch: jest.fn(() => ''),
}));

jest.mock('@plugin/domain/utils/global-env-snapshot', () => ({
  getGlobalEnvSnapshot: jest.fn(() => ({
    socVersion: undefined,
    simulatorType: undefined,
    npuArch: undefined,
    ascendEnvScript: undefined,
  })),
}));

jest.mock('@plugin/domain/models/project-model', () => ({ getProjectById: jest.fn(() => ({ project_type: 'ascend-c' })) }));

jest.mock('@plugin/domain/services/configuration', () => ({ getConfigById: jest.fn() }));

jest.mock('@plugin/domain/models/model', () => ({ getOpByProjectIdAndOpName: jest.fn(() => undefined) }));

jest.mock('@plugin/service/config-service', () => ({
  ConfigService: {
    readOpDevtoolsSetting: jest.fn(() => undefined),
    persistDetectedSocVersion: jest.fn(async () => false),
  },
}));

jest.mock('i18next', () => ({ t: (key: string) => key }));

import { AscendPlugin } from '@plugin/domain/plugins/ascend.plugin';
import { CannPlugin } from '@plugin/domain/plugins/cann.plugin';
import { TritonPlugin } from '@plugin/domain/plugins/triton.plugin';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import { ProjectManager } from '@plugin/core/project/project-manager';
import { deriveOperatorToolOutputLabel } from '@plugin/helpers/output-channel';
import { getSocVersionWithWorkspaceOverride } from '@plugin/helpers/operator-project-workspace-config';
import * as fs from 'fs';
import * as path from 'path';

import {
  buildOperatorSpawnContext,
  commandFailureMessage,
  executeOperatorCommand,
} from '@plugin/service/operator-command-executor';
import { NPU_ARCH_ENV_VAR } from '@plugin/helpers/terminal-npu-arch-env';

describe('executeOperatorCommand', () => {
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
  const persistSoc = (): jest.Mock => (
    jest.requireMock('@plugin/service/config-service') as {
      ConfigService: { persistDetectedSocVersion: jest.Mock };
    }
  ).ConfigService.persistDetectedSocVersion;

  beforeEach(() => {
    jest.clearAllMocks();
    readSetting()
      .mockReturnValue(undefined);
    OperatorPluginRegistry._reset();
    OperatorPluginRegistry.registerOpPlugin(new CannPlugin());
    OperatorPluginRegistry.registerOpPlugin(new AscendPlugin());
    OperatorPluginRegistry.registerOpPlugin(new TritonPlugin());
    (getSocVersionWithWorkspaceOverride as jest.Mock).mockReturnValue('ascend950');
    (ProjectManager.getInstance as jest.Mock).mockReturnValue({ getExecutor: () => ({ execute }) });
  });

  it('embeds export prefixes in the command and does not pass options.env', async () => {
    await executeOperatorCommand('cd build && ./build.sh', {
      projectId: 1,
      configType: 'build_op',
      scriptField: null,
      script: null,
    });

    expect(execute)
      .toHaveBeenCalledTimes(1);
    const [
      command, , , options,
      isOpenTerminal,
    ] = execute.mock.calls[0] as [
      string,
      string[],
      string[],
      { toolOutputLabel?: string;
        env?: Record<string, string> },
      boolean,
    ];

    expect(command)
      .toMatch(/^export SOC_VERSION='ascend950' && export NPU_ARCH='dav-3510' && cd build && \.\/build\.sh$/);
    expect(command).not.toContain('SUPPORT_COMPUTE_UNIT');
    expect(command).not.toContain('SUPPORT_TILING_DIR');
    expect(options.env)
      .toBeUndefined();
    expect(isOpenTerminal)
      .toBe(true);
  });

  it('derives toolOutputLabel from spawn context when meta omits outputLabel', async () => {
    (deriveOperatorToolOutputLabel as jest.Mock).mockReturnValueOnce('compile');

    await executeOperatorCommand('cd build && ./build.sh', {
      projectId: 1,
      configType: 'build_op',
      scriptField: null,
      script: null,
    });

    expect(deriveOperatorToolOutputLabel)
      .toHaveBeenCalledWith(expect.objectContaining({
        configType: 'build_op',
        script: 'cd build && ./build.sh',
      }));
    expect(execute.mock.calls[0][3])
      .toEqual(expect.objectContaining({ toolOutputLabel: 'compile' }));
  });

  it('inserts exports before ascend_env_script source prefix', async () => {
    await executeOperatorCommand('. /cann/set_env.sh && cd build && ./build.sh', {
      projectId: 1,
      configType: 'build_op',
      scriptField: null,
      script: null,
    });

    const [command] = execute.mock.calls[0] as [string];

    expect(command)
      .toMatch(/^export SOC_VERSION='ascend950' && export NPU_ARCH='dav-3510' && /);
    expect(command)
      .toMatch(/ && \. \/cann\/set_env\.sh && cd build && \.\/build\.sh$/);
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

    expect(command)
      .toContain('bash build.sh --soc=ascend950');
    expect(command).not.toContain('{soc_version}');
    expect(command)
      .toMatch(/^export SOC_VERSION='/);
  });

  it('embeds export prefixes when stored project_type is cann and no operator is selected', async () => {
    const { getProjectById } = jest.requireMock('@plugin/domain/models/project-model') as {
      getProjectById: jest.Mock;
    };

    getProjectById.mockReturnValueOnce({ project_type: 'cann' });

    await executeOperatorCommand('cd build && ./build.sh', {
      projectId: 1,
      configType: 'build_op',
      scriptField: null,
      script: null,
    });

    const [command] = execute.mock.calls[0] as [string];

    expect(command)
      .toMatch(/^export SOC_VERSION='ascend950' && export NPU_ARCH='dav-3510' && cd build && \.\/build\.sh$/);
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

    expect(command)
      .toBe('bash build.sh --soc=ascend950');
    expect(command).not.toContain('export SOC_VERSION');
    expect(command).not.toContain('export NPU_ARCH');
  });

  it('resolves opType=triton for a sanitizer config and injects Triton sanitizer env vars', async () => {
    const { getProjectById } = jest.requireMock('@plugin/domain/models/project-model') as {
      getProjectById: jest.Mock;
    };
    const { getConfigById } = jest.requireMock('@plugin/domain/services/configuration') as {
      getConfigById: jest.Mock;
    };

    getProjectById.mockReturnValue({ project_type: 'triton' });
    getConfigById.mockReturnValue({
      project_id: 1,
      config_type: 'sanitizer',
      user_options: { op: 'triton_vector_add' },
    });

    const ctx = buildOperatorSpawnContext({ configId: 1 });

    expect(ctx.opType)
      .toBe('triton');
    expect(ctx.configType)
      .toBe('sanitizer');

    await executeOperatorCommand('mssanitizer -- python3 ./a.py', ctx);

    const [command] = execute.mock.calls[0] as [string];

    expect(command)
      .toContain("export TRITON_ENABLE_SANITIZER='1'");
    expect(command)
      .toContain("export TRITON_ALWAYS_COMPILE='1'");
    expect(command)
      .toContain("export PYTORCH_NO_NPU_MEMORY_CACHING='1'");
  });

  describe('reopen / manual-build env sync (issue #37)', () => {
    const globalRef = globalThis as unknown as { extensionContext?: unknown };
    const originalContext = globalRef.extensionContext;
    let environmentVariableCollection: { replace: jest.Mock;
      delete: jest.Mock };

    beforeEach(() => {
      environmentVariableCollection = {
        replace: jest.fn(),
        delete: jest.fn(),
      };
      globalRef.extensionContext = { environmentVariableCollection };
      persistSoc()
        .mockResolvedValue(false);
    });

    afterEach(() => {
      globalRef.extensionContext = originalContext;
    });

    it('refreshes the terminal NPU_ARCH and offers the resolution for persistence', async () => {
      await executeOperatorCommand('cd build && ./build.sh', {
        projectId: 1,
        configType: 'build_op',
        scriptField: null,
        script: null,
      });

      expect(environmentVariableCollection.replace)
        .toHaveBeenCalledWith(NPU_ARCH_ENV_VAR, 'dav-3510');
      expect(persistSoc())
        .toHaveBeenCalledWith(expect.objectContaining({ socVersion: 'ascend950' }));
    });

    it('leaves the terminal and settings untouched for simulator runs', async () => {
      await executeOperatorCommand('bash build.sh --simulator', {
        projectId: 1,
        configType: 'simulate',
        scriptField: null,
        script: 'bash build.sh --simulator',
      });

      expect(environmentVariableCollection.replace)
        .not
        .toHaveBeenCalled();
      expect(environmentVariableCollection.delete)
        .not
        .toHaveBeenCalled();
      expect(persistSoc())
        .not
        .toHaveBeenCalled();
    });
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

    expect(execute.mock.calls[0][3])
      .toEqual({
        toolOutputLabel: 'run',
        timeout: 1800 * 1000,
      });
  });

  it('passes the configured execution timeout to the executor', async () => {
    readSetting()
      .mockImplementation((key: string) => (key === 'execution.commandTimeoutSeconds' ? 90 : undefined));

    await executeOperatorCommand('cd build && ./run.sh', {
      projectId: 1,
      configType: 'on_board',
      scriptField: null,
      script: null,
    });

    expect(execute.mock.calls[0][3])
      .toEqual(expect.objectContaining({ timeout: 90_000 }));
  });

  it('omits the timeout when the setting disables it', async () => {
    readSetting()
      .mockImplementation((key: string) => (key === 'execution.commandTimeoutSeconds' ? 0 : undefined));

    await executeOperatorCommand('cd build && ./run.sh', {
      projectId: 1,
      configType: 'on_board',
      scriptField: null,
      script: null,
    });

    expect(execute.mock.calls[0][3]).not.toHaveProperty('timeout');
  });

  it('applies the caller-provided command transformer after resolving placeholders and environment', async () => {
    const transformCommand = jest.fn(async (command: string) => `remote_tool.sh exec --command '${command}'`);

    await executeOperatorCommand(
      'bash build.sh --soc={soc_version} -u',
      {
        projectId: 1,
        configType: 'ut_test',
        scriptField: null,
        script: null,
      },
      { transformCommand },
    );

    const [command] = execute.mock.calls[0] as [string];

    expect(command)
      .toContain('bash build.sh --soc=ascend950 -u');
    expect(command)
      .toMatch(/^remote_tool\.sh exec --command '/);
    expect(transformCommand)
      .toHaveBeenCalledWith(expect.stringContaining('bash build.sh --soc=ascend950 -u'));
  });
});

describe('commandFailureMessage', () => {
  it('reports a timeout instead of the generic failure key', () => {
    expect(commandFailureMessage(
      {
        timedOut: true,
        output: 'Command timed out after 1800000ms: ./build.sh',
      },
      'build.compileFailed',
      { output: 'Command timed out after 1800000ms: ./build.sh' },
    ))
      .toBe('build.commandTimedOut');
  });

  it('keeps the caller key for an ordinary non-zero exit', () => {
    expect(commandFailureMessage(
      {
        timedOut: false,
        output: 'error: no such target',
      },
      'build.compileFailed',
      { output: 'error: no such target' },
    ))
      .toBe('build.compileFailed');
  });

  it('keeps the caller key when the result predates the timeout flag', () => {
    expect(commandFailureMessage({ output: '' }, 'build.runFailed'))
      .toBe('build.runFailed');
  });
});

describe('command result failure keys', () => {
  // A timeout resolves as `{ code: null, timedOut: true }`. Anything that turns
  // a command result into a user-facing message has to go through
  // commandFailureMessage, otherwise the timeout is reported as a build failure.
  const routedKeys = [
    'build.compileFailed',
    'build.compileFailedThrow',
    'build.executeFailed',
    'build.executeFailedThrow',
    'build.runFailed',
    'build.runFailedQemuSegfault',
    'build.runFailedPyascRuntime',
    'build.simulationFailed',
    'build.simulationFailedThrow',
    'build.onBoardFailed',
    'build.utTestFailed',
    'sanitizer.compileFailed',
    'sanitizer.exampleCompileFailed',
  ];

  const serviceFiles = [
    'build-service.ts',
    'sanitizer-service.ts',
  ];

  const readService = (file: string) =>
    fs.readFileSync(path.resolve(__dirname, '../../service', file), 'utf-8');

  it.each(serviceFiles)('routes every command result message in %s through commandFailureMessage', (file) => {
    const bypassed = routedKeys.filter((key) => readService(file)
      .includes(`t('${key}'`));

    expect(bypassed)
      .toEqual([]);
  });

  // `routedKeys` above is hand-maintained, and that is how `sanitizer.detectionFailed`
  // slipped through: the key was never added, so the run whose timeout matters most —
  // the sanitizer run itself — was never checked. Derive the command result variables
  // from the source instead, so a message built out of any of them is checked whether
  // or not someone remembered to list its key.
  const commandResultVars = (source: string): string[] => {
    // Local helpers that hand a command result back to their caller
    // (deployStandardCustomRunPackage and friends).
    const factories = source.split(/\basync\s+/)
      .filter((body) => /\breturn\s+executeOperatorCommand\(/.test(body))
      .map((body) => body.match(/^(\w+)\s*\(/)?.[1])
      .filter((name): name is string => Boolean(name));
    const producers = [
      'executeOperatorCommand',
      'execute',
      ...factories,
    ].join('|');
    const assigned = source.matchAll(new RegExp(`const\\s+(\\w+)\\s*=\\s*await\\s+[\\w.]*\\b(?:${producers})\\(`, 'g'));

    return [
      ...new Set([...assigned].map(([
        , name,
      ]) => name)),
    ];
  };

  /** Comment-free, one entry per `;`, so a call split over several lines stays whole. */
  const statementsOf = (source: string): string[] => source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .split(';');

  it.each(serviceFiles)('routes every message built from a command result in %s through commandFailureMessage', (file) => {
    const source = readService(file);
    const resultVars = commandResultVars(source);

    // Guard the guard: a rename that stops matching must not read as "no violations".
    expect(resultVars.length)
      .toBeGreaterThan(0);

    const bypassed = statementsOf(source)
      .filter((statement) => statement.includes('t(\'')
        && !statement.includes('commandFailureMessage(')
        && resultVars.some((name) => new RegExp(`\\b${name}\\.`)
          .test(statement)))
      .map((statement) => statement.trim());

    expect(bypassed)
      .toEqual([]);
  });
});
