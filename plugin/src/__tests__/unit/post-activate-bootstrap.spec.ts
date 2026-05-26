jest.mock('vscode', () => ({
  extensions: { getExtension: jest.fn() },
  workspace: { workspaceFolders: undefined },
  commands: { executeCommand: jest.fn() },
}));

jest.mock('@plugin/class/mind-studio-plugin-installer', () => ({
  MindStudioPluginInstaller: jest.fn().mockImplementation(() => ({
    installIfNeeded: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('@plugin/controller/welcome-controller', () => ({
  welcomeMethods: {
    openProject: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@plugin/helpers/sidebar-context-refresh', () => ({
  requestSidebarContextsRefresh: jest.fn().mockResolvedValue(undefined),
}));

import * as vscode from 'vscode';
import { welcomeMethods } from '@plugin/controller/welcome-controller';
import { requestSidebarContextsRefresh } from '@plugin/helpers/sidebar-context-refresh';
import {
  startPostActivateBootstrap,
  whenPostActivateBootstrapReady,
  resetPostActivateBootstrapForTest,
  MIND_STUDIO_DEBUG_PLUGIN_ID,
} from '@plugin/helpers/post-activate-bootstrap';

const operateTreeProvider = {
  refreshSanitizerReports: jest.fn().mockResolvedValue(undefined),
  refreshPerformanceReports: jest.fn().mockResolvedValue(undefined),
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
    startPostActivateBootstrap({
      context: {} as never,
      operateTreeProvider,
      logDebug: jest.fn(),
      checkDevtoolConfigExists: jest.fn().mockResolvedValue(false),
    });

    await whenPostActivateBootstrapReady();

    expect(welcomeMethods.openProject).not.toHaveBeenCalled();
    expect(requestSidebarContextsRefresh).toHaveBeenCalledTimes(1);
  });

  it('single-flights concurrent startPostActivateBootstrap calls', async () => {
    (vscode.workspace as { workspaceFolders?: unknown }).workspaceFolders = [
      { uri: { fsPath: '/proj' } },
    ];

    const deps = {
      context: {} as never,
      operateTreeProvider,
      logDebug: jest.fn(),
      checkDevtoolConfigExists: jest.fn().mockResolvedValue(true),
    };

    startPostActivateBootstrap(deps);
    startPostActivateBootstrap(deps);
    await whenPostActivateBootstrapReady();

    expect(welcomeMethods.openProject).toHaveBeenCalledTimes(1);
    expect(welcomeMethods.openProject).toHaveBeenCalledWith(
      { projectPath: '/proj' },
      true,
    );
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('opdevtoolsOperateTree.focus');
  });

  it('exports MindStudio debug plugin id constant', () => {
    expect(MIND_STUDIO_DEBUG_PLUGIN_ID).toBe('ascend.mindstudio-debug-vscode-plugin');
  });
});
