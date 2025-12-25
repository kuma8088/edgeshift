import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e/specs',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // 本番環境なので並列実行しない
  reporter: 'html',
  use: {
    baseURL: 'https://edgeshift.tech',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  timeout: 60000, // シーケンス処理待ち用

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
