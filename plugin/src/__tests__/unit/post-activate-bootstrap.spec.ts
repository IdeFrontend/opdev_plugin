jest.mock('vscode', () => ({
  extensions: { getExtension: jest.fn() },
  workspace: { workspaceFolders: undefined },
  commands: { executeCommand: jest.fn() },
}));

jest.mock('@plugin/helpers/cpp-extension-support', () => ({
  maybePromptInstallCppExtension: jest.fn()
    .mockResolvedValue(undefined),
}));

jest.mock('@plugin/domain/utils/cann-cpp-include-paths', () => ({
  maybeApplyCannCppIncludePaths: jest.fn()
    .mockResolvedValue(undefined),
}));

jest.mock('@plugin/class/mind-studio-plugin-installer', () => ({
  MindStudioPluginInstaller: jest.fn()
    .mockImplementation(() => ({
      installIfNeeded: jest.fn()
        .mockResolvedValue(undefined),
    })),
}));

jest.mock('@plugin/controller/welcome-controller', () => ({
  welcomeMethods: {
    openProject: jest.fn()
      .mockResolvedValue(undefined),
  },
}));

jest.mock('@plugin/helpers/sidebar-context-refresh', () => ({
  requestSidebarContextsRefresh: jest.fn()
    .mockResolvedValue(undefined),
}));

jest.mock('@plugin/service/config-service', () => ({
  configService: {
    checkDevtoolConfig: jest.fn()
      .mockResolvedValue(false),
  },
}));

jest.mock('@plugin/domain/utils/npu-hardware-probe', () => ({
  isRemoteNpuHardwareProbeAvailable: jest.fn()
    .mockReturnValue(true),
  startNpuHardwareProbe: jest.fn()
    .mockResolvedValue(true),
  startRemoteNpuHardwareProbe: jest.fn()
    .mockResolvedValue(false),
}));

import * as vscode from 'vscode';
import { welcomeMethods } from '@plugin/controller/welcome-controller';
import { requestSidebarContextsRefresh } from '@plugin/helpers/sidebar-context-refresh';
import { configService } from '@plugin/service/config-service';
import {
  startPostActivateBootstrap,
  whenPostActivateBootstrapReady,
  resetPostActivateBootstrapForTest,
  MIND_STUDIO_DEBUG_PLUGIN_ID,
} from '@plugin/helpers/post-activate-bootstrap';
import {
  isRemoteNpuHardwareProbeAvailable, startNpuHardwareProbe, startRemoteNpuHardwareProbe,
} from '@plugin/domain/utils/npu-hardware-probe';
import { maybeApplyCannCppIncludePaths } from '@plugin/domain/utils/cann-cpp-include-paths';
import { maybePromptInstallCppExtension } from '@plugin/helpers/cpp-extension-support';
import {
  CONTEXT_PREFIX, TREE_VIEW_OPERATE,
} from '@shared/flavor';

