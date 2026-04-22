import {
  test,
  expect,
} from './vscode-fixture';
import {
  runByTitle,
  findAnyApp,
  cssVar,
} from './webview-helpers';

test.describe('Webview Themes Integration', () => {
  test(
    'MS Sanitizer panel should load and adopt theme',
    async ({ vscodePage }) => {
      await vscodePage.waitForSelector('.monaco-workbench');
      await vscodePage.waitForTimeout(5000);

      console.log('\n--- Testing: MS Sanitizer panel ("Sanitizer")');

      // Open the webview via Command Palette
      await runByTitle(vscodePage, 'Sanitizer');
      await vscodePage.waitForTimeout(3000);

      // Find any webview frame (panel may already be open from previous tests)
      const result = await findAnyApp(vscodePage, 10000);

      if (!result) {
        const frameInfo = vscodePage.frames()
          .map((f) => `  ${f.url()}`)
          .join('\n');

        throw new Error('[MS Sanitizer panel] No #app frame found.\n' + `All frames:\n${frameInfo}`);
      }

      const [
        frame,
        appEl,
        frameUrl,
      ] = result;

      await expect(appEl)
        .toBeAttached({ timeout: 5000 });

      const bg = await cssVar(frame, '--vscode-editor-background');

      console.log(`  MS Sanitizer panel: --vscode-editor-background = "${bg}" [frame: ${frameUrl.slice(0, 80)}...]`);

      expect(bg, 'MS Sanitizer panel: should not be empty')
        .toBeTruthy();
      expect(bg, 'MS Sanitizer panel: should be a CSS color')
        .toMatch(/^(#|rgb)/);

      // Take a screenshot of the state with the webview loaded for later analysis
      const screenshotPath = 'test-results/screenshots/MS_Sanitizer_panel.png';

      await vscodePage.screenshot({ path: screenshotPath });
      console.log(`  Saved screenshot to ${screenshotPath}`);

    },
  );
});
