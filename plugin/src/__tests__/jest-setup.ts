jest.mock('@plugin/helpers/output-channel', () => ({
  appendLog: jest.fn(),
  getHuaweiOpDevtoolsOutputChannel: jest.fn(() => ({
    appendLine: jest.fn(),
    show: jest.fn(),
    dispose: jest.fn(),
  })),
  getOperatorToolOutputChannel: jest.fn(() => ({
    appendLine: jest.fn(),
    show: jest.fn(),
    clear: jest.fn(),
  })),
  deriveOperatorToolOutputLabel: jest.fn(() => 'tool'),
}));
