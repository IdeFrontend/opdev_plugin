import * as vscode from 'vscode';
import { MindStudioPluginInstaller } from '@plugin/class/mind-studio-plugin-installer';
import type { OperateTreeProvider } from '@plugin/class/operate-tree-provider';
import { welcomeMethods } from '@plugin/controller/welcome-controller';
import { configService } from '@plugin/service/config-service';
import { AsyncSingleFlight } from './async-single-flight';
import { TREE_VIEW_OPERATE } from '@shared/flavor';
import { requestSidebarContextsRefresh } from './sidebar-context-refresh';

export const MIND_STUDIO_DEBUG_PLUGIN_ID = 'ascend.mindstudio-debug-vscode-plugin';

export type PostActivateBootstrapDeps = {
  context: vscode.ExtensionContext;
  operateTreeProvider: OperateTreeProvider;
  logDebug: (message: string, payload?: unknown)=> void;
};

const postActivateBootstrapFlight = new AsyncSingleFlight<void>();

/**
 * Schedules heavy startup work after `activate()` returns (single-flight).
 */
export function startPostActivateBootstrap(deps: PostActivateBootstrapDeps): void {
  postActivateBootstrapFlight.run(() => runPostActivateBootstrapImpl(deps));
}

/**
 * Resolves when deferred startup (auto-open project, MindStudio debug install, sidebar refresh) has finished.
 * No-op if bootstrap was never started (e.g. unit tests).
 */
export function whenPostActivateBootstrapReady(): Promise<void> {
  return postActivateBootstrapFlight.pending ?? Promise.resolve();
}

export function isMindStudioDebugExtensionActive(): boolean {
  return Boolean(vscode.extensions.getExtension(MIND_STUDIO_DEBUG_PLUGIN_ID));
}

/** @internal */
export function resetPostActivateBootstrapForTest(): void {
  postActivateBootstrapFlight.reset();
}

async function runPostActivateBootstrapImpl(deps: PostActivateBootstrapDeps): Promise<void> {
  const {
    context, operateTreeProvider, logDebug,
  } = deps;

  logDebug('postActivate:bootstrap:start');

  try {
    const installer = new MindStudioPluginInstaller(context, {
      pluginId: MIND_STUDIO_DEBUG_PLUGIN_ID,
      vsixRelativePath:
        './out/plugin/mindstudio-debug-vscode-plugin/MindStudio-Debug-VSCode-Plugin-1.0.8.vsix',
      pluginVersion: '1.0.8',
    });
    const installMindStudioDebug = installer.installIfNeeded()
      .catch((error) => {
        logDebug('postActivate:installMindStudioDebug:error', error);
      });

    const [workspaceFolder] = vscode.workspace.workspaceFolders ?? [];

    if (workspaceFolder) {
      const workspacePath = workspaceFolder.uri.fsPath;

      logDebug('postActivate:autoOpenProject:start', { workspacePath });
      const openWorkspace = (async () => {
        try {
          await welcomeMethods.openProject({ projectPath: workspacePath }, true);
          await operateTreeProvider.refreshSanitizerReports(false);
          await operateTreeProvider.refreshPerformanceReports();
          logDebug('postActivate:autoOpenProject:end');
        }
        catch (error) {
          logDebug('postActivate:autoOpenProject:error', error);
        }
      })();

      await Promise.all([
        openWorkspace,
        installMindStudioDebug,
      ]);
    }
    else {
      await installMindStudioDebug;
    }

    // openProject may create devtool_config.json after the sync refreshSidebarContexts in activate().
    await requestSidebarContextsRefresh();

    if (await configService.checkDevtoolConfig()) {
      try {
        await vscode.commands.executeCommand(`${TREE_VIEW_OPERATE}.focus`);
      }
      catch (error) {
        logDebug('postActivate:focusOperateTree:error', error);
      }
    }

    logDebug('postActivate:bootstrap:end');
  }
  catch (error) {
    logDebug('postActivate:bootstrap:error', error);
  }
}
