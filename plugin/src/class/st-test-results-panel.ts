/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import * as fs from 'fs';
import * as path from 'path';
import { t } from 'i18next';
import * as vscode from 'vscode';

import { HtmlTransformer } from '@plugin/class/html-transformer';
import type { StTestRunHistoryTreeProvider } from '@plugin/class/st-test-run-history-tree-provider';
import {
  ST_TEST_RESULTS_PANEL_TYPE,
  VIEW_ST_TEST_RESULTS,
} from '@plugin/constants';
import { WebviewConnector } from '@plugin/core/connector';
import {
  handleThemeRequest,
  registerWebviewThemeBridge,
} from '@plugin/core/view/webview-theme';
import {
  isSafeStTestResultFile,
  type CompletedStTestArtifact,
} from '@plugin/domain/services/st-test-result-parser';
import {
  buildHistoricalStTestReport,
  createStTestRunHistoryRecord,
  persistStTestRunHistoryRecord,
  type StTestRunHistoryRecord,
  type StTestWorkspaceRunHistoryRecord,
} from '@plugin/domain/services/st-test-run-history';
import {
  ST_TEST_RESULTS_CONNECT_CHANNEL,
  type StTestResultReportDto,
  type StTestResultsPanelDto,
  type StTestResultsWebviewAction,
} from '@shared/st-test-results';

type AllowListedArtifact = {
  outputCsvPath: string;
  runDirectory: string;
};

type StTestHistoryLogger = (message: string)=> void;

function normalizeContentLanguage(language: string): 'en' | 'zh-cn' {
  return language.trim()
    .toLowerCase()
    .startsWith('zh')
    ? 'zh-cn'
    : 'en';
}

function hasMatchingHistoricalSummary(
  report: StTestResultReportDto,
  record: StTestRunHistoryRecord,
): boolean {
  return report.outcome === record.outcome
    && Object.entries(record.summary)
      .every(([
        key,
        value,
      ]) => report.summary[key as keyof typeof report.summary] === value);
}

export class StTestResultsPanel {
  private static currentPanel: StTestResultsPanel | undefined;

  private static historyTreeProvider: Pick<StTestRunHistoryTreeProvider, 'setCurrentRun'> | undefined;

  private readonly connector = new WebviewConnector<
    StTestResultsPanelDto,
    StTestResultsWebviewAction
  >(ST_TEST_RESULTS_CONNECT_CHANNEL);

  private readonly artifactAllowList = new Map<string, AllowListedArtifact>();

  private readonly webview: vscode.Webview;

  private themeDisposable: vscode.Disposable | undefined;

  private themeMessageDisposable: vscode.Disposable | undefined;

  private panelDisposeDisposable: vscode.Disposable | undefined;

  private initialization: Promise<void> | undefined;

