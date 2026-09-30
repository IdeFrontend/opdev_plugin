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
import { INSIGHT_DATA_VIEWER_PANEL_TYPE } from '@shared/flavor';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as net from 'net';
import {
  spawn, ChildProcess,
} from 'child_process';
import AdmZip from 'adm-zip';
import { NodeWebviewSocketBridge } from './node-webview-socket-bridge';
import webviewMessageList from './webview-message-list';
import { EnvironmentVariableReader } from './environment-variable-reader';
import {
  handleThemeRequest,
  postCurrentTheme,
  registerWebviewThemeBridge,
} from '../core/view/webview-theme';
import { insightService } from '../service/insight-service';

type CachedHtmlEntry = {
  html: string;
  sizeBytes: number;
};

type PluginHtmlDescriptor = {
  model: string;
  path?: string;
  iframeName?: string;
};

type LoadedIframeContent = {
  pluginName: string;
  content: string;
  filePath: string;
};

export class InsightDataViewerPanel implements vscode.Disposable {
  private static openedFiles = new Map<string, InsightDataViewerPanel>();
  private static readonly serverPortRangeStart = 9000;
  private static readonly serverPortRangeEnd = 9999;
  private static readonly htmlCacheBudgetBytes = 128 * 1024 * 1024;
  private static htmlCacheSizeBytes = 0;
  private static htmlCache = new Map<string, CachedHtmlEntry>();
  private static readonly debugLoggingEnabled =
    EnvironmentVariableReader.getEnv('INSIGHT_THEME_DEBUG') === '1';
  private static readonly pluginHtmlDescriptors: PluginHtmlDescriptor[] = [
    {
      model: 'Cluster',
      path: 'communication.html',
      iframeName: 'Communication',
    },
    {
      model: 'Cluster',
      path: 'summary.html',
      iframeName: 'Summary',
    },
    {
      model: 'Compute',
      path: 'cache.html',
      iframeName: 'CacheFrame',
    },
    {
      model: 'Compute',
      path: 'detail.html',
      iframeName: 'Details',
    },
    {
      model: 'Compute',
      path: 'source.html',
      iframeName: 'Source',
    },
    {
      model: 'Compute',
      path: 'index.html',
      iframeName: 'Compute',
    },
    {
      model: 'Leaks',
      iframeName: 'leaks',
    },
    { model: 'Memory' },
    { model: 'Operator' },
    { model: 'RL' },
    { model: 'Statistic' },
    { model: 'Timeline' },
  ];
  private readonly panel: vscode.WebviewPanel;
  private readonly context: vscode.ExtensionContext;
  private socketBridge: NodeWebviewSocketBridge | undefined;
  private readonly binPath: string;
  private profilerServerProcess: ChildProcess | null = null;
  private serverPort: number | null = null;
  private readonly serverPath: string = '';
  private readonly serverDir: string = '';
  private readonly zipDir: string = '';
  private readonly insightPluginBasePath: string;
  private readonly serverPortReady!: Promise<void>;
  private resolveServerPortReady: ()=> void = () => {};
  private isDisposed = false;
  private initializationPromise: Promise<void> | null = null;
  private themeBridgeDisposable: vscode.Disposable | undefined;

  constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    binPath: string,
    insightPluginBasePath?: string,
  ) {
    this.panel = panel;
    this.context = context;
    this.binPath = binPath;
    // Get the path from environment variables (preferably from process.env, if failed, read from .arts/.env file)
    this.insightPluginBasePath = insightPluginBasePath || this.getInsightPluginBasePath();

    this.serverDir = path.join(this.insightPluginBasePath, 'server');
    this.serverPath = path.join(this.serverDir, 'profiler_server');
    this.zipDir = path.join(this.insightPluginBasePath, 'zip');
    this.serverPortReady = new Promise((resolve) => {
      this.resolveServerPortReady = resolve;
    });
    this.initializationPromise = this.initializePanel()
      .catch((error) => {
        console.error('[InsightDataViewerPanel] Failed to initialize panel:', error);
        this.resolveServerPortReady();
        this.notifyWebviewLoadFailed();
      });

    this.themeBridgeDisposable = registerWebviewThemeBridge(this.panel.webview);
    context.subscriptions.push(this.themeBridgeDisposable);

    // Listen for panel closing events
    this.panel.onDidDispose(() => this.dispose(), null, context.subscriptions);

    // Listen to webview messages
    this.panel.webview.onDidReceiveMessage(
      (message: any) => {
        this.handleWebviewMessage(message);
      },
      null,
      context.subscriptions,
    );
  }

  private getInsightPluginBasePath(): string {
    const insightPath = insightService.resolveInsightPath(this.context);

    console.log(`[InsightDataViewerPanel] Got insight path: ${insightPath}`);

    return insightPath;
  }

  /**
   * Create or display a panel
   */
  public static createOrShow(
    context: vscode.ExtensionContext,
    binPath: string,
  ): void {
    const insightPluginBasePath = insightService.resolveInsightPath(context);

    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If the panel already exists, display it directly
    if (InsightDataViewerPanel.openedFiles.has(binPath)) {
      InsightDataViewerPanel.openedFiles.get(binPath)?.panel.reveal(column);

      return;
    }

    // Create new panel
    const panel = vscode.window.createWebviewPanel(
      INSIGHT_DATA_VIEWER_PANEL_TYPE,
      t('insight.performanceAnalysis'),
      column || vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    InsightDataViewerPanel.openedFiles.set(
      binPath,
      new InsightDataViewerPanel(panel, context, binPath, insightPluginBasePath),
    );
  }

  private static takeCachedHtml(key: string): string | null {
    const entry = InsightDataViewerPanel.htmlCache.get(key);

    if (!entry) {
      return null;
    }

    InsightDataViewerPanel.htmlCache.delete(key);
    InsightDataViewerPanel.htmlCache.set(key, entry);

    return entry.html;
  }

  private static setCachedHtml(key: string, html: string): void {
    const sizeBytes = Buffer.byteLength(html, 'utf8');

    if (sizeBytes > InsightDataViewerPanel.htmlCacheBudgetBytes) {
      return;
    }

    const existing = InsightDataViewerPanel.htmlCache.get(key);

    if (existing) {
      InsightDataViewerPanel.htmlCacheSizeBytes -= existing.sizeBytes;
      InsightDataViewerPanel.htmlCache.delete(key);
    }

    InsightDataViewerPanel.htmlCache.set(key, {
      html,
      sizeBytes,
    });
    InsightDataViewerPanel.htmlCacheSizeBytes += sizeBytes;

    while (InsightDataViewerPanel.htmlCacheSizeBytes > InsightDataViewerPanel.htmlCacheBudgetBytes) {
      const firstEntry = InsightDataViewerPanel.htmlCache.entries()
        .next();

      if (firstEntry.done) {
        break;
      }

      const [
        cacheKey,
        cacheEntry,
      ] = firstEntry.value;

      InsightDataViewerPanel.htmlCache.delete(cacheKey);
      InsightDataViewerPanel.htmlCacheSizeBytes -= cacheEntry.sizeBytes;
    }
  }

  private logDebug(...args: unknown[]): void {
    if (!InsightDataViewerPanel.debugLoggingEnabled) {
      return;
    }

    console.log('[InsightDataViewerPanel]', ...args);
  }

  private async initializePanel(): Promise<void> {
    if (this.insightPluginBasePath === '') {
      this.resolveServerPortReady();

      return;
    }

    await this.setupWebview();

    this.logDebug('Panel created, waiting for service port before loading all iframe content...');
    const startupSucceeded = await this.startProfilerServer(this.resolveServerPortReady)
      .catch((error) => {
        console.error('[InsightDataViewerPanel] Failed to start profiler_server:', error);
        this.resolveServerPortReady();

        return false;
      });

    if (!startupSucceeded && os.platform() !== 'win32') {
      this.logDebug('Skipping iframe pre-load because profiler_server startup failed');

      // Dismiss the loading overlay so it never traps the user behind a frozen
      // screen when the server fails to start (issue GC-23).
      this.notifyWebviewLoadFailed();

      return;
    }

    await this.loadAndSendAllIframes();
  }

  /**
   * Tell the webview to dismiss the loading overlay immediately when an
   * initialization step fails, rather than waiting out the overlay's
   * client-side fail-safe timeout (issue GC-23).
   */
  private notifyWebviewLoadFailed(): void {
    if (this.isDisposed) {
      return;
    }

    this.panel.webview.postMessage({ command: 'insightLoadFailed' });
  }

  private async readInjectedHtmlFile(
    htmlPath: string,
    allowMissing = false,
    includeLoadingOverlay = false,
  ): Promise<string | null> {
    try {
      const stat = await fs.promises.stat(htmlPath);
      const cacheKey = `${path.resolve(htmlPath)}:${stat.size}:${stat.mtimeMs}:${includeLoadingOverlay ? 'loader' : 'plain'}`;
      const cachedHtml = InsightDataViewerPanel.takeCachedHtml(cacheKey);

      if (cachedHtml !== null) {
        return cachedHtml;
      }

      const rawHtml = await fs.promises.readFile(htmlPath, 'utf8');
      const injectedHtml = this.injectThemeOverrides(rawHtml, includeLoadingOverlay);

      InsightDataViewerPanel.setCachedHtml(cacheKey, injectedHtml);

      return injectedHtml;
    }
    catch (error: any) {
      if (allowMissing && error?.code === 'ENOENT') {
        return null;
      }

      throw error;
    }
  }

  /**
   * Set webview content
   */
  private async setupWebview(): Promise<void> {
    const htmlPath = path.join(this.insightPluginBasePath, 'index.html');
    const htmlContent = (await this.readInjectedHtmlFile(htmlPath, true, true))
      || this.injectThemeOverrides(this.getDefaultHtml(), true);

    this.panel.webview.html = htmlContent;

    // Handle WebSocket bridging using NodeWebviewSocketBridge
    this.logDebug('Initializing NodeWebviewSocketBridge');
    this.socketBridge = new NodeWebviewSocketBridge(this.panel.webview);
    this.logDebug('NodeWebviewSocketBridge initialization completed');
  }

  /**
   * Inject runtime overrides that map --mi-* and --ant-* CSS variables to current
   * VS Code theme values. The third-party HTML file on disk is not modified.
   */
  private injectThemeOverrides(html: string, includeLoadingOverlay = false): string {
    const htmlWithTranslationAliases = this.addInsightTranslationAliases(html);
    const overrideStyle = `
<style id="vscode-theme-overrides">
  html,
  body,
  #app {
    background: var(--vscode-editor-background) !important;
    color: var(--vscode-editor-foreground) !important;
    color-scheme: light dark;
    font-family: var(--vscode-font-family) !important;
  }

  body {
    padding: 0 !important;
    scrollbar-color: var(--vscode-scrollbarSlider-background) var(--vscode-editor-background);
  }

  ::selection {
    background: var(--vscode-editor-selectionBackground);
  }

  a {
    color: var(--vscode-textLink-foreground) !important;
  }

  #root,
  #app,
  .mi-page,
  .container-box,
  .container-body,
  .ant-layout,
  .ant-layout-content,
  .ant-tabs,
  .ant-tabs-content,
  .ant-tabs-content-holder {
    background-color: var(--vscode-editor-background) !important;
    color: var(--vscode-editor-foreground) !important;
  }

  header,
  nav,
  #root > div:first-child,
  .ant-layout-header,
  .ant-tabs-nav,
  .ant-tabs-tab,
  .ant-menu,
  .ant-menu-submenu-popup {
    background-color: var(--vscode-editorWidget-background) !important;
    border-color: var(--vscode-widget-border, var(--vscode-editorWidget-border)) !important;
    color: var(--vscode-editor-foreground) !important;
  }

  .ant-tabs-tab-active,
  .ant-tabs-tab:hover,
  .ant-menu-item-selected,
  .ant-menu-item-active {
    color: var(--vscode-textLink-foreground) !important;
  }

  .hit-label > span,
  .theme_dark .hit-label > span,
  .theme_light .hit-label > span {
    color: var(--vscode-editor-foreground, var(--mi-text-color)) !important;
  }

  .bottomC,
  .topC,
  .splitLine,
  .dragContainer,
  .bottomC::before,
  .bottomC::after,
  .topC::before,
  .topC::after,
  .splitLine::before,
  .splitLine::after,
  .dragContainer::before,
  .dragContainer::after {
    border-color: var(--mi-divider-color, var(--vscode-contrastBorder, var(--vscode-panel-border, var(--vscode-widget-border, var(--vscode-editorWidget-border))))) !important;
    border-top-color: var(--mi-divider-color, var(--vscode-contrastBorder, var(--vscode-panel-border, var(--vscode-widget-border, var(--vscode-editorWidget-border))))) !important;
    border-right-color: var(--mi-divider-color, var(--vscode-contrastBorder, var(--vscode-panel-border, var(--vscode-widget-border, var(--vscode-editorWidget-border))))) !important;
    border-bottom-color: var(--mi-divider-color, var(--vscode-contrastBorder, var(--vscode-panel-border, var(--vscode-widget-border, var(--vscode-editorWidget-border))))) !important;
    border-left-color: var(--mi-divider-color, var(--vscode-contrastBorder, var(--vscode-panel-border, var(--vscode-widget-border, var(--vscode-editorWidget-border))))) !important;
  }

  iframe {
    background-color: var(--vscode-editor-background) !important;
  }

  input,
  textarea,
  select,
  .ant-input,
  .ant-input-affix-wrapper,
  .ant-select-selector,
  .ant-picker,
  .ant-input-number,
  .ant-table-filter-dropdown,
  .ant-tree,
  .ant-table,
  .ant-table-container,
  .ant-modal-content,
  .ant-drawer-content,
  .ant-dropdown-menu,
  .ant-popover-inner,
  .ant-tooltip-inner {
    background-color: var(--vscode-input-background, var(--vscode-editorWidget-background)) !important;
    border-color: var(--vscode-widget-border, var(--vscode-editorWidget-border)) !important;
    color: var(--vscode-input-foreground, var(--vscode-editor-foreground)) !important;
  }

  .ant-input-affix-wrapper:hover,
  .ant-input-affix-wrapper-focused,
  .ant-input-affix-wrapper:focus,
  .ant-input-affix-wrapper:focus-within {
    background-color: var(--vscode-input-background, var(--vscode-editorWidget-background)) !important;
    border-color: var(--vscode-focusBorder, var(--vscode-widget-border, var(--vscode-editorWidget-border))) !important;
    color: var(--vscode-input-foreground, var(--vscode-editor-foreground)) !important;
    box-shadow: 0 0 0 1px var(--vscode-focusBorder, transparent) !important;
  }

  .ant-input-affix-wrapper > input.ant-input,
  .ant-input-affix-wrapper .ant-input {
    background: transparent !important;
    color: var(--vscode-input-foreground, var(--vscode-editor-foreground)) !important;
  }

  .ant-input::placeholder,
  .ant-input-affix-wrapper input::placeholder {
    color: var(--vscode-input-placeholderForeground, var(--vscode-descriptionForeground)) !important;
  }

  .ant-input-affix-wrapper .ant-input-prefix,
  .ant-input-affix-wrapper .ant-input-suffix {
    color: var(--vscode-descriptionForeground, var(--vscode-editor-foreground)) !important;
  }

  .ant-btn-primary {
    background-color: var(--vscode-button-background) !important;
    border-color: var(--vscode-button-background) !important;
    color: var(--vscode-button-foreground) !important;
  }

  .ant-btn-primary:hover,
  .ant-btn-primary:focus {
    background-color: var(--vscode-button-hoverBackground) !important;
    border-color: var(--vscode-button-hoverBackground) !important;
  }

  .switch-theme,
  .ant-switch.switch-theme,
  button.switch-theme {
    display: none !important;
    pointer-events: none !important;
    visibility: hidden !important;
  }
</style>`;
    const overrideScript = `
<script id="vscode-theme-overrides-script">
(function () {
  if (window.__vscodeInsightThemeOverridesInstalled) {
    return;
  }
  window.__vscodeInsightThemeOverridesInstalled = true;

  var debugThemeRuntime = false;
  try {
    debugThemeRuntime = Boolean(window.__INSIGHT_THEME_DEBUG__);
  }
  catch (error) {
    debugThemeRuntime = false;
  }

  function debugLog() {
    if (!debugThemeRuntime || typeof console === 'undefined' || typeof console.debug !== 'function') {
      return;
    }

    console.debug.apply(console, arguments);
  }

  var lastThemeMessage = null;
  var themeGeneration = 0;
  var inheritedVscodeVars = {};
  var inheritedInsightVars = null;
  var lastAppliedVarsSignature = '';
  var lastPatchedVarsSignature = '';
  var styleSheetsDirty = true;
  var fullStyleSheetsDirty = true;
  var dirtyStyleSheets = typeof WeakSet === 'function' ? new WeakSet() : null;
  var dirtyStyleSheetList = [];
  var cachedReplacementSignature = '';
  var cachedReplacements = null;
  var cachedReplacementMatcherSignature = '';
  var cachedReplacementMatcher = null;
  var cachedThemeMessageSignature = '';
  var cachedThemeMessage = null;
  var hasAppliedThemeMessage = false;
  var themeTargetsDirty = true;
  var patchedCssDeclarationValues = typeof WeakMap === 'function' ? new WeakMap() : null;
  var cachedRootStyles = null;
  var cachedBodyStyles = null;
  var scheduledGeneration = 0;
  var scheduledPatchStyleSheets = false;
  var scheduledForwardToIframes = false;
  var flushRafId = 0;
  var cssPatchedProperties = [
    'background',
    'background-color',
    'border',
    'border-top',
    'border-right',
    'border-bottom',
    'border-left',
    'border-color',
    'border-top-color',
    'border-right-color',
    'border-bottom-color',
    'border-left-color',
    'box-shadow',
    'caret-color',
    'color',
    'fill',
    'outline',
    'outline-color',
    'stroke',
    'text-decoration-color',
    'text-shadow'
  ];
  var cssPatchedPropertySet = cssPatchedProperties.reduce(function (set, property) {
    set[property] = true;
    return set;
  }, {});
  var colorTokenHintRegex = /#|rgb\\(/i;
  var vscodeThemeVarNames = [
    '--vscode-font-family',
    '--vscode-font-size',
    '--vscode-bodyFontSize-small',
    '--vscode-bodyFontSize-xSmall',
    '--vscode-editor-background',
    '--vscode-editor-foreground',
    '--vscode-foreground',
    '--vscode-descriptionForeground',
    '--vscode-disabledForeground',
    '--vscode-input-placeholderForeground',
    '--vscode-editorWidget-background',
    '--vscode-editorWidget-border',
    '--vscode-panel-border',
    '--vscode-sideBar-background',
    '--vscode-input-background',
    '--vscode-input-foreground',
    '--vscode-dropdown-background',
    '--vscode-contrastBorder',
    '--vscode-widget-border',
    '--vscode-widget-shadow',
    '--vscode-focusBorder',
    '--vscode-textLink-foreground',
    '--vscode-textLink-activeForeground',
    '--vscode-button-background',
    '--vscode-button-hoverBackground',
    '--vscode-button-foreground',
    '--vscode-editor-selectionBackground',
    '--vscode-scrollbarSlider-background',
    '--vscode-testing-iconPassed',
    '--vscode-charts-green',
    '--vscode-editorWarning-foreground',
    '--vscode-problemsWarningIcon-foreground',
    '--vscode-editorError-foreground',
    '--vscode-errorForeground',
    '--vscode-editorInfo-foreground',
    '--vscode-problemsInfoIcon-foreground'
  ];

  function stylesFor(element) {
    return element ? window.getComputedStyle(element) : null;
  }

  function refreshStyleSnapshots() {
    cachedRootStyles = stylesFor(document.documentElement);
    cachedBodyStyles = document.body ? stylesFor(document.body) : null;
  }

  function readLocalVar(name, fallback) {
    if (!cachedRootStyles && !cachedBodyStyles) {
      refreshStyleSnapshots();
    }

    var rootValue = cachedRootStyles;
    var bodyValue = cachedBodyStyles;
    var value = rootValue ? rootValue.getPropertyValue(name).trim() : '';

    if (!value && bodyValue) {
      value = bodyValue.getPropertyValue(name).trim();
    }

    return value || fallback;
  }

  function readVar(name, fallback) {
    return readLocalVar(name, '') || inheritedVscodeVars[name] || fallback;
  }

  function collectVscodeVars() {
    refreshStyleSnapshots();
    return vscodeThemeVarNames.reduce(function (vars, name) {
      var value = readLocalVar(name, '') || inheritedVscodeVars[name];

      if (value) {
        vars[name] = value;
      }

      return vars;
    }, {});
  }

  function serializeVars(vars) {
    return Object.keys(vars || {}).sort().map(function (name) {
      return name + ':' + vars[name];
    }).join(';');
  }

  function serializeThemeMessage(message) {
    var cleanMessage = copyThemeMessage(message || {});

    delete cleanMessage.vscodeThemeVars;
    delete cleanMessage.insightThemeVars;

    return Object.keys(cleanMessage).sort().map(function (name) {
      return name + ':' + cleanMessage[name];
    }).join(';');
  }

  function invalidateThemeMessageCache() {
    cachedThemeMessageSignature = '';
    cachedThemeMessage = null;
  }

  function markThemeTargetsDirty() {
    themeTargetsDirty = true;
    invalidateThemeMessageCache();
  }

  function markStyleSheetsDirty(sheet) {
    styleSheetsDirty = true;
    invalidateThemeMessageCache();

    if (!sheet) {
      fullStyleSheetsDirty = true;
      return;
    }

    if (dirtyStyleSheets) {
      if (dirtyStyleSheets.has(sheet)) {
        return;
      }

      dirtyStyleSheets.add(sheet);
    }
    else if (dirtyStyleSheetList.indexOf(sheet) >= 0) {
      return;
    }

    dirtyStyleSheetList.push(sheet);
  }

  function clearDirtyStyleSheets() {
    dirtyStyleSheetList = [];
    dirtyStyleSheets = typeof WeakSet === 'function' ? new WeakSet() : null;
  }

  function parseColor(value) {
    if (!value) {
      return null;
    }

    var trimmed = value.trim();
    var hex = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);

    if (hex) {
      var normalized = hex[1].length === 3
        ? hex[1].split('').map(function (part) { return part + part; }).join('')
        : hex[1];

      return [
        parseInt(normalized.slice(0, 2), 16),
        parseInt(normalized.slice(2, 4), 16),
        parseInt(normalized.slice(4, 6), 16)
      ];
    }

    var rgb = trimmed.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/i);

    if (rgb) {
      return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
    }

    return null;
  }

  function rgbCsv(value, fallback) {
    var color = parseColor(value);

    return color ? color.join(',') : fallback;
  }

  function rgba(value, alpha, fallback) {
    var color = parseColor(value);

    return color ? 'rgba(' + color.join(',') + ',' + alpha + ')' : fallback;
  }

  function readDividerColor() {
    return readVar('--vscode-contrastBorder', '')
      || readVar('--vscode-panel-border', readVar('--vscode-widget-border', readVar('--vscode-editorWidget-border', '#303031')));
  }

  function withRequiredInsightVars(vars) {
    if (!vars || vars['--mi-divider-color']) {
      return vars;
    }

    var nextVars = {};

    Object.keys(vars).forEach(function (name) {
      nextVars[name] = vars[name];
    });
    nextVars['--mi-divider-color'] = readDividerColor();

    return nextVars;
  }

  function buildVars() {
    refreshStyleSnapshots();
    if (inheritedInsightVars) {
      return withRequiredInsightVars(inheritedInsightVars);
    }

    var background = readVar('--vscode-editor-background', '#1e1e1e');
    var foreground = readVar('--vscode-editor-foreground', readVar('--vscode-foreground', '#cccccc'));
    var appForeground = readVar('--vscode-foreground', foreground);
    var description = readVar('--vscode-descriptionForeground', foreground);
    var disabled = readVar('--vscode-disabledForeground', description);
    var widgetBackground = readVar('--vscode-editorWidget-background', background);
    var sideBarBackground = readVar('--vscode-sideBar-background', widgetBackground);
    var inputBackground = readVar('--vscode-input-background', widgetBackground);
    var dropdownBackground = readVar('--vscode-dropdown-background', inputBackground);
    var border = readVar('--vscode-contrastBorder', '') || readVar('--vscode-widget-border', readVar('--vscode-editorWidget-border', '#303031'));
    var divider = readDividerColor();
    var focus = readVar('--vscode-focusBorder', readVar('--vscode-textLink-foreground', '#3794ff'));
    var link = readVar('--vscode-textLink-foreground', focus);
    var linkActive = readVar('--vscode-textLink-activeForeground', link);
    var buttonBackground = readVar('--vscode-button-background', link);
    var buttonHover = readVar('--vscode-button-hoverBackground', linkActive);
    var selection = readVar('--vscode-editor-selectionBackground', rgba(link, 0.35, 'rgba(55,148,255,0.35)'));
    var success = readVar('--vscode-testing-iconPassed', readVar('--vscode-charts-green', '#73c991'));
    var warning = readVar('--vscode-editorWarning-foreground', readVar('--vscode-problemsWarningIcon-foreground', '#cca700'));
    var error = readVar('--vscode-editorError-foreground', readVar('--vscode-errorForeground', '#f48771'));
    var info = readVar('--vscode-editorInfo-foreground', readVar('--vscode-problemsInfoIcon-foreground', link));

    return {
      '--grey0': background,
      '--grey5': widgetBackground,
      '--grey6': widgetBackground,
      '--grey8': border,
      '--grey10': border,
      '--grey15': description,
      '--grey18': description,
      '--grey20': description,
      '--grey30': description,
      '--grey40': description,
      '--grey50': description,
      '--grey60': disabled,
      '--grey70': inputBackground,
      '--grey80': inputBackground,
      '--grey83': widgetBackground,
      '--grey85': sideBarBackground,
      '--grey90': widgetBackground,
      '--grey95': background,
      '--grey100': foreground,
      '--activeblue': link,
      '--whiteblue': selection,
      '--grey80blue': widgetBackground,
      '--grey20blue': description,
      '--middleblue': buttonBackground,
      '--labelblue': linkActive,
      '--lightblue': link,
      '--blue30': rgba(link, 0.5, 'rgba(55,148,255,0.5)'),
      '--greyTransparent': rgba(link, 0.1, 'rgba(55,148,255,0.1)'),
      '--mi-font-family': readVar('--vscode-font-family', 'Segoe UI, sans-serif'),
      '--mi-font-size-base': readVar('--vscode-font-size', '13px'),
      '--mi-font-size-small': readVar('--vscode-bodyFontSize-small', '12px'),
      '--mi-font-size-extra-small': readVar('--vscode-bodyFontSize-xSmall', '11px'),
      '--mi-color-primary': link,
      '--mi-color-primary-rgb': rgbCsv(link, '55,148,255'),
      '--mi-color-primary-light-1': buttonHover,
      '--mi-color-primary-light-2': buttonBackground,
      '--mi-color-primary-light-3': selection,
      '--mi-color-primary-light-4': rgba(link, 0.18, 'rgba(55,148,255,0.18)'),
      '--mi-color-primary-light-5': rgba(link, 0.12, 'rgba(55,148,255,0.12)'),
      '--mi-color-primary-dark': linkActive,
      '--mi-color-success': success,
      '--mi-color-success-rgb': rgbCsv(success, '115,201,145'),
      '--mi-color-success-dark': success,
      '--mi-color-warning': warning,
      '--mi-color-warning-rgb': rgbCsv(warning, '204,167,0'),
      '--mi-color-warning-dark': warning,
      '--mi-color-danger': error,
      '--mi-color-danger-rgb': rgbCsv(error, '244,135,113'),
      '--mi-color-danger-dark': error,
      '--mi-color-major': warning,
      '--mi-color-major-rgb': rgbCsv(warning, '204,167,0'),
      '--mi-color-info': info,
      '--mi-color-info-rgb': rgbCsv(info, '89,164,249'),
      '--mi-color-info-dark': info,
      '--mi-bg-color-page': background,
      '--mi-bg-color': widgetBackground,
      '--mi-bg-color-dark': background,
      '--mi-bg-color-light': inputBackground,
      '--mi-bg-color-lighter': dropdownBackground,
      '--mi-bg-color-grey': sideBarBackground,
      '--mi-bg-color-common': widgetBackground,
      '--mi-bg-color-overlay': widgetBackground,
      '--mi-text-color': foreground,
      '--mi-text-color-primary': appForeground,
      '--mi-text-color-secondary': description,
      '--mi-text-color-tertiary': description,
      '--mi-text-color-fourth': appForeground,
      '--mi-text-color-placeholder': readVar('--vscode-input-placeholderForeground', description),
      '--mi-text-color-placeholder-light': disabled,
      '--mi-text-color-disabled': disabled,
      '--mi-border-color': border,
      '--mi-border-color-light': border,
      '--mi-border-color-lighter': border,
      '--mi-border-color-extra-light': border,
      '--mi-border-color-dark': border,
      '--mi-border-color-darker': border,
      '--mi-divider-color': divider,
      '--mi-box-shadow': '0 8px 24px ' + readVar('--vscode-widget-shadow', 'rgba(0,0,0,0.36)'),
      '--mi-box-shadow-light': '0 0 12px ' + readVar('--vscode-widget-shadow', 'rgba(0,0,0,0.36)'),
      '--mi-box-shadow-lighter': '0 0 6px ' + readVar('--vscode-widget-shadow', 'rgba(0,0,0,0.36)'),
      '--mi-box-shadow-dark': '0 16px 48px ' + readVar('--vscode-widget-shadow', 'rgba(0,0,0,0.36)'),
      '--mi-mask-color': rgba(background, 0.8, 'rgba(0,0,0,0.8)'),
      '--mi-mask-color-extra-light': rgba(background, 0.3, 'rgba(0,0,0,0.3)'),
      '--ant-primary-color': link,
      '--ant-primary-color-disabled': disabled,
      '--ant-primary-color-hover': buttonHover,
      '--ant-primary-color-active': buttonBackground,
      '--ant-primary-color-outline': rgba(link, 0.3, 'rgba(55,148,255,0.3)'),
      '--ant-primary-color-deprecated-bg': selection,
      '--ant-primary-color-deprecated-border': focus,
      '--ant-primary-1': rgba(link, 0.12, 'rgba(55,148,255,0.12)'),
      '--ant-primary-2': rgba(link, 0.2, 'rgba(55,148,255,0.2)'),
      '--ant-primary-3': rgba(link, 0.3, 'rgba(55,148,255,0.3)'),
      '--ant-primary-4': link,
      '--ant-primary-5': linkActive,
      '--ant-primary-6': link,
      '--ant-primary-7': buttonBackground,
      '--ant-primary-8': buttonHover,
      '--ant-primary-9': focus,
      '--ant-primary-10': focus,
      '--ant-primary-color-deprecated-l-35': rgba(link, 0.35, 'rgba(55,148,255,0.35)'),
      '--ant-primary-color-deprecated-l-20': rgba(link, 0.2, 'rgba(55,148,255,0.2)'),
      '--ant-primary-color-deprecated-t-20': linkActive,
      '--ant-primary-color-deprecated-t-50': rgba(link, 0.5, 'rgba(55,148,255,0.5)'),
      '--ant-primary-color-deprecated-f-12': rgba(link, 0.12, 'rgba(55,148,255,0.12)'),
      '--ant-primary-color-active-deprecated-f-30': rgba(link, 0.3, 'rgba(55,148,255,0.3)'),
      '--ant-primary-color-active-deprecated-d-02': selection,
      '--ant-success-color': success,
      '--ant-success-color-disabled': disabled,
      '--ant-success-color-hover': success,
      '--ant-success-color-active': success,
      '--ant-success-color-outline': rgba(success, 0.3, 'rgba(115,201,145,0.3)'),
      '--ant-success-color-deprecated-bg': rgba(success, 0.12, 'rgba(115,201,145,0.12)'),
      '--ant-success-color-deprecated-border': success,
      '--ant-warning-color': warning,
      '--ant-warning-color-disabled': disabled,
      '--ant-warning-color-hover': warning,
      '--ant-warning-color-active': warning,
      '--ant-warning-color-outline': rgba(warning, 0.3, 'rgba(204,167,0,0.3)'),
      '--ant-warning-color-deprecated-bg': rgba(warning, 0.12, 'rgba(204,167,0,0.12)'),
      '--ant-warning-color-deprecated-border': warning,
      '--ant-error-color': error,
      '--ant-error-color-disabled': disabled,
      '--ant-error-color-hover': error,
      '--ant-error-color-active': error,
      '--ant-error-color-outline': rgba(error, 0.3, 'rgba(244,135,113,0.3)'),
      '--ant-error-color-deprecated-bg': rgba(error, 0.12, 'rgba(244,135,113,0.12)'),
      '--ant-error-color-deprecated-border': error,
      '--ant-info-color': info,
      '--ant-info-color-disabled': disabled,
      '--ant-info-color-hover': info,
      '--ant-info-color-active': info,
      '--ant-info-color-outline': rgba(info, 0.3, 'rgba(89,164,249,0.3)'),
      '--ant-info-color-deprecated-bg': rgba(info, 0.12, 'rgba(89,164,249,0.12)'),
      '--ant-info-color-deprecated-border': info,
      '--antd-wave-shadow-color': link
    };
  }

  function setVar(target, name, value) {
    if (target && value && target.style.getPropertyValue(name) !== value) {
      target.style.setProperty(name, value);
    }
  }

  function escapeRegExp(value) {
    var specialChars = '\\\\^$.*+?()[]{}|';

    return String(value).split('').map(function (char) {
      return specialChars.indexOf(char) >= 0 ? '\\\\' + char : char;
    }).join('');
  }

  function getReplacementMatcher(replacements, signature) {
    if (cachedReplacementMatcher && cachedReplacementMatcherSignature === signature) {
      return cachedReplacementMatcher;
    }

    var tokenToReplacement = {};

    replacements.forEach(function (replacement) {
      tokenToReplacement[String(replacement[0]).toLowerCase()] = replacement[1];
    });

    var matcher = replacements.length
      ? new RegExp(
        replacements
          .map(function (replacement) { return escapeRegExp(replacement[0]); })
          .join('|'),
        'gi'
      )
      : null;

    cachedReplacementMatcher = {
      matcher: matcher,
      map: tokenToReplacement
    };
    cachedReplacementMatcherSignature = signature;

    return cachedReplacementMatcher;
  }

  function replaceColorTokens(source, replacements, signature) {
    var replacementMatcher = getReplacementMatcher(replacements, signature);

    if (!replacementMatcher.matcher) {
      return source;
    }

    replacementMatcher.matcher.lastIndex = 0;
    if (!replacementMatcher.matcher.test(source)) {
      return source;
    }
    replacementMatcher.matcher.lastIndex = 0;

    return source.replace(replacementMatcher.matcher, function (match) {
      return replacementMatcher.map[String(match).toLowerCase()] || match;
    });
  }

  function copyThemeMessage(message) {
    var themeMessage = {};

    Object.keys(message || {}).forEach(function (key) {
      themeMessage[key] = message[key];
    });

    return themeMessage;
  }

  function getCssDeclarationRecord(style, property, current) {
    if (!patchedCssDeclarationValues) {
      return {
        original: current,
        patched: ''
      };
    }

    var declarationRecord = patchedCssDeclarationValues.get(style);

    if (!declarationRecord) {
      declarationRecord = {};
      patchedCssDeclarationValues.set(style, declarationRecord);
    }

    if (
      !Object.prototype.hasOwnProperty.call(declarationRecord, property)
      || (declarationRecord[property].patched && current !== declarationRecord[property].patched)
    ) {
      declarationRecord[property] = {
        original: current,
        patched: ''
      };
    }

    return declarationRecord[property];
  }

  function buildInsightColorReplacements(vars) {
    var replacements = [
      ['#0a0a0a', vars['--mi-bg-color-page']],
      ['#181b20', vars['--mi-bg-color-dark']],
      ['#1f2329', vars['--mi-bg-color']],
      ['#2a2f37', vars['--mi-bg-color-light']],
      ['#343a43', vars['--mi-bg-color-lighter']],
      ['#252526', vars['--mi-bg-color-overlay']],
      ['#202020', vars['--mi-bg-color']],
      ['#ebeff6', vars['--mi-bg-color-dark']],
      ['#fdfeff', vars['--mi-bg-color']],
      ['#f4f6fa', vars['--mi-bg-color-light']],
      ['#d2dce9', vars['--mi-text-color']],
      ['#d3dce9', vars['--mi-text-color-secondary']],
      ['#4e5865', vars['--mi-text-color']],
      ['#8d98aa', vars['--mi-text-color-tertiary']],
      ['#626d7c', vars['--mi-text-color-placeholder']],
      ['#6c6e72', vars['--mi-text-color-disabled']],
      ['#c0c4cc', vars['--mi-text-color-disabled']],
      ['#363c46', vars['--mi-border-color']],
      ['#3e4551', vars['--mi-border-color-light']],
      ['#576372', vars['--mi-border-color-lighter']],
      ['#e4eaf1', vars['--mi-border-color']],
      ['#dfe5ef', vars['--mi-border-color-light']],
      ['#c3cedf', vars['--mi-border-color-lighter']],
      ['#0077ff', vars['--mi-color-primary']],
      ['#07f', vars['--mi-color-primary']],
      ['#3375b9', vars['--mi-color-primary-light-1']],
      ['#5391ff', vars['--mi-color-primary']],
      ['#5291ff', vars['--mi-color-primary']],
      ['#4c4c4c', vars['--mi-bg-color-lighter']],
      ['rgb(44, 44, 44)', vars['--mi-bg-color-light']],
      ['rgb(177, 177, 177)', vars['--mi-text-color']],
      ['rgb(46, 47, 49)', vars['--mi-border-color']],
      ['rgb(255, 255, 255, 0.6)', vars['--mi-text-color-secondary']],
      ['rgb(255, 255, 255, 0.4)', vars['--mi-text-color-tertiary']],
      ['rgb(255, 255, 255, 0.15)', vars['--mi-text-color-disabled']],
      ['rgba(255,255,255,.6)', vars['--mi-text-color-secondary']],
      ['rgba(255,255,255,.4)', vars['--mi-text-color-tertiary']],
      ['rgba(255,255,255,.15)', vars['--mi-text-color-disabled']]
    ];

    function addRgb(red, green, blue, value) {
      replacements.push(
        ['rgb(' + red + ', ' + green + ', ' + blue + ')', value],
        ['rgb(' + red + ',' + green + ',' + blue + ')', value]
      );
    }

    addRgb(10, 10, 10, vars['--mi-bg-color-page']);
    addRgb(24, 27, 32, vars['--mi-bg-color-dark']);
    addRgb(31, 35, 41, vars['--mi-bg-color']);
    addRgb(37, 37, 38, vars['--mi-bg-color-overlay']);
    addRgb(42, 47, 55, vars['--mi-bg-color-light']);
    addRgb(52, 58, 67, vars['--mi-bg-color-lighter']);
    addRgb(235, 239, 246, vars['--mi-bg-color-dark']);
    addRgb(244, 246, 250, vars['--mi-bg-color-light']);
    addRgb(253, 254, 255, vars['--mi-bg-color']);
    addRgb(210, 220, 233, vars['--mi-text-color']);
    addRgb(211, 220, 233, vars['--mi-text-color-secondary']);
    addRgb(78, 88, 101, vars['--mi-text-color']);
    addRgb(141, 152, 170, vars['--mi-text-color-tertiary']);
    addRgb(98, 109, 124, vars['--mi-text-color-placeholder']);
    addRgb(108, 110, 114, vars['--mi-text-color-disabled']);
    addRgb(192, 196, 204, vars['--mi-text-color-disabled']);
    addRgb(54, 60, 70, vars['--mi-border-color']);
    addRgb(62, 69, 81, vars['--mi-border-color-light']);
    addRgb(87, 99, 114, vars['--mi-border-color-lighter']);
    addRgb(228, 234, 241, vars['--mi-border-color']);
    addRgb(223, 229, 239, vars['--mi-border-color-light']);
    addRgb(195, 206, 223, vars['--mi-border-color-lighter']);
    addRgb(0, 119, 255, vars['--mi-color-primary']);
    addRgb(83, 145, 255, vars['--mi-color-primary']);
    addRgb(82, 145, 255, vars['--mi-color-primary']);

    var deduped = {};
    var normalized = [];

    replacements.forEach(function (replacement) {
      if (!replacement[1]) {
        return;
      }

      var token = String(replacement[0]).toLowerCase();
      if (Object.prototype.hasOwnProperty.call(deduped, token)) {
        return;
      }

      deduped[token] = true;
      normalized.push(replacement);
    });

    return normalized;
  }

  function getInsightColorReplacements(vars, varsSignature) {
    if (cachedReplacements && cachedReplacementSignature === varsSignature) {
      return cachedReplacements;
    }

    cachedReplacementSignature = varsSignature;
    cachedReplacements = buildInsightColorReplacements(vars);

    return cachedReplacements;
  }

  function patchCssDeclaration(style, replacements) {
    if (!style || !style.cssText || !colorTokenHintRegex.test(style.cssText)) {
      return;
    }

    for (var i = 0; i < style.length; i += 1) {
      var property = style[i];
      if (!property || !cssPatchedPropertySet[property]) {
        continue;
      }
      var value = style.getPropertyValue(property);

      if (!value) {
        continue;
      }

      if (!colorTokenHintRegex.test(value)) {
        continue;
      }

      var record = getCssDeclarationRecord(style, property, value);
      var next = replaceColorTokens(record.original, replacements, cachedReplacementSignature);

      if (next !== value) {
        style.setProperty(
          property,
          next,
          typeof style.getPropertyPriority === 'function'
            ? style.getPropertyPriority(property)
            : ''
        );
        record.patched = style.getPropertyValue(property) || next;
      }
      else {
        record.patched = value;
      }
    }
  }

  function patchCssRule(rule, replacements) {
    if (!rule) {
      return;
    }

    if (rule.cssText && !colorTokenHintRegex.test(rule.cssText)) {
      return;
    }

    if (rule.style) {
      patchCssDeclaration(rule.style, replacements);
    }

    if (rule.cssRules) {
      for (var i = 0; i < rule.cssRules.length; i += 1) {
        patchCssRule(rule.cssRules[i], replacements);
      }
    }
  }

  function patchInsightCssRules(replacements, forceAll) {
    var sheets = forceAll || fullStyleSheetsDirty || !dirtyStyleSheetList.length
      ? document.styleSheets || []
      : dirtyStyleSheetList;

    Array.prototype.forEach.call(sheets, function (sheet) {
      try {
        var ownerNode = sheet.ownerNode;
        if (ownerNode && ownerNode.id === 'vscode-theme-overrides') {
          return;
        }

        var rules = sheet.cssRules || [];
        if (!rules.length) {
          return;
        }

        for (var i = 0; i < rules.length; i += 1) {
          patchCssRule(rules[i], replacements);
        }
      }
      catch (error) {
        debugLog('[InsightDataViewerPanel] Failed to patch CSSOM rule', error);
      }
    });
  }

  function installCssomMutationBridge() {
    if (typeof CSSStyleSheet === 'undefined' || !CSSStyleSheet.prototype) {
      return;
    }

    var prototype = CSSStyleSheet.prototype;

    if (prototype.__vscodeInsightThemeInsertRulePatched) {
      return;
    }

    var nativeInsertRule = prototype.insertRule;

    if (typeof nativeInsertRule !== 'function') {
      return;
    }

    try {
      Object.defineProperty(prototype, '__vscodeInsightThemeInsertRulePatched', {
        value: true,
        configurable: true
      });
    }
    catch (error) {
      prototype.__vscodeInsightThemeInsertRulePatched = true;
    }

    prototype.insertRule = function (rule, index) {
      var result = typeof index === 'number'
        ? nativeInsertRule.call(this, rule, index)
        : nativeInsertRule.call(this, rule);

      markStyleSheetsDirty(this);
      scheduleApply(themeGeneration, { patchStyleSheets: true });

      return result;
    };
  }

  function patchInsightStyleSheets(vars, varsSignature) {
    installCssomMutationBridge();

    var patchAllCssRules = lastPatchedVarsSignature !== varsSignature;
    var shouldPatchCssRules = patchAllCssRules || styleSheetsDirty;

    if (!shouldPatchCssRules) {
      return;
    }

    var replacements = getInsightColorReplacements(vars, varsSignature);

    if (shouldPatchCssRules) {
      patchInsightCssRules(replacements, patchAllCssRules);
    }

    lastPatchedVarsSignature = varsSignature;
    styleSheetsDirty = false;
    fullStyleSheetsDirty = false;
    clearDirtyStyleSheets();
  }

  function buildThemeMessage(message) {
    if (cachedThemeMessage && message === lastThemeMessage) {
      return cachedThemeMessage;
    }

    var vscodeVars = collectVscodeVars();
    var insightVars = buildVars();
    var messageSignature = [
      serializeThemeMessage(message),
      serializeVars(vscodeVars),
      serializeVars(insightVars)
    ].join('|');

    if (cachedThemeMessage && cachedThemeMessageSignature === messageSignature) {
      return cachedThemeMessage;
    }

    var themeMessage = copyThemeMessage(message);

    themeMessage.vscodeThemeVars = vscodeVars;
    themeMessage.insightThemeVars = insightVars;
    cachedThemeMessageSignature = messageSignature;
    cachedThemeMessage = themeMessage;

    return themeMessage;
  }

  function cancelThemeWork() {
    if (flushRafId) {
      if (typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(flushRafId);
      }
      else {
        window.clearTimeout(flushRafId);
      }

      flushRafId = 0;
    }

    scheduledGeneration = themeGeneration;
    scheduledPatchStyleSheets = false;
    scheduledForwardToIframes = false;
  }

  function applyThemeVars(generation, options) {
    if (typeof generation === 'number' && generation !== themeGeneration) {
      return;
    }

    var shouldPatchStyleSheets = !options || options.patchStyleSheets !== false;
    var vars = buildVars();
    var shouldApplyInheritedVscodeVars = Boolean(lastThemeMessage && lastThemeMessage.vscodeThemeVars);
    var vscodeVars = shouldApplyInheritedVscodeVars
      ? lastThemeMessage.vscodeThemeVars
      : collectVscodeVars();
    var varsSignature = serializeVars(vars);
    var applySignature = serializeVars(vscodeVars) + '|' + varsSignature;
    var targets = [document.documentElement];

    if (document.body) {
      targets.push(document.body);
    }

    if (themeTargetsDirty || lastAppliedVarsSignature !== applySignature) {
      targets.forEach(function (target) {
        if (shouldApplyInheritedVscodeVars) {
          Object.keys(vscodeVars).forEach(function (name) {
            setVar(target, name, vscodeVars[name]);
          });
        }
        Object.keys(vars).forEach(function (name) {
          setVar(target, name, vars[name]);
        });
      });
      lastAppliedVarsSignature = applySignature;
      themeTargetsDirty = false;
    }

    if (shouldPatchStyleSheets) {
      patchInsightStyleSheets(vars, varsSignature);
    }

    document.documentElement.dataset.opDevtoolsInsightTheme =
      lastThemeMessage && lastThemeMessage.themeKind
        ? lastThemeMessage.themeKind
        : document.documentElement.dataset.vscodeThemeKind || '';
  }

  function getIframes() {
    if (document && typeof document.getElementsByTagName === 'function') {
      return document.getElementsByTagName('iframe');
    }

    if (document && typeof document.querySelectorAll === 'function') {
      return document.querySelectorAll('iframe');
    }

    return [];
  }

  function flushThemeWork() {
    flushRafId = 0;
    var generation = scheduledGeneration;
    var shouldPatchStyleSheets = scheduledPatchStyleSheets;
    var shouldForwardToIframes = scheduledForwardToIframes;

    scheduledPatchStyleSheets = false;
    scheduledForwardToIframes = false;

    applyThemeVars(generation, { patchStyleSheets: shouldPatchStyleSheets });

    if (shouldForwardToIframes) {
      postLatestThemeToIframes(generation);
    }
  }

  function scheduleThemeFlush() {
    if (flushRafId) {
      return;
    }

    if (typeof window.requestAnimationFrame === 'function') {
      flushRafId = window.requestAnimationFrame(flushThemeWork);
      return;
    }

    flushRafId = window.setTimeout(flushThemeWork, 16);
  }

  function scheduleApply(generation, options) {
    var applyGeneration = typeof generation === 'number' ? generation : themeGeneration;
    if (applyGeneration > scheduledGeneration) {
      scheduledGeneration = applyGeneration;
    }

    if (!options || options.patchStyleSheets !== false) {
      scheduledPatchStyleSheets = true;
    }

    scheduleThemeFlush();
  }

  function scheduleThemeApplies(generation) {
    var applyGeneration = typeof generation === 'number' ? generation : themeGeneration;

    scheduleApply(applyGeneration, { patchStyleSheets: true });
  }

  function postThemeToIframes(message, generation) {
    if (typeof generation === 'number' && generation !== themeGeneration) {
      return;
    }

    var themeMessage = buildThemeMessage(message);

    var frames = getIframes();

    for (var i = 0; i < frames.length; i += 1) {
      var frame = frames[i];
      try {
        if (frame.contentWindow) {
          frame.contentWindow.postMessage(themeMessage, '*');
        }
      }
      catch (error) {
        debugLog('[InsightDataViewerPanel] Failed to forward theme to iframe', error);
      }
    }
  }

  function postLatestThemeToIframes(generation) {
    if (typeof generation === 'number' && generation !== themeGeneration) {
      return;
    }

    if (!lastThemeMessage) {
      return;
    }

    postThemeToIframes(lastThemeMessage, generation);
  }

  function forwardThemeToIframes(generation) {
    var forwardGeneration = typeof generation === 'number' ? generation : themeGeneration;
    if (forwardGeneration > scheduledGeneration) {
      scheduledGeneration = forwardGeneration;
    }

    scheduledForwardToIframes = true;
    scheduleThemeFlush();
  }

  function requestThemeFromParent() {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ command: 'getTheme' }, '*');
      }
    }
    catch (error) {
      debugLog('[InsightDataViewerPanel] Failed to request theme from parent', error);
    }
  }

  function inferThemeMessage() {
    var htmlKind = document.documentElement.dataset.vscodeThemeKind || '';
    var bodyKind = document.body ? document.body.dataset.vscodeThemeKind || '' : '';
    var classes = [
      document.documentElement.className || '',
      document.body ? document.body.className || '' : ''
    ].join(' ');
    var isHighContrastLight = htmlKind === 'high-contrast-light'
      || bodyKind === 'high-contrast-light'
      || classes.indexOf('vscode-high-contrast-light') >= 0;
    var isHighContrast = isHighContrastLight
      || htmlKind === 'high-contrast'
      || bodyKind === 'high-contrast'
      || classes.indexOf('vscode-high-contrast') >= 0;
    var isLight = isHighContrastLight
      || htmlKind === 'light'
      || bodyKind === 'light'
      || classes.indexOf('vscode-light') >= 0
      || classes.indexOf('theme_light') >= 0;
    var isDark = !isLight;
    var themeKind = htmlKind || bodyKind || (isHighContrastLight
      ? 'high-contrast-light'
      : isHighContrast
        ? 'high-contrast'
        : isDark
          ? 'dark'
          : 'light');

    return {
      command: 'updateTheme',
      themeKind: themeKind,
      themeName: isDark ? 'dark' : 'light',
      isDark: isDark,
      isHighContrast: isHighContrast
    };
  }

  window.addEventListener('message', function (event) {
    var message = event.data;

    if (message && message.command === 'getTheme') {
      if (event.source && event.source !== window) {
        event.source.postMessage(buildThemeMessage(lastThemeMessage || inferThemeMessage()), '*');
      }

      return;
    }

    if (message && message.command === 'updateTheme') {
      var generation = ++themeGeneration;

      cancelThemeWork();
      invalidateThemeMessageCache();
      if (message.vscodeThemeVars) {
        inheritedVscodeVars = message.vscodeThemeVars;
      }

      inheritedInsightVars = message.insightThemeVars || null;

      try {
        localStorage.setItem('theme', JSON.stringify(message.isDark || message.themeName === 'dark' ? 'dark' : 'light'));
      }
      catch (error) {
        debugLog('[InsightDataViewerPanel] Failed to persist native Insight theme', error);
      }

      if (typeof window.setTheme === 'function') {
        try {
          window.setTheme(Boolean(message.isDark || message.themeName === 'dark'));
        }
        catch (error) {
          debugLog('[InsightDataViewerPanel] Failed to apply native Insight theme switch', error);
        }
      }

      lastThemeMessage = copyThemeMessage(message);
      hasAppliedThemeMessage = true;
      scheduleThemeApplies(generation);
      forwardThemeToIframes(generation);
    }
  });

  function getElementNode(node) {
    return node && node.nodeType === 1 ? node : null;
  }

  function isStyleElement(element) {
    return element && element.tagName && String(element.tagName).toLowerCase() === 'style';
  }

  function isStylesheetLink(element) {
    return element
      && element.tagName
      && String(element.tagName).toLowerCase() === 'link'
      && String(element.rel || '').toLowerCase() === 'stylesheet';
  }

  function isIframeElement(element) {
    return element && element.tagName && String(element.tagName).toLowerCase() === 'iframe';
  }

  function markStyleElementDirty(style) {
    if (!style || style.id === 'vscode-theme-overrides') {
      return false;
    }

    markStyleSheetsDirty(style.sheet || null);

    return true;
  }

  function inspectElementNode(element) {
    var result = {
      apply: false,
      forward: false
    };

    if (!element) {
      return result;
    }

    if (isStyleElement(element)) {
      result.apply = markStyleElementDirty(element);
    }
    else if (isStylesheetLink(element)) {
      markStyleSheetsDirty(null);
      result.apply = true;
    }
    else if (isIframeElement(element)) {
      result.forward = true;
    }

    return result;
  }

  function mergeInspectionResult(target, source) {
    target.apply = target.apply || source.apply;
    target.forward = target.forward || source.forward;
  }

  function inspectAddedNode(node) {
    var element = getElementNode(node);
    var result = {
      apply: false,
      forward: false
    };

    if (!element) {
      return result;
    }

    mergeInspectionResult(result, inspectElementNode(element));
    if (!element.querySelectorAll) {
      return result;
    }

    var nestedMatches = element.querySelectorAll('style,link[rel="stylesheet"],iframe');
    Array.prototype.forEach.call(nestedMatches, function (match) {
      mergeInspectionResult(result, inspectElementNode(match));
    });

    return result;
  }

  var isBodyObserverAttached = false;
  function observeBodyIfNeeded() {
    if (!document.body || isBodyObserverAttached) {
      return;
    }

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-vscode-theme-kind'],
      childList: true,
      subtree: true
    });
    isBodyObserverAttached = true;
  }

  var observer = new MutationObserver(function (mutations) {
    var shouldApply = false;
    var shouldForward = false;

    mutations.forEach(function (mutation) {
      if (mutation.type === 'attributes') {
        if (mutation.target === document.documentElement || mutation.target === document.body) {
          markThemeTargetsDirty();
          shouldApply = true;
          shouldForward = true;
        }

        return;
      }

      if (mutation.type === 'childList') {
        Array.prototype.forEach.call(mutation.addedNodes || [], function (node) {
          var result = inspectAddedNode(node);

          shouldApply = result.apply || shouldApply;
          shouldForward = result.forward || result.apply || shouldForward;
        });
      }
    });

    if (shouldApply) {
      scheduleApply(themeGeneration, {
        patchStyleSheets: styleSheetsDirty || !hasAppliedThemeMessage,
      });
    }

    if (lastThemeMessage && shouldForward) {
      forwardThemeToIframes(themeGeneration);
    }
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'style', 'data-vscode-theme-kind']
  });

  if (document.head) {
    observer.observe(document.head, {
      childList: true,
      subtree: true
    });
  }

  observeBodyIfNeeded();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      markThemeTargetsDirty();
      scheduleApply(undefined, { patchStyleSheets: false });
      observeBodyIfNeeded();
    }, { once: true });
  }

  scheduleApply(themeGeneration, { patchStyleSheets: false });
  requestThemeFromParent();
})();
</script>`;

    const injection = `${overrideStyle}\n${overrideScript}`;
    const htmlWithoutExistingOverrides = htmlWithTranslationAliases
      .replace(/<style id="vscode-theme-overrides">[\s\S]*?<\/style>/g, '')
      .replace(/<script id="vscode-theme-overrides-script">[\s\S]*?<\/script>/g, '')
      .replace(/<!-- hw-insight-loader:start -->[\s\S]*?<!-- hw-insight-loader:end -->/g, '');

    // The theme bridge belongs in <head>.
    const withThemeBridge = this.injectBeforeTag(htmlWithoutExistingOverrides, '</head>', injection, ['</body>']);

    // The loading overlay is added only to the top-level webview document — not
    // the per-plugin iframes — so a single full-screen loader paints immediately
    // and stacks above the still-empty Insight UI while profiler_server starts
    // and prof data is loaded (issue GC-23).
    if (!includeLoadingOverlay) {
      return withThemeBridge;
    }

    // Insert before the LAST </body>: the bundled Insight SPA inlines minified
    // JS that contains a literal "</body>" inside a string (its print/export
    // feature), so the real document-closing tag is the last occurrence.
    // Targeting the first one would split that <script> and break the page.
    return this.injectBeforeTag(withThemeBridge, '</body>', this.buildLoadingOverlayInjection(), [], 'last');
  }

  /**
   * Insert markup immediately before an occurrence of `primaryTag` (the first
   * by default, or the last when `occurrence === 'last'`), falling back to the
   * first available `fallbackTags` entry and finally appending when the
   * document has neither.
   */
  private injectBeforeTag(
    html: string,
    primaryTag: string,
    content: string,
    fallbackTags: string[] = [],
    occurrence: 'first' | 'last' = 'first',
  ): string {
    const tag = [
      primaryTag,
      ...fallbackTags,
    ].find((candidate) => html.includes(candidate));

    if (!tag) {
      return html + content;
    }

    // Slice-based insertion (not String.replace) so any `$` in `content` is
    // inserted literally and so we can target the last occurrence precisely.
    const index = occurrence === 'last' ? html.lastIndexOf(tag) : html.indexOf(tag);

    return `${html.slice(0, index)}${content}\n${html.slice(index)}`;
  }

  /**
   * Build the Huawei-styled "Linear bar" loading overlay (loader variant B,
   * accent #C7000B) that covers the Insight webview while profiler_server
   * starts and prof data is loaded. Without it the panel shows a blank UI for
   * several seconds and users assume the plugin is frozen (issue GC-23). The
   * overlay is torn down as soon as data starts flowing (`renderAllIframes` /
   * `ws:message`), on an explicit load failure (`insightLoadFailed`), or after
   * a fail-safe timeout so it can never trap the user.
   */
  private buildLoadingOverlayInjection(): string {
    const caption = t('insight.loadingProfilingData');

    return `<!-- hw-insight-loader:start -->
<style id="hw-insight-loader-style">
  #hw-insight-loader {
    --hw-accent: #c7000b;
    position: fixed;
    inset: 0;
    z-index: 999999;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 22px;
    background: var(--vscode-editor-background, #1e1e1e);
    color: var(--vscode-foreground, var(--vscode-editor-foreground, #cccccc));
    font-family: var(--vscode-font-family);
    opacity: 1;
    transition: opacity 0.3s ease;
  }
  #hw-insight-loader.hw-hide {
    opacity: 0;
    pointer-events: none;
  }
  #hw-insight-loader .hw-loader--bar {
    position: relative;
    width: 220px;
    height: 3px;
    border-radius: 3px;
    overflow: hidden;
    background: rgba(199, 0, 11, 0.14);
    background: color-mix(in oklch, var(--hw-accent) 14%, transparent);
  }
  #hw-insight-loader .hw-loader--bar::before {
    content: "";
    position: absolute;
    inset: 0;
    width: 40%;
    border-radius: inherit;
    background: linear-gradient(90deg, transparent, var(--hw-accent) 30%, var(--hw-accent) 70%, transparent);
    animation: hw-bar 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }
  #hw-insight-loader .hw-label {
    font-size: 13px;
    letter-spacing: 0.02em;
    color: var(--vscode-descriptionForeground, #8b8b8b);
  }
  @keyframes hw-bar {
    0% { transform: translateX(-120%); }
    100% { transform: translateX(360%); }
  }
  @media (prefers-reduced-motion: reduce) {
    #hw-insight-loader .hw-loader--bar::before {
      animation: hw-breathe 1.6s ease-in-out infinite;
      transform: none;
      width: 100%;
    }
  }
  @keyframes hw-breathe {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 1; }
  }
</style>
<div id="hw-insight-loader" role="status" aria-live="polite">
  <div class="hw-loader--bar" aria-hidden="true"></div>
  <div class="hw-label">${caption}</div>
</div>
<script id="hw-insight-loader-script">
(function () {
  if (window.__hwInsightLoaderInstalled) {
    return;
  }
  window.__hwInsightLoaderInstalled = true;

  var GRACE_MS = 200;
  var FAILSAFE_MS = 20000;
  var hidden = false;

  function hideLoader() {
    if (hidden) {
      return;
    }
    hidden = true;
    var el = document.getElementById('hw-insight-loader');
    if (!el) {
      return;
    }
    el.classList.add('hw-hide');
    window.setTimeout(function () {
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }, 400);
  }

  window.addEventListener('message', function (event) {
    var message = event && event.data;
    if (!message) {
      return;
    }
    if (message.command === 'renderAllIframes' || message.command === 'insightLoadFailed') {
      window.setTimeout(hideLoader, GRACE_MS);
    }
    if (typeof message.type === 'string' && message.type === 'ws:message') {
      window.setTimeout(hideLoader, GRACE_MS);
    }
  });

  window.setTimeout(hideLoader, FAILSAFE_MS);
})();
</script>
<!-- hw-insight-loader:end -->`;
  }

  /**
   * The bundled Insight UI uses CacheFrame as the tab id, but its translation
   * resources only define CacheTooltip. Patch the in-memory HTML resource with
   * the missing alias so Ant Tooltip does not render raw i18n keys.
   */
  private addInsightTranslationAliases(html: string): string {
    return html.replace(
      /(?:"CacheFrameTooltip"\s*:\s*"(?:\\.|[^"\\])*",)?"CacheTooltip"\s*:\s*("(?:\\.|[^"\\])*")/g,
      (match, cacheTooltipValue: string) => {
        if (match.startsWith('"CacheFrameTooltip"')) {
          return match;
        }

        return `"CacheFrameTooltip":${cacheTooltipValue},${match}`;
      },
    );
  }

  /**
   * Get default HTML content
   */
  private getDefaultHtml(): string {
    const title = t('insight.dataViewerTitle');
    const binLabel = t('insight.binFilePathLabel');
    const wsLabel = t('insight.wsPortLabel');
    const loading = t('insight.placeholderLoading');
    const starting = t('insight.placeholderWsStarting');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body {
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            margin: 0;
            padding: 20px;
        }
        h1 {
            font-weight: 400;
            margin-bottom: 16px;
        }
        p {
            margin: 8px 0;
            color: var(--vscode-editor-foreground);
        }
        span {
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div id="app">
        <h1>${title}</h1>
        <p>${binLabel} <span id="binPath">${loading}</span></p>
        <p>${wsLabel} <span id="wsPort">${starting}</span></p>
    </div>
    <script>
        const vscode = acquireVsCodeApi();

        // Listen for messages from extensions
        window.addEventListener('message', event => {
            const message = event.data;

            // Handle WebSocket bridge messages (from NodeWebviewSocketBridge)
            if (message.type && message.type.startsWith('ws:')) {
                console.log('WebSocket bridge message:', message);

                switch (message.type) {
                    case 'ws:opened':
                        console.log('WebSocket opened:', message.id);
                        break;
                    case 'ws:message':
                        console.log('WebSocket message received:', message.id, message.payload);
                        break;
                    case 'ws:error':
                        console.error('WebSocket error:', message.id, message.reason);
                        break;
                    case 'ws:closed':
                        console.log('WebSocket closed:', message.id, message.code, message.reason);
                        break;
                }
            }
        });

        // Notify extension that the webview is ready to receive messages
        vscode.postMessage({ command: 'ready' });
    </script>
</body>
</html>`;
  }

  /**
   * Handle messages from webview
   */
  private handleWebviewMessage(message: any): void {
    this.logDebug('Received webview message command:', message?.command || message?.type || '<unknown>');

    if (handleThemeRequest(this.panel.webview, message)) {
      return;
    }

    if (message && message.command === 'ready') {
      void postCurrentTheme(this.panel.webview);

      return;
    }

    // Check if it is a WebSocket bridge message (these messages should be handled by NodeWebviewSocketBridge)
    if (
      message.type
      && (message.type === 'ws:open'
        || message.type === 'ws:send'
        || message.type === 'ws:close')
    ) {
      this.logDebug(
        '[InsightDataViewerPanel] Detected WebSocket bridge message, should be handled by NodeWebviewSocketBridge:',
        message.type,
      );

      // These messages will be processed by handleMessage of NodeWebviewSocketBridge
      // But we need to make sure the message is delivered correctly
      if (this.socketBridge) {
        this.logDebug('NodeWebviewSocketBridge is initialized; messages should be processed');
      }
      else {
        console.error('[InsightDataViewerPanel] NodeWebviewSocketBridge is not initialized!');
      }

      // Don't handle it here, let NodeWebviewSocketBridge handle it
      return;
    }

    // First try to find the corresponding processor from WebviewMessageList
    for (const messageItem of webviewMessageList) {
      if (message.command === messageItem.command) {
        this.logDebug(`Found handler: ${message.command}`);
        // Create a that object like WebviewProvider
        const that = {
          context: this.context,
          panel: this.panel,
          _view: undefined,
        };

        messageItem.callback(message, that);
        break;
      }
    }
  }

  /**
   * Detection system architecture
   */
  private detectArchitecture(): 'x86' | 'arm' {
    const arch = os.arch()
      .toLowerCase();

    // x86_64, ia32, x32, x64, etc. all belong to the x86 architecture
    if (
      arch.includes('x64')
      || arch.includes('x86')
      || arch.includes('ia32')
      || arch === 'x32'
    ) {
      return 'x86';
    }

    // arm64, aarch64, arm, etc. all belong to the arm architecture
    if (arch.includes('arm') || arch.includes('aarch')) {
      return 'arm';
    }

    // Returns x86 by default (most cases)
    console.warn(`Unknown architecture: ${arch}, defaulting to x86`);

    return 'x86';
  }

  private async pathExists(targetPath: string): Promise<boolean> {
    try {
      await fs.promises.access(targetPath, fs.constants.F_OK);

      return true;
    }
    catch {
      return false;
    }
  }

  private async ensureServerExecutablePermission(): Promise<void> {
    if (os.platform() === 'win32') {
      return;
    }

    try {
      await fs.promises.chmod(this.serverPath, 0o755);
    }
    catch (chmodError) {
      console.warn(
        '[InsightDataViewerPanel] Failed to set execute permission (can be ignored on Windows):',
        chmodError,
      );
    }
  }

  /**
   * Unzip the zip file
   */
  private async extractZip(zipPath: string, extractTo: string): Promise<void> {
    try {
      // Make sure the target directory exists
      await fs.promises.mkdir(extractTo, { recursive: true });

      // Unzip using adm-zip (cross-platform compatible)
      const zip = new AdmZip(zipPath);

      zip.extractAllTo(extractTo, true);
      this.logDebug(`Unzip successful: ${zipPath} -> ${extractTo}`);
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);

      console.error(`Unzip failed: ${errMsg}`);
      throw new Error(t('insight.unzipFailed', { error: errMsg }));
    }
  }

  /**
   * Make sure the server directory exists, if it does not exist, unzip the corresponding zip file
   */
  private async ensureServerDirectoryExists(): Promise<boolean> {
    const serverDirExists = await this.pathExists(this.serverDir);
    const serverFileExists = await this.pathExists(this.serverPath);

    if (serverDirExists && serverFileExists) {
      await this.ensureServerExecutablePermission();

      return true;
    }

    if (serverDirExists && !serverFileExists) {
      console.warn(`[InsightDataViewerPanel] server directory exists but profiler_server file does not: ${this.serverPath}`);
    }

    const architecture = this.detectArchitecture();
    const zipFileName = architecture === 'x86' ? 'server_x86.zip' : 'server_arm.zip';
    const zipPath = path.join(this.zipDir, zipFileName);

    if (!(await this.pathExists(zipPath))) {
      const errorMsg = t('insight.serverZipMissing', { path: zipPath });

      console.error(`[InsightDataViewerPanel] ${errorMsg}`);
      vscode.window.showErrorMessage(errorMsg);

      return false;
    }

    try {
      this.logDebug(`Start unzipping: ${zipPath}`);
      await this.extractZip(zipPath, this.insightPluginBasePath);

      if (!(await this.pathExists(this.serverDir))) {
        const errorMsg = t('insight.serverDirStillMissing', { path: this.serverDir });

        console.error(`[InsightDataViewerPanel] ${errorMsg}`);
        vscode.window.showErrorMessage(errorMsg);

        return false;
      }

      if (!(await this.pathExists(this.serverPath))) {
        const errorMsg = t('insight.profilerServerFileStillMissing', { path: this.serverPath });

        console.error(`[InsightDataViewerPanel] ${errorMsg}`);
        vscode.window.showErrorMessage(errorMsg);

        return false;
      }

      await this.ensureServerExecutablePermission();
      this.logDebug('server directory is ready');

      return true;
    }
    catch (error: any) {
      const errorMsg = t('insight.unzipArchiveFailed', {
        fileName: zipFileName,
        error: error?.message ?? String(error),
      });

      console.error(`[InsightDataViewerPanel] ${errorMsg}`, error);
      vscode.window.showErrorMessage(errorMsg);

      return false;
    }
  }

  /**
   * Start profiler_server
   * @param resolvePort callback function when the port is ready
   */
  private async startProfilerServer(resolvePort: ()=> void): Promise<boolean> {
    try {
      if (os.platform() === 'win32') {
        this.logDebug('Windows detected, skipping profiler_server startup');
        resolvePort();

        return true;
      }

      this.logDebug('Checking server directory...');
      const isServerReady = await this.ensureServerDirectoryExists();

      if (!isServerReady) {
        resolvePort();

        return false;
      }

      this.logDebug(`Allocating available port in range ${InsightDataViewerPanel.serverPortRangeStart}-${InsightDataViewerPanel.serverPortRangeEnd}...`);
      const port = await this.allocateAvailablePort(
        InsightDataViewerPanel.serverPortRangeStart,
        InsightDataViewerPanel.serverPortRangeEnd,
      );

      if (!port) {
        const errorMsg = t('insight.cannotGetPort');

        console.error(`[InsightDataViewerPanel] ${errorMsg}`);
        vscode.window.showErrorMessage(errorMsg);
        resolvePort();

        return false;
      }

      this.serverPort = port;
      this.logDebug(`Found available port: ${this.serverPort}`);
      const logDir = path.join(this.insightPluginBasePath, '.msinsight');

      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      this.profilerServerProcess = spawn(this.serverPath, [
        `--wsPort=${this.serverPort}`,
        '--wsHost=0.0.0.0',
        `--logPath=${logDir}`,
      ], {
        cwd: this.serverDir,
        env: {
          ...process.env,
          LD_LIBRARY_PATH: this.serverDir,
        },
        shell: false,
      });

      this.profilerServerProcess.stdout?.on('data', (data: Buffer) => {
        this.logDebug(`[profiler_server] ${data.toString()}`);
      });

      this.profilerServerProcess.stderr?.on('data', (data: Buffer) => {
        console.error(`[profiler_server] ${data.toString()}`);
      });

      this.profilerServerProcess.on('close', (code: number) => {
        this.logDebug(`profiler_server process exited, code: ${code}`);
        this.profilerServerProcess = null;

        if (code !== 0 && code !== null) {
          vscode.window.showWarningMessage(t('insight.profilerServerExitCode', { code: String(code) }));
        }
      });

      this.profilerServerProcess.on('error', (error: Error) => {
        console.error('[InsightDataViewerPanel] Failed to start profiler_server:', error);
        vscode.window.showErrorMessage(t('insight.profilerServerStartFailed', { error: error.message }));
        this.profilerServerProcess = null;
      });

      const isServerListening = await this.waitForServerReady(this.serverPort);

      if (!isServerListening) {
        const errorMsg = t('insight.profilerServerStartFailed', { error: `profiler_server is not listening on port ${this.serverPort}` });

        console.error(`[InsightDataViewerPanel] ${errorMsg}`);
        vscode.window.showErrorMessage(errorMsg);
        this.stopProfilerServer();
        this.serverPort = null;
        resolvePort();

        return false;
      }

      this.logDebug(`profiler_server started, port: ${this.serverPort}`);
      resolvePort();

      return true;
    }
    catch (error: any) {
      const errorMsg = t('insight.profilerServerStartFailed', { error: error?.message ?? String(error) });

      console.error(`[InsightDataViewerPanel] ${errorMsg}`, error);
      vscode.window.showErrorMessage(errorMsg);
      resolvePort();

      return false;
    }
  }

  private async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();

      server.unref();

      server.once('error', () => {
        resolve(false);
      });

      server.listen(port, '127.0.0.1', () => {
        server.close(() => resolve(true));
      });
    });
  }

  private async allocateAvailablePort(
    startPort = InsightDataViewerPanel.serverPortRangeStart,
    endPort = InsightDataViewerPanel.serverPortRangeEnd,
  ): Promise<number | null> {
    for (let port = startPort; port <= endPort; port += 1) {
      // Keep the historical Insight server port range for compatibility.
      if (await this.isPortAvailable(port)) {
        return port;
      }
    }

    return null;
  }

  private async waitForServerReady(
    port: number,
    timeoutMs = 8000,
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const isReachable = await new Promise<boolean>((resolve) => {
        const socket = net.connect({
          host: '127.0.0.1',
          port,
        });

        let settled = false;
        const finish = (result: boolean) => {
          if (settled) {
            return;
          }

          settled = true;
          resolve(result);
        };

        socket.setTimeout(500);
        socket.once('connect', () => {
          socket.end();
          finish(true);
        });
        socket.once('error', () => {
          socket.destroy();
          finish(false);
        });
        socket.once('timeout', () => {
          socket.destroy();
          finish(false);
        });
      });

      if (isReachable) {
        return true;
      }

      if (!this.profilerServerProcess) {
        return false;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 120);
      });
    }

    return false;
  }

  private async loadIframeHtmlContent(
    pluginModel: PluginHtmlDescriptor,
    pluginsBasePath: string,
  ): Promise<LoadedIframeContent | null> {
    const pluginDirPath = path.join(pluginsBasePath, pluginModel.model);
    const indexPath = path.join(pluginDirPath, pluginModel.path || 'index.html');
    const pluginName = pluginModel.iframeName || pluginModel.model;

    try {
      const injectedHtml = await this.readInjectedHtmlFile(indexPath, true);

      if (injectedHtml === null) {
        console.warn(`[InsightDataViewerPanel] [${pluginName}] Plugin file does not exist: ${indexPath}`);

        return null;
      }

      return {
        pluginName,
        content: injectedHtml,
        filePath: indexPath,
      };
    }
    catch (error: any) {
      console.warn(
        `[InsightDataViewerPanel] [${pluginName}] Failed to read plugin file: ${indexPath}`,
        error,
      );

      return null;
    }
  }

  /**
   * Load all HTML files concurrently and send them to webview uniformly
   */
  private async loadAndSendAllIframes(): Promise<void> {
    const startTime = Date.now();

    try {
      const pluginsBasePath = path.join(this.insightPluginBasePath, 'plugins');

      this.logDebug(`Preparing to load ${InsightDataViewerPanel.pluginHtmlDescriptors.length} plugin files`);

      const results = await Promise.allSettled(InsightDataViewerPanel.pluginHtmlDescriptors.map((pluginModel) =>
        this.loadIframeHtmlContent(pluginModel, pluginsBasePath)));

      const iframes: LoadedIframeContent[] = [];

      results.forEach((result, index) => {
        const pluginModel = InsightDataViewerPanel.pluginHtmlDescriptors[index];
        const pluginName = pluginModel.iframeName || pluginModel.model;

        if (result.status !== 'fulfilled') {
          console.warn(
            `[InsightDataViewerPanel] [${pluginName}] Loading failed with unhandled error`,
            result.reason,
          );

          return;
        }

        if (result.value) {
          iframes.push(result.value);
        }
      });

      this.logDebug(`Loaded ${iframes.length}/${InsightDataViewerPanel.pluginHtmlDescriptors.length} plugin files in ${Date.now() - startTime}ms`);
      await this.serverPortReady;

      if (this.isDisposed) {
        return;
      }

      this.panel.webview.postMessage({
        command: 'renderAllIframes',
        iframes,
        wsPort: this.serverPort,
        binPath: this.binPath,
      });
      void postCurrentTheme(this.panel.webview);
      this.logDebug('renderAllIframes message sent to webview');
    }
    catch (error: any) {
      console.error('[InsightDataViewerPanel] Failed to load and send iframe content:', error);
      this.notifyWebviewLoadFailed();
    }
  }
  /**
   * Stop profiler_server
   */
  private stopProfilerServer(): void {
    if (this.profilerServerProcess) {
      try {
        this.profilerServerProcess.kill('SIGTERM');
        console.log('Stopped profiler_server process');
      }
      catch (error) {
        console.error('Failed to stop profiler_server:', error);
      }

      this.profilerServerProcess = null;
    }
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    this.isDisposed = true;

    // Stop profiler_server
    this.stopProfilerServer();

    // Clean up the WebSocket bridge
    if (this.socketBridge) {
      this.socketBridge.dispose();
      this.socketBridge = undefined;
    }

    if (this.themeBridgeDisposable) {
      this.themeBridgeDisposable.dispose();
      this.themeBridgeDisposable = undefined;
    }

    // Clean up panel references
    InsightDataViewerPanel.openedFiles.delete(this.binPath);

    // Destroy panel
    this.panel.dispose();
  }
}
