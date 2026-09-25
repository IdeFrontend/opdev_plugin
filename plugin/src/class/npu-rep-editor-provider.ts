import * as vscode from 'vscode';

import { ViewOpener } from '@plugin/core/view/view-opener';

/**
 * Default editor for binary `.npu-rep` / `.npu.rep` reports. Problems and
 * Explorer open this URI as the active editor; instead of showing bytes as
 * text we hand off to the existing profiling-report webview panel.
 */
export class NpuRepEditorProvider implements vscode.CustomReadonlyEditorProvider {
  public static readonly viewType = 'opdevtoolsNpuRepViewer';

  public async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken,
  ): Promise<vscode.CustomDocument> {
    return {
      uri,
      dispose: () => undefined,
    };
  }

  public async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    try {
      await ViewOpener.openProfilingReport(document.uri);
    }
    finally {
      // The custom-editor tab is only a routing shell — the real surface is
      // ProfilingReportPanel. Closing this empty tab avoids a blank editor.
      webviewPanel.dispose();
    }
  }
}
