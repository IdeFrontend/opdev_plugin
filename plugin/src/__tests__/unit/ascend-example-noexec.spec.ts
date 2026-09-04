import { AscendCommandStrategy } from '@plugin/domain/services/command-strategy/ascend-strategy';

const noexecTokenPattern = /(^|\s)--noexec(?:=|\s|$)/;
const noexeTokenPattern = /(^|\s)--noexe(?:=|\s|$)/;

describe('AscendCommandStrategy standard-custom build example --noexec', () => {
  it('adds --noexec only when an existing run_example command requests build only', () => {
    const strategy = new AscendCommandStrategy();
    const command = strategy.buildExampleCommand({
      config: {
        script: 'bash build.sh --vendor_name=custom --run_example',
        executionMode: 'eager',
        targetFile: null,
      },
      sourceCannCmd: '',
      cdCmd: '',
      operatorNames: 'add_example',
      compileOption: '--soc=ascend910b',
      buildExampleOnly: true,
      op: 'add_example',
    });

    expect(command)
      .toContain('--run_example add_example eager cust --soc=ascend910b --noexec');
    expect(command)
      .toMatch(noexecTokenPattern);
    expect(command)
      .not.toMatch(noexeTokenPattern);
    expect((command.match(/(^|\s)--noexec(?:=|\s|$)/g) || []).length)
      .toBe(1);
  });

  it('does not duplicate an existing --noexec option', () => {
    const strategy = new AscendCommandStrategy();
    const command = strategy.buildExampleCommand({
      config: {
        script: 'bash build.sh --vendor_name=custom --run_example',
        executionMode: 'eager',
        targetFile: null,
      },
      sourceCannCmd: '',
      cdCmd: '',
      operatorNames: 'add_example',
      compileOption: '--noexec',
      buildExampleOnly: true,
      op: 'add_example',
    });

    expect(command)
      .not.toMatch(noexeTokenPattern);
    expect((command.match(/(^|\s)--noexec(?:=|\s|$)/g) || []).length)
      .toBe(1);
  });
});
