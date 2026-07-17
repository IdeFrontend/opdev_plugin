import * as path from 'path';
import { t } from 'i18next';
import * as vscode from 'vscode';

import { HtmlTransformer } from '@plugin/class/html-transformer';
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
  ST_TEST_RESULTS_CONNECT_CHANNEL,
  type StTestResultReportDto,
  type StTestResultsWebviewAction,
} from '@shared/st-test-results';

type AllowListedArtifact = {
  outputCsvPath: string;
  runDirectory: string;
};

function normalizeContentLanguage(language: string): 'en' | 'zh-cn' {
  return language.trim()
    .toLowerCase()
    .startsWith('zh')
    ? 'zh-cn'
    : 'en';
}

export class StTestResultsPanel {
  private static currentPanel: StTestResultsPanel | undefined;

  private readonly connector = new WebviewConnector<
    StTestResultReportDto,
    StTestResultsWebviewAction
  >(ST_TEST_RESULTS_CONNECT_CHANNEL);

  private readonly artifactAllowList = new Map<string, AllowListedArtifact>();

  private themeDisposable: vscode.Disposable | undefined;

  private themeMessageDisposable: vscode.Disposable | undefined;

  private panelDisposeDisposable: vscode.Disposable | undefined;

  private initialization: Promise<void> | undefined;

  private disposed = false;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
  ) {
    this.connector.receive((message, sourceWebview) => {
      if (sourceWebview !== this.panel.webview) {
        return;
      }

      void this.handleWebviewAction(message);
    });
    this.connector.addWebview(this.panel.webview);
    this.themeMessageDisposable = this.panel.webview.onDidReceiveMessage((message: unknown) => {
      handleThemeRequest(this.panel.webview, message);
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
    if (this.currentPanel) {
      const instance = this.currentPanel;

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

  public dispose(): void {
    if (!this.disposed) {
      this.panel.dispose();
    }

    this.disposeResources();
  }

  private ensureInitialized(): Promise<void> {
    this.initialization ??= this.initializeHtml();

    return this.initialization;
  }

  private async initializeHtml(): Promise<void> {
    const distPath = path.join(this.context.extensionPath, 'out', 'web');
    const cspSource = this.panel.webview.cspSource;

    this.panel.webview.html = await HtmlTransformer.transformDistHtml(
      distPath,
      this.panel.webview,
      `panels/${VIEW_ST_TEST_RESULTS}`,
      {
        lang: normalizeContentLanguage(vscode.env.language),
        scriptSource: cspSource,
        styleSource: cspSource,
        fontSource: cspSource,
        imageSource: cspSource,
      },
    );
    this.themeDisposable = registerWebviewThemeBridge(this.panel.webview);
  }

  private replaceReport(
    report: StTestResultReportDto,
    artifacts: readonly CompletedStTestArtifact[],
    runDirectory: string,
  ): void {
    this.artifactAllowList.clear();

    artifacts.forEach((artifact) => {
      if (!path.isAbsolute(runDirectory)
        || !isSafeStTestResultFile(artifact.outputCsvPath, runDirectory)) {
        return;
      }

      this.artifactAllowList.set(artifact.artifactId, {
        outputCsvPath: artifact.outputCsvPath,
        runDirectory,
      });
    });
    this.connector.sendLatest(this.panel.webview, report);
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

  private isOpenResultFileAction(message: unknown): message is StTestResultsWebviewAction {
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
    this.connector.removeWebview(this.panel.webview);
    this.themeDisposable?.dispose();
    this.themeMessageDisposable?.dispose();
    this.panelDisposeDisposable?.dispose();
    this.themeDisposable = undefined;
    this.themeMessageDisposable = undefined;
    this.panelDisposeDisposable = undefined;
    this.artifactAllowList.clear();

    if (StTestResultsPanel.currentPanel === this) {
      StTestResultsPanel.currentPanel = undefined;
    }
  }
}
