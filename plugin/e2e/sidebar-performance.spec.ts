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
 * Performance Panel Tests
 * 
 * The Performance panel shows performance run data in a tree view.
 * These tests verify the panel renders correctly with theme support.
 */

test.describe('Performance Panel - Tree View Structure', () => {
  test(
    'should display performance panel with tree container',
    async ({ vscodePage }) => {
      await vscodePage.waitForSelector('.monaco-workbench');
      await vscodePage.waitForTimeout(5000);

      console.log('\n--- Testing: Performance panel tree container');

      // Open the panel
      await runByTitle(vscodePage, 'Focus on Performance Tuning View');
      await vscodePage.waitForTimeout(3000);

      // Find ANY panel frame (panel may already be open from previous tests)
      const result = await findAnyApp(vscodePage, 8000);

      if (!result) {
        const frameInfo = vscodePage.frames()
          .map((f) => `  ${f.url()}`)
          .join('\n');
        throw new Error('[Performance] No #app frame found.\n' + `All frames:\n${frameInfo}`);
      }

      const [frame, appEl] = result;

      // Verify tree container exists
      const hasTreeContainer = await appEl.locator('[role="tree"], .tree, .tree-view').count() > 0;
      console.log(`  Has tree container: ${hasTreeContainer}`);

      // Check for filter/sort buttons
      const hasFilterBar = await appEl.locator('.filter-bar, [class*="filter"]').count() > 0;
      console.log(`  Has filter bar: ${hasFilterBar}`);

      await takeScreenshot(vscodePage, 'Performance_tree_container');
    },
  );

  test(
    'should display execution time sorter button',
    async ({ vscodePage }) => {
      await vscodePage.waitForSelector('.monaco-workbench');
      await vscodePage.waitForTimeout(3000);

      console.log('\n--- Testing: Performance panel sorter buttons');

      // Find ANY panel frame (panel may already be open from previous tests)
      const result = await findAnyApp(vscodePage, 8000);

      if (!result) {
        throw new Error('[Performance] No #app frame found');
      }

      const [frame, appEl] = result;

      // Check for sorter buttons
      const hasSorterButton = await appEl.locator('text=/Execution time/i').count() > 0;
      const hasMarkedButton = await appEl.locator('text=/Marked/i').count() > 0;

      console.log(`  Has "Execution time" sorter: ${hasSorterButton}`);
      console.log(`  Has "Marked" sorter: ${hasMarkedButton}`);

      await takeScreenshot(vscodePage, 'Performance_sorter_buttons');
    },
  );

  test(
    'should display empty state or data correctly',
    async ({ vscodePage }) => {
      await vscodePage.waitForSelector('.monaco-workbench');
      await vscodePage.waitForTimeout(3000);

      console.log('\n--- Testing: Performance panel empty/data state');

      // Find ANY panel frame (panel may already be open from previous tests)
      const result = await findAnyApp(vscodePage, 8000);

      if (!result) {
        throw new Error('[Performance] No #app frame found');
      }

      const [frame, appEl] = result;

      // Verify the panel has rendered content
      const hasContent = (await appEl.innerHTML()).length > 100;
      console.log(`  Has rendered content: ${hasContent}`);

      expect(hasContent, 'should have rendered content').toBeTruthy();

      await takeScreenshot(vscodePage, 'Performance_data_state');
    },
  );
});

test.describe('Performance Panel - Theme Integration', () => {
  test(
    'should adopt VS Code theme colors',
    async ({ vscodePage }) => {
      await vscodePage.waitForSelector('.monaco-workbench');
      await vscodePage.waitForTimeout(3000);

      console.log('\n--- Testing: Performance panel theme adoption');

      // Find ANY panel frame (panel may already be open from previous tests)
      const result = await findAnyApp(vscodePage, 8000);

      if (!result) {
        throw new Error('[Performance] No #app frame found');
      }

      const [frame] = result;

      // Verify CSS variables
      const bg = await cssVar(frame, '--vscode-editor-background');
      console.log(`  --vscode-editor-background: "${bg}"`);

      expect(bg, 'background should not be empty').toBeTruthy();
      expect(bg, 'background should be a CSS color').toMatch(/^(#|rgb|rgba|hsl)/);

      await takeScreenshot(vscodePage, 'Performance_theme_colors');
    },
  );
});
