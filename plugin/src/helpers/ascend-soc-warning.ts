import * as vscode from 'vscode';
import { t } from 'i18next';

import type { AscendEnvResolution } from '@plugin/domain/utils/ascend-util';

let socUndetectedWarningShown = false;

/**
 * When SOC resolution falls through to the empty default (host autodetection
 * failed and no workspace / global env override), show a one-time warning with
 * remediation steps before build scripts fail on missing SOC_VERSION.
 */
export function maybeWarnSocNotDetected(resolution: AscendEnvResolution): void {
  if (socUndetectedWarningShown) {
    return;
  }

  if (resolution.source.socVersion !== 'default' || resolution.socVersion) {
    return;
  }

  socUndetectedWarningShown = true;

  const openSettingsLabel = t('extension.ascendEnv.socNotDetected.openSettings');

  void vscode.window
    .showWarningMessage(t('extension.ascendEnv.socNotDetected.message'), openSettingsLabel)
    .then((choice) => {
      if (choice === openSettingsLabel) {
        // Open Workspace settings focused on the SOC setting: the resolver only
        // honors Workspace/WorkspaceFolder scope (getConfiguredValue), so a value
        // entered at the default User scope would be silently ignored. The
        // `@ext:` query mirrors the gear "Project Config" command
        // (huawei-op-devtools.sidebar.projectConfig) so both entry points land on
        // the same Workspace-scope view.
        void vscode.commands.executeCommand(
          'workbench.action.openWorkspaceSettings',
          '@ext:huawei.huawei-op-devtools-vscode-plugin op-devtools.environment.socVersion',
        );
      }
    });
}

/** Test hook — allow re-showing the warning in unit tests. */
export function _resetSocUndetectedWarningForTest(): void {
  socUndetectedWarningShown = false;
}
