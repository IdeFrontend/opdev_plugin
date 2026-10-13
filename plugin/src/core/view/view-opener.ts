/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { t } from 'i18next';
import * as vscode from 'vscode';

import { InsightDataViewerPanel } from '@plugin/class/insight-data-viewer-panel';
import {
  ProfilingReportPanel, type ProfilingReportPanelHooks,
} from '@plugin/class/profiling-report-panel';
import { NPU_REP_EDITOR_VIEW_TYPE } from '@plugin/constants';
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
   * Open the profiling report panel for .rep/.ncrep/.npu-rep files.
   * For `.npu-rep`, pass `hostPanel` from the custom editor so the report fills
   * that tab; without a host, open via `vscode.openWith` (or reveal if already
   * mounted) so Problems/Explorer share one surface.
   */
  public static async openProfilingReport(
    uri: vscode.Uri,
    hostPanel?: vscode.WebviewPanel,
  ): Promise<void> {
    const filePath = uri.fsPath;
    const context = (
      globalThis as unknown as { extensionContext: vscode.ExtensionContext }
    ).extensionContext;

    if (!filePath) {
      vscode.window.showErrorMessage(t('profilingReport.filePathEmpty'));

      return;
    }

    const isNpuRep = isNpuRepFile(filePath);

    // First open of an npu-rep from command/tree: hand off to the custom editor,
    // which re-enters with `hostPanel`. Skip when already mounted so reopen
    // reveals without relying on resolveCustomEditor being called again.
    if (isNpuRep && !hostPanel && !ProfilingReportPanel.isOpen(filePath)) {
      await vscode.commands.executeCommand('vscode.openWith', uri, NPU_REP_EDITOR_VIEW_TYPE);

      return;
    }

    // Reusing a retained panel must keep the webview's operator: hooks are
    // rebuilt from scratch, and Vue will not re-emit an unchanged selection.
    const retainedOperatorId = isNpuRep
      ? ProfilingReportPanel.retainedOperatorId(filePath)
      : undefined;

    let panel: ProfilingReportPanel | undefined;
    const hooks = ViewOpener.profilingReportHooks(
      filePath,
      isNpuRep,
      (published) => {
        panel?.setPerformanceHintsPublished(published);
      },
      retainedOperatorId,
    );

    try {
      panel = hostPanel
        ? await ProfilingReportPanel.attachTo(hostPanel, context, filePath, hooks)
        : await ProfilingReportPanel.createOrShow(context, filePath, hooks);
    }
    catch (error) {
      hooks.onDispose?.();
      vscode.window.showErrorMessage(t('profilingReport.loadFailed', { error: String(error) }));

      return;
    }

    if (isNpuRep) {
      const published = await ViewOpener.publishPerformanceHints(filePath, retainedOperatorId);

      if (published !== undefined) {
        panel.setPerformanceHintsPublished(published);
      }
    }
  }

  /**
   * Hints follow the active profiling tab: a `.npu-rep` panel publishes its own
   * hints while active (re-publishing on operator changes) and drops exactly
   * those hints when it is hidden or disposed; any other report type clears the
   * collection so hints never outlive the tab they came from. Each publish
   * reports back through `onPublishedState` so the panel can flag whether its
   * hints are currently visible in Problems: superseded publishes are ignored
   * (a newer publish owns the collection), and any clear — even one triggered
   * by another report — switches the flag off.
   */
  private static profilingReportHooks(
    filePath: string,
    isNpuRep: boolean,
    onPublishedState: (published: boolean)=> void,
    initialOperatorId?: string,
  ): ProfilingReportPanelHooks {
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
     * scope instead of falling back to the report's default operator. Seeded
     * from the retained panel when hooks are replaced on reopen.
     */
    let selectedOperatorId: string | undefined = initialOperatorId;

    const clearSubscription = performanceHintsDiagnosticsService.onDidClear(() => {
      onPublishedState(false);
    });

    return {
      onActiveChanged: (active) => {
        if (active) {
          void ViewOpener.publishPerformanceHints(filePath, selectedOperatorId)
            .then((published) => {
              if (published !== undefined) {
                onPublishedState(published);
              }
            });

          return;
        }

        performanceHintsDiagnosticsService.clearIfOwns(filePath);
        onPublishedState(false);
      },
      onDispose: () => {
        clearSubscription.dispose();
        performanceHintsDiagnosticsService.clearIfOwns(filePath);
        onPublishedState(false);
      },
      onOperatorChanged: (operatorId) => {
        selectedOperatorId = operatorId ?? undefined;
        void ViewOpener.publishPerformanceHints(filePath, selectedOperatorId)
          .then((published) => {
            if (published !== undefined) {
              onPublishedState(published);
            }
          });
      },
      onHooksReplaced: () => {
        clearSubscription.dispose();
      },
    };
  }

  /**
   * Hint publishing is auxiliary: a failure must never break panel opening or
   * tab switching. `undefined` means the publish was superseded mid-flight by a
   * newer publish/clear, so the caller must leave the published flag alone.
   */
  private static async publishPerformanceHints(filePath: string, operatorId?: string): Promise<boolean | undefined> {
    try {
      const result = await performanceHintsDiagnosticsService.publishFromFile(filePath, { operatorId });

      if (result.stale) {
        return undefined;
      }

      return result.published > 0;
    }
    catch (error) {
      void vscode.window.showWarningMessage(t('performanceHints.publishFailed', {
        file: filePath,
        error: String(error),
      }));

      return false;
    }
  }
}
