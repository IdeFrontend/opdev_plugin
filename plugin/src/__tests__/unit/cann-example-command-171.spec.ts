import { CannCommandStrategy } from '@plugin/domain/services/command-strategy/cann-strategy';

/**
 * Regression for plugin_release #171: standard-custom `--run_example` was emitted as
 * `bash build.sh --vendor_name=custom --run_example` with no positional operator/mode,
 * so build.sh printed "Start to run examples, name:  mode:" (both empty) and dumped its
 * usage instead of building/running the example. A field run confirmed the name/mode come
 * from POSITIONAL args (`<op> <mode> <pkg_mode>`), not from `--ops`: a command carrying
 * `--ops=abs` still left `name:` empty. The fix mirrors AscendCommandStrategy.
 */
describe('CannCommandStrategy.buildExampleCommand (plugin_release #171)', () => {
  const strategy = new CannCommandStrategy();
  const base = {
    operator: null,
    sourceCannCmd: '. /etc/profile',
    cdCmd: 'cd /home/dev/ops-math',
    advance_cmd: '',
  };

  const legacyScript = 'bash build.sh --vendor_name=custom --run_example';

  it('appends the positional operator/mode/pkg and a --soc for a legacy run_example script', () => {
    const cmd = strategy.buildExampleCommand({
      ...base,
      config: { project_id: 1, op: 'add_example', script: legacyScript },
      operatorNames: 'add_example',
      compileOption: '',
    } as any);

    // build.sh reads name (op) + mode from positionals after --run_example.
    expect(cmd)
      .toContain('--run_example add_example eager cust');
    // --soc sets COMPUTE_UNIT; placeholder is resolved later by executeOperatorCommand.
    expect(cmd)
      .toContain('--soc={soc_version}');
    // The operator is passed positionally, NOT as a --ops flag.
    expect(cmd)
      .not.toContain('--ops');
  });

  it('does NOT duplicate --soc when compileOption already supplies it (simulate-example flow)', () => {
    const cmd = strategy.buildExampleCommand({
      ...base,
      config: { project_id: 1, op: 'add_example', script: legacyScript },
      operatorNames: 'add_example',
      compileOption: '--simulator Ascend910C --soc=ascend910_93',
    } as any);

    expect((cmd.match(/--soc=/g) || []).length)
      .toBe(1);
    expect(cmd)
      .toContain('--run_example add_example eager cust');
    expect(cmd)
      .toContain('--simulator Ascend910C');
  });

  it('falls back to the build_example config operator (config.op) when operatorNames is empty', () => {
    const cmd = strategy.buildExampleCommand({
      ...base,
      config: { project_id: 1, op: 'add_example', script: legacyScript },
      operatorNames: '',
      compileOption: '',
    } as any);

    expect(cmd)
      .toContain('--run_example add_example eager cust');
    expect(cmd)
      .toContain('--soc={soc_version}');
  });

  it('falls back to config.user_options.op when operatorNames is not provided', () => {
    const cmd = strategy.buildExampleCommand({
      ...base,
      config: { project_id: 1, user_options: { op: 'add_example' }, script: legacyScript },
      operatorNames: undefined,
      compileOption: '',
    } as any);

    expect(cmd)
      .toContain('--run_example add_example eager cust');
  });

  it('uses the config execution_mode for the positional mode when set', () => {
    const cmd = strategy.buildExampleCommand({
      ...base,
      config: {
        project_id: 1,
        op: 'add_example',
        script: legacyScript,
        user_options: { op: 'add_example', execution_mode: 'sim' },
      },
      operatorNames: 'add_example',
      compileOption: '',
    } as any);

    expect(cmd)
      .toContain('--run_example add_example sim cust');
  });

  it('does NOT append the positional op/mode/pkg when the script is not a --run_example interface', () => {
    // Other CANN repos (e.g. cann-ops use -e|--example) do not take eager/graph/cust
    // positionals; appending them would corrupt the command.
    const cmd = strategy.buildExampleCommand({
      ...base,
      config: { project_id: 1, op: 'add_example', script: 'bash build.sh -e add_example' },
      operatorNames: 'add_example',
      compileOption: '',
    } as any);

    expect(cmd)
      .not.toMatch(/add_example\s+eager\s+cust/);
    expect(cmd)
      .toContain('bash build.sh -e add_example');
  });

  it('honors an explicit exampleMode over config execution_mode (per-operator resolution)', () => {
    // pows ships only a graph example; the resolver passes exampleMode='graph' even though
    // the plugin-wide execution_mode setting is 'eager'. The positional mode must follow it.
    const cmd = strategy.buildExampleCommand({
      ...base,
      config: {
        project_id: 1,
        op: 'pows',
        script: legacyScript,
        user_options: { op: 'pows', execution_mode: 'eager' },
      },
      operatorNames: 'pows',
      compileOption: '',
      exampleMode: 'graph',
    } as any);

    expect(cmd)
      .toContain('--run_example pows graph cust');
  });

  it('adds --soc but no positional args when no operator is resolvable (avoids shifting mode into name)', () => {
    const cmd = strategy.buildExampleCommand({
      ...base,
      config: { project_id: 1, script: legacyScript },
      operatorNames: '',
      compileOption: '',
    } as any);

    expect(cmd)
      .toContain('--soc={soc_version}');
    // No operator → no positional tail at all (build.sh's name/mode stay empty, but we
    // never accidentally pass "eager" as the operator name).
    expect(cmd)
      .toMatch(/--run_example\s*$/);
    expect(cmd)
      .not.toContain('eager');
  });
});
