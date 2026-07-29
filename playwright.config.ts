import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:3010',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --hostname 127.0.0.1 --port 3010',
    url: 'http://127.0.0.1:3010',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'iPhone 15 portrait',
      use: { ...devices['iPhone 15'], browserName: 'chromium', channel: 'chrome' },
    },
    {
      name: 'iPad portrait',
      use: { ...devices['iPad (gen 11)'], browserName: 'chromium', channel: 'chrome' },
    },
  ],
});
