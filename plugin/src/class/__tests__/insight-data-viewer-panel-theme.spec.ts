jest.mock('i18next', () => ({
  t: (key: string) => key,
}));

jest.mock(
  'vscode',
  () => ({
    ColorThemeKind: {
      Light: 1,
      Dark: 2,
      HighContrast: 3,
      HighContrastLight: 4,
    },
    ViewColumn: {
      Active: 1,
    },
    Uri: {
      parse: jest.fn((value: string) => ({ value })),
    },
    commands: {
      executeCommand: jest.fn(),
    },
    env: {
      openExternal: jest.fn(),
    },
    window: {
      activeColorTheme: { kind: 2 },
      createWebviewPanel: jest.fn(),
      onDidChangeActiveColorTheme: jest.fn(() => ({ dispose: jest.fn() })),
      showErrorMessage: jest.fn(),
      showInformationMessage: jest.fn(),
      showWarningMessage: jest.fn(),
    },
  }),
  { virtual: true },
);

jest.mock('../environment-variable-reader', () => ({
  EnvironmentVariableReader: {
    getEnv: jest.fn(() => undefined),
  },
}));

jest.mock('../node-webview-socket-bridge', () => ({
  NodeWebviewSocketBridge: jest.fn(() => ({ dispose: jest.fn() })),
}));

jest.mock('../webview-message-list', () => ({
  __esModule: true,
  default: [],
}));

import * as fs from 'fs';
import * as path from 'path';
import { InsightDataViewerPanel } from '../insight-data-viewer-panel';

type StyleStore = {
  values: Record<string, string>;
  getPropertyValue: jest.Mock<string, [string]>;
  setProperty: jest.Mock<void, [string, string, string?]>;
  getPropertyPriority: jest.Mock<string, [string]>;
  cssText: string;
  length: number;
  [index: number]: string;
};

type RuntimeNode = {
  nodeType: number;
  tagName: string;
  id: string;
  rel?: string;
  dataset: Record<string, string>;
  className: string;
  style: StyleStore;
  textContent: string;
  sheet?: FakeCSSStyleSheet;
  contentWindow?: { postMessage: jest.Mock };
  querySelectorAll: jest.Mock<RuntimeNode[], [string]>;
};

type FakeCssRule = {
  style: StyleStore;
  cssText: string;
};

class FakeCSSStyleSheet {
  public cssRules: FakeCssRule[] = [];

  public ownerNode?: RuntimeNode;

  public insertRule(ruleText: string, index?: number): number {
    const rule = createCssRuleFromText(ruleText);
    const insertIndex = typeof index === 'number' ? index : this.cssRules.length;

    this.cssRules.splice(insertIndex, 0, rule);

    return insertIndex;
  }
}

type Runtime = {
  context: Record<string, unknown>;
  documentElement: RuntimeNode;
  body: RuntimeNode;
  head: RuntimeNode;
  iframePostMessage: jest.Mock;
  localStorageSetItem: jest.Mock;
  setTheme: jest.Mock;
  flushAnimationFrames: ()=> void;
  flushTimers: ()=> void;
  dispatchMessage: (data: unknown, source?: { postMessage: jest.Mock })=> void;
  emitMutations: (mutations: Array<Record<string, unknown>>)=> void;
  addIframe: (iframe?: RuntimeNode)=> RuntimeNode;
};

const REPO_ROOT = path.join(__dirname, '../../../..');
const INSIGHT_EXAMPLE_ROOT = path.join(REPO_ROOT, 'insight-example');
const MAIN_HTML = path.join(INSIGHT_EXAMPLE_ROOT, 'index.html');
const TIMELINE_HTML = path.join(INSIGHT_EXAMPLE_ROOT, 'plugins/Timeline/index.html');
const INSIGHT_EXAMPLE_AVAILABLE =
  fs.existsSync(MAIN_HTML) && fs.existsSync(TIMELINE_HTML);