  private disposed = false;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
  ) {
    this.webview = panel.webview;
    this.connector.receive((message, sourceWebview) => {
      if (sourceWebview !== this.webview) {
        return;
      }

      void this.handleWebviewAction(message);
    });
    this.connector.addWebview(this.webview);
    this.themeMessageDisposable = this.webview.onDidReceiveMessage((message: unknown) => {
      handleThemeRequest(this.webview, message);
    });
    this.panelDisposeDisposable = this.panel.onDidDispose(() => {
      this.disposeResources();
    });
  }

  public static async createOrShow(
    context: vscode.ExtensionContext,
    report: StTestResultReportDto,
    artifacts: readonly CompletedStTestArtifact[],
    runDirectory: string,
  ): Promise<void> {
    const currentPanel = this.currentPanel;

    if (currentPanel?.disposed) {
      this.currentPanel = undefined;
    }
    else if (currentPanel) {
      const instance = currentPanel;

      instance.replaceReport(report, artifacts, runDirectory);
      instance.panel.reveal(vscode.ViewColumn.Active);

      try {
        await instance.ensureInitialized();
      }
      catch (error) {
        instance.dispose();
        throw error;
      }

      return;
    }

    const webRootUri = vscode.Uri.joinPath(context.extensionUri, 'out', 'web');
    const panel = vscode.window.createWebviewPanel(
      ST_TEST_RESULTS_PANEL_TYPE,
      t('stTest.results.title'),
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [webRootUri],
      },
    );
    const instance = new StTestResultsPanel(panel, context);

    this.currentPanel = instance;
    instance.replaceReport(report, artifacts, runDirectory);

    try {
      await instance.ensureInitialized();
    }
    catch (error) {
      instance.dispose();
      throw error;
    }
  }

  public static setHistoryTreeProvider(provider: Pick<StTestRunHistoryTreeProvider, 'setCurrentRun'> | undefined): void {
    this.historyTreeProvider = provider;
  }

  public static recordCompletedRun(
    report: StTestResultReportDto,
    artifacts: readonly CompletedStTestArtifact[],
    runDirectory: string,
    workspaceRoot: string,
  ): void {
    let currentRecord: StTestRunHistoryRecord;

    try {
      currentRecord = createStTestRunHistoryRecord(report, artifacts, runDirectory);
    }
    catch (error) {
      console.error('[ST test] Could not create run history metadata:', error);

      return;
    }

    try {
      currentRecord = persistStTestRunHistoryRecord(currentRecord);
    }
    catch (error) {
      console.error('[ST test] Could not persist run history:', error);
    }

    try {
      StTestResultsPanel.historyTreeProvider?.setCurrentRun(workspaceRoot, currentRecord);
    }
    catch (error) {
      console.error('[ST test] Could not refresh the native run history:', error);
    }
  }

  public static async createOrShowHistorical(
    context: vscode.ExtensionContext,
    entry: StTestWorkspaceRunHistoryRecord,
    log: StTestHistoryLogger = () => undefined,
  ): Promise<void> {
    const { record } = entry;
    const writeLog = (message: string): void => {
      log(`[ST history] ${message}`);
    };
    const writeArtifactDiagnostics = (): void => {
      for (const artifact of record.artifacts) {
        let pathState = 'missing';
        let size = 'n/a';

        try {
          const stat = fs.lstatSync(artifact.outputCsvPath);

          pathState = stat.isFile()
            ? 'file'
            : stat.isSymbolicLink()
              ? 'symlink'
              : 'other';
          size = String(stat.size);
        }
        catch (error) {
          pathState = `unavailable(${error instanceof Error ? error.message : String(error)})`;
        }

        const artifactLog = `Artifact: id=${artifact.artifactId}, mode=${artifact.mode}, path=${artifact.outputCsvPath}, relativePath=${path.relative(record.runDirectory, artifact.outputCsvPath)}, state=${pathState}, size=${size}, safe=${isSafeStTestResultFile(artifact.outputCsvPath, record.runDirectory)}`;

        writeLog(artifactLog);
      }
    };

    writeLog(`Rebuilding report: workspaceRoot=${entry.workspaceRoot}, runId=${record.runId}, operator=${record.operatorName}`);
    writeLog(`Manifest: runDirectory=${record.runDirectory}, outcome=${record.outcome}, summary=${JSON.stringify(record.summary)}, artifacts=${record.artifacts.length}`);

    let report: StTestResultReportDto;

    try {
      report = buildHistoricalStTestReport(record);
    }
    catch (error) {
      writeArtifactDiagnostics();
      writeLog(`Report rebuild failed: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
      throw error;
    }

    if (!hasMatchingHistoricalSummary(report, record)) {
      const mismatches = Object.entries(record.summary)
        .filter(([
          key,
          value,
        ]) => report.summary[key as keyof typeof report.summary] !== value)
        .map(([
          key,
          value,
        ]) => `${key}:saved=${value},rebuilt=${report.summary[key as keyof typeof report.summary]}`);

      if (report.outcome !== record.outcome) {
        mismatches.unshift(`outcome:saved=${record.outcome},rebuilt=${report.outcome}`);
      }

      writeArtifactDiagnostics();
      writeLog(`Rebuilt report: outcome=${report.outcome}, summary=${JSON.stringify(report.summary)}`);

      for (const file of report.files) {
        writeLog(`Rebuilt artifact: id=${file.artifactId}, rows=${file.rowCount}, error=${file.error ? JSON.stringify(file.error) : 'none'}`);
      }

      writeLog(`Validation failed: ${mismatches.join('; ') || 'unknown mismatch'}`);
      throw new Error('Historical ST evidence no longer matches its manifest');
    }

    writeLog('Validation passed; opening results panel.');

    await this.createOrShow(
      context,
      report,
      record.artifacts,
      record.runDirectory,
    );
    writeLog('Results panel opened successfully.');
  }

  public dispose(): void {
    try {
      if (!this.disposed) {
        this.panel.dispose();
      }
    }
    finally {
      this.disposeResources();
    }
  }

  private ensureInitialized(): Promise<void> {
    this.initialization ??= this.initializeHtml();

    return this.initialization;
  }

  private async initializeHtml(): Promise<void> {
    const distPath = path.join(this.context.extensionPath, 'out', 'web');
    const cspSource = this.webview.cspSource;

    this.webview.html = await HtmlTransformer.transformDistHtml(
      distPath,
      this.webview,
      `panels/${VIEW_ST_TEST_RESULTS}`,
      {
        lang: normalizeContentLanguage(vscode.env.language),
        scriptSource: cspSource,
        styleSource: cspSource,
        fontSource: cspSource,
        imageSource: cspSource,
      },
    );
    this.themeDisposable = registerWebviewThemeBridge(this.webview);
  }

  private replaceReport(
    report: StTestResultReportDto,
    artifacts: readonly CompletedStTestArtifact[],
    runDirectory: string,
  ): void {
    const currentRecord = createStTestRunHistoryRecord(
      report,
      artifacts,
      runDirectory,
    );

    this.activateRun(currentRecord, report);
  }

  private activateRun(
    record: StTestRunHistoryRecord,
    report: StTestResultReportDto,
  ): void {
    this.artifactAllowList.clear();

    record.artifacts.forEach((artifact) => {
      if (!path.isAbsolute(record.runDirectory)
        || !isSafeStTestResultFile(artifact.outputCsvPath, record.runDirectory)) {
        return;
      }

      this.artifactAllowList.set(artifact.artifactId, {
        outputCsvPath: artifact.outputCsvPath,
        runDirectory: record.runDirectory,
      });
    });

    this.connector.sendLatest(this.webview, { report });
  }

  private async handleWebviewAction(message: unknown): Promise<void> {
    if (!this.isOpenResultFileAction(message)) {
      return;
    }

    const artifact = this.artifactAllowList.get(message.artifactId);

    if (!artifact || !isSafeStTestResultFile(artifact.outputCsvPath, artifact.runDirectory)) {
      await vscode.window.showWarningMessage(t('stTest.results.openRejected'));

      return;
    }

    try {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(artifact.outputCsvPath));

      await vscode.window.showTextDocument(document, { preview: true });
    }
    catch (error) {
      const detail = error instanceof Error ? error.message : String(error);

      await vscode.window.showErrorMessage(t('stTest.openResultFailed', { error: detail }));
    }
  }

  private isOpenResultFileAction(message: unknown): message is Extract<StTestResultsWebviewAction, { type: 'openResultFile' }> {
    return message !== null
      && typeof message === 'object'
      && 'type' in message
      && message.type === 'openResultFile'
      && 'artifactId' in message
      && typeof message.artifactId === 'string';
  }

  private disposeResources(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    if (StTestResultsPanel.currentPanel === this) {
      StTestResultsPanel.currentPanel = undefined;
    }

    this.connector.removeWebview(this.webview);
    this.themeDisposable?.dispose();
    this.themeMessageDisposable?.dispose();
    this.panelDisposeDisposable?.dispose();
    this.themeDisposable = undefined;
    this.themeMessageDisposable = undefined;
    this.panelDisposeDisposable = undefined;
    this.artifactAllowList.clear();
  }
}
