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
    'Project SH panel should load and adopt theme',
    async ({ vscodePage }) => {
      await vscodePage.waitForSelector('.monaco-workbench');
      await vscodePage.waitForTimeout(5000);

      console.log('\n--- Testing: Project SH panel ("Environment Configuration")');

      // Open the webview via Command Palette
      await runByTitle(vscodePage, 'Environment Configuration');
      await vscodePage.waitForTimeout(3000);

      // Find any webview frame (panel may already be open from previous tests)
      const result = await findAnyApp(vscodePage, 10000);

      if (!result) {
        const frameInfo = vscodePage.frames()
          .map((f) => `  ${f.url()}`)
          .join('\n');

        throw new Error('[Project SH panel] No #app frame found.\n' + `All frames:\n${frameInfo}`);
      }

      const [
        frame,
        appEl,
        frameUrl,
      ] = result;

      await expect(appEl)
        .toBeAttached({ timeout: 5000 });

      const bg = await cssVar(frame, '--vscode-editor-background');

      console.log(`  Project SH panel: --vscode-editor-background = "${bg}" [frame: ${frameUrl.slice(0, 80)}...]`);

      expect(bg, 'Project SH panel: should not be empty')
        .toBeTruthy();
      expect(bg, 'Project SH panel: should be a CSS color')
        .toMatch(/^(#|rgb)/);

      // Take a screenshot of the state with the webview loaded for later analysis
      const screenshotPath = 'test-results/screenshots/Project_SH_panel.png';

      await vscodePage.screenshot({ path: screenshotPath });
      console.log(`  Saved screenshot to ${screenshotPath}`);
    },
  );
});
