jest.mock('vscode', () => ({
  extensions: { getExtension: jest.fn() },
  workspace: { workspaceFolders: undefined },
  commands: { executeCommand: jest.fn() },
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
  startNpuHardwareProbe: jest.fn()
    .mockResolvedValue(true),
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
import { TREE_VIEW_OPERATE } from '@shared/flavor';

const operateTreeProvider = {
  refreshSanitizerReports: jest.fn()
    .mockResolvedValue(undefined),
  refreshPerformanceReports: jest.fn()
    .mockResolvedValue(undefined),
  setNpuHardwareAvailable: jest.fn(),
} as never;

describe('post-activate-bootstrap', () => {
  beforeEach(() => {
    resetPostActivateBootstrapForTest();
    jest.clearAllMocks();
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

    (configService.checkDevtoolConfig as jest.Mock).mockResolvedValue(true);
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
    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith(`${TREE_VIEW_OPERATE}.focus`);
  });

  it('exports MindStudio debug plugin id constant', () => {
    expect(MIND_STUDIO_DEBUG_PLUGIN_ID)
      .toBe('ascend.mindstudio-debug-vscode-plugin');
  });
});
