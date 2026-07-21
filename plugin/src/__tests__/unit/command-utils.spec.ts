jest.mock('@plugin/domain/utils/ascend-util', () => ({ resolveEffectiveCannSoc: jest.fn(() => 'ascend950') }));

import { resolveEffectiveCannSoc } from '@plugin/domain/utils/ascend-util';
import {
  getExecutableCommand,
  hasExplicitBuildTypeArgument,
  isDirectBuildScriptCommand,
  isRunPackageDeployTarget,
  isSupportedSimpleCommandFragment,
} from '@plugin/domain/utils/command-utils';

describe('isDirectBuildScriptCommand', () => {
  it.each([
    'build.sh --debug',
    './build.sh --debug',
    'bash /repo/math/add/build.sh --debug',
    'bash.exe "C:\\repo with spaces\\build.sh" --debug',
    "bash '/repo/$literal/`tick#semi;/build.sh' --debug",
  ])('accepts the supported direct Bash shape: %s', (command) => {
    expect(isDirectBuildScriptCommand(command))
      .toBe(true);
  });

  it.each([
    'python3 build.py',
    'sh build.sh --debug',
    'sh.exe build.sh --debug',
    'Bash build.sh --debug',
    'bash BUILD.sh --debug',
    'bash -x build.sh --debug',
    'bash -- build.sh --debug',
    'bash build.sh --',
    'bash build.sh "--"',
    'bash C:\\repo\\build.sh --debug',
    'bash build.sh --label=hello\\ world',
    'chmod +x build.sh && ./build.sh --debug',
    'bash build.sh --debug || true',
    'bash build.sh --debug; echo done',
    'bash build.sh --debug | tee build.log',
    'bash build.sh --debug &',
    'bash build.sh --debug # custom',
    'bash build.sh\necho done',
    'bash build.sh\n',
    'bash "$BUILD_ROOT/build.sh" --debug',
  ])('rejects unsupported, escaped, or compound syntax: %s', (command) => {
    expect(isDirectBuildScriptCommand(command))
      .toBe(false);
  });
});

describe('isSupportedSimpleCommandFragment', () => {
  it('accepts empty, ordinary, and single-quoted literal fragments', () => {
    expect(isSupportedSimpleCommandFragment())
      .toBe(true);
    expect(isSupportedSimpleCommandFragment('--fast --build-type=Release'))
      .toBe(true);
    expect(isSupportedSimpleCommandFragment("--label '$value `tick ; # &&'" ))
      .toBe(true);
  });

  it.each([
    '--',
    '"--"',
    '--label=hello\\ world',
    '--fast && echo done',
    '--fast; echo done',
    '--fast | tee log',
    '--fast # comment',
    '--fast\necho done',
    '--value=$HOME',
    '--value=`hostname`',
    "--build-type='Release'",
    "foo'--build-type=Release'",
  ])('rejects ambiguous late fragment syntax: %s', (fragment) => {
    expect(isSupportedSimpleCommandFragment(fragment))
      .toBe(false);
  });
});

describe('hasExplicitBuildTypeArgument', () => {
  it('finds both supported syntaxes across simple fragments', () => {
    expect(hasExplicitBuildTypeArgument('bash build.sh --build-type=Release'))
      .toBe(true);
    expect(hasExplicitBuildTypeArgument('bash build.sh', '--verbose --build-type Debug'))
      .toBe(true);
    expect(hasExplicitBuildTypeArgument('bash build.sh', '--verbose', '--build-type', 'Release'))
      .toBe(true);
    expect(hasExplicitBuildTypeArgument("bash build.sh '--build-type=Release'" ))
      .toBe(true);
  });

  it('ignores missing, embedded, case-mismatched, or unsupported fragments', () => {
    expect(hasExplicitBuildTypeArgument('bash build.sh --build-type'))
      .toBe(false);
    expect(hasExplicitBuildTypeArgument('bash build.sh --label=--build-type=Release'))
      .toBe(false);
    expect(hasExplicitBuildTypeArgument('bash build.sh --BUILD-TYPE=Release'))
      .toBe(false);
    expect(hasExplicitBuildTypeArgument('bash build.sh', '--fast && true', '--build-type=Release'))
      .toBe(false);
  });
});

describe('isRunPackageDeployTarget', () => {
  it('returns true for .run globs and paths', () => {
    expect(isRunPackageDeployTarget('build_out/*.run'))
      .toBe(true);
    expect(isRunPackageDeployTarget('/tmp/pkg.run'))
      .toBe(true);
  });

  it('returns false for commands and test binaries', () => {
    expect(isRunPackageDeployTarget('python3 run.py'))
      .toBe(false);
    expect(isRunPackageDeployTarget('build/add'))
      .toBe(false);
  });
});

describe('getExecutableCommand', () => {
  it('appends --force after RUN_FILE for deploy mode with wildcard .run', () => {
    const cmd = getExecutableCommand('build_out/*.run', {
      execute: true,
      mode: 'deploy',
    });

    expect(cmd)
      .toContain('RUN_FILE=$(find build_out/*.run)');
    expect(cmd)
      .toContain('"$RUN_FILE" --force');
    expect(cmd).not.toMatch(/find build_out\/\*\.run --force/);
  });

  it('does not append --force for run mode with wildcard .run', () => {
    const cmd = getExecutableCommand('build_out/*.run', {
      execute: true,
      mode: 'run',
    });

    expect(cmd)
      .toContain('"$RUN_FILE"');
    expect(cmd).not.toContain('--force');
  });

  it('appends --force for deploy mode with concrete .run path', () => {
    const cmd = getExecutableCommand('/path/pkg.run', {
      execute: true,
      mode: 'deploy',
    });

    expect(cmd)
      .toContain('chmod +x /path/pkg.run');
    expect(cmd)
      .toContain('"/path/pkg.run" --force');
  });

  it('does not append --force for run mode on test binary path', () => {
    const cmd = getExecutableCommand('build/add_custom', {
      execute: true,
      mode: 'run',
    });

    expect(cmd)
      .toContain('chmod +x build/add_custom');
    expect(cmd)
      .toContain('build/add_custom');
    expect(cmd).not.toContain('--force');
  });

  it('passes through full shell commands unchanged', () => {
    const shell = 'bash deploy.sh --force';

    expect(getExecutableCommand(shell, { mode: 'deploy' }))
      .toBe(shell);
  });

  it('respects deployForce: false', () => {
    const cmd = getExecutableCommand('build_out/*.run', {
      execute: true,
      mode: 'deploy',
      deployForce: false,
    });

    expect(cmd).not.toContain('--force');
  });

  it('appends --force for deploy on A2 SOC (ascend910b)', () => {
    (resolveEffectiveCannSoc as jest.Mock).mockReturnValueOnce('ascend910b');

    const cmd = getExecutableCommand('build_out/*.run', {
      execute: true,
      mode: 'deploy',
    });

    expect(cmd)
      .toContain('"$RUN_FILE" --force');
  });

  it('does not append --force for deploy on A3 SOC (ascend910_93)', () => {
    (resolveEffectiveCannSoc as jest.Mock).mockReturnValueOnce('ascend910_93');

    const cmd = getExecutableCommand('build_out/*.run', {
      execute: true,
      mode: 'deploy',
    });

    expect(cmd)
      .toContain('"$RUN_FILE"');
    expect(cmd).not.toContain('--force');
  });
});
