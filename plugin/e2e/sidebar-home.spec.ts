import {
  test,
  expect,
} from './vscode-fixture';
import {
  findAnyApp,
  cssVar,
} from './webview-helpers';

// Content marker to identify home sidebar
const HOME_CONTENT_MARKER = 'Help guide';

test.describe('Webview Themes Integration', () => {
  test(
    'Home sidebar should load and adopt theme',
    async ({ vscodePage }) => {
      await vscodePage.waitForSelector('.monaco-workbench');
      await vscodePage.waitForTimeout(5000);

      console.log('\n--- Testing: Home sidebar ("Feature List")');

      // Find the home sidebar by content (sidebar may already be open from previous tests)
      const result = await findAnyApp(vscodePage, 8000, HOME_CONTENT_MARKER);

      if (!result) {
        // Debug: list all frames
        const frameInfo = vscodePage.frames()
          .map((f) => `  ${f.url()}`)
          .join('\n');

        throw new Error('[Home sidebar] No #app frame found.\n'
          + `All frames:\n${frameInfo}`);
      }

      const [
        frame,
        appEl,
        frameUrl,
      ] = result;

      await expect(appEl)
        .toBeAttached({ timeout: 5000 });

      const bg = await cssVar(frame, '--vscode-editor-background');

      console.log(`  Home sidebar: --vscode-editor-background = "${bg}" [frame: ${frameUrl.slice(0, 80)}...]`);

      expect(bg, 'Home sidebar: should not be empty')
        .toBeTruthy();
      expect(bg, 'Home sidebar: should be a CSS color')
        .toMatch(/^(#|rgb)/);

      // Take a screenshot of the state with the webview loaded for later analysis
      const screenshotPath = 'test-results/screenshots/Home_sidebar.png';

      try {
        await vscodePage.screenshot({
          path: screenshotPath,
          timeout: 5000,
        });
        console.log(`  Saved screenshot to ${screenshotPath}`);
      }
      catch (e) {
        console.log(`  [WARN] Screenshot timed out or failed: ${(e as Error).message}`);
      }
    },
  );
});
