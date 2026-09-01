/**
 * Remaining branches of domain/services/command.ts: base-context resolution
 * (unknown project, config-carried op, operator synthesis per project type),
 * wrapped failure paths, and the run_example mode resolution edge branches.
 * The happy-path chains live in runtime-chain-per-type.spec.ts and the
 * strategy specs.
 */
jest.mock('i18next', () => ({ t: (key: string) => key }));

jest.mock('@plugin/domain/models/project-model', () => {
  const actual = jest.requireActual('@plugin/domain/models/project-model') as Record<string, unknown>;

  return {
    ...actual,
    getProjectByPath: jest.fn(),
  };
});

jest.mock('@plugin/domain/models/op-record', () => {
  const actual = jest.requireActual('@plugin/domain/models/op-record') as Record<string, unknown>;

  return {
    ...actual,
    resolveOpRecord: jest.fn(),
  };
});

jest.mock('@plugin/domain/utils/operator-example-mode', () => {
  const actual = jest.requireActual('@plugin/domain/utils/operator-example-mode') as Record<string, unknown>;

  return {
    ...actual,
    resolveExampleMode: jest.fn(),
    toExampleMatcher: jest.fn(),
  };
});

jest.mock('@plugin/service/config-service', () => ({
  ConfigService: {
    getBuildOpConfig: jest.fn(),
    getBuildExampleConfig: jest.fn(),
    getUtTestConfig: jest.fn(),
    getSimulateConfig: jest.fn(),
    getOnBoardConfig: jest.fn(),
    getSanitizerConfig: jest.fn(),
    readBuildOpDeployTargetFromWorkspace: jest.fn(),
    readBuildExampleTargetFromWorkspace: jest.fn(),
  },
}));

import { DEFAULT_EXAMPLE_MATCHERS } from '@plugin/domain/utils/operator-example-mode';
import { getProjectByPath } from '@plugin/domain/models/project-model';
import { resolveOpRecord } from '@plugin/domain/models/op-record';
import { ConfigService } from '@plugin/service/config-service';
import {
  getBuildOpCommand,
  getBuildExampleCommand,
  getOnBoardCommand,
  getRunCommand,
  getSanitizerCommand,
  getSimulateCommand,
  getStandardCustomDeployCommand,
  getUtTestCommand,
  resolveBuildOpBaseContext,
  resolveExampleModeForBaseContext,
} from '@plugin/domain/services/command';
import {
  resolveExampleMode,
  toExampleMatcher,
} from '@plugin/domain/utils/operator-example-mode';
import type {
  BuildOpConfig,
  BuildExampleConfig,
} from '@plugin/service/config-service';

const PROJECT = {
  project_type: 'cann',
  project_path: '/ws',
  project_name: 'ws',
};

const OPERATOR = {
  op_type: 'cann',
  op_path: '/ws/op',
  op_name: 'myop',
};

function buildOpContext(overrides: Partial<BuildOpConfig> = {}): ReturnType<typeof resolveBuildOpBaseContext> {
  return {
    config: {
      script: 'bash build.sh',
      cpuDebugScript: '',
      npuDebugScript: '',
      targetFile: '',
      ...overrides,
    },
    project: PROJECT,
    operator: OPERATOR,
    op: 'myop',
  } as ReturnType<typeof resolveBuildOpBaseContext>;
}

function exampleContext(): { config: BuildExampleConfig;
  project: typeof PROJECT;
  operator: typeof OPERATOR;
  op: string } {
  return {
    config: {
      script: 'bash build.sh --run_example',
      executionMode: 'eager',
      targetFile: null,
    },
    project: PROJECT,
    operator: OPERATOR,
    op: 'myop',
  };
}

