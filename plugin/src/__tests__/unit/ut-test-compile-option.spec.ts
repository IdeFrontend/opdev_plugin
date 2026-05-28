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
});
