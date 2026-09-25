jest.mock('vscode', () => ({
  Uri: {
    file: (fsPath: string) => ({
      fsPath,
      toString: () => `file://${fsPath}`,
    }),
  },
}));

jest.mock('@plugin/core/view/view-opener', () => ({ ViewOpener: { openProfilingReport: jest.fn(async () => undefined) } }));

import * as vscode from 'vscode';

import { NpuRepEditorProvider } from '@plugin/class/npu-rep-editor-provider';
import { ViewOpener } from '@plugin/core/view/view-opener';

describe('NpuRepEditorProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exposes the package.json custom editor view type', () => {
    expect(NpuRepEditorProvider.viewType)
      .toBe('opdevtoolsNpuRepViewer');
  });

  it('opens the profiling report panel then disposes the routing tab', async () => {
    const provider = new NpuRepEditorProvider();
    const uri = vscode.Uri.file('/tmp/gelu.npu-rep');
    const document = await provider.openCustomDocument(
      uri,
      {} as vscode.CustomDocumentOpenContext,
      {} as vscode.CancellationToken,
    );
    const dispose = jest.fn();
    const webviewPanel = { dispose } as unknown as vscode.WebviewPanel;

    await provider.resolveCustomEditor(
      document,
      webviewPanel,
      {} as vscode.CancellationToken,
    );

    expect(ViewOpener.openProfilingReport)
      .toHaveBeenCalledWith(uri);
    expect(dispose)
      .toHaveBeenCalledTimes(1);
  });

  it('still disposes the routing tab when opening the panel fails', async () => {
    const provider = new NpuRepEditorProvider();
    const uri = vscode.Uri.file('/tmp/broken.npu-rep');
    const document = await provider.openCustomDocument(
      uri,
      {} as vscode.CustomDocumentOpenContext,
      {} as vscode.CancellationToken,
    );
    const dispose = jest.fn();
    const webviewPanel = { dispose } as unknown as vscode.WebviewPanel;
    const openProfilingReport = ViewOpener.openProfilingReport as jest.Mock;

    openProfilingReport.mockRejectedValueOnce(new Error('panel failed'));

    await expect(provider.resolveCustomEditor(
      document,
      webviewPanel,
      {} as vscode.CancellationToken,
    ))
      .rejects
      .toThrow('panel failed');

    expect(dispose)
      .toHaveBeenCalledTimes(1);
  });
});