function injectThemeOverrides(html: string): string {
  return (
    InsightDataViewerPanel.prototype as unknown as {
      injectThemeOverrides: (source: string)=> string;
    }
  ).injectThemeOverrides(html);
}

function countOccurrences(source: string, token: string): number {
  return source.split(token).length - 1;
}

function extractInjectedScript(html: string): string {
  const match = html.match(/<script id="vscode-theme-overrides-script">([\s\S]*?)<\/script>/);

  expect(match).not.toBeNull();

  return match?.[1] ?? '';
}

function createStyle(initial: Record<string, string> = {}): StyleStore {
  const values = { ...initial };
  const priorities: Record<string, string> = {};
  const style = {
    values,
    getPropertyValue: jest.fn((name: string) => values[name] ?? ''),
    setProperty: jest.fn((name: string, value: string, priority = '') => {
      values[name] = value;
      priorities[name] = priority;
      syncMetadata();
    }),
    getPropertyPriority: jest.fn((name: string) => priorities[name] ?? ''),
    cssText: '',
    length: 0,
  } as StyleStore;

  const syncMetadata = (): void => {
    const propertyNames = Object.keys(values);

    for (let i = 0; i < style.length; i += 1) {
      delete style[i];
    }

    propertyNames.forEach((property, index) => {
      style[index] = property;
    });

    style.length = propertyNames.length;
    style.cssText = propertyNames
      .map((property) => `${property}: ${values[property]}`)
      .join('; ');
  };

  syncMetadata();

  return style;
}

function createNode(
  tagName: string,
  initialStyle: Record<string, string> = {},
  overrides: Partial<RuntimeNode> = {},
): RuntimeNode {
  return {
    nodeType: 1,
    tagName,
    id: overrides.id ?? '',
    rel: overrides.rel,
    dataset: overrides.dataset ?? {},
    className: overrides.className ?? '',
    style: overrides.style ?? createStyle(initialStyle),
    textContent: overrides.textContent ?? '',
    sheet: overrides.sheet,
    contentWindow: overrides.contentWindow,
    querySelectorAll: overrides.querySelectorAll
      ?? jest.fn(() => []),
  };
}

function createCssRuleFromText(ruleText: string): FakeCssRule {
  const declarationStart = ruleText.indexOf('{');
  const declarationEnd = ruleText.lastIndexOf('}');

  if (declarationStart < 0 || declarationEnd < 0 || declarationEnd <= declarationStart) {
    return {
      style: createStyle(),
      cssText: ruleText,
    };
  }

  const declarationText = ruleText.slice(declarationStart + 1, declarationEnd);
  const values = declarationText.split(';').reduce<Record<string, string>>((next, part) => {
    const separator = part.indexOf(':');

    if (separator > 0) {
      const name = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();

      if (name && value) {
        next[name] = value;
      }
    }

    return next;
  }, {});

  return {
    style: createStyle(values),
    cssText: ruleText,
  };
}

