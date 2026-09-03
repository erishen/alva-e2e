import { defineConfig, devices } from '@playwright/test';

/**
 * Part 1 独立配置：登录链路探索式测试。
 * 复用主套件的浏览器设置，但 testDir 指向 part1 自身（不污染 Part 2 数据套件）。
 * 登录流对限流敏感，故 workers=1、retries=0，避免连续高频访问被 Cloudflare 拦。
 */
export const BASE_URL = process.env.BASE_URL ?? 'https://alva.ai';

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,

  timeout: 90 * 1000,
  expect: { timeout: 30 * 1000 },

  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'on',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 20 * 1000,
    navigationTimeout: 45 * 1000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
