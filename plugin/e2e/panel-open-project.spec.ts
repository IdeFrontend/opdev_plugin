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
    'Open Project panel should load and adopt theme',
    async ({ vscodePage }) => {
      await vscodePage.waitForSelector('.monaco-workbench');
      await vscodePage.waitForTimeout(8000);

      // Record any pre-existing frames (e.g., from restored VS Code state) to exclude
      const existingUrls = new Set<string>();

      for (const f of vscodePage.frames()) {
        try {
          const el = f.locator('#app');

          if ((await el.count()) > 0 && (await el.isVisible())) {
            existingUrls.add(f.url());
          }
        }
        catch (_e) {
          /* frame may be detaching – skip */
        }
      }

      console.log('\n--- Testing: Open Project panel ("Open Operator Project")');

      // Open the webview via Command Palette
      await runByTitle(vscodePage, 'Open Operator Project');
      await vscodePage.waitForTimeout(5000);

      // Look for a NEW frame with #app that we haven't seen before
      const result = await findNewApp(vscodePage, existingUrls, 12000);

      if (!result) {
        // Debug: list all frames and which ones are in existingUrls
        const frameInfo = vscodePage.frames()
          .map((f) => {
            const seen = existingUrls.has(f.url()) ? ' [SEEN BEFORE]' : '';

            return `  ${f.url()}${seen}`;
          })
          .join('\n');

        throw new Error('[Open Project panel] No NEW #app frame found within 12 s.\n'
          + `Existing URLs: ${[...existingUrls].join(', ')}\n`
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

      console.log(`  Open Project panel: --vscode-editor-background = "${bg}" [frame: ${frameUrl.slice(0, 80)}...]`);

      expect(bg, 'Open Project panel: should not be empty')
        .toBeTruthy();
      expect(bg, 'Open Project panel: should be a CSS color')
        .toMatch(/^(#|rgb)/);

      // Take a screenshot of the state with the webview loaded for later analysis
      const screenshotPath = 'test-results/screenshots/Open_Project_panel.png';

      await vscodePage.screenshot({ path: screenshotPath });
      console.log(`  Saved screenshot to ${screenshotPath}`);
    },
  );
});
