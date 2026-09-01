/**
 * OnBoardStrategy aic-metrics matrix + command shape, and the SimulatorStrategy
 * advance/output fallbacks. The A5 vs non-A5 metrics branches and the
 * extended-metrics push are exercised through generate() — the private
 * getOnBoardMetrics is driven via the public surface.
 */
jest.mock('@plugin/helpers/operator-project-workspace-config', () => ({
  getOpDevtoolsWorkspaceConfiguration: jest.requireActual('@plugin/helpers/operator-project-workspace-config').getOpDevtoolsWorkspaceConfiguration,
  getConfiguredValue: jest.requireActual('@plugin/helpers/operator-project-workspace-config').getConfiguredValue,

  getFirstWorkspaceFolderPath: jest.fn(),
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

import * as path from 'path';

import {
  OnBoardStrategy,
  SimulatorStrategy,
} from '@plugin/domain/services/profiler-service';
import { getFirstWorkspaceFolderPath } from '@plugin/helpers/operator-project-workspace-config';
import type {
  OnBoardConfig, SimulateConfig,
} from '@plugin/service/config-service';

const OPERATOR = {
  id: 1,
  project_id: 10,
  op_name: 'op',
  op_type: 'cann',
  op_path: '/tmp/op',
};

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

describe('OnBoardStrategy', () => {
  const strategy = new OnBoardStrategy();

  beforeEach(() => {
    jest.clearAllMocks();
    (getFirstWorkspaceFolderPath as jest.Mock).mockReturnValue('/ws');
  });

  it('emits the non-A5 basic metrics and the Default marker when Roofline is on', () => {
    const cmd = strategy.generate(onBoardConfig({
      occupancy: true,
      roofline: true,
    }), OPERATOR as any, '/tmp/op/run.out');

    expect(cmd)
      .toContain('--aic-metrics=Occupancy,Roofline,Default');
    expect(cmd)
      .toContain(`--output=/ws/${path.join('.vscode', 'opprof')}`);
    expect(cmd)
      .toContain('/tmp/op/run.out');
  });

  it('keeps MemoryDetail for non-A5 and pushes extended metrics only without a Default trigger', () => {
    const cmd = strategy.generate(onBoardConfig({
      memoryDetail: true,
      memory: true,
      l2Cache: true,
    }), OPERATOR as any, '');

    // MemoryDetail in the basic set → needsDefault is true → extended not pushed.
    expect(cmd)
      .toContain('--aic-metrics=MemoryDetail,Default');

    const extended = strategy.generate(onBoardConfig({
      occupancy: true,
      memory: true,
      l2Cache: true,
      memoryUB: true,
    }), OPERATOR as any, '');

    // No Roofline/MemoryDetail → extended metrics are appended (in the
    // extendedMetrics array order: ArithmeticUtilization, L2Cache, Memory, ...).
    expect(extended)
      .toContain('--aic-metrics=Occupancy,L2Cache,Memory,MemoryUB');
    expect(extended)
      .not.toContain('Default');
  });

  it('emits the A5 basic metrics (PCSampling, no MemoryDetail) with the Default marker', () => {
    const cmd = strategy.generate(onBoardConfig({
      source: true,
      pcSampling: true,
    }), OPERATOR as any, '/tmp/op/run.out', { onboardCannSoc: 'ascend950' });

    expect(cmd)
      .toContain('--aic-metrics=Source,PCSampling,Default');
    expect(cmd)
      .not.toContain('MemoryDetail');
  });

  it('pushes extended metrics on A5 when no A5 Default trigger is present', () => {
    const cmd = strategy.generate(onBoardConfig({
      kernelScale: true,
      pipeUtilization: true,
      resourceConflictRatio: true,
    }), OPERATOR as any, '', { onboardCannSoc: 'ascend950' });

    expect(cmd)
      .toContain('--aic-metrics=KernelScale,PipeUtilization,ResourceConflictRatio');
  });

  it('appends advance arguments after the msprof options', () => {
    const cmd = strategy.generate(onBoardConfig({
      advanceParam: [
        {
          name: 'simulate',
          value: 'x',
        },
        {
          name: 'bare',
          value: '',
        },
      ],
    }), OPERATOR as any, '');

    expect(cmd)
      .toContain('--simulate=x');
    expect(cmd)
      .toContain('--bare');
  });

  it('falls back to the operator path for the output dir when no workspace folder exists', () => {
    (getFirstWorkspaceFolderPath as jest.Mock).mockReturnValue(undefined);

    const cmd = strategy.generate(onBoardConfig(), OPERATOR as any, '');

    expect(cmd)
      .toContain(`--output=/tmp/op/${path.join('.vscode', 'opprof')}`);
  });

  it('omits --aic-metrics when no metric is selected', () => {
    const cmd = strategy.generate(onBoardConfig(), OPERATOR as any, '');

    expect(cmd)
      .not.toMatch(/--aic-metrics/);
  });
});

describe('SimulatorStrategy advance args and output fallback', () => {
  const strategy = new SimulatorStrategy();

  beforeEach(() => {
    jest.clearAllMocks();
    (getFirstWorkspaceFolderPath as jest.Mock).mockReturnValue('/ws');
  });

  it('appends advance args after the aic-metrics options', () => {
    const cmd = strategy.generate(simulateConfig({
      advanceParam: [
        {
          name: 'simulate',
          value: 'Ascend910B3',
        },
      ],
    }), OPERATOR as any, '/tmp/op/app.bin');

    expect(cmd)
      .toContain('--simulate=Ascend910B3');
    expect(cmd)
      .toContain('/tmp/op/app.bin');
  });

  it('falls back to the operator path for the output dir when no workspace folder exists', () => {
    (getFirstWorkspaceFolderPath as jest.Mock).mockReturnValue(undefined);

    const cmd = strategy.generate(simulateConfig(), OPERATOR as any, '');

    expect(cmd)
      .toContain(`--output=/tmp/op/${path.join('.vscode', 'opprof')}`);
  });
});
