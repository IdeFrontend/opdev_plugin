jest.mock('i18next', () => ({ t: (key: string) => key }));

jest.mock(
  'vscode',
  () => ({
    ColorThemeKind: {
      Light: 1,
      Dark: 2,
      HighContrast: 3,
      HighContrastLight: 4,
    },
    ViewColumn: { Active: 1 },
    Uri: { parse: jest.fn((value: string) => ({ value })) },
    commands: { executeCommand: jest.fn() },
    env: { openExternal: jest.fn() },
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

jest.mock('../environment-variable-reader', () => ({ EnvironmentVariableReader: { getEnv: jest.fn(() => undefined) } }));

jest.mock('../node-webview-socket-bridge', () => ({ NodeWebviewSocketBridge: jest.fn(() => ({ dispose: jest.fn() })) }));

jest.mock('../webview-message-list', () => ({
  __esModule: true,
  default: [],
}));

import { InsightDataViewerPanel } from '../insight-data-viewer-panel';

const SAMPLE_HTML =
  '<!DOCTYPE html><html><head><title>x</title></head><body><div id="app"></div></body></html>';

function injectThemeOverrides(html: string): string {
  return (
    InsightDataViewerPanel.prototype as unknown as {
      injectThemeOverrides: (source: string, includeLoadingOverlay?: boolean)=> string;
    }
  ).injectThemeOverrides(html, true);
}

function countOccurrences(source: string, token: string): number {
  return source.split(token).length - 1;
}

function extractLoaderScript(html: string): string {
  const match = html.match(/<script id="hw-insight-loader-script">([\s\S]*?)<\/script>/);

  expect(match).not.toBeNull();

  return match?.[1] ?? '';
}

type ScheduledTimer = { fn: ()=> void;
  ms: number };

type LoaderRuntime = {
  context: Record<string, unknown>;
  dispatchMessage: (data: unknown)=> void;
  flushTimers: (maxMs?: number)=> void;
  hasHideClass: ()=> boolean;
  isRemoved: ()=> boolean;
};

function createLoaderRuntime(): LoaderRuntime {
  const messageListeners: Array<(event: { data: unknown })=> void> = [];
  const timers: ScheduledTimer[] = [];
  const classes = new Set<string>();
  let removed = false;

  const loaderElement = {
    classList: { add: (name: string) => classes.add(name) },
    parentNode: {
      removeChild: () => {
        removed = true;
      },
    },
  };

  const windowObject: Record<string, unknown> = {
    addEventListener: jest.fn((type: string, listener: (event: { data: unknown })=> void) => {
      if (type === 'message') {
        messageListeners.push(listener);
      }
    }),
    setTimeout: jest.fn((fn: ()=> void, ms = 0) => {
      timers.push({
        fn,
        ms,
      });

      return timers.length;
    }),
  };

  const document = { getElementById: jest.fn((id: string) => (id === 'hw-insight-loader' ? loaderElement : null)) };

  const context = {
    window: windowObject,
    document,
    console,
  } as Record<string, unknown>;

  return {
    context,
    dispatchMessage: (data: unknown) => {
      messageListeners.forEach((listener) => listener({ data }));
    },
    flushTimers: (maxMs = Number.POSITIVE_INFINITY) => {
      const due = timers.filter((timer) => timer.ms <= maxMs);

      due.forEach((timer) => {
        const index = timers.indexOf(timer);

        if (index >= 0) {
          timers.splice(index, 1);
        }
      });
      due.forEach((timer) => timer.fn());
    },
    hasHideClass: () => classes.has('hw-hide'),
    isRemoved: () => removed,
  };
}

function runLoaderScript(script: string, runtime: LoaderRuntime): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- vm keeps this test independent from a browser/jsdom runtime.
  const vm = require('vm') as typeof import('vm');

  vm.runInNewContext(script, runtime.context);
}

describe('InsightDataViewerPanel loading overlay injection', () => {
  it('injects the Huawei linear-bar overlay markup, styles, and script', () => {
    const injected = injectThemeOverrides(SAMPLE_HTML);

    expect(injected)
      .toContain('id="hw-insight-loader"');
    expect(injected)
      .toContain('class="hw-loader--bar"');
    expect(injected)
      .toContain('id="hw-insight-loader-style"');
    expect(injected)
      .toContain('id="hw-insight-loader-script"');
    expect(injected)
      .toContain('#c7000b');
    expect(injected)
      .toContain('@keyframes hw-bar');
    expect(injected)
      .toContain('prefers-reduced-motion');
    // The caption is resolved through i18next (mocked to echo the key here).
    expect(injected)
      .toContain('insight.loadingProfilingData');
  });

  it('places the overlay inside <body> and the theme bridge inside <head>', () => {
    const injected = injectThemeOverrides(SAMPLE_HTML);

    const bodyOpen = injected.indexOf('<body>');
    const bodyClose = injected.indexOf('</body>');
    const loaderStart = injected.indexOf('hw-insight-loader:start');

    expect(loaderStart)
      .toBeGreaterThan(bodyOpen);
    expect(loaderStart)
      .toBeLessThan(bodyClose);

    expect(injected.indexOf('id="vscode-theme-overrides-script"'))
      .toBeLessThan(injected.toLowerCase()
        .indexOf('</head>'));
  });

  it('is idempotent when re-injected over already-injected HTML', () => {
    const once = injectThemeOverrides(SAMPLE_HTML);
    const twice = injectThemeOverrides(once);

    expect(countOccurrences(twice, 'hw-insight-loader:start'))
      .toBe(1);
    expect(countOccurrences(twice, 'id="hw-insight-loader-style"'))
      .toBe(1);
    expect(countOccurrences(twice, 'id="hw-insight-loader-script"'))
      .toBe(1);
  });

  it('hides the overlay when renderAllIframes arrives', () => {
    const runtime = createLoaderRuntime();

    runLoaderScript(extractLoaderScript(injectThemeOverrides(SAMPLE_HTML)), runtime);
    runtime.dispatchMessage({
      command: 'renderAllIframes',
      iframes: [],
    });

    // Only the short grace timer should run — not the 20s fail-safe.
    runtime.flushTimers(1000);
    expect(runtime.hasHideClass())
      .toBe(true);

    // The deferred removal timer detaches the overlay node.
    runtime.flushTimers(1000);
    expect(runtime.isRemoved())
      .toBe(true);
  });

  it('hides the overlay on explicit load failure and on websocket data', () => {
    const failureRuntime = createLoaderRuntime();

    runLoaderScript(extractLoaderScript(injectThemeOverrides(SAMPLE_HTML)), failureRuntime);
    failureRuntime.dispatchMessage({ command: 'insightLoadFailed' });
    failureRuntime.flushTimers(1000);
    expect(failureRuntime.hasHideClass())
      .toBe(true);

    const wsRuntime = createLoaderRuntime();

    runLoaderScript(extractLoaderScript(injectThemeOverrides(SAMPLE_HTML)), wsRuntime);
    wsRuntime.dispatchMessage({
      type: 'ws:message',
      payload: 'data',
    });
    wsRuntime.flushTimers(1000);
    expect(wsRuntime.hasHideClass())
      .toBe(true);
  });

  it('ignores unrelated messages but always clears via the fail-safe timeout', () => {
    const runtime = createLoaderRuntime();

    runLoaderScript(extractLoaderScript(injectThemeOverrides(SAMPLE_HTML)), runtime);

    runtime.dispatchMessage({ command: 'updateTheme' });
    runtime.dispatchMessage({ type: 'ws:opened' });
    runtime.flushTimers(1000);
    expect(runtime.hasHideClass())
      .toBe(false);

    // The fail-safe (20s) guarantees the overlay never traps the user.
    runtime.flushTimers();
    expect(runtime.hasHideClass())
      .toBe(true);
  });

  it('does not inject the overlay into per-plugin iframe HTML (default off)', () => {
    const injected = (
      InsightDataViewerPanel.prototype as unknown as {
        injectThemeOverrides: (source: string, includeLoadingOverlay?: boolean)=> string;
      }
    ).injectThemeOverrides(SAMPLE_HTML);

    // The theme bridge is still applied to iframes, but never the loader overlay.
    expect(injected)
      .toContain('id="vscode-theme-overrides-script"');
    expect(injected)
      .not.toContain('hw-insight-loader');
  });

  it('injects before the real (last) </body>, not one inside an inline script string', () => {
    // The bundled Insight SPA inlines minified JS whose print/export feature
    // builds an HTML string containing a literal "</body>"; injecting before
    // the first match would split that <script> and render the rest as text.
    const trickyHtml =
      '<!DOCTYPE html><html><head><title>x</title></head><body>'
      + '<div id="app"></div>'
      + '<script>var b="<body style=\\"margin:0\\">x</body>";window.__b=b;</script>'
      + '</body></html>';

    const injected = injectThemeOverrides(trickyHtml);

    // The inline script string must remain intact (not split by the overlay).
    expect(injected)
      .toContain('var b="<body style=\\"margin:0\\">x</body>";window.__b=b;');
    // The overlay is injected exactly once, after the inline script.
    expect(countOccurrences(injected, 'hw-insight-loader:start'))
      .toBe(1);
    expect(injected.indexOf('hw-insight-loader:start'))
      .toBeGreaterThan(injected.indexOf('window.__b=b;'));
    // ...and before the real, document-closing </body> (the last occurrence).
    expect(injected.indexOf('hw-insight-loader:end'))
      .toBeLessThan(injected.lastIndexOf('</body>'));
  });
});
