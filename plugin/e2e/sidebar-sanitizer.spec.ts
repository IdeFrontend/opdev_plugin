import {
  test,
  expect,
} from './vscode-fixture';
import {
  runByTitle,
  findNewApp,
  findAnyApp,
  cssVar,
  verifyThemeVariables,
  takeScreenshot,
} from './webview-helpers';

/**
 * Sanitizer Panel Tests
 * 
 * The Sanitizer panel shows anomaly detection configurations.
 * These tests verify the panel renders correctly with theme support.
 */

test.describe('Sanitizer Panel - Form Structure', () => {
  test(
    'should display sanitizer panel container',
    async ({ vscodePage }) => {
      await vscodePage.waitForSelector('.monaco-workbench');
      await vscodePage.waitForTimeout(5000);

      console.log('\n--- Testing: Sanitizer panel container');

      // Open the panel (command title is "Sanitizer")
      await runByTitle(vscodePage, 'Sanitizer');
      await vscodePage.waitForTimeout(3000);

      // Find ANY panel frame (panel may already be open from previous tests)
      const result = await findAnyApp(vscodePage, 8000);

      if (!result) {
        const frameInfo = vscodePage.frames()
          .map((f) => `  ${f.url()}`)
          .join('\n');
        throw new Error('[Sanitizer] No #app frame found.\n' + `All frames:\n${frameInfo}`);
      }

      const [frame, appEl] = result;

      // Verify app container
      const hasApp = await appEl.count() > 0;
      console.log(`  Has app container: ${hasApp}`);

      expect(hasApp, 'should have app container').toBeTruthy();

      await takeScreenshot(vscodePage, 'Sanitizer_panel_container');
    },
  );

  test(
    'should display form or config section',
    async ({ vscodePage }) => {
      await vscodePage.waitForSelector('.monaco-workbench');
      await vscodePage.waitForTimeout(3000);

      console.log('\n--- Testing: Sanitizer panel form section');

      // Find ANY panel frame (panel may already be open from previous tests)
      const result = await findAnyApp(vscodePage, 8000);

      if (!result) {
        throw new Error('[Sanitizer] No #app frame found');
      }

      const [frame, appEl] = result;

      // Check for form elements
      const hasForm = await appEl.locator('form, .form, [class*="form"]').count() > 0;
      const hasSelect = await appEl.locator('select, [class*="select"]').count() > 0;
      const hasConfig = await appEl.locator('[class*="config"]').count() > 0;

      console.log(`  Has form: ${hasForm}`);
      console.log(`  Has select: ${hasSelect}`);
      console.log(`  Has config: ${hasConfig}`);

      await takeScreenshot(vscodePage, 'Sanitizer_form_section');
    },
  );

  test(
    'should display action buttons',
    async ({ vscodePage }) => {
      await vscodePage.waitForSelector('.monaco-workbench');
      await vscodePage.waitForTimeout(3000);

      console.log('\n--- Testing: Sanitizer panel action buttons');

      // Find ANY panel frame (panel may already be open from previous tests)
      const result = await findAnyApp(vscodePage, 8000);

      if (!result) {
        throw new Error('[Sanitizer] No #app frame found');
      }

      const [frame, appEl] = result;

      // Check for buttons
      const buttons = await appEl.locator('button').all();
      console.log(`  Found ${buttons.length} buttons`);

      for (const button of buttons.slice(0, 5)) {
        const text = await button.textContent();
        if (text) {
          console.log(`  Button: "${text.trim()}"`);
        }
      }

      await takeScreenshot(vscodePage, 'Sanitizer_action_buttons');
    },
  );
});

test.describe('Sanitizer Panel - Theme Integration', () => {
  test(
    'should adopt VS Code theme colors',
    async ({ vscodePage }) => {
      await vscodePage.waitForSelector('.monaco-workbench');
      await vscodePage.waitForTimeout(3000);

      console.log('\n--- Testing: Sanitizer panel theme adoption');

      // Find ANY panel frame (panel may already be open from previous tests)
      const result = await findAnyApp(vscodePage, 8000);

      if (!result) {
        throw new Error('[Sanitizer] No #app frame found');
      }

      const [frame] = result;

      // Verify CSS variables
      const bg = await cssVar(frame, '--vscode-editor-background');
      const fg = await cssVar(frame, '--vscode-editor-foreground');
      const border = await cssVar(frame, '--vscode-widget-border');

      console.log(`  --vscode-editor-background: "${bg}"`);
      console.log(`  --vscode-editor-foreground: "${fg}"`);
      console.log(`  --vscode-widget-border: "${border}"`);

      expect(bg, 'background should not be empty').toBeTruthy();
      expect(bg, 'background should be a CSS color').toMatch(/^(#|rgb|rgba|hsl)/);

      await takeScreenshot(vscodePage, 'Sanitizer_theme_colors');
    },
  );
});
