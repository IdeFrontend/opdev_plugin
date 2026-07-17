import { t } from 'i18next';
import * as vscode from 'vscode';

import { ST_TEST_MODES } from '@plugin/domain/services/st-test-command';
import type { StTestMode } from '@shared/st-test-results';
import {
  discoverStTestInputCsvFiles,
  validateStTestOperatorDirectory,
} from '@plugin/domain/utils/st-test-paths';

type StTestModePick = vscode.QuickPickItem & {
  mode: StTestMode;
};

export async function pickAvailableStTestModes(
  workspaceRoot: string,
  operatorPath: string,
): Promise<StTestMode[] | undefined> {
  let availableModes: StTestMode[];

  try {
    validateStTestOperatorDirectory(workspaceRoot, operatorPath);
    const inputsByMode = discoverStTestInputCsvFiles(operatorPath);

    availableModes = ST_TEST_MODES.filter((mode) => inputsByMode[mode].length > 0);
  }
  catch (error) {
    const detail = error instanceof Error ? error.message : String(error);

    await vscode.window.showErrorMessage(t('stTest.discoveryFailed', { error: detail }));

    return undefined;
  }

  if (availableModes.length === 0) {
    await vscode.window.showInformationMessage(t('stTest.noAvailableModes'));

    return undefined;
  }

  const preferredMode = availableModes.includes('kernel') ? 'kernel' : availableModes[0];
  const modePicks: StTestModePick[] = availableModes.map((mode) => ({
    label: t(`stTest.mode.${mode}`),
    description: mode,
    picked: mode === preferredMode,
    mode,
  }));
  const selectedModes = await vscode.window.showQuickPick(modePicks, {
    canPickMany: true,
    placeHolder: t('stTest.pickModes'),
  });

  if (!selectedModes || selectedModes.length === 0) {
    return undefined;
  }

  const selected = new Set(selectedModes.map((item) => item.mode));

  return availableModes.filter((mode) => selected.has(mode));
}
