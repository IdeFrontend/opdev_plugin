import * as vscode from 'vscode';
import { MindStudioPluginInstaller } from '@plugin/class/mind-studio-plugin-installer';
import type { OperateTreeProvider } from '@plugin/class/operate-tree-provider';
import { welcomeMethods } from '@plugin/controller/welcome-controller';
import {
  isRemoteNpuHardwareProbeAvailable, startNpuHardwareProbe, startRemoteNpuHardwareProbe,
} from '@plugin/domain/utils/npu-hardware-probe';
import { CONTEXT_PREFIX } from '@shared/flavor';
import { maybeApplyCannCppIncludePaths } from '@plugin/domain/utils/cann-cpp-include-paths';
import { maybePromptInstallCppExtension } from '@plugin/helpers/cpp-extension-support';
import { computeAscendEnvResolution } from '@plugin/domain/utils/ascend-util';
import { applyNpuArchToTerminalEnv } from './terminal-npu-arch-env';
import { AsyncSingleFlight } from './async-single-flight';
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

  void refreshNpuHardwareAvailability(operateTreeProvider, logDebug);

  void maybePromptInstallCppExtension(context, logDebug)
    .catch((error) => {
      logDebug('postActivate:cppSupportPrompt:error', error);
    });

  void maybeApplyCannCppIncludePaths(logDebug)
    .catch((error) => {
      logDebug('postActivate:cannCppIncludePaths:error', error);
    });

  // Issue #37: seed NPU_ARCH into the terminal env from settings / OS env only, so a manual
  // `bash build.sh` right after "Open Folder" has it. Host detection stays off here: it is
  // memoized, and probing before the user's CANN env is applied would cache a failure.
  try {
    applyNpuArchToTerminalEnv(
      context.environmentVariableCollection,
      computeAscendEnvResolution({ isSimulator: false }, { allowHostDetection: false }).npuArch,
    );
  }
  catch (error) {
    logDebug('postActivate:npuArchTerminalEnv:error', error);
  }

  try {
    const installer = new MindStudioPluginInstaller(context, {
      pluginId: MIND_STUDIO_DEBUG_PLUGIN_ID,
      vsixRelativePath:
        './out/plugin/mindstudio-debug-vscode-plugin/MindStudio-Debug-VSCode-Plugin-1.0.10.vsix',
      pluginVersion: '1.0.10',
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

      await openWorkspace;
    }

    void installer.installIfNeeded()
      .then(() => {
        logDebug('postActivate:installMindStudioDebug:completed (fire-and-forget)');
      })
      .catch((error) => {
        logDebug('postActivate:installMindStudioDebug:error (fire-and-forget)', error);
      });

    // openProject may create devtool_config.json after the sync refreshSidebarContexts in activate().
    // Note: do not auto-focus the operate tree here — revealing the secondary sidebar on every
    // startup of an operator workspace disturbs users who deliberately closed it. Visibility
    // of the views inside the container is still driven by `refreshSidebarContexts` context
    // keys, so the panel shows its content as soon as the user opens it themselves.
    await requestSidebarContextsRefresh();

    logDebug('postActivate:bootstrap:end');
  }
  catch (error) {
    logDebug('postActivate:bootstrap:error', error);
  }
}

function refreshRemoteNpuHardwareAvailability(
  operateTreeProvider: OperateTreeProvider,
  logDebug: (message: string, payload?: unknown)=> void,
): void {
  operateTreeProvider.setRemoteNpuHardwareAvailable(isRemoteNpuHardwareProbeAvailable());

  void startRemoteNpuHardwareProbe()
    .then((remoteAvailable) => {
      operateTreeProvider.setRemoteNpuHardwareAvailable(remoteAvailable);
      logDebug('postActivate:remoteNpuHardwareProbe', { remoteAvailable });
    })
    .catch((error) => {
      operateTreeProvider.setRemoteNpuHardwareAvailable(false);
      logDebug('postActivate:remoteNpuHardwareProbe:error', error);
    });
}

async function refreshNpuHardwareAvailability(
  operateTreeProvider: OperateTreeProvider,
  logDebug: (message: string, payload?: unknown)=> void,
): Promise<void> {
  try {
    const available = await startNpuHardwareProbe();

    await vscode.commands.executeCommand(
      'setContext',
      `${CONTEXT_PREFIX}.npuHardwareAvailable`,
      available,
    );
    operateTreeProvider.setNpuHardwareAvailable(available);
    logDebug('postActivate:npuHardwareProbe', { available });

    if (!available) {
      refreshRemoteNpuHardwareAvailability(operateTreeProvider, logDebug);
    }
    else {
      operateTreeProvider.setRemoteNpuHardwareAvailable(false);
    }
  }
  catch (error) {
    logDebug('postActivate:npuHardwareProbe:error', error);
    await vscode.commands.executeCommand(
      'setContext',
      `${CONTEXT_PREFIX}.npuHardwareAvailable`,
      false,
    );
    operateTreeProvider.setNpuHardwareAvailable(false);

    refreshRemoteNpuHardwareAvailability(operateTreeProvider, logDebug);
  }
}
