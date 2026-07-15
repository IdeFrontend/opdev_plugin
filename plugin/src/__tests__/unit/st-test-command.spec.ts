import {
  buildPythonPathExport,
  buildStTestCommand,
  normalizeStTestModes,
} from '@plugin/domain/services/st-test-command';
import { shellQuoteBash } from '@plugin/domain/utils/shell-env-exports';

describe('ST test command helpers', () => {
  it('normalizes selected modes once in canonical execution order', () => {
    expect(normalizeStTestModes([
      ' E2E ',
      'kernel',
      'ACLNN',
      'kernel',
    ]))
      .toEqual([
        'kernel',
        'aclnn',
        'e2e',
      ]);
  });

  it('rejects an unknown mode even when mixed with valid modes', () => {
    expect(() => normalizeStTestModes([
      'kernel',
      'unknown',
      'ACLNN',
    ]))
      .toThrow('Unsupported ST test mode(s): unknown');
  });

  it('prepends managed source and dependencies without overwriting PYTHONPATH', () => {
    expect(buildPythonPathExport([
      '/cache with spaces/source',
      '/cache/dependencies',
    ]))
      .toBe("export PYTHONDONTWRITEBYTECODE=1 && export PYTHONPATH='/cache with spaces/source:/cache/dependencies'${PYTHONPATH:+:$PYTHONPATH}");
  });

  it('quotes every path and applies the required kernel defaults', () => {
    const params = {
      interpreter: "/opt/python's/bin/python3",
      environmentScriptPath: '/opt/CANN env/set_env.sh',
      pythonPathEntries: [
        '/cache/source',
        '/cache/deps;safe',
      ],
      mode: 'kernel' as const,
      inputCsvPath: "/workspace/op $(touch nope)/input's.csv",
      outputCsvPath: '/workspace/.vscode/st results/out;safe.csv',
      pluginPath: '/workspace/op/tests/assets & data',
    };
    const command = buildStTestCommand(params);

    expect(command)
      .toContain(`. ${shellQuoteBash(params.environmentScriptPath)}`);
    expect(command)
      .toContain(shellQuoteBash(params.interpreter));
    expect(command)
      .toContain(shellQuoteBash(params.inputCsvPath));
    expect(command)
      .toContain(shellQuoteBash(params.outputCsvPath));
    expect(command)
      .toContain(shellQuoteBash(params.pluginPath));
    expect(command)
      .toContain("'-d=false' '-b=release' '--pc=8'");
    expect(command)
      .toContain("'-m' 'ttk' 'kernel'");
  });

  it.each([
    'aclnn',
    'e2e',
  ] as const)('does not add kernel-only defaults to %s mode', (mode) => {
    const command = buildStTestCommand({
      interpreter: 'python3',
      mode,
      inputCsvPath: '/tmp/input.csv',
      outputCsvPath: '/tmp/output.csv',
      pluginPath: '/tmp/tests',
    });

    expect(command)
      .toContain(`'${mode}'`);
    expect(command).not.toContain('-d=false');
    expect(command).not.toContain('-b=release');
    expect(command).not.toContain('--pc=8');
  });
});
