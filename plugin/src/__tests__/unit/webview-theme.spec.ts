import {
  WebviewThemeKind,
  WebviewThemeName,
  buildWebviewThemePayload,
  handleThemeRequest,
  postCurrentTheme,
  registerWebviewThemeBridge,
} from '@plugin/core/view/webview-theme';

jest.mock('vscode', () => {
  const activeColorTheme = { kind: 2 };
  const themeChangeListeners: Array<(theme: { kind: number })=> void> = [];
  const dispose = jest.fn();

  return {
    ColorThemeKind: {
      Light: 1,
      Dark: 2,
      HighContrast: 3,
      HighContrastLight: 4,
    },
    window: {
      activeColorTheme,
      onDidChangeActiveColorTheme: jest.fn((listener: (theme: { kind: number })=> void) => {
        themeChangeListeners.push(listener);

        return { dispose };
      }),
    },
    __test: {
      activeColorTheme,
      themeChangeListeners,
      dispose,
    },
  };
});

const vscodeMock = jest.requireMock('vscode') as {
  __test: {
    activeColorTheme: { kind: number };
    themeChangeListeners: Array<(theme: { kind: number })=> void>;
    dispose: jest.Mock;
  };
};

function makeWebview(): { postMessage: jest.Mock } {
  return {
    postMessage: jest.fn()
      .mockResolvedValue(true),
  };
}

describe('webview-theme payloads', () => {
  it('maps every ColorThemeKind to the matching WebviewThemeKind', () => {
    expect(buildWebviewThemePayload(1 as never))
      .toEqual({
        command: 'updateTheme',
        themeKind: WebviewThemeKind.Light,
        themeName: WebviewThemeName.Light,
        isDark: false,
        isHighContrast: false,
      });
    expect(buildWebviewThemePayload(2 as never))
      .toEqual(expect.objectContaining({
        themeKind: WebviewThemeKind.Dark,
        themeName: WebviewThemeName.Dark,
        isDark: true,
        isHighContrast: false,
      }));
    expect(buildWebviewThemePayload(3 as never))
      .toEqual(expect.objectContaining({
        themeKind: WebviewThemeKind.HighContrast,
        themeName: WebviewThemeName.Dark,
        isDark: true,
        isHighContrast: true,
      }));
    expect(buildWebviewThemePayload(4 as never))
      .toEqual(expect.objectContaining({
        themeKind: WebviewThemeKind.HighContrastLight,
        themeName: WebviewThemeName.Light,
        isDark: false,
        isHighContrast: true,
      }));
  });

  it('falls back to the dark theme for an unknown kind', () => {
    expect(buildWebviewThemePayload(99 as never))
      .toEqual(expect.objectContaining({
        themeKind: WebviewThemeKind.Dark,
        isDark: true,
        isHighContrast: false,
      }));
  });

  it('defaults to the active color theme when no kind is passed', () => {
    vscodeMock.__test.activeColorTheme.kind = 1;

    expect(buildWebviewThemePayload())
      .toEqual(expect.objectContaining({ themeKind: WebviewThemeKind.Light }));

    vscodeMock.__test.activeColorTheme.kind = 3;

    expect(buildWebviewThemePayload())
      .toEqual(expect.objectContaining({ themeKind: WebviewThemeKind.HighContrast }));
  });
});

describe('postCurrentTheme and registerWebviewThemeBridge', () => {
  beforeEach(() => {
    vscodeMock.__test.activeColorTheme.kind = 2;
  });

  afterEach(() => {
    vscodeMock.__test.themeChangeListeners.length = 0;
  });

  it('posts the current theme payload to the webview', async () => {
    const webview = makeWebview();

    await postCurrentTheme(webview as never);

    expect(webview.postMessage)
      .toHaveBeenCalledWith(expect.objectContaining({
        command: 'updateTheme',
        themeKind: WebviewThemeKind.Dark,
      }));
  });

  it('posts immediately on registration and follows theme changes', () => {
    const webview = makeWebview();
    const disposable = registerWebviewThemeBridge(webview as never);

    expect(webview.postMessage)
      .toHaveBeenCalledWith(expect.objectContaining({ command: 'updateTheme' }));

    vscodeMock.__test.themeChangeListeners[0]!({ kind: 1 });

    expect(webview.postMessage)
      .toHaveBeenLastCalledWith(expect.objectContaining({ themeKind: WebviewThemeKind.Light }));

    disposable.dispose();
    expect(vscodeMock.__test.dispose)
      .toHaveBeenCalled();
  });
});

describe('handleThemeRequest', () => {
  it('rejects messages that are not objects or lack the getTheme command', () => {
    const webview = makeWebview();

    expect(handleThemeRequest(webview as never, null))
      .toBe(false);
    expect(handleThemeRequest(webview as never, 'getTheme'))
      .toBe(false);
    expect(handleThemeRequest(webview as never, { command: 'run' }))
      .toBe(false);
    expect(handleThemeRequest(webview as never, {}))
      .toBe(false);
    expect(webview.postMessage)
      .not.toHaveBeenCalled();
  });

  it('answers a getTheme request with the current theme payload', async () => {
    const webview = makeWebview();

    expect(handleThemeRequest(webview as never, { command: 'getTheme' }))
      .toBe(true);

    expect(webview.postMessage)
      .toHaveBeenCalledWith(expect.objectContaining({
        command: 'updateTheme',
        themeKind: WebviewThemeKind.Dark,
      }));
    await expect(webview.postMessage.mock.results[0]!.value)
      .resolves
      .toBe(true);
  });
});
