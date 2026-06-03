jest.mock('@plugin/domain/utils/ascend-util', () => ({
  resolveEffectiveCannSoc: jest.fn(() => 'ascend950'),
}));

import { resolveEffectiveCannSoc } from '@plugin/domain/utils/ascend-util';
import {
  getExecutableCommand,
  isRunPackageDeployTarget,
} from '@plugin/domain/utils/command-utils';

describe('isRunPackageDeployTarget', () => {
  it('returns true for .run globs and paths', () => {
    expect(isRunPackageDeployTarget('build_out/*.run')).toBe(true);
    expect(isRunPackageDeployTarget('/tmp/pkg.run')).toBe(true);
  });

  it('returns false for commands and test binaries', () => {
    expect(isRunPackageDeployTarget('python3 run.py')).toBe(false);
    expect(isRunPackageDeployTarget('build/add')).toBe(false);
  });
});

describe('getExecutableCommand', () => {
  it('appends --force after RUN_FILE for deploy mode with wildcard .run', () => {
    const cmd = getExecutableCommand('build_out/*.run', { execute: true, mode: 'deploy' });

    expect(cmd).toContain('RUN_FILE=$(find build_out/*.run)');
    expect(cmd).toContain('"$RUN_FILE" --force');
    expect(cmd).not.toMatch(/find build_out\/\*\.run --force/);
  });

  it('does not append --force for run mode with wildcard .run', () => {
    const cmd = getExecutableCommand('build_out/*.run', { execute: true, mode: 'run' });

    expect(cmd).toContain('"$RUN_FILE"');
    expect(cmd).not.toContain('--force');
  });

  it('appends --force for deploy mode with concrete .run path', () => {
    const cmd = getExecutableCommand('/path/pkg.run', { execute: true, mode: 'deploy' });

    expect(cmd).toContain('chmod +x /path/pkg.run');
    expect(cmd).toContain('"/path/pkg.run" --force');
  });

  it('does not append --force for run mode on test binary path', () => {
    const cmd = getExecutableCommand('build/add_custom', { execute: true, mode: 'run' });

    expect(cmd).toContain('chmod +x build/add_custom');
    expect(cmd).toContain('build/add_custom');
    expect(cmd).not.toContain('--force');
  });

  it('passes through full shell commands unchanged', () => {
    const shell = 'bash deploy.sh --force';
    expect(getExecutableCommand(shell, { mode: 'deploy' })).toBe(shell);
  });

  it('respects deployForce: false', () => {
    const cmd = getExecutableCommand('build_out/*.run', {
      execute: true,
      mode: 'deploy',
      deployForce: false,
    });

    expect(cmd).not.toContain('--force');
  });

  it('does not append --force for deploy on non-A5 SOC', () => {
    (resolveEffectiveCannSoc as jest.Mock).mockReturnValueOnce('ascend910b');

    const cmd = getExecutableCommand('build_out/*.run', { execute: true, mode: 'deploy' });

    expect(cmd).toContain('"$RUN_FILE"');
    expect(cmd).not.toContain('--force');
  });
});
