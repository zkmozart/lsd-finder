import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests',
  testMatch: /.*\.spec\.mjs/,
  workers: 1,
  timeout: 120000,
  reporter: 'list',
  webServer: process.env.BASE_URL ? undefined : { command: 'node tools/serve.mjs', url: 'http://localhost:4173/', reuseExistingServer: true },
});
