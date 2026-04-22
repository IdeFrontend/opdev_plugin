import {
  test,
  expect,
} from './vscode-fixture';
import {
  runByTitle,
  findNewApp,
  cssVar,
} from './webview-helpers';

test.describe('Webview Themes Integration', () => {
  test(
    'Theme variables should update in webview when VS Code theme changes',
    async ({ vscodePage }) => {
      await vscodePage.waitForSelector('.monaco-workbench');
      await vscodePage.waitForTimeout(8000);

      // Open Welcome panel as reference webview
      await runByTitle(vscodePage, 'Huawei OP DevTools: Welcome');

      const found = await findNewApp(vscodePage, new Set(), 15000);

      if (!found) {
        throw new Error('Could not find #app for theme-change test');
      }

      const [frame] = found;

      // Switch to Light Modern
      await runByTitle(vscodePage, 'Preferences: Color Theme');
      await vscodePage.waitForTimeout(400);
      await vscodePage.keyboard.type('Light Modern');
      await vscodePage.keyboard.press('Enter');
      await vscodePage.waitForTimeout(2000);

      const lightBg = await cssVar(frame, '--vscode-editor-background');

      expect(lightBg, 'Light theme bg should be set')
        .toBeTruthy();

      // Switch to Dark Modern
      await runByTitle(vscodePage, 'Preferences: Color Theme');
      await vscodePage.waitForTimeout(400);
      await vscodePage.keyboard.type('Dark Modern');
      await vscodePage.keyboard.press('Enter');
      await vscodePage.waitForTimeout(2000);

      const darkBg = await cssVar(frame, '--vscode-editor-background');

      expect(darkBg, 'Dark theme bg should be set')
        .toBeTruthy();

      expect(
        lightBg,
        'Light and dark bg must differ – webview reacted to theme change',
      ).not.toBe(darkBg);
    },
  );
});
