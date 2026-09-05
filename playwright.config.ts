import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';

/**
 * 被测站点完全由环境变量驱动（playwright.config.ts 顶部经 dotenv 自动加载 .env；
 * 也可用命令行前缀覆盖）。代码内不内置任何站点默认值——目标站点属于配置而非代码：
 *   BASE_URL      被测站点地址（必填）
 *   PLAYBOOK_PATH 被测 playbook 路径（必填）
 * 缺失时启动即失败并给出修复指引，防止套件静默指向错误站点。
 */
const envBaseUrl = process.env.BASE_URL;
const envPlaybookPath = process.env.PLAYBOOK_PATH;

if (!envBaseUrl || !envPlaybookPath) {
  throw new Error(
    '[alva-e2e] Missing required env: BASE_URL / PLAYBOOK_PATH.\n' +
      'Fix: cp .env.example .env  (then edit .env), or export the vars before running.\n' +
      'No in-code default is provided on purpose — the target site is configuration.'
  );
}

// 导出为确定的 string 类型（上方校验已收窄），供 tests/helpers 复用。
export const BASE_URL: string = envBaseUrl;
export const PLAYBOOK_PATH: string = envPlaybookPath;

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

  // 基础 reporter：list + html（永不自动打开）。设置 PATROL_REPORT 环境变量时
  // 额外把 JSON 报告写入指定文件（供 scripts/check-patrol.mjs 判定已知缺陷哨兵，
  // 见 .github/workflows/ci.yml 的每日 @data 巡逻步）。
  reporter: process.env.PATROL_REPORT
    ? [
        ['list'],
        ['html', { open: 'never' }],
        ['json', { outputFile: process.env.PATROL_REPORT }],
      ]
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
