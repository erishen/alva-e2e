/**
 * Part 1 登录链路探索式测试（@part1）
 *
 * 产品事实（已用探针确认真实结构，非凭截图猜）：
 *   - Alva 是**聊天驱动的 AI agent**，不是表单产品。Playbook / Alert / Automation
 *     都靠跟 Alva 对话生成，没有 /playbooks、/alerts 这种直接表单页
 *     （直接访问会落到 404 的 "Go Home" 页）。
 *   - 持久左侧栏：New Chat / Explore / Portfolio / Markets / Channels / Alva / for-you
 *   - 首页：AI agent 问候 + 快捷卡（Connect Portfolio / Chat / Tasks / Alerts / Memory / Files）
 *   - Explore 页：已发布 Playbook 列表（如 "AMD Deep-Dive"）+ 分类标签
 *   - 聊天输入框是 DIV[role="textbox"]（placeholder "Ask Alva anything..."），在
 *     [data-testid="agent-chat-tab"] 面板里；全站仅 2 个稳定 data-testid：
 *     sidebar-user、agent-chat-tab。
 *
 * 登录方式：用 Gmail / Google SSO 登录后，由 export-state.mjs 导出会话文件复用，
 * 本套件**不复现登录**。无该文件则整组跳过，避免污染 Part 2 数据套件的绿集。
 *
 * ⚠️ 限流风险：Alva 后端对高频/出口 IP 有限流，AI 回复（test 5）可能超时。
 *   该条为已知脆弱点，失败不影响"登录链路可达性"结论，详细问题见 PART1-onboarding.md。
 */
import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.BASE_URL ?? 'https://alva.ai';
const AUTH_FILE = resolve(__dirname, '.auth', 'alva.json');
const ASK = process.env.WATCH_TICKER ?? 'AAPL';

test.describe('登录链路探索式测试 @part1', () => {
  test.skip(!existsSync(AUTH_FILE), '需先运行 `node part1/export-state.mjs` 用 Gmail 手动登录并导出会话');

  test.use({ storageState: AUTH_FILE });

  // 等待 SPA 应用壳加载完毕：常驻左侧栏出现即视为已登录进入工作台。
  // 注意：聊天面板（agent-chat-tab）是首页专属伴侣，在 /explore 等路由会被收起，
  // 故不作为通用就绪条件，仅聊天测试在首页显式使用。
  async function waitForWorkspace(page: import('@playwright/test').Page) {
    await expect(page.getByText('Portfolio')).toBeVisible({ timeout: 30_000 });
  }

  test('1) 登录后进入工作台：左侧栏 + AI agent 问候可见', async ({ page }) => {
    await page.goto(BASE);
    await waitForWorkspace(page);
    // AI agent 问候语（首页真实文本）
    await expect(page.getByText(/your AI investing agent/i)).toBeVisible();
  });

  test('2) Explore 可达且列出已发布 Playbook', async ({ page }) => {
    await page.goto(`${BASE}/explore`);
    await waitForWorkspace(page);
    // 已发布的示例 Playbook（探针确认存在于 Explore 列表）
    await expect(page.getByText('AMD Deep-Dive')).toBeVisible({ timeout: 30_000 });
    // 分类标签也存在，证明 Explore 内容区正常渲染（多匹配取 first 避开 strict mode）
    await expect(page.getByText(/Asset Deepdive|Popular|Smart Screener/i).first()).toBeVisible();
  });

  test('3) 首页快捷入口可达：Alerts / Tasks / Memory / Files', async ({ page }) => {
    await page.goto(BASE);
    await waitForWorkspace(page);
    // 首页 AI agent 区的快捷卡（探针确认）
    await expect(page.getByText('Alerts')).toBeVisible();
    await expect(page.getByText('Tasks')).toBeVisible();
    await expect(page.getByText('Memory')).toBeVisible();
    await expect(page.getByText('Files')).toBeVisible();
  });

  test('4) 聊天入口可用：能输入并提交消息', async ({ page }) => {
    await page.goto(BASE);
    await waitForWorkspace(page);
    await page.getByTestId('agent-chat-tab').click();
    const box = page.getByRole('textbox');
    await expect(box).toBeVisible();
    await box.click();
    await box.type(`What is the current price of ${ASK}?`);
    await box.press('Enter');
    // 用户消息进入对话区（不依赖助手回复，验证输入链路）
    await expect(page.getByText(`What is the current price of ${ASK}?`)).toBeVisible({
      timeout: 15_000,
    });
  });

  test('5) AI 一致性：助手回复应给出带 $ 的价格', async ({ page }) => {
    await page.goto(BASE);
    await waitForWorkspace(page);
    await page.getByTestId('agent-chat-tab').click();
    const box = page.getByRole('textbox');
    await box.click();
    await box.type(`What is the current price of ${ASK}?`);
    await box.press('Enter');
    // 宽容等待：助手回复出现且含 $ 价格（受后端限流影响，超时即暴露脆弱点）
    await expect(page.getByText(/\$[\d,]+(\.\d+)?/)).toBeVisible({ timeout: 60_000 });
  });
});
