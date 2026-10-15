/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
jest.mock('@plugin/domain/models/project-model', () => {
  const actual = jest.requireActual('@plugin/domain/models/project-model') as Record<string, unknown>;

  return {
    ...actual,
    getProjectByPath: jest.fn(),
  };
});

jest.mock('@plugin/domain/models/op-record', () => ({
  ...jest.requireActual('@plugin/domain/models/op-record'),
  resolveOpRecord: jest.fn(),
}));

jest.mock('@plugin/service/config-service', () => ({
  ConfigService: {
    getBuildOpConfig: jest.fn(),
    readBuildOpDeployTargetFromWorkspace: jest.fn(),
    readBuildExampleTargetFromWorkspace: jest.fn(),
  },
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { getProjectByPath } from '@plugin/domain/models/project-model';
import { resolveOpRecord } from '@plugin/domain/models/op-record';
import { ConfigService } from '@plugin/service/config-service';
import type { BuildOpConfig } from '@plugin/service/config-service';
import {
  getRunCommand,
  resolveBuildOpBaseContext,
} from '@plugin/domain/services/command';
import { AscendCommandStrategy } from '@plugin/domain/services/command-strategy/ascend-strategy';
import { CannCommandStrategy } from '@plugin/domain/services/command-strategy/cann-strategy';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import { CannPlugin } from '@plugin/domain/plugins/cann.plugin';
import { AscendPlugin } from '@plugin/domain/plugins/ascend.plugin';
import { PyAscPlugin } from '@plugin/domain/plugins/pyasc.plugin';
import { TritonPlugin } from '@plugin/domain/plugins/triton.plugin';

function buildOpConfig(overrides: Partial<BuildOpConfig> = {}): BuildOpConfig {
  return {
    script: '',
    cpuDebugScript: '',
    npuDebugScript: '',
    targetFile: null,
    ...overrides,
  };
}

describe('run target fallback (default .run package instead of a bare cd)', () => {
  let root: string;
  let add: string;

  beforeAll(() => {
    OperatorPluginRegistry._reset();
    OperatorPluginRegistry.registerOpPlugin(new CannPlugin());
    OperatorPluginRegistry.registerOpPlugin(new AscendPlugin());
    OperatorPluginRegistry.registerOpPlugin(new PyAscPlugin());
    OperatorPluginRegistry.registerOpPlugin(new TritonPlugin());
  });

  beforeEach(() => {
    jest.clearAllMocks();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'op-devtools-run-target-'));
    add = path.join(root, 'math', 'add');

    (getProjectByPath as jest.Mock).mockReturnValue({
      project_type: 'ascend',
      project_path: root,
    });
    (resolveOpRecord as jest.Mock).mockReturnValue({
      op_name: 'add',
      op_type: 'cann',
      op_path: add,
    });
    (ConfigService.getBuildOpConfig as jest.Mock)
      .mockReturnValue(buildOpConfig({ script: `bash ${add}/build.sh --pkg` }));
    (ConfigService.readBuildOpDeployTargetFromWorkspace as jest.Mock).mockReturnValue('');
    (ConfigService.readBuildExampleTargetFromWorkspace as jest.Mock).mockReturnValue('');
  });

  afterEach(() => {
    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
  });

  it('run falls back to the operator default .run package when the deploy setting is unset', () => {
    // The multi-operator seeder leaves deployCommandOrRunCommand empty; without
    // the default-path fallback the run degrades to a bare `cd` (no RUN_FILE).
    const command = getRunCommand(resolveBuildOpBaseContext(root, 'add,sub'));

    expect(command)
      .toContain('mkdir -p');
    expect(command)
      .toContain(`cd ${add}/build`);
    expect(command)
      .toContain(`RUN_FILE=$(find ${path.join(add, 'build_out', '*.run')})`);
  });

  it('strategies resolve the layout-aware default run target', () => {
    expect(new AscendCommandStrategy()
      .getRunTargetFile('add', {
        op_type: 'ascend',
        op_name: 'add',
        op_path: add,
      }))
      .toBe(path.join(add, 'build_out', '*.run'));

    // Plain cann project → cann layout.
    expect(new CannCommandStrategy()
      .getRunTargetFile('add', {
        op_type: 'cann',
        op_name: 'add',
        op_path: add,
      }))
      .toBe(path.join(add, 'build', 'add'));

    // standard-custom project (project_type 'ascend') → ascend layout.
    expect(new CannCommandStrategy()
      .getRunTargetFile('add', {
        op_type: 'cann',
        op_name: 'add',
        op_path: add,
      }, { project_type: 'ascend' } as any))
      .toBe(path.join(add, 'build_out', '*.run'));
  });
});
