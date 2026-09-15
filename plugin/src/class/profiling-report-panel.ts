import * as fs from 'fs';
import * as path from 'path';
import { t } from 'i18next';
import * as vscode from 'vscode';

import { HtmlTransformer } from '@plugin/class/html-transformer';
import {
  CANN_ASSIST_SET_INPUT_TEXT,
  PROFILING_REPORT_PANEL_TYPE,
  VIEW_PROFILING_REPORT,
} from '@plugin/constants';
import {
  handleThemeRequest,
  registerWebviewThemeBridge,
} from '@plugin/core/view/webview-theme';
import { SettingsLoader } from '@plugin/service/settings-loader';

function normalizeContentLanguage(language: string): 'en' | 'zh-cn' {
  return language.trim()
    .toLowerCase()
    .startsWith('zh')
    ? 'zh-cn'
    : 'en';
}

/**
 * 调测专用：当工作区隐藏配置 `op-devtools.profilingReport.cannbotPromptOverride`
 * 有值时，用它替换 payload 中的 prompt；未配置时原样返回。
 * 配置读取失败不影响正常转发（视为未配置）。
 */
function applyCannbotPromptOverride(payload: unknown): unknown {
  const effective = payload ?? {};

  if (!effective || typeof effective !== 'object' || Array.isArray(effective)) {
    return effective;
  }

  let promptOverride: string | undefined;

  try {
    promptOverride = SettingsLoader.getCannbotPromptOverride();
  }
  catch {
    promptOverride = undefined;
  }

  if (promptOverride === undefined) {
    return effective;
  }

  return {
    ...(effective as Record<string, unknown>),
    prompt: promptOverride,
  };
}

export class ProfilingReportPanel {
  private static openedFiles = new Map<string, ProfilingReportPanel>();

  private themeDisposable: vscode.Disposable | undefined;

  private themeMessageDisposable: vscode.Disposable | undefined;

  private panelDisposeDisposable: vscode.Disposable | undefined;

  private disposed = false;

  private webviewReady = false;

  private pendingFilePath: string | undefined;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
  ) {
    this.themeMessageDisposable = this.panel.webview.onDidReceiveMessage((message: unknown) => {
      handleThemeRequest(this.panel.webview, message);

      if (
        message
        && typeof message === 'object'
        && (message as { command?: unknown }).command === 'profilingReportReady'
      ) {
        this.webviewReady = true;

        if (this.pendingFilePath) {
          const filePath = this.pendingFilePath;

          this.pendingFilePath = undefined;
          void this.loadFile(filePath);
        }
      }

      if (
        message
        && typeof message === 'object'
        && (message as { command?: unknown }).command === 'cannbotRequest'
      ) {
        void this.handleCannbotRequest((message as { payload?: unknown }).payload);
      }
    });
    this.panelDisposeDisposable = this.panel.onDidDispose(() => {
      this.dispose();
    });
  }

  public static async createOrShow(
    context: vscode.ExtensionContext,
    filePath: string,
  ): Promise<void> {
    const existing = ProfilingReportPanel.openedFiles.get(filePath);

    if (existing && !existing.disposed) {
      await existing.loadFile(filePath);
      existing.panel.reveal(vscode.ViewColumn.Active);

      return;
    }

    const webRootUri = vscode.Uri.joinPath(context.extensionUri, 'out', 'web');
    const fileDirUri = vscode.Uri.file(path.dirname(filePath));
    const panel = vscode.window.createWebviewPanel(
      PROFILING_REPORT_PANEL_TYPE,
      t('profilingReport.title'),
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          webRootUri,
          fileDirUri,
        ],
      },
    );
    const instance = new ProfilingReportPanel(panel, context);

    try {
      await instance.initializeHtml();
    }
    catch (error) {
      instance.dispose();
      const detail = error instanceof Error ? error.message : String(error);

      await vscode.window.showErrorMessage(t('profilingReport.loadFailed', { error: detail }));

      return;
    }

    ProfilingReportPanel.openedFiles.set(filePath, instance);
    await instance.loadFile(filePath);
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.themeDisposable?.dispose();
    this.themeMessageDisposable?.dispose();
    this.panelDisposeDisposable?.dispose();
    this.themeDisposable = undefined;
    this.themeMessageDisposable = undefined;
    this.panelDisposeDisposable = undefined;
    this.panel.dispose();

    for (const [
      key,
      value,
    ] of ProfilingReportPanel.openedFiles) {
      if (value === this) {
        ProfilingReportPanel.openedFiles.delete(key);
        break;
      }
    }
  }

  private async initializeHtml(): Promise<void> {
    const distPath = path.join(this.context.extensionPath, 'out', 'web');
    const cspSource = this.panel.webview.cspSource;

    this.panel.webview.html = await HtmlTransformer.transformDistHtml(
      distPath,
      this.panel.webview,
      `panels/${VIEW_PROFILING_REPORT}`,
      {
        lang: normalizeContentLanguage(vscode.env.language),
        scriptSource: cspSource,
        styleSource: cspSource,
        fontSource: cspSource,
        imageSource: cspSource,
        connectSource: cspSource,
      },
    );
    this.themeDisposable = registerWebviewThemeBridge(this.panel.webview);
  }

  private async loadFile(filePath: string): Promise<void> {
    if (!fs.existsSync(filePath)) {
      const message = t('profilingReport.fileNotFound', { path: filePath });

      await vscode.window.showErrorMessage(message);
      await this.postLoadFailed(message);

      return;
    }

    if (!this.webviewReady) {
      this.pendingFilePath = filePath;

      return;
    }

    try {
      const fileUri = vscode.Uri.file(filePath);
      const webviewUri = this.panel.webview.asWebviewUri(fileUri);
      const collectedAt = fs.statSync(filePath).mtime.toISOString();

      await this.panel.webview.postMessage({
        command: 'loadProfilingReport',
        uri: webviewUri.toString(),
        fileName: path.basename(filePath),
        filePath,
        collectedAt,
      });
    }
    catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const message = t('profilingReport.loadFailed', { error: detail });

      await vscode.window.showErrorMessage(message);
      await this.postLoadFailed(message);
    }
  }

  /**
   * Forward the payload assembled by the profiling-report webview (section snapshot
   * + prompt) to the cannbot plugin by filling its chat input box.
   * 调测专用隐藏配置 `op-devtools.profilingReport.cannbotPromptOverride` 有值时，
   * payload 中的 prompt 会被替换后再转发。
   */
  private async handleCannbotRequest(payload: unknown): Promise<void> {
    try {
      const inputText = JSON.stringify(applyCannbotPromptOverride(payload), null, 2);

      await vscode.commands.executeCommand(CANN_ASSIST_SET_INPUT_TEXT, inputText, { autoSend: true });
      await vscode.window.showInformationMessage(t('profilingReport.cannbotSent'));
    }
    catch (error) {
      const detail = error instanceof Error ? error.message : String(error);

      await vscode.window.showErrorMessage(t('profilingReport.cannbotFailed', { error: detail }));
    }
  }

  private async postLoadFailed(error: string): Promise<void> {
    if (!this.webviewReady) {
      return;
    }

    await this.panel.webview.postMessage({
      command: 'loadProfilingReportFailed',
      error,
    });
  }
}
