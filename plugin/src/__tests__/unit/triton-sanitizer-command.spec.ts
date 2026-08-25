jest.mock('vscode', () => ({
  workspace: { workspaceFolders: [{ uri: { fsPath: '/ws/triton-op' } }] },
  env: { uriScheme: 'vscode' },
}), { virtual: true });

import { TritonCommandStrategy } from '@plugin/domain/services/command-strategy/triton-strategy';
import type { CommandContext } from '@plugin/domain/services/command-strategy';
import type { SanitizerConfig } from '@plugin/service/config-service';
import { getIdeConfigDirName } from '@plugin/helpers/ide-config-dir';
import * as vscode from 'vscode';

describe('TritonCommandStrategy.buildSanitizerCommand', () => {
  const strategy = new TritonCommandStrategy();

  const baseConfig: SanitizerConfig = {
    script: 'python3 ./triton_vector_add.py',
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
});
