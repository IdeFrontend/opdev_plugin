import type {
  Frame,
  Page,
} from '@playwright/test';
import {
  test,
  expect,
} from './vscode-fixture';
import {
  runByTitle,
  findNewApp,
  cssVar,
} from './webview-helpers';

type ThemeState = {
  themeKind?: string;
  background: string;
  foreground: string;
  border: string;
  buttonBackground: string;
  buttonColor: string;
};

async function selectColorTheme(
  vscodePage: Page,
  themeName: string,
): Promise<void> {
  await runByTitle(vscodePage, 'Preferences: Color Theme');
  await vscodePage.waitForTimeout(400);
  await vscodePage.keyboard.type(themeName, { delay: 50 });
  await vscodePage.keyboard.press('Enter');
  await vscodePage.waitForTimeout(2000);
}

async function readThemeState(frame: Frame): Promise<ThemeState> {
  return frame.evaluate(() => {
    const rootStyle = getComputedStyle(document.documentElement);
    const button = document.querySelector('button');
    const buttonStyle = button ? getComputedStyle(button) : null;

    return {
      themeKind: document.documentElement.dataset.opDevtoolsTheme,
      background: rootStyle.getPropertyValue('--vscode-editor-background')
        .trim(),
      foreground: rootStyle.getPropertyValue('--vscode-editor-foreground')
        .trim(),
      border: rootStyle.getPropertyValue('--vscode-widget-border')
        .trim(),
      buttonBackground: buttonStyle?.backgroundColor ?? '',
      buttonColor: buttonStyle?.color ?? '',
    };
  });
}

test.describe('Webview Themes Integration', () => {
  test(
    'Theme variables should update in webview when VS Code theme changes',
    async ({ vscodePage }) => {
      await vscodePage.waitForSelector('.monaco-workbench');
      await vscodePage.waitForTimeout(8000);

      await runByTitle(vscodePage, 'Huawei OP DevTools: Welcome');

      const found = await findNewApp(vscodePage, new Set(), 15000);

      if (!found) {
        throw new Error('Could not find #app for theme-change test');
      }

      const [frame] = found;

      await selectColorTheme(vscodePage, 'Light Modern');

      const lightBg = await cssVar(frame, '--vscode-editor-background');
      const lightState = await readThemeState(frame);

      expect(lightBg, 'Light theme bg should be set')
        .toBeTruthy();
      expect(lightState.themeKind)
        .toBe('light');
      expect(lightState.foreground)
        .toBeTruthy();
      expect(lightState.border)
        .toBeTruthy();
      expect(lightState.buttonBackground)
        .toBeTruthy();
      expect(lightState.buttonColor)
        .toBeTruthy();

      await selectColorTheme(vscodePage, 'Dark Modern');

      const darkBg = await cssVar(frame, '--vscode-editor-background');
      const darkState = await readThemeState(frame);

      expect(darkBg, 'Dark theme bg should be set')
        .toBeTruthy();
      expect(darkState.themeKind)
        .toBe('dark');
      expect(
        lightBg,
        'Light and dark bg must differ - webview reacted to theme change',
      ).not.toBe(darkBg);

      await selectColorTheme(vscodePage, 'High Contrast');

      const highContrastState = await readThemeState(frame);

      expect(highContrastState.themeKind)
        .toBe('high-contrast');
      expect(highContrastState.border)
        .toBeTruthy();

      await selectColorTheme(vscodePage, 'Light High Contrast');

      const highContrastLightState = await readThemeState(frame);

      expect(highContrastLightState.themeKind)
        .toBe('high-contrast-light');
      expect(highContrastLightState.background)
        .toBeTruthy();
      expect(highContrastLightState.foreground)
        .toBeTruthy();
    },
  );
});
