import type {
  Page,
  Frame,
  Locator,
} from '@playwright/test';

export type FrameResult = [Frame, Locator, string];

// ============================================================
// FRAME NAVIGATION HELPERS
// ============================================================

/**
 * Find ANY visible #app frame (existing or new).
 * Use this when the webview might already be open.
 * @param contentMarker — if provided, only match frames whose #app text includes this string.
 */
export async function findAnyApp(
  vscodePage: Page,
  timeoutMs: number = 5000,
  contentMarker?: string,
): Promise<FrameResult | null> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    for (const f of vscodePage.frames()) {
      try {
        const el = f.locator('#app');

        if (await el.count() > 0 && await el.isVisible()) {
          // If a content marker is specified, verify the frame contains it
          if (contentMarker) {
            const text = await el.textContent();

            if (!text || !text.includes(contentMarker)) {
              continue;
            }
          }

          return [f, el, f.url()];
        }
      }
      catch {
        /* frame may be detaching – skip */
      }
    }
    await vscodePage.waitForTimeout(400);
  }

  return null;
}

/**
 * Open the VS Code Command Palette and type an exact command title to execute.
 * This is the only reliable way to trigger commands in the sandboxed renderer.
 */
export async function runByTitle(
  vscodePage: Page,
  commandTitle: string,
): Promise<void> {
  await vscodePage.keyboard.press('F1');
  await vscodePage.waitForTimeout(1000);
  await vscodePage.keyboard.type(commandTitle, { delay: 50 });
  await vscodePage.waitForTimeout(1000);
  await vscodePage.keyboard.press('Enter');
  await vscodePage.waitForTimeout(500);
}

/**
 * Poll all frames on the page looking for one with a visible #app element
 * whose URL is NOT in the `excludeUrls` set. This ensures each iteration
 * finds a genuinely new webview frame rather than re-matching previously
 * verified ones.
 */
export async function findNewApp(
  vscodePage: Page,
  excludeUrls: Set<string>,
  timeoutMs: number = 12000,
): Promise<FrameResult | null> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    for (const f of vscodePage.frames()) {
      if (excludeUrls.has(f.url())) {
        continue;
      }

      try {
        const el = f.locator('#app');

        if (await el.count() > 0 && await el.isVisible()) {
          return [
            f,
            el,
            f.url(),
          ];
        }
      }
      catch (_e) {
        /* frame may be detaching – skip */
      }
    }

    await vscodePage.waitForTimeout(400);
  }

  return null;
}

// ============================================================
// CSS VARIABLE HELPERS
// ============================================================

/**
 * Read a CSS custom property from :root of the given frame.
 */
export async function cssVar(frame: Frame, name: string): Promise<string> {
  return frame.evaluate((n: string) => {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(n)
      .trim();
  }, name);
}

/**
 * Verify that CSS theme variables are properly populated.
 */
export async function verifyThemeVariables(frame: Frame): Promise<{
  background: string;
  foreground: string;
  border: string;
}> {
  const background = await cssVar(frame, '--vscode-editor-background');
  const foreground = await cssVar(frame, '--vscode-editor-foreground');
  const border = await cssVar(frame, '--vscode-widget-border');

  return { background, foreground, border };
}

// ============================================================
// LIST & TABLE ASSERTION HELPERS
// ============================================================

/**
 * Find all list items in the webview matching a selector pattern.
 */
export async function getListItems(
  frame: Frame,
  containerSelector: string = '[data-testid*="list"], [role="list"], .list, ul',
): Promise<Locator[]> {
  const container = frame.locator(containerSelector).first();
  const items = container.locator('[role="listitem"], li, .list-item');
  
  return await items.all();
}

/**
 * Count visible list items.
 */
export async function countListItems(
  frame: Frame,
  containerSelector?: string,
): Promise<number> {
  const items = await getListItems(frame, containerSelector);
  let count = 0;
  
  for (const item of items) {
    if (await item.isVisible()) {
      count++;
    }
  }
  
  return count;
}

/**
 * Find a list item by its text content.
 */
export async function findListItemByText(
  frame: Frame,
  searchText: string,
  options?: { exact?: boolean; containerSelector?: string },
): Promise<Locator | null> {
  const { exact = false, containerSelector } = options || {};
  const items = await getListItems(frame, containerSelector);
  
  for (const item of items) {
    if (!await item.isVisible()) continue;
    
    const text = await item.textContent();
    if (!text) continue;
    
    if (exact) {
      if (text.trim() === searchText) {
        return item;
      }
    }
    else {
      if (text.includes(searchText)) {
        return item;
      }
    }
  }
  
  return null;
}

