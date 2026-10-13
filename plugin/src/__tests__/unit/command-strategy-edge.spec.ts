/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
/**
 * Edge branches of the cann / ascend / pyasc command strategies: missing
 * operator records, missing scripts, `advance_cmd` tails, sanitizer option
 * guards with partial DAOs, and default-path fallbacks with no operator row.
 */
import * as path from 'path';
import * as vscode from 'vscode';

jest.mock('i18next', () => ({ t: (key: string) => key }));

import { CannCommandStrategy } from '@plugin/domain/services/command-strategy/cann-strategy';
import { AscendCommandStrategy } from '@plugin/domain/services/command-strategy/ascend-strategy';
import { PyAscCommandStrategy } from '@plugin/domain/services/command-strategy/pyasc-strategy';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import { CannPlugin } from '@plugin/domain/plugins/cann.plugin';
import { AscendPlugin } from '@plugin/domain/plugins/ascend.plugin';
import { PyAscPlugin } from '@plugin/domain/plugins/pyasc.plugin';
import { TritonPlugin } from '@plugin/domain/plugins/triton.plugin';
import type {
  BuildOpConfig,
  BuildExampleConfig,
  UtTestConfig,
  SanitizerConfig,
} from '@plugin/service/config-service';

const OPERATOR = {
  op_type: 'cann',
  op_path: '/ws/op',
  op_name: 'myop',
} as const;

const PROJECT = {
  project_type: 'cann',
  project_path: '/ws',
  project_name: 'ws',
} as const;

const sanitizerConfig = (overrides: Partial<SanitizerConfig> = {}): SanitizerConfig => ({
  script: '',
  tool: {
    memcheck: false,
    racecheck: false,
    initcheck: false,
  },
  memcheckOption: {
    'leak-check': false,
    'check-unused-memory': false,
  },
  logLevel: 'warn',
  maxDebuglogSize: 1024,
  useBlock: false,
  blockId: null,
  targetFile: null,
  fileMapList: [],
  ...overrides,
});

