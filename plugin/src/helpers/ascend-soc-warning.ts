import * as vscode from 'vscode';
import { t } from 'i18next';

import type { AscendEnvResolution } from '@plugin/domain/utils/ascend-util';
import { getSocVersionWithWorkspaceOverride } from '@plugin/helpers/operator-project-workspace-config';
import {
  EXTENSION_ID, settingsKey,
} from '@shared/flavor';

/**
 * When SOC resolution falls through to the empty default (host autodetection
 * failed and no workspace / global env override), show a warning with a link to
 * workspace settings before build scripts fail on missing SOC_VERSION.
 *
 * Called from operator command execution only; repeats on every run until SOC
 * is configured or otherwise resolved.
 */
export function maybeWarnSocNotDetected(resolution: AscendEnvResolution): void {
  // Match resolver: only explicit workspace/workspaceFolder values count; User
  // scope via cfg.get is ignored (see getSocVersionWithWorkspaceOverride).
  if (getSocVersionWithWorkspaceOverride(null)
    .trim()) {
    return;
  }

  if (resolution.source.socVersion !== 'default' || resolution.socVersion) {
    return;
  }

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
          `@ext:${EXTENSION_ID} ${settingsKey('environment.socVersion')}`,
        );
      }
    });
}
