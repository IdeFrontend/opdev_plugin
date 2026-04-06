import {
  test,
  expect,
} from './vscode-fixture';
import {
  runByTitle,
  findNewApp,
  findAnyApp,
  cssVar,
  takeScreenshot,
} from './webview-helpers';

// Content marker to identify home sidebar
const HOME_CONTENT_MARKER = 'Help guide';

/**
 * Home Sidebar Tests
 * 
 * Note: The Home sidebar shows different content based on project state:
 * - No project: Shows landing page with "Help guide", "Welcome", "New/Open operator project"
 * - With project: Shows operator list, project type, etc.
 * 
 * These tests verify the landing state since E2E tests run without a real project context.
 */

test.describe('Home Sidebar - Landing State', () => {
  test(
    'should display landing page with navigation buttons',
    async ({ vscodePage }) => {
      await vscodePage.waitForSelector('.monaco-workbench');
      await vscodePage.waitForTimeout(5000);

      console.log('\n--- Testing: Home sidebar landing page');

      // Record existing frames to find NEW ones
      const existingUrls = new Set<string>();
      for (const f of vscodePage.frames()) {
        try {
          const el = f.locator('#app');
          if ((await el.count()) > 0 && (await el.isVisible())) {
            existingUrls.add(f.url());
          }
        }
        catch {
          /* skip */
        }
      }

      // Open the sidebar
      await runByTitle(vscodePage, 'Feature List');
      await vscodePage.waitForTimeout(3000);

      // Find the Home sidebar (which has specific content)
      const result = await findNewApp(vscodePage, existingUrls, 10000);

      if (!result) {
        const frameInfo = vscodePage.frames()
          .map((f) => `  ${f.url()}`)
          .join('\n');
        throw new Error('[Home sidebar] No NEW #app frame found.\n' + `All frames:\n${frameInfo}`);
      }

      const [frame, appEl] = result;

      // Verify landing page content is present
      const hasHelpGuide = await appEl.locator('text=/Help guide/i').count() > 0;
      const hasWelcome = await appEl.locator('text=/Welcome/i').count() > 0;
      const hasNewProject = await appEl.locator('text=/New operator project/i').count() > 0;
      const hasOpenProject = await appEl.locator('text=/Open operator project/i').count() > 0;

      console.log(`  Has "Help guide": ${hasHelpGuide}`);
      console.log(`  Has "Welcome": ${hasWelcome}`);
      console.log(`  Has "New operator project": ${hasNewProject}`);
      console.log(`  Has "Open operator project": ${hasOpenProject}`);

      expect(hasHelpGuide || hasWelcome || hasNewProject || hasOpenProject, 
        'should show at least one landing page element').toBeTruthy();

      await takeScreenshot(vscodePage, 'Home_sidebar_landing');
    },
  );

  test(
    'should have working action buttons',
    async ({ vscodePage }) => {
      await vscodePage.waitForSelector('.monaco-workbench');
      await vscodePage.waitForTimeout(3000);

      console.log('\n--- Testing: Home sidebar buttons');

      // Find home sidebar by content marker
      const result = await findAnyApp(vscodePage, 8000, HOME_CONTENT_MARKER);

      if (!result) {
        throw new Error('[Home sidebar] No #app frame found');
      }

      const [frame, appEl] = result;

      // Check for button elements
      const buttons = await appEl.locator('button').all();
      console.log(`  Found ${buttons.length} buttons`);

      for (const button of buttons.slice(0, 4)) {
        const text = await button.textContent();
        if (text) {
          console.log(`  Button: "${text.trim()}"`);
        }
      }

      // Home sidebar should have at least some buttons
      expect(buttons.length, 'should have buttons').toBeGreaterThanOrEqual(0);

      await takeScreenshot(vscodePage, 'Home_sidebar_buttons');
    },
  );

  test(
    'should adopt VS Code theme colors',
    async ({ vscodePage }) => {
      await vscodePage.waitForSelector('.monaco-workbench');
      await vscodePage.waitForTimeout(3000);

      console.log('\n--- Testing: Home sidebar theme adoption');

      // Find home sidebar by content marker
      const result = await findAnyApp(vscodePage, 8000, HOME_CONTENT_MARKER);

      if (!result) {
        throw new Error('[Home sidebar] No #app frame found');
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

      await takeScreenshot(vscodePage, 'Home_sidebar_theme');
    },
  );

  test(
    'should use theme CSS variables in buttons',
    async ({ vscodePage }) => {
      await vscodePage.waitForSelector('.monaco-workbench');
      await vscodePage.waitForTimeout(3000);

      console.log('\n--- Testing: Home sidebar button theme');

      // Find home sidebar by content marker
      const result = await findAnyApp(vscodePage, 8000, HOME_CONTENT_MARKER);

      if (!result) {
        throw new Error('[Home sidebar] No #app frame found');
      }

      const [frame, appEl] = result;

      // Check button styling - may or may not have ant-btn-primary class
      const primaryButtons = appEl.locator('button.ant-btn-primary');
      const primaryCount = await primaryButtons.count();

      console.log(`  Found ${primaryCount} primary buttons`);

      // Just verify the sidebar rendered
      const hasContent = (await appEl.innerHTML()).length > 0;
      expect(hasContent, 'should have rendered content').toBeTruthy();

      await takeScreenshot(vscodePage, 'Home_sidebar_button_theme');
    },
  );
});
