jest.mock('@plugin/core/project/project-manager', () => ({ ProjectManager: { getInstance: jest.fn() } }));

jest.mock('@plugin/service/build-service', () => ({
  buildService: {
    startDumpTensor: jest.fn(),
    startOnBoard: jest.fn(),
    startRun: jest.fn(),
    startUtTest: jest.fn(),
  },
  isRootStandardCustom: jest.fn(() => Promise.resolve(false)),
}));

jest.mock('@plugin/service/sanitizer-service', () => ({ sanitizerService: { runSanitizer: jest.fn() } }));

jest.mock('@plugin/helpers/post-activate-bootstrap', () => ({
  whenPostActivateBootstrapReady: jest.fn(() => Promise.resolve()),
  isMindStudioDebugExtensionActive: jest.fn(() => true),
}));

jest.mock('@plugin/helpers/npu-hardware-guard', () => ({ assertNpuHardwareAvailableOrNotify: jest.fn(() => false) }));

jest.mock('@plugin/domain/utils/npu-hardware-probe', () => ({
  startNpuHardwareProbe: jest.fn(() => Promise.resolve(true)),
  startRemoteNpuHardwareProbe: jest.fn(() => Promise.resolve(false)),
}));

jest.mock('@plugin/helpers/operator-flow-coordinator', () => ({ enqueueCompileRun: jest.fn((_kind, action) => action()) }));

jest.mock('@plugin/controller/home-controller', () => ({
  homeMethods: {
    getProjectType: jest.fn(() => Promise.resolve({ projectType: 'ascend' })),
    resolveBuildTargetFile: jest.fn(),
    resolveDebugOperatorEntry: jest.fn(),
    getSelectedOperators: jest.fn(),
  },
}));

jest.mock('@plugin/service/config-service', () => ({ ConfigService: {} }));

jest.mock('@plugin/domain/plugins/operator-plugin.registry', () => ({ OperatorPluginRegistry: { isProjectTypeSupported: jest.fn(() => true) } }));

jest.mock('@plugin/domain', () => ({
  getBuildExampleCommand: jest.fn(),
  resolveBuildExampleBaseContext: jest.fn(),
  resolveExampleModeForBaseContext: jest.fn(),
}));

jest.mock('@plugin/domain/utils/debug-target', () => ({
  msdebugConfiguredTargetExists: jest.fn(() => true),
  updateMsdebugTarget: jest.fn(),
}));

jest.mock('@plugin/domain/utils/msdebug-env', () => ({ backfillMsdebugLibInEnvFile: jest.fn() }));

jest.mock('@plugin/domain/utils/debug-config-resolver', () => ({
  isPythonDebugLaunchConfig: jest.fn(() => false),
  resolveDebugLaunchConfigName: jest.fn(() => 'msdebug'),
}));

jest.mock('@plugin/domain/utils/debug-python-target', () => ({ updateMsdebugPythonTarget: jest.fn() }));

jest.mock('@plugin/domain/utils/msdebug-ide-settings', () => ({ ensureMsdebugBreakpointFileAssociations: jest.fn() }));

jest.mock('@plugin/domain/utils/triton-kernel-path', () => ({ resolveTritonLaunchKernelPath: jest.fn() }));

jest.mock('@plugin/domain/services/command-strategy/triton-strategy', () => ({ probeTritonPythonDependencies: jest.fn(() => Promise.resolve({ ok: true })) }));

jest.mock('@plugin/domain/services/command-strategy/python-operator-strategy-shared', () => ({
  buildPythonDeployTarget: jest.fn(),
  resolvePythonExecutablePath: jest.fn(),
}));

import { ProjectManager } from '@plugin/core/project/project-manager';
import {
  parseRemoteDebugAdapterReadyPort,
  taskMethods,
} from '@plugin/controller/task-controller';
import { buildService } from '@plugin/service/build-service';
import { sanitizerService } from '@plugin/service/sanitizer-service';
import { assertNpuHardwareAvailableOrNotify } from '@plugin/helpers/npu-hardware-guard';
import { whenPostActivateBootstrapReady } from '@plugin/helpers/post-activate-bootstrap';
import {
  startNpuHardwareProbe,
  startRemoteNpuHardwareProbe,
} from '@plugin/domain/utils/npu-hardware-probe';

