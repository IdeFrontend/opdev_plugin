export const env = { uriScheme: 'vscode' };

export const workspace = {
  workspaceFolders: [{ uri: { fsPath: '/workspace' } }] as Array<{ uri: { fsPath: string } }> | undefined,
  getConfiguration: jest.fn(() => ({
    inspect: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
  })),
  onDidChangeConfiguration: jest.fn()
    .mockReturnValue({ dispose: jest.fn() }),
};

export const extensions = {
  all: [] as Array<{ id: string;
    packageJSON: unknown }>,
  getExtension: jest.fn(),
};

export const window = {
  activeTextEditor: undefined as
  | { document: { fileName: string;
    uri: { fsPath: string } } }
    | undefined,
  showInformationMessage: jest.fn(),
  showErrorMessage: jest.fn(),
  showWarningMessage: jest.fn()
    .mockResolvedValue(undefined),
  showInputBox: jest.fn()
    .mockResolvedValue(undefined),
};

export const commands = {
  executeCommand: jest.fn()
    .mockResolvedValue(undefined),
};

export const ConfigurationTarget = {
  Global: 1,
  Workspace: 2,
  WorkspaceFolder: 3,
};

export const Uri = { file: (fsPath: string) => ({ fsPath }) };
