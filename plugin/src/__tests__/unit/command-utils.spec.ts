import {
  getExecutableCommand,
  hasExplicitBuildTypeArgument,
  isDirectBuildScriptCommand,
  isRunPackageTarget,
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

describe('isRunPackageTarget', () => {
  it('returns true for .run globs and paths', () => {
    expect(isRunPackageTarget('build_out/*.run'))
      .toBe(true);
    expect(isRunPackageTarget('/tmp/pkg.run'))
      .toBe(true);
  });

  it('returns false for commands and test binaries', () => {
    expect(isRunPackageTarget('python3 run.py'))
      .toBe(false);
    expect(isRunPackageTarget('build/add'))
      .toBe(false);
  });
});

describe('getExecutableCommand', () => {
  it('probes --force support before executing a wildcard .run package', () => {
    const cmd = getExecutableCommand('build_out/*.run', { execute: true });

    expect(cmd)
      .toContain('RUN_FILE=$(find build_out/*.run)');
    expect(cmd)
      .toContain('RUN_FILE_HELP=$("$RUN_FILE" --help 2>&1 || true)');
    expect(cmd)
      .toContain('case "$RUN_FILE_HELP" in');
    expect(cmd)
      .toContain(') "$RUN_FILE" --force ;; *) "$RUN_FILE" ;; esac');
    expect(cmd).not.toMatch(/find build_out\/\*\.run --force/);
  });

  it('loosely detects --force anywhere in help output', () => {
    const cmd = getExecutableCommand('build_out/*.run', { execute: true });

    expect(cmd)
      .toContain('case "$RUN_FILE_HELP" in *--force*)');
  });

  it('probes --force support before executing a concrete .run path', () => {
    const cmd = getExecutableCommand('/path/pkg.run', { execute: true });

    expect(cmd)
      .toContain("RUN_FILE='/path/pkg.run'");
    expect(cmd)
      .toContain('chmod +x "$RUN_FILE"');
    expect(cmd)
      .toContain('"$RUN_FILE" --help');
    expect(cmd)
      .toContain('"$RUN_FILE" --force');
  });

  it('does not probe --force support for a non-.run executable', () => {
    const cmd = getExecutableCommand('build/add_custom', { execute: true });

    expect(cmd)
      .toContain('chmod +x build/add_custom');
    expect(cmd)
      .toContain('build/add_custom');
    expect(cmd).not.toContain('--help');
  });

  it('passes through full shell commands unchanged', () => {
    const shell = 'bash deploy.sh --force';

    expect(getExecutableCommand(shell))
      .toBe(shell);
  });
});
