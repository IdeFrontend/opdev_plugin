export const env = { uriScheme: 'vscode' };

export const workspace = {
  workspaceFolders: undefined as Array<{ uri: { fsPath: string } }> | undefined,
  getConfiguration: jest.fn(() => ({
    inspect: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
  })),
};

export const window = {
  showInformationMessage: jest.fn(),
  showErrorMessage: jest.fn(),
  showWarningMessage: jest.fn(),
};

export const ConfigurationTarget = {
  Global: 1,
  Workspace: 2,
  WorkspaceFolder: 3,
};

export const Uri = {
  file: (fsPath: string) => ({ fsPath }),
};
