import { defineConfig, devices } from '@playwright/test';

/**
 * 被测站点是 alva.ai 的公开 playbook 页面（线上环境，非本地服务）。
 * 因此这里不配置 webServer —— 没有需要拉起的 SUT，
 * 所有测试直连 https://alva.ai。
 *
 * 环境变量：
 *   BASE_URL    覆盖被测地址，默认 https://alva.ai
 *   PLAYBOOK_PATH 覆盖 playbook 路径，默认 /u/lake/playbooks/amd-deep-dive
 */
export const BASE_URL = process.env.BASE_URL ?? 'https://alva.ai';
export const PLAYBOOK_PATH =
  process.env.PLAYBOOK_PATH ?? '/u/lake/playbooks/amd-deep-dive';

export default defineConfig({
  testDir: './tests',
  // 线上站点有限流迹象，压低并发避免数据区块加载不出来
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 2 : 2,

  // 线上站点 + 客户端渲染，比本地服务慢，超时整体放宽
  timeout: 90 * 1000,
  expect: { timeout: 30 * 1000 },

  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // 客户端渲染的仪表盘，用 domcontentloaded 起步，
    // 具体元素等待交给各测试的显式断言（不用 networkidle，长轮询站点永远不会 idle）
    actionTimeout: 20 * 1000,
    navigationTimeout: 45 * 1000,
  },

  // 只跑 chromium 单端：本项目验证的是数据正确性，
  // 数据内容不随视口变化，多端 project 只会让每个用例重复加载一次慢速页面。
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
