/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { AscendCommandStrategy } from '@plugin/domain/services/command-strategy/ascend-strategy';
import { CannCommandStrategy } from '@plugin/domain/services/command-strategy/cann-strategy';
import type {
  BuildOpConfig, UtTestConfig,
} from '@plugin/service/config-service';

describe('buildUtTestCommand compileOption', () => {
  const baseConfig: UtTestConfig = { script: './build.sh --ut' };

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
    const config: UtTestConfig = { script: 'bash build.sh --soc={soc_version} --ops={operatorNames} -u' };
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

  it('ascend strategy appends --ops for a stored settings script without placeholder', () => {
    const strategy = new AscendCommandStrategy();
    const config: BuildOpConfig = {
      script: 'bash build.sh --pkg --soc={soc_version} --vendor_name=custom',
      cpuDebugScript: '',
      npuDebugScript: '',
      targetFile: null,
    };
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
    const config: BuildOpConfig = {
      script: 'bash build.sh --pkg --soc={soc_version} --vendor_name=custom --ops={operatorNames}',
      cpuDebugScript: '',
      npuDebugScript: '',
      targetFile: null,
    };
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
  const debugConfig: BuildOpConfig = {
    cpuDebugScript: 'bash.exe "C:\\repo with spaces\\build.sh" --simulator {simulator_type}',
    npuDebugScript: 'bash ./build.sh --debug',
    script: 'bash ./build.sh --pkg',
    targetFile: null,
  };

  function build(
    scriptField: 'script' | 'cpu_debug_script' | 'npu_debug_script',
    options: { compileOption?: string;
      advance_cmd?: string } = {},
    config: BuildOpConfig = debugConfig,
  ): string {
    return createStrategy()
      .buildOpCommand({
        config,
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
    const daoKey = field === 'cpu_debug_script'
      ? 'cpuDebugScript'
      : field === 'npu_debug_script'
        ? 'npuDebugScript'
        : 'script';
    const customConfig: BuildOpConfig = {
      ...debugConfig,
      [daoKey]: script,
    };

    expect(build(field, options, customConfig)).not.toContain('--build-type=Debug');
  });

  it('leaves supported non-debug commands unchanged', () => {
    expect(build('script')).not.toContain('--build-type');
  });
});
