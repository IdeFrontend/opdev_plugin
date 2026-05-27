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
        void vscode.commands.executeCommand(
          'workbench.action.openSettings',
          'op-devtools.environment.socVersion',
        );
      }
    });
}

/** Test hook — allow re-showing the warning in unit tests. */
export function _resetSocUndetectedWarningForTest(): void {
  socUndetectedWarningShown = false;
}
