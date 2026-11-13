import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:1420',
    viewport: { width: 1440, height: 900 },
    headless: true,
    launchOptions: {
      executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://127.0.0.1:1420',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
