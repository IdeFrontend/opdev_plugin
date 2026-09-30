/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
jest.mock('@plugin/helpers/operator-project-workspace-config', () => ({
  getOpDevtoolsWorkspaceConfiguration: jest.requireActual('@plugin/helpers/operator-project-workspace-config').getOpDevtoolsWorkspaceConfiguration,
  getConfiguredValue: jest.requireActual('@plugin/helpers/operator-project-workspace-config').getConfiguredValue,

  getFirstWorkspaceFolderPath: jest.requireActual('@plugin/helpers/operator-project-workspace-config').getFirstWorkspaceFolderPath,
  getWorkspaceSimulatorType: jest.fn(() => ''),
  getSocVersionWithWorkspaceOverride: jest.fn(() => ''),
}));
jest.mock('@plugin/domain/utils/global-env-snapshot', () => ({
  getGlobalEnvSnapshot: jest.fn(() => ({
    socVersion: undefined,
    simulatorType: undefined,
    npuArch: undefined,
    ascendEnvScript: undefined,
  })),
}));
jest.mock('@plugin/domain/utils/ascend-util', () => ({
  ...jest.requireActual('@plugin/domain/utils/ascend-util'),
  resolveAscendEnv: jest.fn(() => ({ socVersion: undefined })),
}));

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
    getSimulateConfig: jest.fn(),
    getOnBoardConfig: jest.fn(),
    getSanitizerConfig: jest.fn(),
    getBuildExampleConfig: jest.fn(),
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
import type {
  BuildExampleConfig, OnBoardConfig, SanitizerConfig, SimulateConfig,
} from '@plugin/service/config-service';
import {
  getSimulateCommand,
  getOnBoardCommand,
  getSanitizerCommand,
  resolveBuildExampleBaseContext,
  resolveOnBoardBaseContext,
  resolveSanitizerBaseContext,
  resolveSimulateBaseContext,
} from '@plugin/domain/services/command';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import { CannPlugin } from '@plugin/domain/plugins/cann.plugin';
import { AscendPlugin } from '@plugin/domain/plugins/ascend.plugin';
import { PyAscPlugin } from '@plugin/domain/plugins/pyasc.plugin';
import { TritonPlugin } from '@plugin/domain/plugins/triton.plugin';

function buildExampleConfig(overrides: Partial<BuildExampleConfig> = {}): BuildExampleConfig {
  return {
    script: '',
    executionMode: 'eager',
    eagerExamplePattern: undefined,
    graphExamplePattern: undefined,
    targetFile: null,
    ...overrides,
  };
}

function simulateConfig(overrides: Partial<SimulateConfig> = {}): SimulateConfig {
  return {
    script: '',
    simulatorType: '',
    memoryThroughputWaveform: false,
    resourceConflictRatio: false,
    advanceParam: [],
    fileMapList: [],
    ...overrides,
  };
}

function onBoardConfig(overrides: Partial<OnBoardConfig> = {}): OnBoardConfig {
  return {
    script: '',
    occupancy: false,
    roofline: false,
    source: false,
    arithmeticUtilization: false,
    l2Cache: false,
    memory: false,
    memoryL0: false,
    memoryUB: false,
    pipeUtilization: false,
    resourceConflictRatio: false,
    kernelScale: false,
    memoryDetail: false,
    pcSampling: false,
    operatorMetrics: false,
    advanceParam: [],
    fileMapList: [],
    ...overrides,
  };
}

function sanitizerConfig(overrides: Partial<SanitizerConfig> = {}): SanitizerConfig {
  return {
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
  };
}

describe('multi-op selection resolves ONE profiler target without embedding the comma', () => {
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
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'op-devtools-multi-op-target-'));
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
    (ConfigService.getSimulateConfig as jest.Mock).mockReturnValue(simulateConfig());
    (ConfigService.getOnBoardConfig as jest.Mock).mockReturnValue(onBoardConfig());
    (ConfigService.getSanitizerConfig as jest.Mock).mockReturnValue(sanitizerConfig());
    (ConfigService.getBuildExampleConfig as jest.Mock).mockReturnValue(buildExampleConfig());
    (ConfigService.readBuildOpDeployTargetFromWorkspace as jest.Mock).mockReturnValue('');
    (ConfigService.readBuildExampleTargetFromWorkspace as jest.Mock).mockReturnValue('');
  });

  afterEach(() => {
    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
  });

  function expectSingleTargetWithoutComma(command: string): void {
    // The standard-custom profiler target is the packaged .run artifact (the
    // build_op row target), not the example binary — and a comma-separated
    // multi-op selection must never surface inside a path.
    expect(command)
      .toContain(path.join(add, 'build_out', '*.run'));
    expect(command)
      .not.toContain('add,sub');
  }

  it('simulate targets the packaged artifact for the multi-op selection', () => {
    const command = getSimulateCommand(
      resolveSimulateBaseContext(root, 'add,sub'),
      resolveBuildExampleBaseContext(root, 'add'),
      'add,sub',
    );

    expectSingleTargetWithoutComma(command);
  });

  it('on-board targets the packaged artifact for the multi-op selection', () => {
    const command = getOnBoardCommand(
      resolveOnBoardBaseContext(root, 'add,sub'),
      resolveBuildExampleBaseContext(root, 'add'),
      'add,sub',
    );

    expectSingleTargetWithoutComma(command);
  });

  it('sanitizer targets the packaged artifact for the multi-op selection', () => {
    const command = getSanitizerCommand(
      resolveSanitizerBaseContext(root, 'add,sub'),
      resolveBuildExampleBaseContext(root, 'add'),
      'add,sub',
    );

    expectSingleTargetWithoutComma(command);
  });
});
