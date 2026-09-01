jest.mock('vscode', () => ({
  workspace: { workspaceFolders: [{ uri: { fsPath: '/ws/triton-op' } }] },
  env: { uriScheme: 'vscode' },
}), { virtual: true });

jest.mock('i18next', () => ({ t: (key: string) => key }));

jest.mock('@plugin/service/config-service', () => ({ ConfigService: { readBuildOpDeployTargetFromWorkspace: jest.fn() } }));

jest.mock('@plugin/domain/plugins/operator-plugin.registry', () => ({ OperatorPluginRegistry: { getDefaultPaths: jest.fn() } }));

import { TritonCommandStrategy } from '@plugin/domain/services/command-strategy/triton-strategy';
import type {
  CommandContext, CommandBuildParams,
} from '@plugin/domain/services/command-strategy';
import type { SanitizerConfig } from '@plugin/service/config-service';
import { ConfigService } from '@plugin/service/config-service';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import { getIdeConfigDirName } from '@plugin/helpers/ide-config-dir';
import * as vscode from 'vscode';

describe('TritonCommandStrategy.buildSanitizerCommand', () => {
  const strategy = new TritonCommandStrategy();

  const baseConfig: SanitizerConfig = {
    script: 'python3 ./triton_vector_add.py',
    toolType: 'mssanitizer',
    tool: {
      memcheck: true,
      racecheck: false,
      initcheck: false,
    },
    memcheckOption: {
      'leak-check': false,
      'check-unused-memory': false,
    },
    logLevel: 'warn',
    maxDebuglogSize: 1024,
    useBlock: false,
    blockId: null,
    targetFile: 'python3 ./triton_vector_add.py',
    fileMapList: [],
  };

  /** Build the command context the new buildSanitizerCommand signature takes. */
  const buildContext = (
    config: SanitizerConfig,
    overrides: Partial<CommandContext<SanitizerConfig>> = {},
  ): CommandContext<SanitizerConfig> => ({
    config,
    project: null,
    operator: null,
    sourceCannCmd: '',
    cdCmd: 'cd /op',
    cdBuildCmd: 'cd /op',
    op: 'triton_vector_add',
    ...overrides,
  });

  it('wraps python target after -- separator', () => {
    const cmd = strategy.buildSanitizerCommand(buildContext(baseConfig, { sourceCannCmd: '. /env.sh' }));

    expect(cmd)
      .toContain('mssanitizer');
    expect(cmd)
      .toContain('--tool=memcheck');
    expect(cmd)
      .toContain('-- python3 ./triton_vector_add.py');
    expect(cmd).not.toMatch(/^mssanitizer[^\n]*python3 \.\/triton_vector_add\.py/);
  });

  it('writes log file under workspace ide config dir', () => {
    const cmd = strategy.buildSanitizerCommand(buildContext(baseConfig));

    const ideDir = getIdeConfigDirName();
    const normalized = cmd.replace(/\\/g, '/');

    expect(normalized)
      .toContain(`--log-file=/ws/triton-op/${ideDir}/mindstudio_sanitizer_log/mssanitizer_`);
  });

  it('emits block-id only when useBlock is true', () => {
    const withBlock: SanitizerConfig = {
      ...baseConfig,
      useBlock: true,
      blockId: 0,
    };

    expect(strategy.buildSanitizerCommand(buildContext(withBlock)))
      .toContain('--block-id=0');

    expect(strategy.buildSanitizerCommand(buildContext(baseConfig)))
      .not.toContain('--block-id');
  });

  it('includes basic log options from config', () => {
    const cmd = strategy.buildSanitizerCommand(buildContext(baseConfig));

    expect(cmd)
      .toContain('--log-level=warn');
    expect(cmd)
      .toContain('--max-debuglog-size=1024');
  });

  it('omits --max-debuglog-size when the stored value is invalid (e.g. 0)', () => {
    const badSize: SanitizerConfig = {
      ...baseConfig,
      maxDebuglogSize: 0,
    };

    const cmd = strategy.buildSanitizerCommand(buildContext(badSize));

    expect(cmd).not.toContain('--max-debuglog-size');
  });

  it('omits --log-level when the stored value is not a valid level', () => {
    const badLevel: SanitizerConfig = {
      ...baseConfig,
      logLevel: 'verbose' as SanitizerConfig['logLevel'],
    };

    expect(strategy.buildSanitizerCommand(buildContext(badLevel)))
      .not.toContain('--log-level');
  });

  it('omits --block-id when the stored id is out of mssanitizer range (0..200)', () => {
    const badBlock: SanitizerConfig = {
      ...baseConfig,
      useBlock: true,
      blockId: 999,
    };

    expect(strategy.buildSanitizerCommand(buildContext(badBlock)))
      .not.toContain('--block-id');
  });

  it('serializes multiple selected tools as repeated --tool flags', () => {
    const multi: SanitizerConfig = {
      ...baseConfig,
      tool: {
        memcheck: true,
        racecheck: true,
        initcheck: false,
      },
    };

    const cmd = strategy.buildSanitizerCommand(buildContext(multi));

    expect(cmd)
      .toContain('--tool=memcheck');
    expect(cmd)
      .toContain('--tool=racecheck');
    expect(cmd).not.toContain('--tool=memcheck,racecheck');
  });

  it('emits memcheck sub-options even when the memcheck tool box is unchecked', () => {
    const leakOnly: SanitizerConfig = {
      ...baseConfig,
      tool: {
        memcheck: false,
        racecheck: true,
        initcheck: false,
      },
      memcheckOption: {
        'leak-check': true,
        'check-unused-memory': false,
      },
    };

    const cmd = strategy.buildSanitizerCommand(buildContext(leakOnly));

    expect(cmd)
      .toContain('--tool=racecheck');
    expect(cmd)
      .toContain('--leak-check=yes');
  });

  it('omits --tool entirely (no stray token) when no tool is selected', () => {
    const noTools: SanitizerConfig = {
      ...baseConfig,
      tool: {
        memcheck: false,
        racecheck: false,
        initcheck: false,
      },
    };

    const cmd = strategy.buildSanitizerCommand(buildContext(noTools));

    expect(cmd).not.toContain('--tool');
    expect(cmd).not.toMatch(/mssanitizer\s{2,}/);
  });

  it('shell-quotes the --log-file path when the workspace path contains spaces', () => {
    const original = vscode.workspace.workspaceFolders;

    (vscode.workspace as unknown as { workspaceFolders: unknown }).workspaceFolders = [{ uri: { fsPath: '/ws/my op' } }];

    try {
      const cmd = strategy.buildSanitizerCommand(buildContext(baseConfig));
      const normalized = cmd.replace(/\\/g, '/');

      // Quoted so the shell keeps the spaced path as a single --log-file token.
      expect(normalized)
        .toContain("--log-file='/ws/my op/");
      expect(normalized).not.toContain('--log-file=/ws/my op');
    }
    finally {
      (vscode.workspace as unknown as { workspaceFolders: unknown }).workspaceFolders = original;
    }
  });

  it('tolerates a partial DAO without tool or memcheckOption fields', () => {
    const cmd = strategy.buildSanitizerCommand(buildContext({
      script: 'python3 ./run.py',
      targetFile: 'python3 ./run.py',
    } as unknown as SanitizerConfig));

    expect(cmd)
      .toContain('mssanitizer');
    expect(cmd).not.toContain('--tool');
  });

  it('throws when no python target is resolvable', () => {
    expect(() => strategy.buildSanitizerCommand(buildContext({ script: 'python3 ./run.py' } as unknown as SanitizerConfig)))
      .toThrow('cann.configMissingScript');
  });

  it('falls back to the process cwd for the log file when no workspace folder exists', () => {
    const original = vscode.workspace.workspaceFolders;

    (vscode.workspace as unknown as { workspaceFolders: unknown }).workspaceFolders = undefined;

    try {
      const cmd = strategy.buildSanitizerCommand(buildContext(baseConfig));
      const normalized = cmd.replace(/\\/g, '/');
      const cwd = process.cwd()
        .replace(/\\/g, '/');

      expect(normalized)
        .toContain(`--log-file=${cwd}/`);
    }
    finally {
      (vscode.workspace as unknown as { workspaceFolders: unknown }).workspaceFolders = original;
    }
  });

  it('builds npu-check with repeated selected npu tool flags from toolType', () => {
    const npuConfig: SanitizerConfig = {
      ...baseConfig,
      toolType: 'npu-check',
      tool: {
        memcheck: true,
        synccheck: true,
        racecheck: false,
        initcheck: true,
        soccheck: true,
        overcheck: false,
      },
    };

    const cmd = strategy.buildSanitizerCommand(buildContext(npuConfig));

    expect(cmd)
      .toContain('npu-check');
    expect(cmd)
      .toContain('--tool=memcheck');
    expect(cmd)
      .toContain('--tool=synccheck');
    expect(cmd)
      .toContain('--tool=initcheck');
    expect(cmd)
      .toContain('--tool=soccheck');
    expect(cmd).not.toContain('--tool=racecheck');
    expect(cmd).not.toContain('--tool=overcheck');
    expect(cmd).not.toContain('--log-level');
    expect(cmd).not.toContain('--max-debuglog-size');
    expect(cmd)
      .toContain('--log-file=');
  });

  it('builds npu-check with all selected npu tool flags', () => {
    const npuConfig: SanitizerConfig = {
      ...baseConfig,
      toolType: 'npu-check',
      tool: {
        memcheck: true,
        synccheck: true,
        racecheck: true,
        initcheck: true,
        soccheck: true,
        overcheck: true,
      },
    };

    const cmd = strategy.buildSanitizerCommand(buildContext(npuConfig));

    expect(cmd)
      .toContain('npu-check');
    expect(cmd)
      .toContain('--tool=memcheck');
    expect(cmd)
      .toContain('--tool=synccheck');
    expect(cmd)
      .toContain('--tool=racecheck');
    expect(cmd)
      .toContain('--tool=initcheck');
    expect(cmd)
      .toContain('--tool=soccheck');
    expect(cmd)
      .toContain('--tool=overcheck');
  });

  it('keeps the mssanitizer log-file path rule when using npu-check from toolType', () => {
    const npuConfig: SanitizerConfig = {
      ...baseConfig,
      toolType: 'npu-check',
      tool: {
        memcheck: true,
        synccheck: true,
        racecheck: true,
        initcheck: true,
        soccheck: true,
        overcheck: true,
      },
    };

    const cmd = strategy.buildSanitizerCommand(buildContext(npuConfig));
    const ideDir = getIdeConfigDirName();
    const normalized = cmd.replace(/\\/g, '/');

    expect(normalized)
      .toContain(`--log-file=/ws/triton-op/${ideDir}/mindstudio_sanitizer_log/mssanitizer_`);
    expect(normalized)
      .toMatch(/mssanitizer_\d+-npu-check\.log/);
  });

  it('keeps the legacy log-file name (no -npu-check identifier) for mssanitizer toolType or default', () => {
    const explicitToolType: SanitizerConfig = {
      ...baseConfig,
      toolType: 'mssanitizer',
    };
    const defaultToolType = {
      ...baseConfig,
      toolType: undefined,
    } as unknown as SanitizerConfig;

    [
      explicitToolType,
      defaultToolType,
    ].forEach((config) => {
      const cmd = strategy.buildSanitizerCommand(buildContext(config), 'python3 ./a.py');
      const normalized = cmd.replace(/\\/g, '/');

      expect(normalized)
        .toMatch(/mssanitizer_\d+\.log/);
      expect(normalized).not.toContain('-npu-check');
    });
  });
});