describe('resolveBuildOpBaseContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (ConfigService.getBuildOpConfig as jest.Mock).mockReturnValue({
      script: 'bash build.sh',
      cpuDebugScript: '',
      npuDebugScript: '',
      targetFile: '',
    });
  });

  it('throws configNotFound when the project does not exist', () => {
    (getProjectByPath as jest.Mock).mockReturnValue(undefined);

    expect(() => resolveBuildOpBaseContext('/unknown'))
      .toThrow('command.configNotFound');
  });

  it('synthesizes the operator op_type from the project type when no ops row exists', () => {
    (getProjectByPath as jest.Mock).mockReturnValue({
      ...PROJECT,
      project_type: 'pyasc',
    });
    (resolveOpRecord as jest.Mock).mockReturnValue(undefined);

    expect(resolveBuildOpBaseContext('/ws', 'myop').operator)
      .toMatchObject({
        op_type: 'pyasc',
        op_path: '/ws',
      });

    (getProjectByPath as jest.Mock).mockReturnValue({
      ...PROJECT,
      project_type: 'triton',
    });

    expect(resolveBuildOpBaseContext('/ws', 'myop').operator)
      .toMatchObject({ op_type: 'triton' });

    (getProjectByPath as jest.Mock).mockReturnValue({
      ...PROJECT,
      project_type: 'ascend',
    });

    expect(resolveBuildOpBaseContext('/ws', 'myop').operator)
      .toMatchObject({ op_type: 'ascend' });

    (getProjectByPath as jest.Mock).mockReturnValue({
      ...PROJECT,
      project_type: 'standard-custom',
    });

    expect(resolveBuildOpBaseContext('/ws', 'myop').operator)
      .toMatchObject({ op_type: 'ascend' });

    (getProjectByPath as jest.Mock).mockReturnValue({
      ...PROJECT,
      project_type: 'torch-library',
    });

    expect(resolveBuildOpBaseContext('/ws', 'myop').operator)
      .toMatchObject({ op_type: 'cann' });
  });

  it('uses the config-carried op name over the selection when present', () => {
    (getProjectByPath as jest.Mock).mockReturnValue(PROJECT);
    (ConfigService.getBuildOpConfig as jest.Mock).mockReturnValue({
      op: 'cfg_op',
      script: 'bash build.sh',
      cpuDebugScript: '',
      npuDebugScript: '',
      targetFile: '',
    });

    const ctx = resolveBuildOpBaseContext('/ws', 'sel1,sel2');

    expect(ctx.op)
      .toBe('cfg_op');
    expect(resolveOpRecord)
      .toHaveBeenCalledWith('/ws', 'cfg_op');
  });

  it('resolves the operator from the first selection when the config carries no op', () => {
    (getProjectByPath as jest.Mock).mockReturnValue(PROJECT);

    const ctx = resolveBuildOpBaseContext('/ws', 'sel1,sel2');

    expect(ctx.op)
      .toBe('sel1');
    expect(resolveOpRecord)
      .toHaveBeenCalledWith('/ws', 'sel1');
  });
});

describe('command builders wrapped failure paths', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Operator missing + no script → buildCommandContext throws → wrapped.
  const brokenContext = {
    config: {
      script: '',
      targetFile: '',
    },
    project: null,
    operator: null,
    op: 'ghost',
  };

  it('getBuildOpCommand wraps strategy failures', () => {
    expect(() => getBuildOpCommand(brokenContext as never))
      .toThrow('command.getBuildCommandFailed');
  });

  it('getRunCommand wraps strategy failures', () => {
    expect(() => getRunCommand(brokenContext as never))
      .toThrow('command.getRunCommandFailed');
  });

  it('getSimulateCommand wraps strategy failures', () => {
    expect(() => getSimulateCommand(brokenContext as never, brokenContext as never))
      .toThrow('command.getSimulateCommandFailed');
  });

  it('getOnBoardCommand wraps strategy failures', () => {
    expect(() => getOnBoardCommand(brokenContext as never, brokenContext as never))
      .toThrow('command.getOnBoardCommandFailed');
  });

  it('getSanitizerCommand wraps strategy failures', () => {
    expect(() => getSanitizerCommand(brokenContext as never, brokenContext as never))
      .toThrow('command.getSanitizerCommandFailed');
  });

  it('getUtTestCommand wraps strategy failures', () => {
    expect(() => getUtTestCommand(brokenContext as never))
      .toThrow('Failed to build UT test command');
  });

  it('getStandardCustomDeployCommand wraps strategy failures', () => {
    expect(() => getStandardCustomDeployCommand(brokenContext as never))
      .toThrow('Failed to build standard custom deploy command');
  });

  it('getBuildOpCommand builds a cann build command without advanceParam in the config', () => {
    const cmd = getBuildOpCommand(buildOpContext());

    expect(cmd)
      .toBe('cd /ws/op && bash build.sh');
  });

  it('getBuildOpCommand forwards advanceParam from the config into the command tail', () => {
    const cmd = getBuildOpCommand(buildOpContext({
      advanceParam: [
        {
          name: 'simulate',
          value: 'x',
        },
      ],
    } as never));

    expect(cmd)
      .toContain('bash build.sh');
    expect(cmd)
      .toContain('--simulate=x');
  });
});

