import { AscendCommandStrategy } from '@plugin/domain/services/command-strategy/ascend-strategy';
import { CannCommandStrategy } from '@plugin/domain/services/command-strategy/cann-strategy';
import type { ConfigRecord } from '@plugin/domain/models/types';

describe('buildUtTestCommand compileOption', () => {
  const baseConfig = {
    id: 1,
    project_id: 1,
    op: 'test_op',
    config_type: 'ut_test',
    script: './build.sh --ut',
    user_options: { script: './build.sh --ut' },
  } as ConfigRecord;

  it('ascend strategy appends compileOption to UT command', () => {
    const strategy = new AscendCommandStrategy();
    const command = strategy.buildUtTestCommand({
      config: baseConfig,
      sourceCannCmd: 'source /path/setenv.bash',
      cdCmd: 'cd /project',
      compileOption: '--experimental',
      operatorNames: 'add',
    });

    expect(command)
      .toContain('--experimental');
    expect(command)
      .toContain('./build.sh --ut');
  });

  it('cann strategy appends compileOption to UT command', () => {
    const strategy = new CannCommandStrategy();
    const command = strategy.buildUtTestCommand({
      config: baseConfig,
      sourceCannCmd: 'source /path/setenv.bash',
      cdCmd: 'cd /project',
      compileOption: '--experimental',
      operatorNames: 'add',
    });

    expect(command)
      .toContain('--experimental');
    expect(command)
      .toContain('./build.sh --ut');
  });

  it('cann strategy removes --ops={operatorNames} when no operator selected', () => {
    const strategy = new CannCommandStrategy();
    const config = {
      ...baseConfig,
      user_options: { script: 'bash build.sh --soc={soc_version} --ops={operatorNames} -u' },
    } as typeof baseConfig;
    const command = strategy.buildUtTestCommand({
      config,
      sourceCannCmd: 'source /path/setenv.bash',
      cdCmd: 'cd /project',
    });

    expect(command)
      .not.toMatch(/--ops=/);
    expect(command)
      .toContain('bash build.sh --soc={soc_version} -u');
  });

  it('ascend strategy appends --ops for legacy settings script without placeholder', () => {
    const strategy = new AscendCommandStrategy();
    const config = {
      id: 1,
      project_id: 1,
      op: 'test_op',
      config_type: 'build_op',
      user_options: { script: 'bash build.sh --pkg --soc={soc_version} --vendor_name=custom' },
    } as ConfigRecord;
    const command = strategy.buildOpCommand({
      config,
      sourceCannCmd: 'source /path/setenv.bash',
      cdCmd: 'cd /project',
      operatorNames: 'legacy_op',
    });

    expect(command)
      .toContain('--ops=legacy_op');
    expect(command.match(/--ops=/g)?.length)
      .toBe(1);
  });

  it('ascend strategy applies --ops only from settings template (no runtime injection)', () => {
    const strategy = new AscendCommandStrategy();
    const config = {
      id: 1,
      project_id: 1,
      op: 'test_op',
      config_type: 'build_op',
      user_options: { script: 'bash build.sh --pkg --soc={soc_version} --vendor_name=custom --ops={operatorNames}' },
    } as ConfigRecord;
    const command = strategy.buildOpCommand({
      config,
      sourceCannCmd: 'source /path/setenv.bash',
      cdCmd: 'cd /project',
      operatorNames: 'my_op',
    });

    expect(command)
      .toContain('--ops=my_op');
    expect(command)
      .not.toContain('{operatorNames}');
    expect(command.match(/--ops=/g)?.length)
      .toBe(1);
  });
});

describe.each([
  [
    'Ascend',
    () => new AscendCommandStrategy(),
  ],
  [
    'CANN',
    () => new CannCommandStrategy(),
  ],
] as const)('%s debug build type', (_name, createStrategy) => {
  const debugConfig = {
    id: 1,
    project_id: 1,
    op: 'test_op',
    config_type: 'build_op',
    user_options: {
      cpu_debug_script: 'bash.exe "C:\\repo with spaces\\build.sh" --simulator {simulator_type}',
      npu_debug_script: 'bash ./build.sh --debug',
      script: 'bash ./build.sh --pkg',
    },
  } as ConfigRecord;

  function build(
    scriptField: 'script' | 'cpu_debug_script' | 'npu_debug_script',
    options: { compileOption?: string;
      advance_cmd?: string } = {},
    config: ConfigRecord = debugConfig,
  ): string {
    return createStrategy()
      .buildOpCommand({
        config,
        operator: null,
        sourceCannCmd: '',
        cdCmd: 'cd /project',
        scriptField,
        ...options,
      });
  }

  it('adds Debug exactly once to supported CPU and NPU debug commands', () => {
    expect(build('cpu_debug_script')
      .match(/--build-type=Debug/g))
      .toHaveLength(1);
    expect(build('npu_debug_script')
      .match(/--build-type=Debug/g))
      .toHaveLength(1);
  });

  it('lets explicit late compile and advanced arguments win', () => {
    const compileCommand = build('cpu_debug_script', { compileOption: '--fast --build-type=Release' });
    const advancedCommand = build('npu_debug_script', { advance_cmd: '--trace --build-type Debug' });

    expect(compileCommand)
      .toContain('--build-type=Release');
    expect(compileCommand).not.toContain('--build-type=Debug');
    expect(advancedCommand)
      .toContain('--build-type Debug');
    expect(advancedCommand).not.toContain('--build-type=Debug');
  });

  it.each([
    [
      'cpu_debug_script',
      'sh build.sh --debug',
      {},
    ],
    [
      'cpu_debug_script',
      'bash build.sh --debug --',
      {},
    ],
    [
      'cpu_debug_script',
      'bash build.sh --label=hello\\ world',
      {},
    ],
    [
      'npu_debug_script',
      'bash build.sh --debug && echo done',
      {},
    ],
    [
      'npu_debug_script',
      'python3 build.py --debug',
      {},
    ],
    [
      'npu_debug_script',
      'bash build.sh --debug',
      { compileOption: '--fast && echo done' },
    ],
    [
      'npu_debug_script',
      'bash build.sh --debug',
      { advance_cmd: '--trace # comment' },
    ],
  ] as const)('leaves unsupported debug input unchanged: %s / %s', (field, script, options) => {
    const customConfig = {
      ...debugConfig,
      user_options: {
        ...debugConfig.user_options,
        [field]: script,
      },
    } as ConfigRecord;

    expect(build(field, options, customConfig)).not.toContain('--build-type=Debug');
  });

  it('leaves supported non-debug commands unchanged', () => {
    expect(build('script')).not.toContain('--build-type');
  });
});
