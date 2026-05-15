import {
  test,
  expect,
} from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import * as vm from 'vm';

const REPO_ROOT = path.resolve(__dirname, '../..');
const PANEL_SOURCE = path.join(REPO_ROOT, 'plugin/src/class/insight-data-viewer-panel.ts');
const MAIN_HTML = path.join(REPO_ROOT, 'insight-example/index.html');
const TIMELINE_HTML = path.join(REPO_ROOT, 'insight-example/plugins/Timeline/index.html');

function loadInsightPanelClass(): {
  prototype: { injectThemeOverrides: (html: string)=> string };
} {
  const source = fs.readFileSync(PANEL_SOURCE, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const module = { exports: {} as Record<string, unknown> };
  const customRequire = (id: string) => {
    if (id === 'i18next') {
      return { t: (key: string) => key };
    }

    if (id === 'vscode') {
      return {
        ColorThemeKind: {
          Light: 1,
          Dark: 2,
          HighContrast: 3,
          HighContrastLight: 4,
        },
        ViewColumn: { Active: 1 },
        Uri: { parse: (value: string) => ({ value }) },
        commands: { executeCommand: () => undefined },
        env: { openExternal: () => undefined },
        window: {
          activeColorTheme: { kind: 2 },
          onDidChangeActiveColorTheme: () => ({ dispose: () => undefined }),
          showErrorMessage: () => undefined,
          showInformationMessage: () => undefined,
          showWarningMessage: () => undefined,
        },
      };
    }

    if (id === './node-webview-socket-bridge') {
      return { NodeWebviewSocketBridge: class {} };
    }

    if (id === './webview-message-list') {
      return {
        __esModule: true,
        default: [],
      };
    }

    if (id === './command-options') {
      return { CommandExecutor: class {} };
    }

    if (id === './environment-variable-reader') {
      return { EnvironmentVariableReader: { getEnv: () => '' } };
    }

    if (id === '../core/view/webview-theme') {
      return {
        handleThemeRequest: () => false,
        postCurrentTheme: () => Promise.resolve(true),
        registerWebviewThemeBridge: () => ({ dispose: () => undefined }),
      };
    }

    return require(id);
  };

  vm.runInNewContext(compiled, {
    __dirname: path.dirname(PANEL_SOURCE),
    __filename: PANEL_SOURCE,
    console,
    exports: module.exports,
    module,
    process,
    require: customRequire,
  });

  return module.exports.InsightDataViewerPanel as {
    prototype: { injectThemeOverrides: (html: string)=> string };
  };
}

function injectThemeOverrides(html: string): string {
  return loadInsightPanelClass().prototype.injectThemeOverrides(html);
}

function extractInjectedAssets(html: string): string {
  const style = html.match(/<style id="vscode-theme-overrides">[\s\S]*?<\/style>/)?.[0];
  const script = html.match(/<script id="vscode-theme-overrides-script">[\s\S]*?<\/script>/)?.[0];

  if (!style || !script) {
    throw new Error('Insight theme override injection was not found');
  }

  return `${style}\n${script}`;
}

function escapeScriptString(value: string): string {
  return JSON.stringify(value)
    .replace(/<\//g, '<\\/');
}

test.describe('Insight theme bridge browser verification', () => {
  test.skip(
    !fs.existsSync(MAIN_HTML) || !fs.existsSync(TIMELINE_HTML),
    'insight-example fixture is required',
  );

  test('passes VSCode theme variables from parent webview into Timeline iframe', async ({ page }) => {
    const mainInjected = injectThemeOverrides(fs.readFileSync(MAIN_HTML, 'utf8'));
    const timelineHtml = fs.readFileSync(TIMELINE_HTML, 'utf8');
    const timelineInjected = injectThemeOverrides(timelineHtml);
    const parentAssets = extractInjectedAssets(mainInjected);
    const timelineAssets = extractInjectedAssets(timelineInjected);
    const timelineThemeStyleStart = timelineHtml.indexOf('body.theme_dark');
    const timelineThemeStyle = timelineHtml.slice(
      timelineThemeStyleStart,
      timelineThemeStyleStart + 2600,
    );
    const iframeHtml = `<!doctype html>
<html>
<head>
  <style id="timeline-style">${timelineThemeStyle}</style>
  <style id="hit-label-style">.theme_dark .hit-label > span { color: var(--grey10); }</style>
  <style id="ant-input-style">
    .ant-input-affix-wrapper {
      background-color: #fff;
      border: 1px solid #d9d9d9;
      color: rgba(0, 0, 0, .85);
    }

    .ant-input-affix-wrapper > input.ant-input {
      background-color: transparent;
      color: rgba(0, 0, 0, .85);
    }
  </style>
  <style id="insight-splitter-style">
    .insight-splitter > .bottomC {
      border-top: #000 2px solid;
    }

    .insight-splitter > .bottomC > .splitLine {
      border-bottom: #000 1px solid;
    }
  </style>
  <style id="emotion-cssom-runtime"></style>
  ${timelineAssets}
</head>
<body class="theme_dark">
  <div id="root">Timeline</div>
  <div class="hit-label">
    <span id="hit-label-text">Line :, Related Instructions Count : <span id="hit-count">0</span></span>
  </div>
  <span id="filter-input-wrapper" class="ant-input-affix-wrapper css-q3m2t0">
    <input id="filter-input" class="ant-input" placeholder="Please enter" />
  </span>
  <div id="custom-row" class="css-ry7kws">Generated row</div>
  <div id="generated-panel" class="css-qmy4eb">Generated panel</div>
  <div id="generated-card" class="css-h8pm21"><div id="generated-card-head" class="ant-card-head">Generated card</div></div>
  <div class="insight-splitter">
    <div id="splitter-bottom" class="bottomC">
      <div id="splitter-line" class="splitLine"></div>
      <div class="dragContainer"></div>
    </div>
  </div>
</body>
</html>`;
    const lateIframeHtml = `<!doctype html>
<html>
<head>
  ${timelineAssets}
</head>
<body class="theme_dark">
  <div id="late-root">Late Timeline</div>
</body>
</html>`;

    await page.setContent(`<!doctype html>
<html>
<head>
  <style id="vscode-theme-vars">
    :root {
      --vscode-editor-background: #123456;
      --vscode-editor-foreground: #abcdef;
      --vscode-foreground: #abcdee;
      --vscode-descriptionForeground: #8899aa;
      --vscode-disabledForeground: #667788;
      --vscode-editorWidget-background: #223344;
      --vscode-input-background: #334455;
      --vscode-input-foreground: #ddeeff;
      --vscode-widget-border: #445566;
      --vscode-panel-border: #ab1234;
      --vscode-focusBorder: #5577ff;
      --vscode-textLink-foreground: #6688ff;
      --vscode-textLink-activeForeground: #7799ff;
      --vscode-button-background: #2255aa;
      --vscode-button-hoverBackground: #3366bb;
      --vscode-button-foreground: #ffffff;
      --vscode-editor-selectionBackground: #314f78;
    }
  </style>
  ${parentAssets}
</head>
<body style="padding: 0 20px;">
  <button id="theme-toggle" class="ant-switch ant-switch-small switch-theme switch-theme-dark" role="switch"></button>
  <iframe id="plugin"></iframe>
  <script>
    const iframe = document.getElementById('plugin');
    const iframeHtml = ${escapeScriptString(iframeHtml)};
    iframe.contentDocument.open();
    iframe.contentDocument.write(iframeHtml);
    iframe.contentDocument.close();
    window.dispatchEvent(new MessageEvent('message', {
      data: {
        command: 'updateTheme',
        themeKind: 'dark',
        themeName: 'dark',
        isDark: true,
        isHighContrast: false
      }
    }));
  </script>
</body>
</html>`);

    const frame = page.frameLocator('#plugin');

    await expect(page.locator('#theme-toggle')).toBeHidden();
    await expect(page.locator('body')).toHaveCSS('padding-left', '0px');
    await expect(page.locator('body')).toHaveCSS('padding-right', '0px');

    await expect.poll(async () => frame.locator('html')
      .evaluate((html) => getComputedStyle(html).getPropertyValue('--vscode-editor-background')
        .trim()))
      .toBe('#123456');
    await expect.poll(async () => frame.locator('html')
      .evaluate((html) => getComputedStyle(html).getPropertyValue('--mi-bg-color-dark')
        .trim()))
      .toBe('#123456');
    await expect.poll(async () => frame.locator('html')
      .evaluate((html) => getComputedStyle(html).getPropertyValue('--mi-text-color')
        .trim()))
      .toBe('#abcdef');

    await page.evaluate((html) => {
      const lateIframe = document.createElement('iframe');

      lateIframe.id = 'late-plugin';
      document.body.appendChild(lateIframe);
      lateIframe.contentDocument?.open();
      lateIframe.contentDocument?.write(html);
      lateIframe.contentDocument?.close();
    }, lateIframeHtml);

    const lateFrame = page.frameLocator('#late-plugin');

    await expect.poll(async () => lateFrame.locator('html')
      .evaluate((html) => getComputedStyle(html).getPropertyValue('--vscode-editor-background')
        .trim()))
      .toBe('#123456');
    await expect.poll(async () => lateFrame.locator('html')
      .evaluate((html) => getComputedStyle(html).getPropertyValue('--mi-bg-color-dark')
        .trim()))
      .toBe('#123456');

    const patchedStyle = await frame.locator('#timeline-style')
      .evaluate((style) => style.textContent ?? '');
    const hitLabelText = frame.locator('#hit-label-text');
    const filterInputWrapper = frame.locator('#filter-input-wrapper');
    const filterInput = frame.locator('#filter-input');
    const generatedRow = frame.locator('#custom-row');
    const generatedPanel = frame.locator('#generated-panel');
    const generatedCardHead = frame.locator('#generated-card-head');
    const splitterBottom = frame.locator('#splitter-bottom');
    const splitterLine = frame.locator('#splitter-line');

    expect(patchedStyle).toContain('#123456');
    expect(patchedStyle).toContain('#abcdef');
    expect(patchedStyle).not.toContain('#181b20');
    expect(patchedStyle).not.toContain('#d2dce9');
    await expect(hitLabelText).toHaveCSS('color', 'rgb(171, 205, 239)');
    await expect(filterInputWrapper).toHaveCSS('background-color', 'rgb(51, 68, 85)');
    await expect(filterInputWrapper).toHaveCSS('border-color', 'rgb(68, 85, 102)');
    await expect(filterInputWrapper).toHaveCSS('color', 'rgb(221, 238, 255)');
    await expect(filterInput).toHaveCSS('color', 'rgb(221, 238, 255)');
    await expect(splitterBottom).toHaveCSS('border-top-color', 'rgb(171, 18, 52)');
    await expect(splitterLine).toHaveCSS('border-bottom-color', 'rgb(171, 18, 52)');

    await page.locator('#vscode-theme-vars')
      .evaluate((style) => {
        style.textContent = `
          :root {
            --vscode-editor-background: #654321;
            --vscode-editor-foreground: #fedcba;
            --vscode-foreground: #fedcbb;
            --vscode-descriptionForeground: #aabbcc;
            --vscode-disabledForeground: #778899;
            --vscode-editorWidget-background: #213243;
            --vscode-input-background: #314253;
            --vscode-input-foreground: #eeddcc;
            --vscode-widget-border: #425364;
            --vscode-panel-border: #ba4321;
            --vscode-focusBorder: #6655ff;
            --vscode-textLink-foreground: #7766ff;
            --vscode-textLink-activeForeground: #8877ff;
            --vscode-button-background: #5522aa;
            --vscode-button-hoverBackground: #6633bb;
            --vscode-button-foreground: #ffffff;
            --vscode-editor-selectionBackground: #784f31;
          }
        `;
        window.dispatchEvent(new MessageEvent('message', {
          data: {
            command: 'updateTheme',
            themeKind: 'light',
            themeName: 'light',
            isDark: false,
            isHighContrast: false,
          },
        }));
      });

    await expect.poll(async () => frame.locator('html')
      .evaluate((html) => getComputedStyle(html).getPropertyValue('--vscode-editor-background')
        .trim()))
      .toBe('#654321');
    await expect.poll(async () => frame.locator('html')
      .evaluate((html) => getComputedStyle(html).getPropertyValue('--mi-bg-color-dark')
        .trim()))
      .toBe('#654321');
    await expect.poll(async () => frame.locator('html')
      .evaluate((html) => getComputedStyle(html).getPropertyValue('--mi-text-color')
        .trim()))
      .toBe('#fedcba');
    await expect(hitLabelText).toHaveCSS('color', 'rgb(254, 220, 186)');
    await expect(filterInputWrapper).toHaveCSS('background-color', 'rgb(49, 66, 83)');
    await expect(filterInputWrapper).toHaveCSS('border-color', 'rgb(66, 83, 100)');
    await expect(filterInputWrapper).toHaveCSS('color', 'rgb(238, 221, 204)');
    await expect(filterInput).toHaveCSS('color', 'rgb(238, 221, 204)');
    await expect(splitterBottom).toHaveCSS('border-top-color', 'rgb(186, 67, 33)');
    await expect(splitterLine).toHaveCSS('border-bottom-color', 'rgb(186, 67, 33)');

    await page.waitForTimeout(1100);
    await frame.locator('#emotion-cssom-runtime')
      .evaluate((styleElement) => {
        const style = styleElement as HTMLStyleElement;
        const generatedRules = [
          '.css-ry7kws { background: rgb(42, 47, 55); color: rgb(211, 220, 233); box-shadow: rgb(62, 69, 81) 0px -1px 0px 0px inset; }',
          '.css-qmy4eb { background: rgb(31,35,41); color: rgb(210,220,233); }',
          '.css-h8pm21 .ant-card-head { background: rgb(24, 27, 32); border-bottom: 1px solid rgb(62,69,81); }',
        ];

        generatedRules.forEach((rule, index) => style.sheet?.insertRule(rule, index));
      });

    await expect(generatedRow).toHaveCSS('background-color', 'rgb(49, 66, 83)');
    await expect(generatedRow).toHaveCSS('color', 'rgb(170, 187, 204)');
    await expect(generatedRow).toHaveCSS(
      'box-shadow',
      'rgb(66, 83, 100) 0px -1px 0px 0px inset',
    );
    await expect(generatedPanel).toHaveCSS('background-color', 'rgb(33, 50, 67)');
    await expect(generatedPanel).toHaveCSS('color', 'rgb(254, 220, 186)');
    await expect(generatedCardHead).toHaveCSS('background-color', 'rgb(101, 67, 33)');
    await expect(generatedCardHead).toHaveCSS('border-bottom-color', 'rgb(66, 83, 100)');

    await frame.locator('body')
      .evaluate((body) => {
        body.ownerDocument.defaultView?.dispatchEvent(new MessageEvent('message', {
          data: {
            command: 'updateTheme',
            themeKind: 'dark',
            themeName: 'dark',
            isDark: true,
            isHighContrast: false,
            insightThemeVars: {
              '--mi-bg-color-page': '#101112',
              '--mi-bg-color-dark': '#101112',
              '--mi-bg-color': '#202122',
              '--mi-bg-color-light': '#303132',
              '--mi-bg-color-lighter': '#303132',
              '--mi-bg-color-overlay': '#202122',
              '--mi-text-color': '#404142',
              '--mi-text-color-secondary': '#505152',
              '--mi-text-color-tertiary': '#505152',
              '--mi-text-color-placeholder': '#505152',
              '--mi-text-color-disabled': '#707172',
              '--mi-border-color': '#606162',
              '--mi-border-color-light': '#606162',
              '--mi-border-color-lighter': '#606162',
              '--mi-color-primary': '#808182',
              '--mi-color-primary-light-1': '#909192',
            },
          },
        }));
      });

    await expect(generatedRow).toHaveCSS('background-color', 'rgb(48, 49, 50)');
    await expect(generatedRow).toHaveCSS('color', 'rgb(80, 81, 82)');
    await expect(generatedRow).toHaveCSS(
      'box-shadow',
      'rgb(96, 97, 98) 0px -1px 0px 0px inset',
    );
    await expect(generatedPanel).toHaveCSS('background-color', 'rgb(32, 33, 34)');
    await expect(generatedPanel).toHaveCSS('color', 'rgb(64, 65, 66)');
    await expect(generatedCardHead).toHaveCSS('background-color', 'rgb(16, 17, 18)');
    await expect(generatedCardHead).toHaveCSS('border-bottom-color', 'rgb(96, 97, 98)');
  });
});
