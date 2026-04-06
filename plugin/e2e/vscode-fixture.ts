import {
  test as base, expect, _electron as electron, ElectronApplication, Page,
} from '@playwright/test';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import * as path from 'path';
import * as fs from 'fs';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type VSCodeTestFixture = {};

export type VSCodeWorkerFixture = {
  vscodeApp: ElectronApplication;
  vscodePage: Page;
};

export const test = base.extend<VSCodeTestFixture, VSCodeWorkerFixture>({
  vscodeApp: [
    async ({}, use) => {
    // Download a version of VS Code that satisfies our engines requirement ^1.80.0
      const vscodePath = await downloadAndUnzipVSCode('1.80.0');

      // The workspace root where the extension lives
      const extensionPath = path.resolve(__dirname, '../../');

      // Write a file marker for E2E mode so the extension host backend reliably reads and overrides APIs
      const mockFilePath = path.join(extensionPath, '.e2e-mock');

      try {
        fs.writeFileSync(mockFilePath, 'true');
      }
      catch (e) {
        // ignore
      }

      // Launch VSCode as an electron application using Playwright
      const electronApp = await electron.launch({
        executablePath: vscodePath,
        args: [
          '--no-sandbox',
          '--disable-gpu-sandbox',
          '--disable-updates',
          '--skip-welcome',
          '--skip-release-notes',
          '--disable-workspace-trust',
          `--extensionDevelopmentPath=${extensionPath}`,
          `--user-data-dir=${path.join(extensionPath, '.vscode-test', 'user-data')}`,
        ],
        env: {
          ...process.env,
          E2E_MOCK: 'true',
          ELECTRON_RUN_AS_NODE: undefined,
        } as any,
      });

      await use(electronApp);
      await electronApp.close();

      try {
        if (fs.existsSync(mockFilePath)) {
          fs.unlinkSync(mockFilePath);
        }
      }
      catch (e) {
        // ignore
      }
    },
    { scope: 'worker' },
  ],
  vscodePage: [
    async ({ vscodeApp }, use) => {
      const page = await vscodeApp.firstWindow();

      await use(page);
    },
    { scope: 'worker' },
  ],
});

export { expect };