/**
 * Verify that specific text items exist in a list.
 */
export async function verifyListContents(
  frame: Frame,
  expectedTexts: string[],
  options?: { containerSelector?: string },
): Promise<{ found: string[]; missing: string[] }> {
  const found: string[] = [];
  const missing: string[] = [];
  
  for (const text of expectedTexts) {
    const item = await findListItemByText(frame, text, { containerSelector: options?.containerSelector });
    if (item) {
      found.push(text);
    }
    else {
      missing.push(text);
    }
  }
  
  return { found, missing };
}

/**
 * Find all table rows in the webview.
 */
export async function getTableRows(
  frame: Frame,
  tableSelector: string = 'table, [role="grid"], .table',
): Promise<Locator[]> {
  const table = frame.locator(tableSelector).first();
  const rows = table.locator('tbody tr, [role="row"], .table-row, tr');
  
  return await rows.all();
}

/**
 * Find a table cell by row index and column content.
 */
export async function findTableCell(
  frame: Frame,
  rowIndex: number,
  columnText: string,
  options?: { tableSelector?: string },
): Promise<Locator | null> {
  const rows = await getTableRows(frame, options?.tableSelector);
  
  if (rowIndex >= rows.length) {
    return null;
  }
  
  const row = rows[rowIndex];
  const cells = row.locator('td, [role="cell"], .table-cell');
  
  for (const cell of await cells.all()) {
    const text = await cell.textContent();
    if (text && text.includes(columnText)) {
      return cell;
    }
  }
  
  return null;
}

/**
 * Count visible table rows.
 */
export async function countTableRows(
  frame: Frame,
  tableSelector?: string,
): Promise<number> {
  const rows = await getTableRows(frame, tableSelector);
  let count = 0;
  
  for (const row of rows) {
    if (await row.isVisible()) {
      count++;
    }
  }
  
  return count;
}

// ============================================================
// TREE VIEW HELPERS
// ============================================================

/**
 * Find tree items in a tree view.
 */
export async function getTreeItems(
  frame: Frame,
  treeSelector: string = '[role="tree"], .tree-view, .tree',
): Promise<Locator[]> {
  const tree = frame.locator(treeSelector).first();
  const items = tree.locator('[role="treeitem"], .tree-item, .tree-node');
  
  return await items.all();
}

/**
 * Find a tree item by its text content.
 */
export async function findTreeItemByText(
  frame: Frame,
  searchText: string,
  options?: { treeSelector?: string },
): Promise<Locator | null> {
  const items = await getTreeItems(frame, options?.treeSelector);
  
  for (const item of items) {
    if (!await item.isVisible()) continue;
    
    const text = await item.textContent();
    if (text && text.includes(searchText)) {
      return item;
    }
  }
  
  return null;
}

/**
 * Expand a tree node and return child items.
 */
export async function expandTreeItem(
  frame: Frame,
  itemText: string,
): Promise<Locator[]> {
  const item = await findTreeItemByText(frame, itemText);
  
  if (!item) {
    return [];
  }
  
  // Click to expand
  await item.click();
  await frame.waitForTimeout(300);
  
  // Find children
  const children = item.locator('[role="group"] > [role="treeitem"], .children > .tree-item');
  
  return await children.all();
}

/**
 * Verify tree contents with nested structure.
 */
export async function verifyTreeContents(
  frame: Frame,
  expectedItems: string[],
): Promise<{ found: string[]; missing: string[] }> {
  const found: string[] = [];
  const missing: string[] = [];
  
  for (const text of expectedItems) {
    const item = await findTreeItemByText(frame, text);
    if (item) {
      found.push(text);
    }
    else {
      missing.push(text);
    }
  }
  
  return { found, missing };
}

// ============================================================
// FORM & INPUT HELPERS
// ============================================================

/**
 * Find all form inputs in the webview.
 */
export async function getFormInputs(
  frame: Frame,
  containerSelector?: string,
): Promise<Locator[]> {
  const container = containerSelector 
    ? frame.locator(containerSelector).first() 
    : frame.locator('#app');
  
  const inputs = container.locator('input, textarea, select, [contenteditable="true"]');
  
  return await inputs.all();
}

