jest.mock('i18next', () => ({ t: (key: string) => key }));

jest.mock('vscode', () => ({
  env: { uriScheme: 'vscode' },
  Uri: { file: (fsPath: string) => ({ fsPath }) },
  workspace: { workspaceFolders: undefined },
  window: {
    showInformationMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showErrorMessage: jest.fn(),
  },
  commands: { executeCommand: jest.fn(() => Promise.resolve()) },
  debug: { startDebugging: jest.fn(() => Promise.resolve(true)) },
}));

jest.mock('@plugin/core/project/project-manager', () => ({ ProjectManager: { getInstance: jest.fn() } }));

jest.mock('@plugin/service/build-service', () => ({
  buildService: {
    startBuild: jest.fn(),
    startRun: jest.fn(),
    startBuildExample: jest.fn(),
    startSimulate: jest.fn(),
    startOnBoard: jest.fn(),
    startDumpTensor: jest.fn(),
    startUtTest: jest.fn(),
    importDumpTensorBinFile: jest.fn(),
  },
  isRootStandardCustom: jest.fn(() => Promise.resolve(false)),
}));

jest.mock('@plugin/service/sanitizer-service', () => ({ sanitizerService: { runSanitizer: jest.fn() } }));

jest.mock('@plugin/helpers/post-activate-bootstrap', () => ({
  whenPostActivateBootstrapReady: jest.fn(() => Promise.resolve()),
  isMindStudioDebugExtensionActive: jest.fn(() => true),
}));

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
    resolveBuildExampleTargetFile: jest.fn(),
    getSelectedOperators: jest.fn(),
  },
}));

jest.mock('@plugin/service/config-service', () => ({ ConfigService: { hasBuildExampleConfig: jest.fn(() => false) } }));

jest.mock('@plugin/domain/plugins/operator-plugin.registry', () => ({
  OperatorPluginRegistry: {
    isProjectTypeSupported: jest.fn(() => true),
    getBuildBehaviorByProjectType: jest.fn(() => 'build'),
  },
}));

jest.mock('@plugin/helpers/compile-options', () => ({ getCompileOptionForSelectedOperators: jest.fn(() => Promise.resolve('--fast')) }));

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
  resolvePythonExecutablePath: jest.fn(() => 'python3'),
}));

jest.mock('@plugin/helpers/python-operator-editor-context', () => ({ resolveOrPickPythonOperatorUri: jest.fn() }));

jest.mock('@plugin/domain/models/op-record', () => ({ resolveOpRecord: jest.fn() }));

jest.mock('@plugin/domain/models/project-model', () => ({ getProjectByPath: jest.fn() }));

jest.mock('@plugin/helpers/remote-command', () => ({
  buildRemoteExecCommand: jest.fn(),
  ensureRemoteToolAvailable: jest.fn(() => Promise.resolve(true)),
  buildRemoteBuildExampleCommand: jest.fn(),
  createRemoteCommandWhenNoNpuTransformer: jest.fn(() => (command: unknown) => command),
  getRemoteToolConfig: jest.fn(() => Promise.resolve({ host: '10.0.0.1' })),
}));

jest.mock('@plugin/service/operator-command-executor', () => ({
  executeOperatorCommand: jest.fn(() => Promise.resolve({
    code: 0,
    output: 'ok',
    interruptedByUserStop: false,
  })),
  buildOperatorSpawnContext: jest.fn((context) => context),
}));

const mockStartStTest = jest.fn();
const mockRecordCompletedRun = jest.fn();
const mockCreateOrShow = jest.fn();
const mockShowNotification = jest.fn();
const mockIsStTestCancelledError = jest.fn(() => false);

jest.mock('@plugin/class/st-test-results-panel', () => ({
  StTestResultsPanel: {
    recordCompletedRun: mockRecordCompletedRun,
    createOrShow: mockCreateOrShow,
  },
}));

jest.mock('@plugin/helpers/st-test-completion-notification', () => ({ showStTestCompletionNotification: mockShowNotification }));

jest.mock('@plugin/service/st-test-service', () => ({ StTestService: jest.fn(() => ({ startStTest: mockStartStTest })) }));

jest.mock('@plugin/domain/services/st-test-errors', () => ({ isStTestCancelledError: mockIsStTestCancelledError }));

import * as vscode from 'vscode';
import { ProjectManager } from '@plugin/core/project/project-manager';
import { taskMethods } from '@plugin/controller/task-controller';
import { buildService } from '@plugin/service/build-service';
import { sanitizerService } from '@plugin/service/sanitizer-service';
import { whenPostActivateBootstrapReady } from '@plugin/helpers/post-activate-bootstrap';
import { homeMethods } from '@plugin/controller/home-controller';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';