describe('TritonCommandStrategy command builders', () => {
  const strategy = new TritonCommandStrategy();

  const makeParams = (config: Record<string, unknown>): CommandBuildParams<any> => ({
    config: config as never,
    sourceCannCmd: '. /env.sh',
    cdCmd: 'cd /op',
    cdBuildCmd: 'cd /op',
    op: 'triton_vector_add',
  });

  describe('buildRunCommand', () => {
    it('wraps the configured python target with source and cd commands', () => {
      const cmd = strategy.buildRunCommand(makeParams({ targetFile: 'python3 ./run.py' }));

      expect(cmd)
        .toBe('. /env.sh && cd /op && python3 ./run.py');
    });

    it('throws when the configured target file is empty', () => {
      expect(() => strategy.buildRunCommand(makeParams({ targetFile: '' })))
        .toThrow('cann.configMissingScript');
    });
  });

  describe('buildOpCommand', () => {
    it('uses the cpu_debug_script field when scriptField is cpu_debug_script', () => {
      const cmd = strategy.buildOpCommand({
        ...makeParams({
          script: 'script.sh',
          cpuDebugScript: 'cpu.sh',
          npuDebugScript: 'npu.sh',
        }),
        scriptField: 'cpu_debug_script',
      });

      expect(cmd)
        .toContain('cpu.sh');
      expect(cmd).not.toContain('script.sh');
    });

    it('uses the npu_debug_script field when scriptField is npu_debug_script', () => {
      const cmd = strategy.buildOpCommand({
        ...makeParams({
          script: 'script.sh',
          cpuDebugScript: 'cpu.sh',
          npuDebugScript: 'npu.sh',
        }),
        scriptField: 'npu_debug_script',
      });

      expect(cmd)
        .toContain('npu.sh');
      expect(cmd).not.toContain('script.sh');
    });

    it('throws when the selected script is empty', () => {
      expect(() => strategy.buildOpCommand(makeParams({})))
        .toThrow('cann.configMissingScript');
    });

    it('appends the compile option and advance command when provided', () => {
      const cmd = strategy.buildOpCommand({
        ...makeParams({ script: 'build.sh' }),
        compileOption: '--compile-option x',
        advance_cmd: '--advance y',
      });

      expect(cmd)
        .toBe('. /env.sh && cd /op && build.sh --compile-option x --advance y');
    });
  });

  describe('buildExampleCommand', () => {
    it('wraps the example script with source and cd commands', () => {
      const cmd = strategy.buildExampleCommand(makeParams({ script: 'bash build.sh --example' }));

      expect(cmd)
        .toBe('. /env.sh && cd /op && bash build.sh --example');
    });

    it('throws when the example script is empty', () => {
      expect(() => strategy.buildExampleCommand(makeParams({})))
        .toThrow('cann.configMissingScript');
    });

    it('appends the compile option and advance command when provided', () => {
      const cmd = strategy.buildExampleCommand({
        ...makeParams({ script: 'bash build.sh --example' }),
        compileOption: '--compile-option x',
        advance_cmd: '--advance y',
      });

      expect(cmd)
        .toBe('. /env.sh && cd /op && bash build.sh --example --compile-option x --advance y');
    });
  });

  it('rejects ut tests for triton', () => {
    expect(() => strategy.buildUtTestCommand({} as never))
      .toThrow('triton.utTestNotSupported');
  });

  describe('getRunTargetFile', () => {
    it('returns the workspace deploy target', () => {
      (ConfigService.readBuildOpDeployTargetFromWorkspace as jest.Mock).mockReturnValue('python3 ./run.py');

      expect(strategy.getRunTargetFile('op'))
        .toBe('python3 ./run.py');
    });

    it('throws when no deploy target is configured', () => {
      (ConfigService.readBuildOpDeployTargetFromWorkspace as jest.Mock).mockReturnValue('');

      expect(() => strategy.getRunTargetFile('op'))
        .toThrow('cann.configMissingScript');
    });
  });

  describe('getProfilerTargetFile', () => {
    it('returns the config target file when present', () => {
      expect(strategy.getProfilerTargetFile({ targetFile: 'python3 ./run.py' } as never, null, 'op'))
        .toBe('python3 ./run.py');
    });

    it('returns an empty string when the config target file is empty', () => {
      expect(strategy.getProfilerTargetFile({ targetFile: '' } as never, null, 'op'))
        .toBe('');
    });

    it('falls back to the workspace deploy target for simulate and on-board', () => {
      (ConfigService.readBuildOpDeployTargetFromWorkspace as jest.Mock).mockReturnValue('python3 ./sim.py');

      expect(strategy.getProfilerTargetFile({} as never, null, 'op'))
        .toBe('python3 ./sim.py');
    });

    it('falls back to the registry default op file', () => {
      (ConfigService.readBuildOpDeployTargetFromWorkspace as jest.Mock).mockReturnValue(undefined);
      (OperatorPluginRegistry.getDefaultPaths as jest.Mock).mockReturnValue({ targetOpFile: 'python3 ./op.py' });

      expect(strategy.getProfilerTargetFile({} as never, null, 'op'))
        .toBe('python3 ./op.py');
      expect(OperatorPluginRegistry.getDefaultPaths)
        .toHaveBeenCalledWith({
          op_type: 'triton',
          op_path: '',
          op_name: 'op',
        });
    });

    it('passes the operator op_path to the registry fallback', () => {
      (ConfigService.readBuildOpDeployTargetFromWorkspace as jest.Mock).mockReturnValue('');
      (OperatorPluginRegistry.getDefaultPaths as jest.Mock).mockReturnValue({ targetOpFile: 'python3 ./op.py' });

      strategy.getProfilerTargetFile({} as never, {
        op_path: '/proj/op1',
        op_name: 'op1',
      } as never, 'op');

      expect(OperatorPluginRegistry.getDefaultPaths)
        .toHaveBeenCalledWith({
          op_type: 'triton',
          op_path: '/proj/op1',
          op_name: 'op',
        });
    });
  });
});
