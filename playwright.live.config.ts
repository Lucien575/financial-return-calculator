import { defineConfig, devices } from '@playwright/test';

/** 对着**线上真实部署**跑同一套 E2E。不启动任何本地服务器。 */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'https://lucien575.github.io/financial-return-calculator/',
    channel: 'chrome',
    ignoreHTTPSErrors: false,
  },
  projects: [{ name: 'live', use: { ...devices['Pixel 7'], channel: 'chrome' } }],
});