describe('resolveExampleModeForBaseContext / getBuildExampleCommand mode resolution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (resolveExampleMode as jest.Mock).mockReturnValue({
      mode: 'eager',
      exampleFound: true,
    });
    (toExampleMatcher as jest.Mock).mockReturnValue(/fallback/);
  });

  it('keeps the global mode when the context cannot be inspected (no project / no op)', () => {
    const result = resolveExampleModeForBaseContext({
      config: { script: 'x' } as never,
      project: undefined,
      operator: OPERATOR,
      op: 'op1',
    } as never);

    expect(result)
      .toEqual({
        mode: 'eager',
        exampleFound: true,
        opName: 'op1',
      });
    expect(resolveExampleMode)
      .not.toHaveBeenCalled();
  });

  it('resolves graph mode from executionMode and passes configured example patterns', () => {
    const result = resolveExampleModeForBaseContext({
      config: {
        script: 'x',
        executionMode: 'graph',
        eagerExamplePattern: 'eager-pattern',
        graphExamplePattern: 'graph-pattern',
      } as never,
      project: PROJECT,
      operator: OPERATOR,
      op: '',
    } as never, 'add,sub');

    expect(result.opName)
      .toBe('add,sub');
    expect(resolveExampleMode)
      .toHaveBeenCalledWith('/ws', 'add,sub', 'graph', false, expect.anything());
    expect(toExampleMatcher)
      .toHaveBeenCalledWith('eager-pattern', DEFAULT_EXAMPLE_MATCHERS.eager);
    expect(toExampleMatcher)
      .toHaveBeenCalledWith('graph-pattern', DEFAULT_EXAMPLE_MATCHERS.graph);
  });

  it('falls back to the default matchers and the context op when patterns are unset', () => {
    const result = resolveExampleModeForBaseContext({
      config: { script: 'x' } as never,
      project: PROJECT,
      operator: OPERATOR,
      op: 'op1',
    } as never);

    expect(result.opName)
      .toBe('op1');
    expect(resolveExampleMode)
      .toHaveBeenCalledWith('/ws', 'op1', 'eager', false, expect.anything());
    expect(toExampleMatcher)
      .toHaveBeenCalledWith(undefined, DEFAULT_EXAMPLE_MATCHERS.eager);
    expect(toExampleMatcher)
      .toHaveBeenCalledWith(undefined, DEFAULT_EXAMPLE_MATCHERS.graph);
  });

  it('falls back to an empty op name when the operatorNames and context op are both blank', () => {
    const result = resolveExampleModeForBaseContext({
      config: { script: 'x' } as never,
      project: PROJECT,
      operator: OPERATOR,
      op: '',
    } as never, '   ');

    // Blank operatorNames trims to '' and the context op is empty → the final
    // `|| ''` arm of the op name expression; the early return keeps the global
    // mode and never consults resolveExampleMode.
    expect(result)
      .toEqual({
        mode: 'eager',
        exampleFound: true,
        opName: '',
      });
    expect(resolveExampleMode)
      .not.toHaveBeenCalled();
  });

  it('getBuildExampleCommand uses an explicit exampleMode without re-resolving', () => {
    const cmd = getBuildExampleCommand(exampleContext() as never, undefined, 'add', 'graph');

    expect(resolveExampleMode)
      .not.toHaveBeenCalled();
    expect(cmd)
      .toContain('--run_example add graph cust');
  });

  it('getBuildExampleCommand resolves the mode from the context when none is given', () => {
    const cmd = getBuildExampleCommand(exampleContext() as never, undefined, 'add');

    expect(resolveExampleMode)
      .toHaveBeenCalled();
    expect(cmd)
      .toContain('--run_example add eager cust');
  });
});