function createRuntime(options: {
  rootVars?: Record<string, string>;
  parent?: { postMessage: jest.Mock };
  deferAsyncCallbacks?: boolean;
  initialCssRules?: string[];
} = {}): Runtime {
  const messageListeners: Array<(event: { data: unknown; source?: { postMessage: jest.Mock } })=> void> = [];
  const observerCallbacks: Array<(mutations: Array<Record<string, unknown>>)=> void> = [];
  let nextAsyncId = 1;
  const animationFrames = new Map<number, ()=> void>();
  const timers = new Map<number, ()=> void>();

  const documentElement = createNode('HTML', options.rootVars, {
    dataset: { vscodeThemeKind: 'dark' },
    className: 'vscode-dark',
  });
  const body = createNode('BODY', {}, { className: 'theme_dark' });
  const head = createNode('HEAD');

  const styleElement = createNode('STYLE', {}, {
    id: 'insight-style',
  });

  class RuntimeCSSStyleSheet extends FakeCSSStyleSheet {}

  const styleSheet = new RuntimeCSSStyleSheet();
  styleSheet.ownerNode = styleElement;
  styleElement.sheet = styleSheet;
  (options.initialCssRules ?? []).forEach((rule) => {
    styleSheet.insertRule(rule);
  });

  const iframePostMessage = jest.fn();
  const iframes: RuntimeNode[] = [
    createNode('IFRAME', {}, {
      contentWindow: {
        postMessage: iframePostMessage,
      },
    }),
  ];

  const getElementsByTagName = (name: string): RuntimeNode[] => {
    const normalized = name.toLowerCase();

    if (normalized === 'iframe') {
      return iframes;
    }

    if (normalized === 'style') {
      return [styleElement];
    }

    return [];
  };

  const document = {
    documentElement,
    body,
    head,
    readyState: 'complete',
    styleSheets: [styleSheet],
    addEventListener: jest.fn(),
    getElementsByTagName: jest.fn(getElementsByTagName),
    querySelectorAll: jest.fn((selector: string) => {
      if (selector === 'iframe') {
        return iframes;
      }

      if (selector === 'style') {
        return [styleElement];
      }

      return [];
    }),
  };

  const localStorageSetItem = jest.fn();
  const setTheme = jest.fn();

  const flushCallbacks = (callbacks: Map<number, ()=> void>): void => {
    const queued = Array.from(callbacks.entries());

    callbacks.clear();
    queued.forEach(([, callback]) => callback());
  };

  const windowObject: Record<string, unknown> = {
    addEventListener: jest.fn((type: string, listener: (event: { data: unknown })=> void) => {
      if (type === 'message') {
        messageListeners.push(listener);
      }
    }),
    cancelAnimationFrame: jest.fn((id: number) => {
      animationFrames.delete(id);
    }),
    clearTimeout: jest.fn((id: number) => {
      timers.delete(id);
    }),
    console,
    getComputedStyle: jest.fn((element: RuntimeNode) => element.style),
    parent: options.parent,
    requestAnimationFrame: jest.fn((callback: ()=> void) => {
      if (options.deferAsyncCallbacks) {
        const id = nextAsyncId++;

        animationFrames.set(id, callback);

        return id;
      }

      callback();

      return 1;
    }),
    setTheme,
    setTimeout: jest.fn((callback: ()=> void) => {
      if (options.deferAsyncCallbacks) {
        const id = nextAsyncId++;

        timers.set(id, callback);

        return id;
      }

      callback();

      return 1;
    }),
  };

  if (!options.parent) {
    windowObject.parent = windowObject;
  }

  const context = {
    WeakMap,
    WeakSet,
    CSSStyleSheet: RuntimeCSSStyleSheet,
    console,
    document,
    localStorage: {
      setItem: localStorageSetItem,
    },
    MutationObserver: jest.fn().mockImplementation((callback: (mutations: Array<Record<string, unknown>>)=> void) => {
      observerCallbacks.push(callback);

      return {
        observe: jest.fn(),
        disconnect: jest.fn(),
      };
    }),
    window: windowObject,
  } as Record<string, unknown>;

  return {
    context,
    documentElement,
    body,
    head,
    iframePostMessage,
    localStorageSetItem,
    setTheme,
    flushAnimationFrames: () => flushCallbacks(animationFrames),
    flushTimers: () => flushCallbacks(timers),
    dispatchMessage: (data: unknown, source?: { postMessage: jest.Mock }) => {
      messageListeners.forEach((listener) => listener({ data, source }));
    },
    emitMutations: (mutations: Array<Record<string, unknown>>) => {
      observerCallbacks.forEach((callback) => callback(mutations));
    },
    addIframe: (iframe?: RuntimeNode) => {
      const nextIframe = iframe ?? createNode('IFRAME', {}, {
        contentWindow: {
          postMessage: jest.fn(),
        },
      });

      iframes.push(nextIframe);

      return nextIframe;
    },
  };
}

function runInjectedScript(script: string, runtime: Runtime): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- vm keeps this test independent from a browser/jsdom runtime.
  const vm = require('vm') as typeof import('vm');

  vm.runInNewContext(script, runtime.context);
}

