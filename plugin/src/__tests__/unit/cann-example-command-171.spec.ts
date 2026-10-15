/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { CannCommandStrategy } from '@plugin/domain/services/command-strategy/cann-strategy';
import type { BuildExampleConfig } from '@plugin/service/config-service';

/**
 * Standard-custom `--run_example` was emitted as
 * `bash build.sh --vendor_name=custom --run_example` with no positional operator/mode,
 * so build.sh printed "Start to run examples, name:  mode:" (both empty) and dumped its
 * usage instead of building/running the example. A field run confirmed the name/mode come
 * from POSITIONAL args (`<op> <mode> <pkg_mode>`), not from `--ops`: a command carrying
 * `--ops=abs` still left `name:` empty. The fix mirrors AscendCommandStrategy.
 */
describe('CannCommandStrategy.buildExampleCommand (positional run_example args)', () => {
  const strategy = new CannCommandStrategy();
  const base = {
    sourceCannCmd: '. /etc/profile',
    cdCmd: 'cd /home/dev/ops-math',
    advance_cmd: '',
  };

  const legacyScript = 'bash build.sh --vendor_name=custom --run_example';

  const baseConfig: BuildExampleConfig = {
    script: legacyScript,
    executionMode: 'eager',
    targetFile: null,
  };

  it('appends the positional operator/mode/pkg and a --soc for a stored run_example script', () => {
    const cmd = strategy.buildExampleCommand({
      ...base,
      config: baseConfig,
      operatorNames: 'add_example',
      compileOption: '',
      op: 'add_example',
    });

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
      config: baseConfig,
      operatorNames: 'add_example',
      compileOption: '--simulator Ascend910_9362 --soc=ascend910_93',
      op: 'add_example',
    });

    expect((cmd.match(/--soc=/g) || []).length)
      .toBe(1);
    expect(cmd)
      .toContain('--run_example add_example eager cust');
    expect(cmd)
      .toContain('--simulator Ascend910_9362');
  });

  it('does not add the standard-custom build-only option', () => {
    const cmd = strategy.buildExampleCommand({
      ...base,
      config: baseConfig,
      operatorNames: 'add_example',
      compileOption: '',
      buildExampleOnly: true,
      op: 'add_example',
    });

    expect(cmd)
      .not.toContain('--noexec');
  });

  it('falls back to the resolved operator (op) when operatorNames is empty', () => {
    const cmd = strategy.buildExampleCommand({
      ...base,
      config: baseConfig,
      operatorNames: '',
      compileOption: '',
      op: 'add_example',
    });

    expect(cmd)
      .toContain('--run_example add_example eager cust');
    expect(cmd)
      .toContain('--soc={soc_version}');
  });

  it('falls back to op when operatorNames is not provided', () => {
    const cmd = strategy.buildExampleCommand({
      ...base,
      config: baseConfig,
      operatorNames: undefined,
      compileOption: '',
      op: 'add_example',
    });

    expect(cmd)
      .toContain('--run_example add_example eager cust');
  });

  it('uses the config executionMode for the positional mode when set', () => {
    const cmd = strategy.buildExampleCommand({
      ...base,
      config: {
        ...baseConfig,
        executionMode: 'graph',
      },
      operatorNames: 'add_example',
      compileOption: '',
      op: 'add_example',
    });

    expect(cmd)
      .toContain('--run_example add_example graph cust');
  });

  it('does NOT append the positional op/mode/pkg when the script is not a --run_example interface', () => {
    // Other CANN repos (e.g. cann-ops use -e|--example) do not take eager/graph/cust
    // positionals; appending them would corrupt the command.
    const cmd = strategy.buildExampleCommand({
      ...base,
      config: {
        ...baseConfig,
        script: 'bash build.sh -e add_example',
      },
      operatorNames: 'add_example',
      compileOption: '',
      op: 'add_example',
    });

    expect(cmd)
      .not.toMatch(/add_example\s+eager\s+cust/);
    expect(cmd)
      .toContain('bash build.sh -e add_example');
  });

  it('honors an explicit exampleMode over config executionMode (per-operator resolution)', () => {
    // pows ships only a graph example; the resolver passes exampleMode='graph' even though
    // the plugin-wide executionMode setting is 'eager'. The positional mode must follow it.
    const cmd = strategy.buildExampleCommand({
      ...base,
      config: baseConfig,
      operatorNames: 'pows',
      compileOption: '',
      exampleMode: 'graph',
      op: 'pows',
    });

    expect(cmd)
      .toContain('--run_example pows graph cust');
  });

  it('adds --soc but no positional args when no operator is resolvable (avoids shifting mode into name)', () => {
    const cmd = strategy.buildExampleCommand({
      ...base,
      config: baseConfig,
      operatorNames: '',
      compileOption: '',
      op: '',
    });

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