describe('taskMethods.startUtTest', () => {
  const executor = { kill: jest.fn() };
  const projectManager = {
    getExecutor: jest.fn(() => executor),
    clearExecutor: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (ProjectManager.getInstance as jest.Mock).mockReturnValue(projectManager);
    (startNpuHardwareProbe as jest.Mock).mockResolvedValue(true);
    (startRemoteNpuHardwareProbe as jest.Mock).mockResolvedValue(false);
  });

  it('does not block UT tests on local NPU hardware availability', async () => {
    const params = {
      operatorNames: 'AddCustom',
      compileOption: '--fast',
    };

    await taskMethods.startUtTest(params);

    expect(assertNpuHardwareAvailableOrNotify).not.toHaveBeenCalled();
    expect(whenPostActivateBootstrapReady)
      .toHaveBeenCalledTimes(1);
    expect(buildService.startUtTest)
      .toHaveBeenCalledWith(params);
    expect(projectManager.clearExecutor)
      .toHaveBeenCalledTimes(1);
  });

  it('does not block on-board analysis on local NPU hardware availability', async () => {
    const params = {
      operatorNames: 'AddCustom',
      compileOption: '--fast',
    };

    await taskMethods.startOnBoard(params);

    expect(assertNpuHardwareAvailableOrNotify).not.toHaveBeenCalled();
    expect(whenPostActivateBootstrapReady)
      .toHaveBeenCalledTimes(1);
    expect(buildService.startOnBoard)
      .toHaveBeenCalledWith(params);
    expect(projectManager.clearExecutor)
      .toHaveBeenCalledTimes(1);
  });

  it('does not block run on local NPU guard', async () => {
    await taskMethods.startRun();

    expect(assertNpuHardwareAvailableOrNotify).not.toHaveBeenCalled();
    expect(whenPostActivateBootstrapReady)
      .toHaveBeenCalledTimes(1);
    expect(buildService.startRun)
      .toHaveBeenCalledTimes(1);
    expect(projectManager.clearExecutor)
      .toHaveBeenCalledTimes(1);
  });

  it('does not block DumpTensor on local NPU hardware availability', async () => {
    const params = {
      operatorNames: 'AddCustom',
      compileOption: '--fast',
    };

    await taskMethods.startDumpTensor(params);

    expect(assertNpuHardwareAvailableOrNotify)
      .not.toHaveBeenCalled();
    expect(whenPostActivateBootstrapReady)
      .toHaveBeenCalledTimes(1);
    expect(buildService.startDumpTensor)
      .toHaveBeenCalledWith(params);
    expect(projectManager.clearExecutor)
      .toHaveBeenCalledTimes(1);
  });

  it('does not block sanitizer on local NPU guard', async () => {
    await taskMethods.runSanitizer();

    expect(assertNpuHardwareAvailableOrNotify).not.toHaveBeenCalled();
    expect(whenPostActivateBootstrapReady)
      .toHaveBeenCalledTimes(1);
    expect(sanitizerService.runSanitizer)
      .toHaveBeenCalledTimes(1);
    expect(projectManager.clearExecutor)
      .toHaveBeenCalledTimes(1);
  });

  it('checks remote availability for NPU debug instead of using the local NPU guard', async () => {
    (startNpuHardwareProbe as jest.Mock).mockResolvedValue(false);
    (startRemoteNpuHardwareProbe as jest.Mock).mockResolvedValue(false);

    await taskMethods.runDebug();

    expect(assertNpuHardwareAvailableOrNotify).not.toHaveBeenCalled();
    expect(startNpuHardwareProbe)
      .toHaveBeenCalledTimes(1);
    expect(startRemoteNpuHardwareProbe)
      .toHaveBeenCalledTimes(1);
  });

  it('parses ready adapter ports from nested JSON logs', () => {
    const output = 'booting\n{"event":"ready","data":{"adapter":"msdebug"},"port":45678}\n';

    expect(parseRemoteDebugAdapterReadyPort(output))
      .toBe(45678);
  });

  it('parses ready adapter ports from combined stdout and stderr output', () => {
    const output = 'stderr: {"event":"ready","port":23456}\n';

    expect(parseRemoteDebugAdapterReadyPort(output))
      .toBe(23456);
  });
});
