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
import { CANNWORK_EXTENSION_ID } from '@plugin/helpers/cannwork-extension-support';
import {
  CANN_ASSIST_SET_INPUT_TEXT,
  COMMAND_SHOW_PERFORMANCE_HINTS,
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

/** cannbot 转发模板首行的内置提示词：默认调用 tool-perf-analysis 技能分析报告。 */
const CANNBOT_BUILD_IN_PROMPT = '调用技能 tool-perf-analysis 分析下方报告，按其流程与固定框架输出。';

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

/**
 * Host-side reactions to panel lifecycle events. The performance-hints
 * diagnostics service uses them to publish/clear hints so the Problems view
 * follows the active tab and the operator selected inside the report.
 */
export interface ProfilingReportPanelHooks {
  /** Panel tab (de)activated; `active` is `panel.active`. */
  onActiveChanged?(active: boolean): void;
  /** Panel closed: hints published for this report must be dropped. */
  onDispose?(): void;
  /** Webview reported its selected operator (multi-op packs); `null` when none. */
  onOperatorChanged?(operatorId: string | null): void;
  /** New hooks replaced this set (panel reopened): drop subscriptions, keep the published hints intact. */
  onHooksReplaced?(): void;
}

export class ProfilingReportPanel {
  private static openedFiles = new Map<string, ProfilingReportPanel>();

  private themeDisposable: vscode.Disposable | undefined;

  private themeMessageDisposable: vscode.Disposable | undefined;

  private panelDisposeDisposable: vscode.Disposable | undefined;

  private viewStateDisposable: vscode.Disposable | undefined;

  private disposed = false;

  private webviewReady = false;

  private pendingFilePath: string | undefined;

  /** Report path the panel is showing; used by the "open in Problems" click handler. */
  private filePath: string | undefined;

  /** Publish-state to forward once the webview becomes ready (posted after the pending load). */
  private pendingPublishedState: boolean | undefined;

  /**
   * Operator the retained webview last reported. Survives hook replacement and
   * tab hide (`retainContextWhenHidden`), so a reopen can republish the same
   * scope even when Vue does not re-fire its selection watch.
   */
  private selectedOperatorId: string | undefined;

  private hooks: ProfilingReportPanelHooks | undefined;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
    hooks?: ProfilingReportPanelHooks,
  ) {
    this.hooks = hooks;
    this.themeMessageDisposable = this.panel.webview.onDidReceiveMessage((message: unknown) => {
      handleThemeRequest(this.panel.webview, message);

      if (!message || typeof message !== 'object') {
        return;
      }

      const command = (message as { command?: unknown }).command;

      if (command === 'profilingReportReady') {
        this.webviewReady = true;

        if (this.pendingFilePath) {
          const filePath = this.pendingFilePath;

          this.pendingFilePath = undefined;
          void this.loadFile(filePath);
        }

        if (this.pendingPublishedState !== undefined) {
          const published = this.pendingPublishedState;

          this.pendingPublishedState = undefined;
          void this.panel.webview.postMessage({
            command: 'performanceHintsPublishedChanged',
            published,
          });
        }

        return;
      }

      if (
        message
        && typeof message === 'object'
        && (message as { command?: unknown }).command === 'cannbotRequest'
      ) {
        void this.handleCannbotRequest((message as { payload?: unknown }).payload);
      }

      if (command === 'profilingReportOperatorChanged') {
        const operatorId = (message as { operatorId?: unknown }).operatorId;

        this.selectedOperatorId = typeof operatorId === 'string' && operatorId ? operatorId : undefined;
        this.hooks?.onOperatorChanged?.(this.selectedOperatorId ?? null);
      }

      if (command === 'showPerformanceHintsInProblems') {
        if (this.filePath) {
          void vscode.commands.executeCommand(COMMAND_SHOW_PERFORMANCE_HINTS, this.filePath);
        }
      }
    });
    this.viewStateDisposable = this.panel.onDidChangeViewState(() => {
      this.hooks?.onActiveChanged?.(this.panel.active);
    });
    this.panelDisposeDisposable = this.panel.onDidDispose(() => {
      this.dispose();
    });
  }

  /**
   * Operator selection retained by an already-open panel for `filePath`, if any.
   * Used to seed hint publishing when the panel is reused without a Vue re-emit.
   */
  public static retainedOperatorId(filePath: string): string | undefined {
    const existing = ProfilingReportPanel.openedFiles.get(filePath);

    return existing && !existing.disposed ? existing.selectedOperatorId : undefined;
  }

  /** True when a live panel is already hosting `filePath`. */
  public static isOpen(filePath: string): boolean {
    const existing = ProfilingReportPanel.openedFiles.get(filePath);

    return !!(existing && !existing.disposed);
  }

  /**
   * Show the report panel of `filePath`, reusing an already open one, and
   * return the instance so the caller can push state into its webview (the
   * performance-hints publish flag). The instance returned after a failed
   * `initializeHtml` is already disposed: calls on it are no-ops.
   */
  public static async createOrShow(
    context: vscode.ExtensionContext,
    filePath: string,
    hooks?: ProfilingReportPanelHooks,
  ): Promise<ProfilingReportPanel> {
    const reused = await ProfilingReportPanel.reuseIfOpen(filePath, hooks);

    if (reused) {
      return reused;
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

    return ProfilingReportPanel.mount(panel, context, filePath, hooks);
  }

  /**
   * Host the report inside an existing webview (custom editor tab). Prefer this
   * for `.npu-rep` so Problems/Explorer open one surface without a dispose-and-
   * reopen flash.
   */
  public static async attachTo(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    filePath: string,
    hooks?: ProfilingReportPanelHooks,
  ): Promise<ProfilingReportPanel> {
    const existing = ProfilingReportPanel.openedFiles.get(filePath);

    if (existing && !existing.disposed) {
      if (existing.panel === panel) {
        return (await ProfilingReportPanel.reuseIfOpen(filePath, hooks))!;
      }

      // Legacy free-floating panel for the same file: drop it and host on the
      // custom-editor shell Problems just opened.
      existing.dispose();
    }

    const webRootUri = vscode.Uri.joinPath(context.extensionUri, 'out', 'web');
    const fileDirUri = vscode.Uri.file(path.dirname(filePath));

    panel.title = t('profilingReport.title');
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        webRootUri,
        fileDirUri,
      ],
    };

    return ProfilingReportPanel.mount(panel, context, filePath, hooks);
  }

  private static async reuseIfOpen(
    filePath: string,
    hooks?: ProfilingReportPanelHooks,
  ): Promise<ProfilingReportPanel | undefined> {
    const existing = ProfilingReportPanel.openedFiles.get(filePath);

    if (!existing || existing.disposed) {
      return undefined;
    }

    if (hooks) {
      existing.hooks?.onHooksReplaced?.();
      existing.hooks = hooks;
    }

    // Already hosting this path: reveal only. Reloading would reset the
    // webview selectedOperatorId to the pack default and republish the wrong
    // Problems scope on multi-op tree/command reopen.
    existing.panel.reveal(vscode.ViewColumn.Active);

    return existing;
  }

  private static async mount(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    filePath: string,
    hooks?: ProfilingReportPanelHooks,
  ): Promise<ProfilingReportPanel> {
    const instance = new ProfilingReportPanel(panel, context, hooks);

    try {
      await instance.initializeHtml();
    }
    catch (error) {
      instance.dispose();
      const detail = error instanceof Error ? error.message : String(error);

      await vscode.window.showErrorMessage(t('profilingReport.loadFailed', { error: detail }));

      return instance;
    }

    ProfilingReportPanel.openedFiles.set(filePath, instance);
    await instance.loadFile(filePath);

    return instance;
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.themeDisposable?.dispose();
    this.themeMessageDisposable?.dispose();
    this.viewStateDisposable?.dispose();
    this.panelDisposeDisposable?.dispose();
    this.themeDisposable = undefined;
    this.themeMessageDisposable = undefined;
    this.viewStateDisposable = undefined;
    this.panelDisposeDisposable = undefined;
    this.hooks?.onDispose?.();
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

  /**
   * Forward the performance-hints publish state to the webview: the indicator
   * is only clickable while hints of this report are actually published in the
   * Problems view. Queued until the webview is ready, dropped after dispose.
   */
  public setPerformanceHintsPublished(published: boolean): void {
    if (this.disposed) {
      return;
    }

    if (!this.webviewReady) {
      this.pendingPublishedState = published;

      return;
    }

    void this.panel.webview.postMessage({
      command: 'performanceHintsPublishedChanged',
      published,
    });
  }

  private async initializeHtml(): Promise<void> {
    const distPath = path.join(this.context.extensionPath, 'out', 'web');
    const cspSource = this.panel.webview.cspSource;
    const devServerUrl = process.env.MSTT_DEV_SERVER_URL?.replace(/\/$/, '');
    // Hot Mode loads scripts/workers from the Vite origin; packaged builds use cspSource only.
    // `blob:` is required because the webview wraps the Sudu worker in a Blob URL —
    // `new Worker(vscode-webview://…)` is unreliable across VS Code webview hosts.
    const scriptSource = devServerUrl ? `${cspSource} ${devServerUrl}` : cspSource;
    const workerSource = `${scriptSource} blob:`;

    this.panel.webview.html = await HtmlTransformer.transformDistHtml(
      distPath,
      this.panel.webview,
      `panels/${VIEW_PROFILING_REPORT}`,
      {
        lang: normalizeContentLanguage(vscode.env.language),
        scriptSource,
        styleSource: cspSource,
        fontSource: cspSource,
        imageSource: cspSource,
        connectSource: scriptSource,
        workerSource,
      },
    );
    this.themeDisposable = registerWebviewThemeBridge(this.panel.webview);
  }

  /**
   * Same-origin Sudu worker URL for Source-tab Ascend C highlighting.
   * Packaged: `out/web/sudu/worker.js` via asWebviewUri. Hot Mode: Vite `/sudu/worker.js`.
   */
  private resolveSuduWorkerUrl(): string {
    const devServerUrl = process.env.MSTT_DEV_SERVER_URL?.replace(/\/$/, '');

    if (devServerUrl) {
      return `${devServerUrl}/sudu/worker.js`;
    }

    const workerUri = vscode.Uri.joinPath(
      this.context.extensionUri,
      'out',
      'web',
      'sudu',
      'worker.js',
    );

    return this.panel.webview.asWebviewUri(workerUri)
      .toString();
  }

  private async loadFile(filePath: string): Promise<void> {
    this.filePath = filePath;

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
        suduWorkerUrl: this.resolveSuduWorkerUrl(),
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

      const isSim = !!this.filePath && this.filePath.includes('npu-emulate');

      const inputText = `${buildInPrompt}
报告路径：${toText(effective.report_path)}
报告名称：${toText(effective.report_name)}
报告章节：${toText(effective.scope)}
算子名称：${toText(effective.op_name)}
采集时间：${formatCollectedAt(effective.collected_at)}
isSim：${isSim}
`;

      // A freshly installed / lazy CANNWork may not be activated yet; without
      // this its commands would not be registered.
      const cannwork = vscode.extensions.getExtension(CANNWORK_EXTENSION_ID);

      if (cannwork && !cannwork.isActive) {
        await cannwork.activate();
      }

      await vscode.commands.executeCommand(CANN_ASSIST_SET_INPUT_TEXT, inputText, { autoSend: true });
      await vscode.window.showInformationMessage(t('profilingReport.cannbotSent'));
    }
    catch (error) {
      const detail = error instanceof Error ? error.message : String(error);

      if (detail.includes(CANN_ASSIST_SET_INPUT_TEXT) && detail.includes('not found')) {
        await vscode.window.showErrorMessage(t('profilingReport.cannbotNotInstalled'));
      }
      else {
        await vscode.window.showErrorMessage(t('profilingReport.cannbotFailed', { error: detail }));
      }
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
