const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: process.env.RA_PROBE_DIR || './tests/instrument',
  testMatch: '**/*.spec.cjs',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  workers: 1,
  retries: 0,
  forbidOnly: true,
  globalTimeout: 120_000,
  reporter: [['json', { outputFile: process.env.RA_RAW_REPORT }]],
  outputDir: process.env.RA_RUN_DIR || '../.tmp/ai-cohort-web/p00a/playwright',
  use: { connectOptions: { wsEndpoint: process.env.RA_BROWSER_WS }, headless: true, serviceWorkers: 'block' },
});