const operateTreeProvider = {
  refreshSanitizerReports: jest.fn()
    .mockResolvedValue(undefined),
  refreshPerformanceReports: jest.fn()
    .mockResolvedValue(undefined),
  setNpuHardwareAvailable: jest.fn(),
  setRemoteNpuHardwareAvailable: jest.fn(),
} as never;

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('post-activate-bootstrap', () => {
  beforeEach(() => {
    resetPostActivateBootstrapForTest();
    jest.clearAllMocks();
    (isRemoteNpuHardwareProbeAvailable as jest.Mock).mockReturnValue(true);
    (startNpuHardwareProbe as jest.Mock).mockResolvedValue(true);
    (startRemoteNpuHardwareProbe as jest.Mock).mockResolvedValue(false);
    (vscode.workspace as { workspaceFolders?: unknown }).workspaceFolders = undefined;
  });

  it('whenPostActivateBootstrapReady resolves immediately if bootstrap never started', async () => {
    await expect(whenPostActivateBootstrapReady()).resolves.toBeUndefined();
  });

  it('runs bootstrap once and awaits install without workspace', async () => {
    (configService.checkDevtoolConfig as jest.Mock).mockResolvedValue(false);
    startPostActivateBootstrap({
      context: {} as never,
      operateTreeProvider,
      logDebug: jest.fn(),
    });

    await whenPostActivateBootstrapReady();

    expect(welcomeMethods.openProject).not.toHaveBeenCalled();
    expect(requestSidebarContextsRefresh)
      .toHaveBeenCalledTimes(1);
  });

  it('single-flights concurrent startPostActivateBootstrap calls', async () => {
    (vscode.workspace as { workspaceFolders?: unknown }).workspaceFolders = [{ uri: { fsPath: '/proj' } }];

    const deps = {
      context: {} as never,
      operateTreeProvider,
      logDebug: jest.fn(),
    };

    startPostActivateBootstrap(deps);
    startPostActivateBootstrap(deps);
    await whenPostActivateBootstrapReady();

    expect(welcomeMethods.openProject)
      .toHaveBeenCalledTimes(1);
    expect(welcomeMethods.openProject)
      .toHaveBeenCalledWith(
        { projectPath: '/proj' },
        true,
      );
    // Bootstrap must not auto-focus the operate tree — revealing the secondary
    // sidebar on every startup of an operator workspace disturbs users.
    expect(vscode.commands.executeCommand)
      .not.toHaveBeenCalledWith(`${TREE_VIEW_OPERATE}.focus`);
  });

  it('kicks off the C/C++ prompt and the CANN include-path fix', async () => {
    const context = {} as never;
    const logDebug = jest.fn();

    startPostActivateBootstrap({
      context,
      operateTreeProvider,
      logDebug,
    });

    await whenPostActivateBootstrapReady();

    expect(maybePromptInstallCppExtension)
      .toHaveBeenCalledWith(context, logDebug);
    expect(maybeApplyCannCppIncludePaths)
      .toHaveBeenCalledWith(logDebug);
  });

  it('finishes bootstrap when the C/C++ work rejects instead of taking the rest down', async () => {
    const logDebug = jest.fn();

    (maybePromptInstallCppExtension as jest.Mock).mockRejectedValueOnce(new Error('no marketplace'));
    (maybeApplyCannCppIncludePaths as jest.Mock).mockRejectedValueOnce(new Error('settings.json is read-only'));

    startPostActivateBootstrap({
      context: {} as never,
      operateTreeProvider,
      logDebug,
    });

    await expect(whenPostActivateBootstrapReady())
      .resolves
      .toBeUndefined();
    await flushPromises();

    expect(logDebug)
      .toHaveBeenCalledWith('postActivate:cppSupportPrompt:error', expect.any(Error));
    expect(logDebug)
      .toHaveBeenCalledWith('postActivate:cannCppIncludePaths:error', expect.any(Error));
  });

  it('exports MindStudio debug plugin id constant', () => {
    expect(MIND_STUDIO_DEBUG_PLUGIN_ID)
      .toBe('ascend.mindstudio-debug-vscode-plugin');
  });

  it('keeps remote NPU actions available while remote probe is pending after local probe is unavailable', async () => {
    let resolveRemoteProbe: (available: boolean)=> void = jest.fn();

    (startNpuHardwareProbe as jest.Mock).mockResolvedValue(false);
    (startRemoteNpuHardwareProbe as jest.Mock).mockImplementation(() => new Promise<boolean>((resolve) => {
      resolveRemoteProbe = resolve;
    }));

    startPostActivateBootstrap({
      context: {} as never,
      operateTreeProvider,
      logDebug: jest.fn(),
    });

    await flushPromises();

    expect(operateTreeProvider.setNpuHardwareAvailable)
      .toHaveBeenCalledWith(false);
    expect(operateTreeProvider.setRemoteNpuHardwareAvailable)
      .toHaveBeenCalledWith(true);

    resolveRemoteProbe(false);
    await flushPromises();

    expect(operateTreeProvider.setRemoteNpuHardwareAvailable)
      .toHaveBeenLastCalledWith(false);
  });

  it('keeps remote NPU actions available while remote probe is pending after local probe errors', async () => {
    let resolveRemoteProbe: (available: boolean)=> void = jest.fn();

    (startNpuHardwareProbe as jest.Mock).mockRejectedValue(new Error('local probe failed'));
    (startRemoteNpuHardwareProbe as jest.Mock).mockImplementation(() => new Promise<boolean>((resolve) => {
      resolveRemoteProbe = resolve;
    }));

    startPostActivateBootstrap({
      context: {} as never,
      operateTreeProvider,
      logDebug: jest.fn(),
    });

    await flushPromises();

    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith(
        'setContext',
        `${CONTEXT_PREFIX}.npuHardwareAvailable`,
        false,
      );
    expect(operateTreeProvider.setNpuHardwareAvailable)
      .toHaveBeenCalledWith(false);
    expect(operateTreeProvider.setRemoteNpuHardwareAvailable)
      .toHaveBeenCalledWith(true);

    resolveRemoteProbe(true);
    await flushPromises();

    expect(operateTreeProvider.setRemoteNpuHardwareAvailable)
      .toHaveBeenLastCalledWith(true);
  });

  it('does not temporarily enable remote NPU actions when remote probe is already unavailable', async () => {
    (isRemoteNpuHardwareProbeAvailable as jest.Mock).mockReturnValue(false);
    (startNpuHardwareProbe as jest.Mock).mockResolvedValue(false);
    (startRemoteNpuHardwareProbe as jest.Mock).mockResolvedValue(false);

    startPostActivateBootstrap({
      context: {} as never,
      operateTreeProvider,
      logDebug: jest.fn(),
    });

    await flushPromises();

    expect(operateTreeProvider.setRemoteNpuHardwareAvailable)
      .not.toHaveBeenCalledWith(true);
    expect(operateTreeProvider.setRemoteNpuHardwareAvailable)
      .toHaveBeenLastCalledWith(false);
  });
});
