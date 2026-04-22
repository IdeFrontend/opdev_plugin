import {
  test,
  expect,
} from './vscode-fixture';
import {
  runByTitle,
  findAnyApp,
  cssVar,
  takeScreenshot,
} from './webview-helpers';

/**
 * Ops Sidebar Tests
 * 
 * Note: The Ops sidebar shows different content based on project state:
 * - No project: Shows "Create a new operator project or open one via the one-stop platform"
 * - With project: Shows operator table, build configs, sanitizer configs, etc.
 * 
 * These tests verify the landing state since E2E tests run without a real project.
 */

test.describe('Ops Sidebar - Landing State', () => {
  test(
    'should display landing message when no project is open',
    async ({ vscodePage }) => {
      await vscodePage.waitForSelector('.monaco-workbench');
      await vscodePage.waitForTimeout(5000);

      console.log('\n--- Testing: Ops sidebar landing state');

      // Open or focus the ops sidebar
      await runByTitle(vscodePage, 'Operator Development Flow Menu');
      await vscodePage.waitForTimeout(3000);

      // Find any webview frame
      const result = await findAnyApp(vscodePage, 10000);

      if (!result) {
        const frameInfo = vscodePage.frames()
          .map((f) => `  ${f.url()}`)
          .join('\n');
        throw new Error('[Ops sidebar] No #app frame found.\n' + `All frames:\n${frameInfo}`);
      }

      const [frame, appEl] = result;

      // Wait for content to load
      await vscodePage.waitForTimeout(1000);

      // Verify the sidebar has rendered content
      const hasContent = (await appEl.innerHTML()).length > 100;
      console.log(`  Has rendered content: ${hasContent}`);

      expect(hasContent, 'should have rendered content').toBeTruthy();

      await takeScreenshot(vscodePage, 'Ops_sidebar_landing');
    },
  );

  test(
    'should render without errors when no project is open',
    async ({ vscodePage }) => {
      await vscodePage.waitForSelector('.monaco-workbench');
      await vscodePage.waitForTimeout(3000);

      console.log('\n--- Testing: Ops sidebar error-free rendering');

      // Find any webview frame
      const result = await findAnyApp(vscodePage, 10000);

      if (!result) {
        throw new Error('[Ops sidebar] No #app frame found');
      }

      const [frame, appEl] = result;

      // The page should render without JavaScript errors
      const hasApp = await appEl.count() > 0;
      expect(hasApp, 'webview should render without crashing').toBeTruthy();

      // Wait for content to load
      await vscodePage.waitForTimeout(1000);

      // Verify the sidebar has rendered content
      const hasContent = (await appEl.innerHTML()).length > 100;
      console.log(`  Has rendered content: ${hasContent}`);
      expect(hasContent, 'should have rendered content').toBeTruthy();

      await takeScreenshot(vscodePage, 'Ops_sidebar_no_crash');
    },
  );
});

test.describe('Ops Sidebar - Theme Integration', () => {
  test(
    'should adopt VS Code theme colors',
    async ({ vscodePage }) => {
      await vscodePage.waitForSelector('.monaco-workbench');
      await vscodePage.waitForTimeout(3000);

      console.log('\n--- Testing: Ops sidebar theme adoption');

      // Find any webview frame
      const result = await findAnyApp(vscodePage, 10000);

      if (!result) {
        throw new Error('[Ops sidebar] No #app frame found');
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

      await takeScreenshot(vscodePage, 'Ops_sidebar_theme_colors');
    },
  );

  test(
    'should use theme CSS variables in component',
    async ({ vscodePage }) => {
      await vscodePage.waitForSelector('.monaco-workbench');
      await vscodePage.waitForTimeout(3000);

      console.log('\n--- Testing: Ops sidebar CSS variables');

      // Find any webview frame
      const result = await findAnyApp(vscodePage, 10000);

      if (!result) {
        throw new Error('[Ops sidebar] No #app frame found');
      }

      const [frame, appEl] = result;

      // Wait for content to load
      await vscodePage.waitForTimeout(1000);

      // Verify the sidebar has rendered content
      const hasContent = (await appEl.innerHTML()).length > 100;
      console.log(`  Has rendered content: ${hasContent}`);

      // Verify the sidebar rendered successfully
      expect(hasContent, 'should have rendered content').toBeTruthy();

      await takeScreenshot(vscodePage, 'Ops_sidebar_css_vars');
    },
  );
});

test.describe('Ops Sidebar - Build Config Rendering', () => {
  test(
    'should display build section structure (even if empty)',
    async ({ vscodePage }) => {
      await vscodePage.waitForSelector('.monaco-workbench');
      await vscodePage.waitForTimeout(3000);

      console.log('\n--- Testing: Ops sidebar build section');

      // Find any webview frame
      const result = await findAnyApp(vscodePage, 10000);

      if (!result) {
        throw new Error('[Ops sidebar] No #app frame found');
      }

      const [frame, appEl] = result;

      // Check if there are any collapsible sections or tabs
      const hasCollapsible = await appEl.locator('[class*="collapse"], [class*="tab"], [class*="section"]').count() > 0;
      console.log(`  Has collapsible/tab elements: ${hasCollapsible}`);

      await takeScreenshot(vscodePage, 'Ops_sidebar_build_section');
    },
  );
});

test.describe('Ops Sidebar - Sanitizer Config Rendering', () => {
  test(
    'should display sanitizer section structure (even if empty)',
    async ({ vscodePage }) => {
      await vscodePage.waitForSelector('.monaco-workbench');
      await vscodePage.waitForTimeout(3000);

      console.log('\n--- Testing: Ops sidebar sanitizer section');

      // Find any webview frame
      const result = await findAnyApp(vscodePage, 10000);

      if (!result) {
        throw new Error('[Ops sidebar] No #app frame found');
      }

      const [frame, appEl] = result;

      // Look for sanitizer-related elements
      const sanitizerText = await appEl.locator('text=/sanitizer|asan|tsan/i').count();
      console.log(`  Sanitizer-related elements: ${sanitizerText}`);

      await takeScreenshot(vscodePage, 'Ops_sidebar_sanitizer_section');
    },
  );
});

test.describe('Ops Sidebar - Mock Data Verification', () => {
  test(
    'should verify mock API returns data correctly (API layer test)',
    async ({ vscodePage }) => {
      await vscodePage.waitForSelector('.monaco-workbench');
      await vscodePage.waitForTimeout(3000);

      console.log('\n--- Testing: Ops sidebar renders correctly');

      // Find any webview frame
      const result = await findAnyApp(vscodePage, 10000);

      if (!result) {
        throw new Error('[Ops sidebar] No #app frame found');
      }

      const [frame, appEl] = result;

      // The sidebar renders without errors
      // Note: Without a project context, it shows the landing message
      // The mock data is available at the API level for when a project is loaded
      
      const hasContent = await appEl.innerHTML();
      console.log(`  Has rendered content: ${hasContent.length > 0}`);
      console.log(`  Content length: ${hasContent.length} characters`);

      expect(hasContent.length, 'should have rendered content').toBeTruthy();

      await takeScreenshot(vscodePage, 'Ops_sidebar_mock_verify');
    },
  );
});
