import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './plugin/e2e',
  timeout: 360_000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: 'test-results',
  use: { trace: 'on-first-retry' },
  reporter: 'list',
});
