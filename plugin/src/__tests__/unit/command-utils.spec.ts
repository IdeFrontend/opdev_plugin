import {
  Command,
  generateChmodCommand,
  getAdvanceCmd,
  getExecutableCommand,
  hasExplicitBuildTypeArgument,
  isDirectBuildScriptCommand,
  isRunPackageTarget,
  isSupportedSimpleCommandFragment,
  joinCommands,
  objectToCommandString,
  shouldAddDebugBuildType,
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

  it('returns an empty string for an empty file', () => {
    expect(getExecutableCommand(''))
      .toBe('');
  });

  it('resolves a wildcard non-run target with find + chmod + execute', () => {
    const cmd = getExecutableCommand('build_out/*', { execute: true });

    expect(cmd)
      .toBe('RUN_FILE=$(find build_out/*) && chmod +x "$RUN_FILE" && "$RUN_FILE"');
  });

  it('does not chmod a bare command', () => {
    expect(getExecutableCommand('npm test'))
      .toBe('npm test');
    expect(getExecutableCommand('/usr/bin/python3 run.py'))
      .toBe('/usr/bin/python3 run.py');
  });

  it('honors read/write/execute permission flags', () => {
    expect(getExecutableCommand('/bin/tool', { read: true }))
      .toBe('chmod +r /bin/tool && /bin/tool');
    expect(getExecutableCommand('/bin/tool', { write: true }))
      .toBe('chmod +w /bin/tool && /bin/tool');
    expect(getExecutableCommand('/bin/tool', {
      read: true,
      write: true,
      execute: true,
    }))
      .toBe('chmod +rwx /bin/tool && /bin/tool');
  });

  it('runs the file without chmod when no permission bits are enabled', () => {
    const cmd = getExecutableCommand('/bin/tool', {});

    expect(cmd)
      .toBe('/bin/tool');
    expect(cmd)
      .not.toContain('chmod');
  });

  it('returns empty chmod for an empty file', () => {
    expect(generateChmodCommand(''))
      .toBe('');
    expect(generateChmodCommand('', {}))
      .toBe('');
  });

  it('isRunPackageTarget is false for an empty target', () => {
    expect(isRunPackageTarget(''))
      .toBe(false);
  });
});

describe('objectToCommandString', () => {
  it('returns an empty string for no options', () => {
    expect(objectToCommandString({}))
      .toBe('');
  });

  it('emits --key for true and skips false/undefined/null', () => {
    expect(objectToCommandString({
      pkg: true,
      skipFalse: false,
      skipUndefined: undefined,
      skipNull: null,
      soc: 'Ascend310',
    }))
      .toBe('--pkg --soc=Ascend310');
  });

  it('emits repeated --key=value for arrays by default', () => {
    expect(objectToCommandString({
      tool: [
        'memcheck',
        'leak',
      ],
    }))
      .toBe('--tool=memcheck --tool=leak');
  });

  it('joins array values with the configured separator', () => {
    expect(objectToCommandString(
      {
        metrics: [
          'A',
          'B',
        ],
        tool: [
          'x',
          'y',
        ],
      },
      { separators: { metrics: ',' } },
    ))
      .toBe('--metrics=A,B --tool=x --tool=y');
  });

  it('emits numeric scalars and array members', () => {
    expect(objectToCommandString({
      depth: 2,
      ports: [
        1,
        2,
      ],
    }))
      .toBe('--depth=2 --ports=1 --ports=2');
  });
});

describe('joinCommands', () => {
  it('joins non-empty commands with &&', () => {
    expect(joinCommands('a', 'b', 'c'))
      .toBe('a && b && c');
  });

  it('filters out empty, null, and undefined commands', () => {
    expect(joinCommands('a', '', null, undefined, 'b'))
      .toBe('a && b');
  });

  it('returns an empty string when nothing is left', () => {
    expect(joinCommands('', null, undefined))
      .toBe('');
  });
});

describe('shouldAddDebugBuildType', () => {
  it('adds --build-type=Debug to a direct cpu debug build script', () => {
    expect(shouldAddDebugBuildType('cpu_debug_script', './build.sh --onboard'))
      .toBe(true);
    expect(shouldAddDebugBuildType('npu_debug_script', 'bash build.sh --debug'))
      .toBe(true);
  });

  it('rejects non-debug script fields', () => {
    expect(shouldAddDebugBuildType('build_script', './build.sh'))
      .toBe(false);
  });

  it('rejects scripts that are not direct build invocations', () => {
    expect(shouldAddDebugBuildType('cpu_debug_script', 'python3 build.py'))
      .toBe(false);
  });

  it('rejects unsupported fragments', () => {
    expect(shouldAddDebugBuildType('cpu_debug_script', './build.sh', '--fast && true'))
      .toBe(false);
  });

  it('rejects scripts that already carry an explicit build type', () => {
    expect(shouldAddDebugBuildType('cpu_debug_script', 'bash build.sh --build-type=Release'))
      .toBe(false);
    expect(shouldAddDebugBuildType('cpu_debug_script', 'bash build.sh', '--build-type', 'Debug'))
      .toBe(false);
  });
});

describe('Command', () => {
  it('renders name, options, arguments, and subcommand in order', () => {
    const cmd = new Command('ascend')
      .addOption('pkg', true)
      .addOption('soc', 'Ascend310')
      .addArgument('--verbose')
      .addArgument('extra');

    expect(cmd.toString())
      .toBe('ascend --pkg --soc=Ascend310 --verbose extra');
  });

  it('adds options in bulk and ignores empty arguments', () => {
    const cmd = new Command('tool')
      .addOptions({
        a: '1',
        b: 2,
      })
      .addArgument('')
      .addArgument('x');

    expect(cmd.toString())
      .toBe('tool --a=1 --b=2 x');
  });

  it('renders only the name when nothing is configured', () => {
    expect(new Command('bare')
      .toString())
      .toBe('bare');
  });

  it('recursively renders a subcommand with its own config', () => {
    const cmd = new Command('parent');
    const sub = cmd.sub('child', { separators: { list: '|' } });

    sub.addOption('list', [
      'a',
      'b',
    ]);

    expect(cmd.toString())
      .toBe('parent child --list=a|b');
  });

  it('supports nested subcommand chains', () => {
    const cmd = new Command('outer')
      .addOption('flag', true);

    cmd.sub('inner')
      .addArgument('pos');

    expect(cmd.toString())
      .toBe('outer --flag inner pos');
  });
});

describe('getAdvanceCmd', () => {
  it('returns an empty string for non-array or empty input', () => {
    expect(getAdvanceCmd(undefined))
      .toBe('');
    expect(getAdvanceCmd('not-an-array'))
      .toBe('');
    expect(getAdvanceCmd([]))
      .toBe('');
  });

  it('renders name/value pairs as --name=value', () => {
    expect(getAdvanceCmd([
      {
        name: 'soc',
        value: 'Ascend310',
      },
      {
        name: 'pkg',
        value: 'x',
      },
    ]))
      .toBe('--soc=Ascend310 --pkg=x');
  });

  it('renders flag-only entries without =value', () => {
    expect(getAdvanceCmd([
      {
        name: 'debug',
        value: '',
      },
    ]))
      .toBe('--debug');
  });

  it('skips entries without a name', () => {
    expect(getAdvanceCmd([
      {
        name: '',
        value: 'x',
      },
      {
        name: 'keep',
        value: '1',
      },
    ]))
      .toBe('--keep=1');
  });
});
