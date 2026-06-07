import { t } from 'i18next';
import * as vscode from 'vscode';

export async function promptReloadWindow(message: string): Promise<void> {
  const reloadAction = t('extension.reloadWindowAction');
  const pick = await vscode.window.showInformationMessage(message, reloadAction);

  if (pick === reloadAction) {
    await vscode.commands.executeCommand('workbench.action.reloadWindow');
  }
}
