import { t } from 'i18next';
import * as vscode from 'vscode';

import { InsightDataViewerPanel } from '@plugin/class/insight-data-viewer-panel';
import {
  ProfilingReportPanel, type ProfilingReportPanelHooks,
} from '@plugin/class/profiling-report-panel';
import {
  isNpuRepFile, performanceHintsDiagnosticsService,
} from '@plugin/service/performance-hints-diagnostics.service';
import { CSV_VIEWER_VIEW_TYPE } from '@shared/flavor';

// Track opened CSV file directories
const openedCsvDirectories = new Map<string, vscode.Uri>();

export class ViewOpener {
  /**
   * Open csv table preview
   * @param uri csv file uri
   */
  public static async openCsvPreview(uri: vscode.Uri): Promise<void> {
    const targetDir = vscode.Uri.joinPath(
      uri,
      '../',
    ).fsPath.toLocaleLowerCase(); // Use lowercase for comparisons to avoid path case issues

    // Check if a file in the same directory is already open
    const existingUri = openedCsvDirectories.get(targetDir);

    // Open the new file first (using a custom editor) so the new file appears immediately
    // Use the openWith command, VSCode will automatically handle it and will not flash the source file.
    await vscode.commands.executeCommand('vscode.openWith', uri, CSV_VIEWER_VIEW_TYPE);

    // If different files in the same directory are open, close the old file after the new file is opened
    // This way the new file is already displayed and the source file will not flash when closing the old file.
    if (existingUri && existingUri.fsPath !== uri.fsPath) {
      // Wait for the new file to fully open
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Try closing the old file
      // Check the currently open text editor, find the old file and close it

      for (const editor of vscode.window.visibleTextEditors) {
        if (editor.document.uri.fsPath === existingUri.fsPath) {
          // Switch to the old file and close it (the new file is already open and displayed at this point, so it won't flash)
          await vscode.window.showTextDocument(editor.document, { preview: false });
          await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
          break;
        }
      }
    }

    // Record opened directories
    openedCsvDirectories.set(targetDir, uri);
  }

  /**
   * Open the insight performance analysis graph
   * @param uri bin file uri
   */
  public static async openInsight(uri: vscode.Uri): Promise<void> {
    // Get BIN file path from message
    const binPath = uri.fsPath;
    const context = (
      globalThis as unknown as { extensionContext: vscode.ExtensionContext }
    ).extensionContext;

    if (!binPath) {
      vscode.window.showErrorMessage(t('view.binPathEmpty'));

      return;
    }

    try {
      InsightDataViewerPanel.createOrShow(context, binPath);
    }
    catch (error) {
      vscode.window.showErrorMessage(t('view.loadDataFileFailed', { error: String(error) }));
    }
  }

  /**
   * Open the profiling report panel for .rep/.ncrep/.npu-rep files
   * @param uri rep/ncrep/npu-rep file uri
   */
  public static async openProfilingReport(uri: vscode.Uri): Promise<void> {
    const filePath = uri.fsPath;
    const context = (
      globalThis as unknown as { extensionContext: vscode.ExtensionContext }
    ).extensionContext;

    if (!filePath) {
      vscode.window.showErrorMessage(t('profilingReport.filePathEmpty'));

      return;
    }

    const isNpuRep = isNpuRepFile(filePath);

    try {
      await ProfilingReportPanel.createOrShow(context, filePath, ViewOpener.profilingReportHooks(filePath, isNpuRep));
    }
    catch (error) {
      vscode.window.showErrorMessage(t('profilingReport.loadFailed', { error: String(error) }));

      return;
    }

    if (isNpuRep) {
      await ViewOpener.publishPerformanceHints(filePath);
    }
  }

  /**
   * Hints follow the active profiling tab: a `.npu-rep` panel publishes its own
   * hints while active (re-publishing on operator changes) and drops exactly
   * those hints when it is hidden or disposed; any other report type clears the
   * collection so hints never outlive the tab they came from.
   */
  private static profilingReportHooks(filePath: string, isNpuRep: boolean): ProfilingReportPanelHooks {
    if (!isNpuRep) {
      return {
        onActiveChanged: (active) => {
          if (active) {
            performanceHintsDiagnosticsService.clear();
          }
        },
      };
    }

    /**
     * Operator the webview last reported. The panel keeps the webview alive
     * while the tab is hidden, so re-activating it must republish the very same
     * scope instead of falling back to the report's default operator.
     */
    let selectedOperatorId: string | undefined;

    return {
      onActiveChanged: (active) => {
        if (active) {
          void ViewOpener.publishPerformanceHints(filePath, selectedOperatorId);

          return;
        }

        performanceHintsDiagnosticsService.clearIfOwns(filePath);
      },
      onDispose: () => {
        performanceHintsDiagnosticsService.clearIfOwns(filePath);
      },
      onOperatorChanged: (operatorId) => {
        selectedOperatorId = operatorId ?? undefined;
        void ViewOpener.publishPerformanceHints(filePath, selectedOperatorId);
      },
    };
  }

  /** Hint publishing is auxiliary: a failure must never break panel opening or tab switching. */
  private static async publishPerformanceHints(filePath: string, operatorId?: string): Promise<void> {
    try {
      await performanceHintsDiagnosticsService.publishFromFile(filePath, { operatorId });
    }
    catch (error) {
      void vscode.window.showWarningMessage(t('performanceHints.publishFailed', {
        file: filePath,
        error: String(error),
      }));
    }
  }
}