describe('command strategy context / script / option edge branches', () => {
  beforeAll(() => {
    OperatorPluginRegistry._reset();
    OperatorPluginRegistry.registerOpPlugin(new CannPlugin());
    OperatorPluginRegistry.registerOpPlugin(new AscendPlugin());
    OperatorPluginRegistry.registerOpPlugin(new PyAscPlugin());
    OperatorPluginRegistry.registerOpPlugin(new TritonPlugin());
  });

  afterEach(() => {
    // Restore the shared mock's default workspace folder.
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
  });

  describe('CannCommandStrategy', () => {
    const strategy = new CannCommandStrategy();

    it('falls back to the project path when no operator exists but a script does', () => {
      const context = strategy.buildCommandContext({
        config: {
          script: 'bash build.sh',
          targetFile: '',
        },
        project: PROJECT,
        operator: null,
        op: 'myop',
      });

      expect(context.cdCmd)
        .toBe('cd /ws');
      expect(context.cdBuildCmd)
        .toBe('mkdir -p  /ws/build && cd /ws/build');
      expect(context.operator)
        .toBeNull();
    });

    it('throws Operator not found when neither an operator nor a script exists', () => {
      expect(() => strategy.buildCommandContext({
        config: {
          script: '',
          targetFile: '',
        },
        project: null,
        operator: null,
        op: 'ghost',
      }))
        .toThrow('Operator not found: ghost');
    });

    it('buildRunCommand tolerates an empty targetFile', () => {
      const cmd = strategy.buildRunCommand({
        config: { targetFile: '' },
        sourceCannCmd: '. /etc/profile',
        cdBuildCmd: 'cd /ws/build',
        op: 'myop',
      });

      expect(cmd)
        .toBe('. /etc/profile && cd /ws/build');
      expect(cmd)
        .not.toContain('RUN_FILE');
    });

    it('buildExampleCommand throws when the example script is missing', () => {
      expect(() => strategy.buildExampleCommand({
        config: {
          script: '',
          executionMode: 'eager',
          targetFile: null,
        },
        sourceCannCmd: '',
        cdCmd: 'cd /ws',
        op: 'myop',
      }))
        .toThrow('cann.configMissingScript');
    });

    it('buildExampleCommand appends advance_cmd after compile args', () => {
      const cmd = strategy.buildExampleCommand({
        config: {
          script: 'bash build.sh -e add',
          executionMode: 'eager',
          targetFile: null,
        },
        sourceCannCmd: '. /etc/profile',
        cdCmd: 'cd /ws',
        compileOption: '--fast',
        advance_cmd: '--simulator Ascend910B3',
        op: 'myop',
      });

      expect(cmd)
        .toContain('bash build.sh -e add');
      expect(cmd)
        .toContain('--fast');
      expect(cmd)
        .toContain('--simulator Ascend910B3');
    });

    it('buildUtTestCommand throws when the UT script is missing', () => {
      expect(() => strategy.buildUtTestCommand({
        config: { script: '' },
        sourceCannCmd: '',
        cdCmd: 'cd /ws',
        op: 'myop',
      }))
        .toThrow('配置缺少脚本信息，且找不到算子记录: myop');
    });

    it('buildUtTestCommand appends advance_cmd', () => {
      const cmd = strategy.buildUtTestCommand({
        config: { script: 'bash build.sh -u' },
        sourceCannCmd: '. /etc/profile',
        cdCmd: 'cd /ws',
        advance_cmd: '--coverage',
        op: 'myop',
      });

      expect(cmd)
        .toContain('bash build.sh -u');
      expect(cmd)
        .toContain('--coverage');
    });

    it('buildSanitizerCommand tolerates partial DAOs and empty workspace folders', () => {
      vscode.workspace.workspaceFolders = [];
      const cmd = strategy.buildSanitizerCommand({
        config: sanitizerConfig({
          tool: undefined,
          memcheckOption: undefined,
        } as unknown as Partial<SanitizerConfig>),
        sourceCannCmd: '',
        cdBuildCmd: 'cd /ws/build',
        op: 'myop',
      });

      expect(cmd)
        .toContain('mssanitizer');
      expect(cmd)
        .toContain('mindstudio_sanitizer_log');
      // No workspace folder → the log dir falls back to process.cwd().
      expect(cmd)
        .toContain(process.cwd());
    });

    it('buildSanitizerCommand falls back to an empty memcheck option map', () => {
      const cmd = strategy.buildSanitizerCommand({
        config: sanitizerConfig({
          tool: {
            memcheck: true,
            racecheck: false,
            initcheck: false,
          },
          memcheckOption: undefined,
        } as unknown as Partial<SanitizerConfig>),
        sourceCannCmd: '',
        cdBuildCmd: 'cd /ws/build',
        op: 'myop',
      });

      // memcheck is on but `memcheckOption` is absent → the `?? {}` guard
      // supplies an empty map and no leak-check args are rendered.
      expect(cmd)
        .toContain('--tool=memcheck');
      expect(cmd)
        .not.toContain('leak-check');
    });

    it('getRunTargetFile falls back to the operator default layout for an empty op_path', () => {
      expect(strategy.getRunTargetFile('myop'))
        .toBe(path.join('build', 'myop'));
    });

    it('getProfilerTargetFile resolves the default path type from the project type', () => {
      // standard-custom project → ascend artifact layout even for a cann row
      // (the packaged `.run` artifact, not the example binary).
      const ascendLayout = strategy.getProfilerTargetFile(
        { script: '' },
        null,
        'myop',
        {
          project_type: 'standard-custom',
          project_path: '/ws',
        },
      );

      expect(ascendLayout)
        .toBe(path.join('build_out', '*.run'));

      const cannLayout = strategy.getProfilerTargetFile(
        { script: '' },
        null,
        'myop',
        null,
      );

      expect(cannLayout)
        .toBe(path.join('build', 'myop'));
    });
  });

  describe('AscendCommandStrategy', () => {
    const strategy = new AscendCommandStrategy();

    it('falls back to the project path when no operator exists but a script does', () => {
      const context = strategy.buildCommandContext({
        config: {
          script: 'bash build.sh',
          targetFile: '',
        },
        project: PROJECT,
        operator: null,
        op: 'myop',
      });

      expect(context.cdCmd)
        .toBe('cd /ws');
      expect(context.cdBuildCmd)
        .toBe('mkdir -p /ws/build && cd /ws/build');
    });

    it('throws Operator not found when neither an operator nor a script exists', () => {
      expect(() => strategy.buildCommandContext({
        config: {
          script: '',
          targetFile: '',
        },
        project: null,
        operator: null,
        op: 'ghost',
      }))
        .toThrow('Operator not found: ghost');
    });

    it('buildRunCommand tolerates an empty targetFile', () => {
      const cmd = strategy.buildRunCommand({
        config: { targetFile: '' },
        sourceCannCmd: '. /etc/profile',
        cdCmd: 'cd /ws',
        op: 'myop',
      });

      expect(cmd)
        .toBe('. /etc/profile && cd /ws');
    });

    it('buildExampleCommand tolerates a missing script and appends advance_cmd', () => {
      const cmd = strategy.buildExampleCommand({
        config: {
          script: '',
          executionMode: 'eager',
          targetFile: null,
        },
        sourceCannCmd: '. /etc/profile',
        cdCmd: 'cd /ws',
        advance_cmd: '--fast',
        op: 'myop',
      });

      expect(cmd)
        .toBe('. /etc/profile && cd /ws &&  --fast');
      expect(cmd)
        .not.toContain('--run_example');
    });

    it('buildUtTestCommand tolerates a missing script and appends advance_cmd', () => {
      const cmd = strategy.buildUtTestCommand({
        config: { script: '' },
        sourceCannCmd: '. /etc/profile',
        cdCmd: 'cd /ws',
        advance_cmd: '--coverage',
        op: 'myop',
      });

      expect(cmd)
        .toContain('--coverage');
    });

    it('buildSanitizerCommand tolerates partial DAOs and falls back to process.cwd() without folders', () => {
      vscode.workspace.workspaceFolders = undefined;
      const cmd = strategy.buildSanitizerCommand({
        config: sanitizerConfig({
          tool: undefined,
          memcheckOption: undefined,
        } as unknown as Partial<SanitizerConfig>),
        operator: null,
        sourceCannCmd: '',
        cdCmd: 'cd /ws',
        op: 'myop',
      });

      expect(cmd)
        .toContain('mssanitizer');
      expect(cmd)
        .toContain(process.cwd());
      expect(cmd)
        .toContain('mindstudio_sanitizer_log');
    });

    it('buildSanitizerCommand falls back to an empty memcheck option map', () => {
      const cmd = strategy.buildSanitizerCommand({
        config: sanitizerConfig({
          tool: {
            memcheck: true,
            racecheck: false,
            initcheck: false,
          },
          memcheckOption: undefined,
        } as unknown as Partial<SanitizerConfig>),
        sourceCannCmd: '',
        cdCmd: 'cd /ws',
        op: 'myop',
      });

      expect(cmd)
        .toContain('--tool=memcheck');
      expect(cmd)
        .not.toContain('leak-check');
    });

    it('getRunTargetFile falls back to the ascend .run default without an operator row', () => {
      expect(strategy.getRunTargetFile('myop'))
        .toBe(path.join('build_out', '*.run'));
    });

    it('getProfilerTargetFile falls back to the example binary without an operator row', () => {
      expect(strategy.getProfilerTargetFile({ script: '' }, null, 'myop'))
        .toBe(path.join('build', 'test_aclnn_myop'));
    });
  });

  describe('PyAscCommandStrategy', () => {
    const strategy = new PyAscCommandStrategy();

    it('buildRunCommand rewrites the python interpreter of the target file', () => {
      const cmd = strategy.buildRunCommand({
        config: { targetFile: 'python3 ./run.py' },
        sourceCannCmd: '. /etc/profile',
        cdCmd: 'cd /ws',
        op: 'myop',
      });

      expect(cmd)
        .toContain('. /etc/profile && cd /ws');
      expect(cmd)
        .toContain('python3');
      expect(cmd)
        .toContain('run.py');
    });

    it('buildRunCommand throws when the target file is missing', () => {
      expect(() => strategy.buildRunCommand({
        config: { targetFile: '' },
        sourceCannCmd: '',
        cdCmd: 'cd /ws',
        op: 'myop',
      }))
        .toThrow('cann.configMissingScript');
    });

    it('getProfilerTargetFile falls back to the python entry default without an operator row', () => {
      expect(strategy.getProfilerTargetFile({ script: '' }, null, 'myop'))
        .toBe('python3 ./myop.py');
    });

    it('getRunTargetFile reads the workspace deploy target', () => {
      expect(strategy.getRunTargetFile())
        .toBe('');
    });
  });
});
