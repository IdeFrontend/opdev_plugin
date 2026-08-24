jest.mock('vscode', () => ({
  workspace: { workspaceFolders: [{ uri: { fsPath: '/ws/triton-op' } }] },
  env: { uriScheme: 'vscode' },
}), { virtual: true });

import { TritonCommandStrategy } from '@plugin/domain/services/command-strategy/triton-strategy';
import { ConfigRecord } from '@plugin/domain/models/config-model';
import { getIdeConfigDirName } from '@plugin/helpers/ide-config-dir';
import * as vscode from 'vscode';

describe('TritonCommandStrategy.buildSanitizerCommand', () => {
  const strategy = new TritonCommandStrategy();

  const baseConfig = {
    op: 'triton_vector_add',
    target_file: 'python3 ./triton_vector_add.py',
    user_options: {
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
    },
  } as unknown as ConfigRecord;

  it('wraps python target after -- separator', () => {
    const cmd = strategy.buildSanitizerCommand(
      baseConfig,
      null,
      '. /env.sh',
      'cd /op',
      'python3 ./triton_vector_add.py',
    );

    expect(cmd)
      .toContain('mssanitizer');
    expect(cmd)
      .toContain('--tool=memcheck');
    expect(cmd)
      .toContain('-- python3 ./triton_vector_add.py');
    expect(cmd).not.toMatch(/^mssanitizer[^\n]*python3 \.\/triton_vector_add\.py/);
  });

  it('writes log file under workspace ide config dir', () => {
    const cmd = strategy.buildSanitizerCommand(
      baseConfig,
      null,
      '',
      'cd /op',
      'python3 ./triton_vector_add.py',
    );

    const ideDir = getIdeConfigDirName();
    const normalized = cmd.replace(/\\/g, '/');

    expect(normalized)
      .toContain(`--log-file=/ws/triton-op/${ideDir}/mindstudio_sanitizer_log/mssanitizer_`);
  });

  it('emits block-id only when useBlock is true', () => {
    const withBlock = {
      ...baseConfig,
      user_options: {
        ...baseConfig.user_options,
        useBlock: true,
        blockId: 0,
      },
    } as unknown as ConfigRecord;

    expect(strategy.buildSanitizerCommand(withBlock, null, '', 'cd /op', 'python3 ./a.py'))
      .toContain('--block-id=0');

    expect(strategy.buildSanitizerCommand(baseConfig, null, '', 'cd /op', 'python3 ./a.py'))
      .not.toContain('--block-id');
  });

  it('includes basic log options from config', () => {
    const cmd = strategy.buildSanitizerCommand(
      baseConfig,
      null,
      '',
      'cd /op',
      'python3 ./a.py',
    );

    expect(cmd)
      .toContain('--log-level=warn');
    expect(cmd)
      .toContain('--max-debuglog-size=1024');
  });

  it('omits --max-debuglog-size when the stored value is invalid (e.g. 0)', () => {
    const badSize = {
      ...baseConfig,
      user_options: {
        ...baseConfig.user_options,
        maxDebuglogSize: 0,
      },
    } as unknown as ConfigRecord;

    const cmd = strategy.buildSanitizerCommand(badSize, null, '', 'cd /op', 'python3 ./a.py');

    expect(cmd).not.toContain('--max-debuglog-size');
  });

  it('omits --log-level when the stored value is not a valid level', () => {
    const badLevel = {
      ...baseConfig,
      user_options: {
        ...baseConfig.user_options,
        logLevel: 'verbose',
      },
    } as unknown as ConfigRecord;

    expect(strategy.buildSanitizerCommand(badLevel, null, '', 'cd /op', 'python3 ./a.py'))
      .not.toContain('--log-level');
  });

  it('omits --block-id when the stored id is out of mssanitizer range (0..200)', () => {
    const badBlock = {
      ...baseConfig,
      user_options: {
        ...baseConfig.user_options,
        useBlock: true,
        blockId: 999,
      },
    } as unknown as ConfigRecord;

    expect(strategy.buildSanitizerCommand(badBlock, null, '', 'cd /op', 'python3 ./a.py'))
      .not.toContain('--block-id');
  });

  it('serializes multiple selected tools as repeated --tool flags', () => {
    const multi = {
      ...baseConfig,
      user_options: {
        ...baseConfig.user_options,
        tool: {
          memcheck: true,
          racecheck: true,
          initcheck: false,
        },
      },
    } as unknown as ConfigRecord;

    const cmd = strategy.buildSanitizerCommand(multi, null, '', 'cd /op', 'python3 ./a.py');

    expect(cmd)
      .toContain('--tool=memcheck');
    expect(cmd)
      .toContain('--tool=racecheck');
    expect(cmd).not.toContain('--tool=memcheck,racecheck');
  });

  it('emits memcheck sub-options even when the memcheck tool box is unchecked', () => {
    const leakOnly = {
      ...baseConfig,
      user_options: {
        ...baseConfig.user_options,
        tool: {
          memcheck: false,
          racecheck: true,
          initcheck: false,
        },
        memcheckOption: {
          'leak-check': true,
          'check-unused-memory': false,
        },
      },
    } as unknown as ConfigRecord;

    const cmd = strategy.buildSanitizerCommand(leakOnly, null, '', 'cd /op', 'python3 ./a.py');

    expect(cmd)
      .toContain('--tool=racecheck');
    expect(cmd)
      .toContain('--leak-check=yes');
  });

  it('omits --tool entirely (no stray token) when no tool is selected', () => {
    const noTools = {
      ...baseConfig,
      user_options: {
        ...baseConfig.user_options,
        tool: {
          memcheck: false,
          racecheck: false,
          initcheck: false,
        },
      },
    } as unknown as ConfigRecord;

    const cmd = strategy.buildSanitizerCommand(noTools, null, '', 'cd /op', 'python3 ./a.py');

    expect(cmd).not.toContain('--tool');
    expect(cmd).not.toMatch(/mssanitizer\s{2,}/);
  });

  it('shell-quotes the --log-file path when the workspace path contains spaces', () => {
    const original = vscode.workspace.workspaceFolders;

    (vscode.workspace as unknown as { workspaceFolders: unknown }).workspaceFolders = [{ uri: { fsPath: '/ws/my op' } }];

    try {
      const cmd = strategy.buildSanitizerCommand(baseConfig, null, '', 'cd /op', 'python3 ./a.py');
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

  it('builds npu-check with repeated selected npu tool flags from toolType', () => {
    const npuConfig = {
      ...baseConfig,
      user_options: {
        ...baseConfig.user_options,
        toolType: 'npu-check',
        tool: {
          memcheck: true,
          synccheck: true,
          racecheck: false,
          initcheck: true,
          soccheck: true,
          overcheck: false,
        },
      },
    } as unknown as ConfigRecord;

    const cmd = strategy.buildSanitizerCommand(npuConfig, null, '', 'cd /op', 'python3 ./a.py');

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
    const npuConfig = {
      ...baseConfig,
      user_options: {
        ...baseConfig.user_options,
        toolType: 'npu-check',
        tool: {
          memcheck: true,
          synccheck: true,
          racecheck: true,
          initcheck: true,
          soccheck: true,
          overcheck: true,
        },
      },
    } as unknown as ConfigRecord;

    const cmd = strategy.buildSanitizerCommand(npuConfig, null, '', 'cd /op', 'python3 ./a.py');

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
    const npuConfig = {
      ...baseConfig,
      user_options: {
        ...baseConfig.user_options,
        toolType: 'npu-check',
        tool: {
          memcheck: true,
          synccheck: true,
          racecheck: true,
          initcheck: true,
          soccheck: true,
          overcheck: true,
        },
      },
    } as unknown as ConfigRecord;

    const cmd = strategy.buildSanitizerCommand(npuConfig, null, '', 'cd /op', 'python3 ./a.py');
    const ideDir = getIdeConfigDirName();
    const normalized = cmd.replace(/\\/g, '/');

    expect(normalized)
      .toContain(`--log-file=/ws/triton-op/${ideDir}/mindstudio_sanitizer_log/mssanitizer_`);
  });
});
