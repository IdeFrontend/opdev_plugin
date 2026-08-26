jest.mock('i18next', () => ({ t: (key: string) => key }));

const mockExecuteCommand = jest.fn();
const mockShowErrorMessage = jest.fn();

jest.mock('fs', () => ({ existsSync: jest.fn() }));

jest.mock('vscode', () => ({
  workspace: { workspaceFolders: undefined },
  Uri: { file: (fsPath: string) => ({ fsPath }) },
  commands: { executeCommand: mockExecuteCommand },
  window: { showErrorMessage: mockShowErrorMessage },
}));

import * as fs from 'fs';
import * as vscode from 'vscode';
import { linkMethods } from '@plugin/controller/link-controller';

describe('linkMethods.openFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' } }];
    (fs.existsSync as jest.Mock)
      .mockReturnValue(true);
  });

  it('returns without opening anything when no workspace folder is open', async () => {
    vscode.workspace.workspaceFolders = undefined;

    await linkMethods.openFile({ file: '/ws/report.txt' });

    expect(mockExecuteCommand)
      .not.toHaveBeenCalled();
    expect(mockShowErrorMessage)
      .not.toHaveBeenCalled();
  });

  it('opens the file with vscode.open when it exists on disk', async () => {
    await linkMethods.openFile({ file: '/ws/report.txt' });

    expect(fs.existsSync)
      .toHaveBeenCalledWith('/ws/report.txt');
    expect(mockExecuteCommand)
      .toHaveBeenCalledWith('vscode.open', { fsPath: '/ws/report.txt' });
    expect(mockShowErrorMessage)
      .not.toHaveBeenCalled();
  });

  it('shows a file-not-exist error and does not open when the file is missing', async () => {
    (fs.existsSync as jest.Mock)
      .mockReturnValue(false);

    await linkMethods.openFile({ file: '/ws/gone.txt' });

    expect(mockExecuteCommand)
      .not.toHaveBeenCalled();
    expect(mockShowErrorMessage)
      .toHaveBeenCalledWith('link.fileNotExist');
  });
});
