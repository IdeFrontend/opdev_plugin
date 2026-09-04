jest.mock('i18next', () => ({ t: (key: string) => key }));

import * as vscode from 'vscode';

import { promptReloadWindow } from '@plugin/helpers/reload-window-prompt';

describe('promptReloadWindow', () => {
  const showInformationMessage = vscode.window.showInformationMessage as jest.Mock;
  const executeCommand = vscode.commands.executeCommand as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    showInformationMessage.mockResolvedValue(undefined);
    executeCommand.mockResolvedValue(undefined);
  });

  it('reloads the window when the reload action is picked', async () => {
    showInformationMessage.mockResolvedValue('extension.reloadWindowAction');

    await promptReloadWindow('Settings changed');

    expect(showInformationMessage)
      .toHaveBeenCalledWith('Settings changed', 'extension.reloadWindowAction');
    expect(executeCommand)
      .toHaveBeenCalledWith('workbench.action.reloadWindow');
  });

  it('does nothing when the prompt is dismissed', async () => {
    await promptReloadWindow('Settings changed');

    expect(executeCommand)
      .not
      .toHaveBeenCalled();
  });

  it('does nothing when any other button is picked', async () => {
    showInformationMessage.mockResolvedValue('some other action');

    await promptReloadWindow('Settings changed');

    expect(executeCommand)
      .not
      .toHaveBeenCalled();
  });
});
