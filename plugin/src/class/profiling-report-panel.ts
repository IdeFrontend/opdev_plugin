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

/** cannbot 转发模板首行的内置提示词：默认调用 tool-report-analysis 技能分析报告。 */
const CANNBOT_BUILD_IN_PROMPT = '调用技能 tool-report-analysis 分析下方报告，按其流程与固定框架输出。';

function toText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * 将 payload 中的采集时间（ISO 8601）格式化为 `YYYY-MM-DD HH:mm:ss`（本地时区）。
 * 空值返回空字符串；无法解析时原样返回。
 */
function formatCollectedAt(value: unknown): string {
  const raw = toText(value);

  if (!raw) {
    return raw;
  }

  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) {
    return raw;
  }

  const pad = (part: number) => String(part)
    .padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
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
   * Forward the cannbot request payload to the cannbot plugin by filling its chat
   * input box: payload 字段填入多行模板，首行为内置提示词（buildInPrompt）。
   * 调测专用隐藏配置 `op-devtools.profilingReport.cannbotPromptOverride` 有值时，
   * 内置提示词会被替换后再转发。
   */
  private async handleCannbotRequest(payload: unknown): Promise<void> {
    try {
      const effective = payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload as Record<string, unknown>
        : {};

      let buildInPrompt = CANNBOT_BUILD_IN_PROMPT;

      try {
        buildInPrompt = SettingsLoader.getCannbotPromptOverride() ?? CANNBOT_BUILD_IN_PROMPT;
      }
      catch {
        // 配置读取失败不影响正常转发（视为未配置）
      }

      const inputText = `${buildInPrompt}
报告路径：${toText(effective.report_path)}
报告名称：${toText(effective.report_name)}
报告章节：${toText(effective.scope)}
算子名称：${toText(effective.op_name)}
采集时间：${formatCollectedAt(effective.collected_at)}
`;

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