/**
 * Find an input by its label text.
 */
export async function findInputByLabel(
  frame: Frame,
  labelText: string,
): Promise<Locator | null> {
  // Try various label patterns
  const selectors = [
    `label:has-text("${labelText}")`,
    `[aria-label="${labelText}"]`,
    `[placeholder="${labelText}"]`,
    `*:has-text("${labelText}") + input`,
    `*:has-text("${labelText}") ~ input`,
  ];
  
  for (const selector of selectors) {
    try {
      const input = frame.locator(selector).first();
      if (await input.count() > 0 && await input.isVisible()) {
        return input;
      }
    }
    catch {
      // Try next selector
    }
  }
  
  return null;
}

/**
 * Get input value.
 */
export async function getInputValue(
  frame: Frame,
  inputSelector: string,
): Promise<string> {
  const input = frame.locator(inputSelector).first();
  
  const tagName = await input.evaluate((el) => (el as HTMLElement).tagName.toLowerCase());
  
  if (tagName === 'select') {
    return await input.locator('option[selected]').textContent() || '';
  }
  
  return await input.inputValue();
}

/**
 * Verify form has expected inputs.
 */
export async function verifyFormInputs(
  frame: Frame,
  expectedLabels: string[],
): Promise<{ found: string[]; missing: string[] }> {
  const found: string[] = [];
  const missing: string[] = [];
  
  for (const label of expectedLabels) {
    const input = await findInputByLabel(frame, label);
    if (input) {
      found.push(label);
    }
    else {
      missing.push(label);
    }
  }
  
  return { found, missing };
}

// ============================================================
// BUTTON & ACTION HELPERS
// ============================================================

/**
 * Find a button by its text.
 * @param exact — when true, matches the full button text exactly; when false, matches substring.
 */
export async function findButtonByText(
  frame: Frame,
  buttonText: string,
  options?: { exact?: boolean },
): Promise<Locator | null> {
  const { exact = false } = options || {};

  if (exact) {
    return frame.getByRole('button', { name: buttonText, exact: true }).first();
  }

  return frame.locator(`button:has-text("${buttonText}"), [role="button"]:has-text("${buttonText}")`).first();
}

/**
 * Click a button by text.
 */
export async function clickButton(
  frame: Frame,
  buttonText: string,
  timeoutMs: number = 5000,
): Promise<void> {
  const button = await findButtonByText(frame, buttonText, { exact: true });
  
  if (!button) {
    throw new Error(`Button not found: ${buttonText}`);
  }
  
  await button.click({ timeout: timeoutMs });
}

/**
 * Verify buttons exist.
 */
export async function verifyButtons(
  frame: Frame,
  expectedButtons: string[],
): Promise<{ found: string[]; missing: string[] }> {
  const found: string[] = [];
  const missing: string[] = [];
  
  for (const text of expectedButtons) {
    const button = await findButtonByText(frame, text);
    if (button && await button.isVisible()) {
      found.push(text);
    }
    else {
      missing.push(text);
    }
  }
  
  return { found, missing };
}

// ============================================================
// SCREENSHOT HELPERS
// ============================================================

/**
 * Take a screenshot and save with a descriptive name.
 */
export async function takeScreenshot(
  page: Page,
  name: string,
  options?: { fullPage?: boolean },
): Promise<string> {
  const path = `test-results/screenshots/${name}.png`;
  
  await page.screenshot({
    path,
    fullPage: options?.fullPage ?? false,
    timeout: 10000,
  });
  
  console.log(`[Screenshot] Saved: ${path}`);
  
  return path;
}

// ============================================================
// DEBUG & DUMP HELPERS
// ============================================================

/**
 * Dump the DOM structure of an element for debugging.
 */
export async function dumpDOM(
  frame: Frame,
  selector: string = '#app',
  maxLength: number = 5000,
): Promise<string> {
  const el = frame.locator(selector).first();
  let html = await el.innerHTML();
  
  if (html.length > maxLength) {
    html = html.substring(0, maxLength) + '... [TRUNCATED]';
  }
  
  return html;
}

/**
 * Log all visible text in the webview for debugging.
 */
export async function dumpVisibleText(
  frame: Frame,
  selector: string = '#app',
): Promise<string> {
  const text = await frame.locator(selector).first().innerText();
  
  console.log('=== Visible Text ===');
  console.log(text);
  console.log('====================');
  
  return text;
}
