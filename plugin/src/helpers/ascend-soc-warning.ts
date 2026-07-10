import * as vscode from 'vscode';
import { t } from 'i18next';

import type { AscendEnvResolution } from '@plugin/domain/utils/ascend-util';
import { getSocVersionWithWorkspaceOverride } from '@plugin/helpers/operator-project-workspace-config';
import {
  EXTENSION_ID, settingsKey,
} from '@shared/flavor';

export type SocWarningResult = 'continue' | 'open-settings' | 'cancelled';

/**
 * When SOC resolution falls through to the empty default (host autodetection
 * failed and no workspace / global env override), show a warning with a link to
 * workspace settings before build scripts fail on missing SOC_VERSION.
 *
 * Called from operator command execution only; repeats on every run until SOC
 * is configured or otherwise resolved.
 *
 * Returns a Promise that resolves with the user's choice:
 * - 'continue': User explicitly clicked Continue to proceed with empty SOC
 * - 'open-settings': User clicked Open Settings
 * - 'cancelled': User dismissed the warning (clicked elsewhere)
 */
export async function maybeWarnSocNotDetected(resolution: AscendEnvResolution): Promise<SocWarningResult> {
  if (getSocVersionWithWorkspaceOverride(null)
    .trim()) {
    return 'continue';
  }

  if (resolution.source.socVersion !== 'default' || resolution.socVersion) {
    return 'continue';
  }

  const openSettingsLabel = t('extension.ascendEnv.socNotDetected.openSettings');
  const continueLabel = t('extension.ascendEnv.socNotDetected.continue');

  const choice = await vscode.window
    .showWarningMessage(t('extension.ascendEnv.socNotDetected.message'), openSettingsLabel, continueLabel);

  if (choice === openSettingsLabel) {
    void vscode.commands.executeCommand(
      'workbench.action.openWorkspaceSettings',
      `@ext:${EXTENSION_ID} ${settingsKey('environment.socVersion')}`,
    );

    return 'open-settings';
  }

  if (choice === continueLabel) {
    return 'continue';
  }

  return 'cancelled';
}
