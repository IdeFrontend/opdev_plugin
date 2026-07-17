import * as vscode from 'vscode';
import { t } from 'i18next';

import type { AscendEnvResolution } from '@plugin/domain/utils/ascend-util';
import { getSocVersionWithWorkspaceOverride } from '@plugin/helpers/operator-project-workspace-config';
import {
  EXTENSION_ID, settingsKey, SETTINGS_PREFIX,
} from '@shared/flavor';
import { ConfigService } from '@plugin/service/config-service';

export type SocWarningResult = 'continue' | 'open-settings' | 'cancelled' | 'configured';

/**
 * When SOC resolution falls through to the empty default (host autodetection
 * failed and no workspace / global env override), show a warning with a link to
 * workspace settings before build scripts fail on missing SOC_VERSION.
 *
 * Called from operator command execution only; repeats on every run until SOC
 * is configured or otherwise resolved.
 *
 * Returns a Promise that resolves with the user's choice:
 * - 'continue': Continue with the current resolution (SOC is already configured)
 * - 'open-settings': User clicked Open Settings, should abort execution
 * - 'cancelled': User dismissed the warning (clicked elsewhere), should abort execution
 * - 'configured': User set SOC version via input box, should re-resolve with new config
 */
export async function maybeWarnSocNotDetected(resolution: AscendEnvResolution): Promise<SocWarningResult> {
  if (getSocVersionWithWorkspaceOverride(null)
    .trim()) {
    return 'continue';
  }

  if (resolution.source.socVersion !== 'default' || resolution.socVersion) {
    return 'continue';
  }

  const setAndExecuteLabel = t('extension.ascendEnv.socNotDetected.setAndExecute');
  const openSettingsLabel = t('extension.ascendEnv.socNotDetected.openSettings');

  const choice = await vscode.window
    .showWarningMessage(t('extension.ascendEnv.socNotDetected.message'), setAndExecuteLabel, openSettingsLabel);

  if (choice === setAndExecuteLabel) {
    const socVersion = await vscode.window.showInputBox({
      prompt: t('extension.ascendEnv.socNotDetected.inputPrompt'),
      placeHolder: t('extension.ascendEnv.socNotDetected.inputPlaceholder'),
      value: t('extension.ascendEnv.socNotDetected.inputPlaceholder'),
      validateInput: (value) => {
        if (!value?.trim()) {
          return t('extension.ascendEnv.socNotDetected.inputRequired');
        }

        return undefined;
      },
    });

    if (socVersion?.trim()) {
      await ConfigService.writeOpDevtoolsDottedSettings({ 'environment.socVersion': socVersion.trim() });

      const cfg = vscode.workspace.getConfiguration(SETTINGS_PREFIX);

      await cfg.update('environment.socVersion', socVersion.trim(), vscode.ConfigurationTarget.Workspace);

      vscode.window.showInformationMessage(t('extension.ascendEnv.socNotDetected.setSuccess'));

      return 'configured';
    }

    return 'cancelled';
  }

  if (choice === openSettingsLabel) {
    void vscode.commands.executeCommand(
      'workbench.action.openWorkspaceSettings',
      `@ext:${EXTENSION_ID} ${settingsKey('environment.socVersion')}`,
    );

    return 'open-settings';
  }

  return 'cancelled';
}
