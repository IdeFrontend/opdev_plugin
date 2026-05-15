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
