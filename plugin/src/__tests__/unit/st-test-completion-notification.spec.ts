const mockShowInformationMessage = jest.fn();
const mockShowErrorMessage = jest.fn();
const mockShowQuickPick = jest.fn();
const mockShowTextDocument = jest.fn();
const mockOpenTextDocument = jest.fn();
const mockUriFile = jest.fn((fsPath: string) => ({ fsPath }));
const mockT = jest.fn((key: string, options?: Record<string, unknown>) => {
  switch (key) {
    case 'stTest.completed':
      return `completed:${String(options?.count)}:${String(options?.path)}`;
    case 'stTest.openFile':
      return 'Open File';
    case 'stTest.pickResultFile':
      return 'Select result file';
    case 'stTest.openResultFailed':
      return `open-failed:${String(options?.error)}`;
    default:
      return key;
  }
});

jest.mock('i18next', () => ({ t: mockT }));

jest.mock('vscode', () => ({
  Uri: { file: mockUriFile },
  window: {
    showErrorMessage: mockShowErrorMessage,
    showInformationMessage: mockShowInformationMessage,
    showQuickPick: mockShowQuickPick,
    showTextDocument: mockShowTextDocument,
  },
  workspace: { openTextDocument: mockOpenTextDocument },
}), { virtual: true });

import * as path from 'path';

import {
  resolveStTestDisplayPath,
  showStTestCompletionNotification,
} from '@plugin/helpers/st-test-completion-notification';
import enMessages from '@shared/i18n/en';
import zhCnMessages from '@shared/i18n/zh-cn';

describe('ST test completion notification', () => {
  const workspaceRoot = path.resolve('workspace with spaces');
  const runDirectory = path.join(workspaceRoot, '.vscode', 'st-results', 'add', 'run-id');

  beforeEach(() => {
    jest.clearAllMocks();
    mockShowInformationMessage.mockResolvedValue(undefined);
    mockShowErrorMessage.mockResolvedValue(undefined);
    mockShowQuickPick.mockResolvedValue(undefined);
    mockShowTextDocument.mockResolvedValue(undefined);
    mockOpenTextDocument.mockImplementation(async (uri) => ({ uri }));
    mockUriFile.mockImplementation((fsPath: string) => ({ fsPath }));
  });

  it('shows one in-workspace result as a relative CSV path and opens its exact URI', async () => {
    const outputPath = path.join(runDirectory, 'kernel', '001-add-result.csv');
    const relativeOutputPath = path.relative(workspaceRoot, outputPath);

    mockShowInformationMessage.mockResolvedValue('Open File');

    await showStTestCompletionNotification({
      workspaceRoot,
      outputPaths: [outputPath],
      runDirectory,
    });

    expect(mockShowInformationMessage)
      .toHaveBeenCalledWith(`completed:1:${relativeOutputPath}`, 'Open File');
    expect(mockShowInformationMessage.mock.calls[0][0])
      .not.toContain(workspaceRoot);
    expect(mockShowQuickPick).not.toHaveBeenCalled();
    expect(mockUriFile)
      .toHaveBeenCalledWith(outputPath);
    expect(mockOpenTextDocument)
      .toHaveBeenCalledWith({ fsPath: outputPath });
    expect(mockShowTextDocument)
      .toHaveBeenCalledWith({ uri: { fsPath: outputPath } }, { preview: true });
  });

  it('shows a relative run directory and preserves result order in the multi-file picker', async () => {
    const outputPaths = [
      path.join(runDirectory, 'kernel', '001-add-result.csv'),
      path.join(runDirectory, 'aclnn', '002-add-result.csv'),
    ];

    mockShowInformationMessage.mockResolvedValue('Open File');
    mockShowQuickPick.mockImplementation(async (items) => items[1]);

    await showStTestCompletionNotification({
      workspaceRoot,
      outputPaths,
      runDirectory,
    });

    expect(mockShowInformationMessage)
      .toHaveBeenCalledWith(`completed:2:${path.relative(workspaceRoot, runDirectory)}`, 'Open File');
    expect(mockShowInformationMessage.mock.calls[0][0])
      .not.toContain(workspaceRoot);
    expect(mockShowQuickPick)
      .toHaveBeenCalledWith([
        {
          label: path.relative(workspaceRoot, outputPaths[0]),
          outputPath: outputPaths[0],
        },
        {
          label: path.relative(workspaceRoot, outputPaths[1]),
          outputPath: outputPaths[1],
        },
      ], { placeHolder: 'Select result file' });
    expect(mockUriFile)
      .toHaveBeenCalledWith(outputPaths[1]);
  });

  it('does nothing when the completion notification is dismissed', async () => {
    await showStTestCompletionNotification({
      workspaceRoot,
      outputPaths: [path.join(runDirectory, 'kernel', '001-add-result.csv')],
      runDirectory,
    });

    expect(mockShowQuickPick).not.toHaveBeenCalled();
    expect(mockOpenTextDocument).not.toHaveBeenCalled();
  });

  it('does nothing when the multi-file picker is cancelled', async () => {
    mockShowInformationMessage.mockResolvedValue('Open File');

    await showStTestCompletionNotification({
      workspaceRoot,
      outputPaths: [
        path.join(runDirectory, 'kernel', '001-add-result.csv'),
        path.join(runDirectory, 'kernel', '002-add-result.csv'),
      ],
      runDirectory,
    });

    expect(mockShowQuickPick)
      .toHaveBeenCalledTimes(1);
    expect(mockOpenTextDocument).not.toHaveBeenCalled();
  });

  it('uses an absolute display path instead of traversal for an outside result', async () => {
    const outsidePath = path.resolve(path.dirname(workspaceRoot), 'outside', 'result.csv');

    await showStTestCompletionNotification({
      workspaceRoot,
      outputPaths: [outsidePath],
      runDirectory,
    });

    expect(resolveStTestDisplayPath(workspaceRoot, outsidePath))
      .toBe(outsidePath);
    expect(mockShowInformationMessage)
      .toHaveBeenCalledWith(`completed:1:${outsidePath}`, 'Open File');
  });

  it('reports an open failure separately without converting the completed ST run to failure', async () => {
    const outputPath = path.join(runDirectory, 'kernel', '001-add-result.csv');

    mockShowInformationMessage.mockResolvedValue('Open File');
    mockOpenTextDocument.mockRejectedValue(new Error('result was removed'));

    await expect(showStTestCompletionNotification({
      workspaceRoot,
      outputPaths: [outputPath],
      runDirectory,
    }))
      .resolves.toBeUndefined();

    expect(mockShowErrorMessage)
      .toHaveBeenCalledWith('open-failed:result was removed');
    expect(mockShowTextDocument).not.toHaveBeenCalled();
    expect(mockT.mock.calls.some(([key]) => key === 'stTest.failed'))
      .toBe(false);
  });

  it('defines matching English and Chinese strings for every completion interaction', () => {
    const keys = [
      'stTest.openFile',
      'stTest.pickResultFile',
      'stTest.openResultFailed',
    ] as const;

    keys.forEach((key) => {
      expect(enMessages[key])
        .toBeTruthy();
      expect(zhCnMessages[key])
        .toBeTruthy();
    });
    expect(enMessages['stTest.completed'])
      .toContain('{{count}}');
    expect(enMessages['stTest.completed'])
      .toContain('{{path}}');
    expect(zhCnMessages['stTest.completed'])
      .toContain('{{count}}');
    expect(zhCnMessages['stTest.completed'])
      .toContain('{{path}}');
  });
});