describe('taskMethods basic actions', () => {
  const executor = { kill: jest.fn() };
  const projectManager = {
    getExecutor: jest.fn(() => executor),
    clearExecutor: jest.fn(),
    projectPath: '',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (ProjectManager.getInstance as jest.Mock).mockReturnValue(projectManager);
    (buildService.startBuild as jest.Mock).mockResolvedValue(undefined);
    (buildService.startBuildExample as jest.Mock).mockResolvedValue(undefined);
    (buildService.startSimulate as jest.Mock).mockResolvedValue(undefined);
    (buildService.importDumpTensorBinFile as jest.Mock).mockResolvedValue(undefined);
    (buildService.startRun as jest.Mock).mockResolvedValue(undefined);
    (buildService.startOnBoard as jest.Mock).mockResolvedValue(undefined);
    (buildService.startDumpTensor as jest.Mock).mockResolvedValue(undefined);
    (buildService.startUtTest as jest.Mock).mockResolvedValue(undefined);
    (sanitizerService.runSanitizer as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('builds the operator with the provided parameters and clears the executor', async () => {
    const params = { operatorNames: 'AddCustom' };

    await taskMethods.startBuild(params);

    expect(whenPostActivateBootstrapReady)
      .toHaveBeenCalledTimes(1);
    expect(buildService.startBuild)
      .toHaveBeenCalledWith(params);
    expect(projectManager.clearExecutor)
      .toHaveBeenCalledTimes(1);
  });

  it('builds the example with the provided parameters and clears the executor', async () => {
    const params = { exampleName: 'AddCustom' };

    await taskMethods.startBuildExample(params);

    expect(buildService.startBuildExample)
      .toHaveBeenCalledWith(params);
    expect(projectManager.clearExecutor)
      .toHaveBeenCalledTimes(1);
  });

  it('runs simulation analysis with the provided parameters and clears the executor', async () => {
    const params = { operatorNames: 'AddCustom' };

    await taskMethods.startSimulate(params);

    expect(buildService.startSimulate)
      .toHaveBeenCalledWith(params);
    expect(projectManager.clearExecutor)
      .toHaveBeenCalledTimes(1);
  });

  it('runs the operator and clears the executor', async () => {
    const params = { operatorNames: 'AddCustom' };

    await taskMethods.startRun(params);

    expect(buildService.startRun)
      .toHaveBeenCalledWith(params);
    expect(projectManager.clearExecutor)
      .toHaveBeenCalledTimes(1);
  });

  it('runs the on-board flow and clears the executor', async () => {
    const params = { operatorNames: 'AddCustom' };

    await taskMethods.startOnBoard(params);

    expect(buildService.startOnBoard)
      .toHaveBeenCalledWith(params);
    expect(projectManager.clearExecutor)
      .toHaveBeenCalledTimes(1);
  });

  it('runs the sanitizer and clears the executor', async () => {
    const params = { operatorNames: 'AddCustom' };

    await taskMethods.runSanitizer(params);

    expect(sanitizerService.runSanitizer)
      .toHaveBeenCalledWith(params);
    expect(projectManager.clearExecutor)
      .toHaveBeenCalledTimes(1);
  });

  it('runs the dump tensor flow and clears the executor', async () => {
    const params = { operatorNames: 'AddCustom' };

    await taskMethods.startDumpTensor(params);

    expect(buildService.startDumpTensor)
      .toHaveBeenCalledWith(params);
    expect(projectManager.clearExecutor)
      .toHaveBeenCalledTimes(1);
  });

  it('runs the UT test flow and clears the executor', async () => {
    const params = { operatorNames: 'AddCustom' };

    await taskMethods.startUtTest(params);

    expect(buildService.startUtTest)
      .toHaveBeenCalledWith(params);
    expect(projectManager.clearExecutor)
      .toHaveBeenCalledTimes(1);
  });

  it('returns false and informs the user when no task is running', async () => {
    const stopped = await taskMethods.stopTask();

    expect(stopped)
      .toBe(false);
    expect(vscode.window.showInformationMessage)
      .toHaveBeenCalledWith('task.noRunningTask');
    expect(executor.kill)
      .not.toHaveBeenCalled();
  });

  it('returns false silently when no task is running and notify is disabled', async () => {
    const stopped = await taskMethods.stopTask({ notify: false });

    expect(stopped)
      .toBe(false);
    expect(vscode.window.showInformationMessage)
      .not.toHaveBeenCalled();
  });

  it('terminates a running task, warns the user and returns true', async () => {
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    (buildService.startBuild as jest.Mock)
      .mockImplementationOnce(() => gate);

    const pending = taskMethods.startBuild({});

    // Let the enqueued action reach the executor assignment (two microtask hops).
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const stopped = await taskMethods.stopTask();

    expect(stopped)
      .toBe(true);
    expect(executor.kill)
      .toHaveBeenCalledTimes(1);
    expect(vscode.window.showWarningMessage)
      .toHaveBeenCalledWith('task.stoppedByUser');

    release();
    await pending;

    expect(projectManager.clearExecutor)
      .toHaveBeenCalledTimes(2);
  });

  it('terminates a running task silently when notify is disabled', async () => {
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    (buildService.startBuild as jest.Mock)
      .mockImplementationOnce(() => gate);

    const pending = taskMethods.startBuild({});

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const stopped = await taskMethods.stopTask({ notify: false });

    expect(stopped)
      .toBe(true);
    expect(vscode.window.showWarningMessage)
      .not.toHaveBeenCalled();

    release();
    await pending;
  });

  it('imports the dump tensor bin file and clears the executor', async () => {
    await taskMethods.importDumpTensorBinFile({ binFilePath: '/tmp/dump.bin' });

    expect(buildService.importDumpTensorBinFile)
      .toHaveBeenCalledWith('/tmp/dump.bin');
    expect(projectManager.clearExecutor)
      .toHaveBeenCalledTimes(1);
  });

  it('opens the NPU launch.json configuration', async () => {
    await taskMethods.debugConfig();

    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith('workbench.action.debug.configure');
    expect(vscode.window.showInformationMessage)
      .toHaveBeenCalledWith('task.launchJsonOpened');
  });

  it('surfaces NPU launch.json open failures', async () => {
    const errorSpy = jest.spyOn(console, 'error')
      .mockImplementation();

    (vscode.commands.executeCommand as jest.Mock)
      .mockRejectedValueOnce(new Error('configure failed'));

    await expect(taskMethods.debugConfig())
      .rejects
      .toThrow('configure failed');
    expect(vscode.window.showErrorMessage)
      .toHaveBeenCalledWith('task.cannotOpenLaunchJson');
    errorSpy.mockRestore();
  });

  it('opens the CPU launch.json configuration', async () => {
    await taskMethods.cpuDebugConfig();

    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith('workbench.action.debug.configure');
    expect(vscode.window.showInformationMessage)
      .toHaveBeenCalledWith('task.launchJsonOpened');
  });

  it.each([
    [
      'startBuild',
      'startBuild',
    ],
    [
      'startBuildExample',
      'startBuildExample',
    ],
    [
      'startSimulate',
      'startSimulate',
    ],
    [
      'startOnBoard',
      'startOnBoard',
    ],
    [
      'startDumpTensor',
      'startDumpTensor',
    ],
    [
      'startUtTest',
      'startUtTest',
    ],
  ] as const)('%s falls back to empty params when called without arguments', async (methodName, serviceMethod) => {
    await (taskMethods[methodName] as ()=> Promise<void>)();

    expect(buildService[serviceMethod])
      .toHaveBeenCalledWith({});
    expect(projectManager.clearExecutor)
      .toHaveBeenCalledTimes(1);
  });

  it('stringifies non-Error NPU launch.json open failures', async () => {
    const errorSpy = jest.spyOn(console, 'error')
      .mockImplementation();

    (vscode.commands.executeCommand as jest.Mock)
      .mockRejectedValueOnce('configure exploded');

    await expect(taskMethods.debugConfig())
      .rejects
      .toBe('configure exploded');
    expect(vscode.window.showErrorMessage)
      .toHaveBeenCalledWith('task.cannotOpenLaunchJson');
    errorSpy.mockRestore();
  });

  it('stringifies non-Error CPU launch.json open failures', async () => {
    const errorSpy = jest.spyOn(console, 'error')
      .mockImplementation();

    (vscode.commands.executeCommand as jest.Mock)
      .mockRejectedValueOnce('configure exploded');

    await expect(taskMethods.cpuDebugConfig())
      .rejects
      .toBe('configure exploded');
    expect(vscode.window.showErrorMessage)
      .toHaveBeenCalledWith('task.cannotOpenLaunchJson');
    errorSpy.mockRestore();
  });

  it('reports an unknown project type when the guard type is empty', async () => {
    (homeMethods.getProjectType as jest.Mock)
      .mockResolvedValue({ projectType: '' });
    (OperatorPluginRegistry.isProjectTypeSupported as jest.Mock)
      .mockReturnValue(false);

    await taskMethods.runDebug();

    expect(vscode.window.showErrorMessage)
      .toHaveBeenCalledWith('extension.unsupportedProjectTypeDisabled');
    expect(buildService.startBuild)
      .not.toHaveBeenCalled();
  });

  it('surfaces CPU launch.json open failures', async () => {
    const errorSpy = jest.spyOn(console, 'error')
      .mockImplementation();

    (vscode.commands.executeCommand as jest.Mock)
      .mockRejectedValueOnce(new Error('configure failed'));

    await expect(taskMethods.cpuDebugConfig())
      .rejects
      .toThrow('configure failed');
    expect(vscode.window.showErrorMessage)
      .toHaveBeenCalledWith('task.cannotOpenLaunchJson');
    errorSpy.mockRestore();
  });
});

describe('taskMethods.startStTest', () => {
  const executor = { kill: jest.fn() };
  const projectManager = {
    getExecutor: jest.fn(() => executor),
    clearExecutor: jest.fn(),
  };
  const stResult = {
    report: {
      outcome: 'PASS',
      total: 1,
    },
    artifacts: [{ outputCsvPath: '/workspace/out/a.csv' }],
    outputPaths: ['/workspace/out/a.csv'],
    runDirectory: '/workspace/out',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (ProjectManager.getInstance as jest.Mock)
      .mockReturnValue(projectManager);
    mockStartStTest.mockResolvedValue(stResult);
    mockCreateOrShow.mockResolvedValue(undefined);
    mockIsStTestCancelledError.mockReturnValue(false);
  });

  it('runs ST tests, records the run and presents the completed report', async () => {
    const params = {
      workspaceRoot: '/workspace',
      operatorName: 'Add',
    };

    await taskMethods.startStTest({} as vscode.ExtensionContext, params);

    expect(mockStartStTest)
      .toHaveBeenCalledWith(params, expect.objectContaining({ isCancellationRequested: expect.any(Function) }));
    expect(mockShowNotification)
      .toHaveBeenCalledWith({
        workspaceRoot: '/workspace',
        outputPaths: stResult.outputPaths,
        runDirectory: stResult.runDirectory,
      });
    expect(mockRecordCompletedRun)
      .toHaveBeenCalledWith(
        stResult.report,
        stResult.artifacts,
        stResult.runDirectory,
        '/workspace',
      );
    expect(mockCreateOrShow)
      .toHaveBeenCalledWith(
        expect.anything(),
        stResult.report,
        stResult.artifacts,
        stResult.runDirectory,
      );
    expect(projectManager.clearExecutor)
      .toHaveBeenCalledTimes(1);
  });

  it('logs but does not fail when the results panel cannot be shown', async () => {
    const errorSpy = jest.spyOn(console, 'error')
      .mockImplementation();

    mockCreateOrShow.mockRejectedValue(new Error('panel failed'));

    await taskMethods.startStTest({} as vscode.ExtensionContext, { workspaceRoot: '/workspace' });

    expect(console.error)
      .toHaveBeenCalled();
    expect(mockRecordCompletedRun)
      .toHaveBeenCalledTimes(1);
    expect(projectManager.clearExecutor)
      .toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it('surfaces non-cancelled ST test failures', async () => {
    mockStartStTest.mockRejectedValue(new Error('ttk failed'));

    await expect(taskMethods.startStTest({} as vscode.ExtensionContext, { workspaceRoot: '/workspace' }))
      .rejects
      .toThrow('ttk failed');
    expect(vscode.window.showErrorMessage)
      .toHaveBeenCalledWith('stTest.failed');
  });

  it('returns silently when the ST test was cancelled by the user', async () => {
    mockStartStTest.mockRejectedValue(new Error('cancelled'));
    mockIsStTestCancelledError.mockReturnValue(true);

    await expect(taskMethods.startStTest({} as vscode.ExtensionContext, { workspaceRoot: '/workspace' }))
      .resolves
      .toBeUndefined();
    expect(vscode.window.showErrorMessage)
      .not.toHaveBeenCalled();
    expect(mockRecordCompletedRun)
      .not.toHaveBeenCalled();
  });

  it('stringifies non-Error ST test failures', async () => {
    mockStartStTest.mockRejectedValue('ttk exploded');

    await expect(taskMethods.startStTest({} as vscode.ExtensionContext, { workspaceRoot: '/workspace' }))
      .rejects
      .toBe('ttk exploded');
    expect(vscode.window.showErrorMessage)
      .toHaveBeenCalledWith('stTest.failed');
  });
});