function resetInjectedHtmlCache(): void {
  (InsightDataViewerPanel as unknown as {
    htmlCache: Map<string, { html: string; sizeBytes: number }>;
    htmlCacheSizeBytes: number;
  }).htmlCache = new Map<string, { html: string; sizeBytes: number }>();

  (InsightDataViewerPanel as unknown as {
    htmlCacheSizeBytes: number;
  }).htmlCacheSizeBytes = 0;
}

(INSIGHT_EXAMPLE_AVAILABLE ? describe : describe.skip)(
  'InsightDataViewerPanel theme override injection',
  () => {
    it('injects the theme bridge into real Insight HTML fixtures idempotently', () => {
      const mainHtml = fs.readFileSync(MAIN_HTML, 'utf8');
      const timelineHtml = fs.readFileSync(TIMELINE_HTML, 'utf8');

      const injectedMain = injectThemeOverrides(mainHtml);
      const injectedTimeline = injectThemeOverrides(timelineHtml);
      const injectedTwice = injectThemeOverrides(injectedMain);

      expect(injectedMain).toContain('id="vscode-theme-overrides"');
      expect(injectedMain).toContain('id="vscode-theme-overrides-script"');
      expect(injectedMain).toContain('vscodeThemeVars');
      expect(injectedMain).toContain('insightThemeVars');
      expect(injectedMain).toContain('requestThemeFromParent');
      expect(injectedMain).toContain('patchInsightStyleSheets');
      expect(injectedMain).toContain('scheduleThemeFlush');
      expect(injectedMain).toContain('.switch-theme');
      expect(injectedMain).toContain('.ant-input-affix-wrapper');
      expect(injectedMain).toContain('--mi-divider-color');
      expect(injectedMain).toContain('.splitLine');
      expect(injectedMain).toContain('padding: 0 !important');
      expect(injectedMain).toContain('"CacheFrameTooltip"');
      expect(injectedMain.indexOf('id="vscode-theme-overrides-script"'))
        .toBeLessThan(injectedMain.toLowerCase().indexOf('</head>'));

      expect(injectedTimeline).toContain('MindStudio Insight Timeline');
      expect(injectedTimeline).toContain('id="vscode-theme-overrides-script"');

      expect(countOccurrences(injectedTwice, 'id="vscode-theme-overrides"')).toBe(1);
      expect(countOccurrences(injectedTwice, 'id="vscode-theme-overrides-script"')).toBe(1);
      expect(countOccurrences(injectedTwice, '"CacheFrameTooltip"'))
        .toBe(countOccurrences(injectedTwice, '"CacheTooltip"'));
    });

    it('forwards computed VSCode variables from the parent webview into plugin iframes', () => {
      const script = extractInjectedScript(injectThemeOverrides(fs.readFileSync(MAIN_HTML, 'utf8')));
      const runtime = createRuntime({
        deferAsyncCallbacks: true,
        rootVars: {
          '--vscode-editor-background': '#123456',
          '--vscode-editor-foreground': '#abcdef',
          '--vscode-foreground': '#abcdee',
          '--vscode-editorWidget-background': '#223344',
          '--vscode-input-background': '#334455',
          '--vscode-widget-border': '#445566',
          '--vscode-panel-border': '#aa3344',
          '--vscode-focusBorder': '#5577ff',
          '--vscode-textLink-foreground': '#6688ff',
          '--vscode-textLink-activeForeground': '#7799ff',
          '--vscode-button-background': '#2255aa',
          '--vscode-button-hoverBackground': '#3366bb',
          '--vscode-button-foreground': '#ffffff',
          '--vscode-descriptionForeground': '#8899aa',
          '--vscode-disabledForeground': '#667788',
          '--vscode-editor-selectionBackground': '#314f78',
        },
      });

      runInjectedScript(script, runtime);
      runtime.dispatchMessage({
        command: 'updateTheme',
        themeKind: 'dark',
        themeName: 'dark',
        isDark: true,
        isHighContrast: false,
      });
      runtime.flushAnimationFrames();

      expect(runtime.iframePostMessage).toHaveBeenCalled();
      const forwarded = runtime.iframePostMessage.mock.calls.at(-1)?.[0];

      expect(forwarded.vscodeThemeVars['--vscode-editor-background']).toBe('#123456');
      expect(forwarded.vscodeThemeVars['--vscode-panel-border']).toBe('#aa3344');
      expect(forwarded.insightThemeVars['--mi-bg-color-dark']).toBe('#123456');
      expect(forwarded.insightThemeVars['--mi-text-color']).toBe('#abcdef');
      expect(forwarded.insightThemeVars['--mi-divider-color']).toBe('#aa3344');
      expect(runtime.documentElement.style.values['--mi-divider-color']).toBe('#aa3344');
      expect(forwarded.themeKind).toBe('dark');
    });

    it('applies only the latest generation for burst updateTheme events', () => {
      const script = extractInjectedScript(injectThemeOverrides(fs.readFileSync(MAIN_HTML, 'utf8')));
      const runtime = createRuntime({ deferAsyncCallbacks: true });

      runInjectedScript(script, runtime);
      runtime.flushAnimationFrames();
      runtime.iframePostMessage.mockClear();

      runtime.dispatchMessage({
        command: 'updateTheme',
        themeKind: 'dark',
        themeName: 'dark',
        isDark: true,
        isHighContrast: false,
        insightThemeVars: {
          '--mi-bg-color-dark': '#111111',
          '--mi-text-color': '#eeeeee',
        },
      });
      runtime.dispatchMessage({
        command: 'updateTheme',
        themeKind: 'light',
        themeName: 'light',
        isDark: false,
        isHighContrast: false,
        insightThemeVars: {
          '--mi-bg-color-dark': '#222222',
          '--mi-text-color': '#dddddd',
        },
      });
      runtime.dispatchMessage({
        command: 'updateTheme',
        themeKind: 'high-contrast',
        themeName: 'dark',
        isDark: true,
        isHighContrast: true,
        insightThemeVars: {
          '--mi-bg-color-dark': '#333333',
          '--mi-text-color': '#cccccc',
        },
      });

      expect(runtime.iframePostMessage).not.toHaveBeenCalled();

      runtime.flushAnimationFrames();

      expect(runtime.iframePostMessage).toHaveBeenCalledTimes(1);
      const forwarded = runtime.iframePostMessage.mock.calls[0][0];

      expect(forwarded.themeKind).toBe('high-contrast');
      expect(forwarded.insightThemeVars['--mi-bg-color-dark']).toBe('#333333');
      expect(runtime.documentElement.style.values['--mi-bg-color-dark']).toBe('#333333');
      expect(runtime.documentElement.style.values['--mi-text-color']).toBe('#cccccc');
    });

    it('queues CSSOM insertRule patching and applies replacements on the next frame', () => {
      const script = extractInjectedScript(injectThemeOverrides(fs.readFileSync(MAIN_HTML, 'utf8')));
      const runtime = createRuntime({ deferAsyncCallbacks: true });
      const document = runtime.context.document as {
        styleSheets: FakeCSSStyleSheet[];
      };
      const sheet = document.styleSheets[0];

      runInjectedScript(script, runtime);
      runtime.dispatchMessage({
        command: 'updateTheme',
        themeKind: 'dark',
        themeName: 'dark',
        isDark: true,
        isHighContrast: false,
        insightThemeVars: {
          '--mi-bg-color-light': '#303132',
          '--mi-text-color-secondary': '#505152',
          '--mi-border-color-light': '#606162',
        },
      });
      runtime.flushAnimationFrames();
      expect((runtime.context.CSSStyleSheet as any).prototype.__vscodeInsightThemeInsertRulePatched).toBe(true);

      sheet.insertRule(
        '.row { background: rgb(42, 47, 55); color: rgb(211, 220, 233); box-shadow: rgb(62, 69, 81) 0px -1px 0px 0px inset; }',
        0,
      );

      expect(sheet.cssRules[0].style.values.background).toBe('rgb(42, 47, 55)');
      runtime.flushAnimationFrames();

      expect(sheet.cssRules[0].style.values.background).toBe('#303132');
      expect(sheet.cssRules[0].style.values.color).toBe('#505152');
      expect(sheet.cssRules[0].style.values['box-shadow']).toBe(
        '#606162 0px -1px 0px 0px inset',
      );
    });

    it('handles nested dynamic style and iframe insertion from subtree mutations', () => {
      const script = extractInjectedScript(injectThemeOverrides(fs.readFileSync(MAIN_HTML, 'utf8')));
      const runtime = createRuntime({ deferAsyncCallbacks: true });

      runInjectedScript(script, runtime);
      runtime.dispatchMessage({
        command: 'updateTheme',
        themeKind: 'dark',
        themeName: 'dark',
        isDark: true,
        isHighContrast: false,
      });
      runtime.flushAnimationFrames();
      runtime.iframePostMessage.mockClear();

      const nestedIframePostMessage = jest.fn();
      const nestedIframe = runtime.addIframe(createNode('IFRAME', {}, {
        contentWindow: {
          postMessage: nestedIframePostMessage,
        },
      }));
      const nestedStyle = createNode('STYLE', {}, {
        id: 'dynamic-style',
      });
      const wrapper = createNode('DIV', {}, {
        querySelectorAll: jest.fn((selector: string) => {
          if (selector === 'style,link[rel="stylesheet"],iframe') {
            return [nestedStyle, nestedIframe];
          }

          return [];
        }),
      });

      runtime.emitMutations([
        {
          type: 'childList',
          target: runtime.body,
          addedNodes: [wrapper],
        },
      ]);

      runtime.flushAnimationFrames();

      expect(nestedIframePostMessage).toHaveBeenCalledTimes(1);
      const forwarded = nestedIframePostMessage.mock.calls[0][0];

      expect(forwarded.command).toBe('updateTheme');
      expect(forwarded.themeKind).toBe('dark');
    });

    it('handles late stylesheet link insertion and forwards the latest theme once', () => {
      const script = extractInjectedScript(injectThemeOverrides(fs.readFileSync(MAIN_HTML, 'utf8')));
      const runtime = createRuntime({ deferAsyncCallbacks: true });

      runInjectedScript(script, runtime);
      runtime.dispatchMessage({
        command: 'updateTheme',
        themeKind: 'dark',
        themeName: 'dark',
        isDark: true,
        isHighContrast: false,
      });
      runtime.flushAnimationFrames();
      runtime.iframePostMessage.mockClear();

      const link = createNode('LINK', {}, {
        rel: 'stylesheet',
      });

      runtime.emitMutations([
        {
          type: 'childList',
          target: runtime.head,
          addedNodes: [link],
        },
      ]);

      expect(runtime.iframePostMessage).not.toHaveBeenCalled();
      runtime.flushAnimationFrames();

      expect(runtime.iframePostMessage).toHaveBeenCalledTimes(1);
      expect(runtime.iframePostMessage.mock.calls[0][0].themeKind).toBe('dark');
    });

    it('reuses transformed HTML from cache on warm reads', async () => {
      resetInjectedHtmlCache();

      const panelLike = Object.create(InsightDataViewerPanel.prototype) as {
        injectThemeOverrides: jest.Mock<string, [string]>;
        readInjectedHtmlFile: (htmlPath: string, allowMissing?: boolean)=> Promise<string | null>;
      };
      panelLike.injectThemeOverrides = jest.fn((source: string) => `${source}\n<!-- transformed -->`);

      const cold = await panelLike.readInjectedHtmlFile(MAIN_HTML);
      const warm = await panelLike.readInjectedHtmlFile(MAIN_HTML);

      expect(cold).toContain('<!-- transformed -->');
      expect(warm).toBe(cold);
      expect(panelLike.injectThemeOverrides).toHaveBeenCalledTimes(1);
    });
  },
);
