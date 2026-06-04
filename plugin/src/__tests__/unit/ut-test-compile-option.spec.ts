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

    expect(command).toContain('--experimental');
    expect(command).toContain('./build.sh --ut');
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

    expect(command).toContain('--experimental');
    expect(command).toContain('./build.sh --ut');
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
      user_options: {
        script: 'bash build.sh --pkg --soc={soc_version} --vendor_name=custom',
      },
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
      user_options: {
        script: 'bash build.sh --pkg --soc={soc_version} --vendor_name=custom --ops={operatorNames}',
      },
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
