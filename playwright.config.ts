import { defineConfig, devices } from '@playwright/test';

/**
 * 用本机已安装的 Chrome（channel: 'chrome'），不额外下载浏览器。
 * 手机视口按 vivo X200s 实测的 360dp 宽设置。
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/financial-return-calculator/',
    channel: 'chrome',
    trace: 'off',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: 'chrome' } },
  ],
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/financial-return-calculator/',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
