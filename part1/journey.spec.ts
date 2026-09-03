/**
 * Part 1 旅程「空状态 + 可达性」骨架（@part1-journey）
 *
 * 产品事实（probe-journey.mjs 已实测）：
 *   - `?tab=portfolio` 未连账户时主区是「Connect Portfolio / Connect IM」空状态引导页，
 *     没有真实 watch 列表。
 *   - `?tab=alerts` 未连账户时主区是「Get Started / Set up your Alpha Radar」空状态引导页，
 *     没有真实 alert 列表。
 *   - 建 watch / 收 alert 两步需连接个人财务账户；发聊天指令依赖 LLM，沙箱出口 IP 下
 *     回复偶发不稳定。故完整端到端（watch 真建出 + alert 真收到）CI 不可靠，不纳入本骨架。
 *
 * 本骨架只验证「不连账户也能可靠断言」的部分：各路由可达 + 空状态引导正确 + 聊天可输入
 * 并提交「建 watch」指令（消息进入对话即过，不依赖 LLM 回复）。命中 JD 的 P2 空状态/边界类。
 *
 * 登录方式：复用 export-state.mjs 导出的会话，不复现登录。无该文件则整组跳过。
 */
import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.BASE_URL ?? 'https://alva.ai';
const AUTH_FILE = resolve(__dirname, '.auth', 'alva.json');
const WATCH_CMD = process.env.WATCH_CMD ?? 'watch AMD stock price and alert me if it drops below $100';

test.describe('Part 1 旅程空状态骨架 @part1-journey', () => {
  test.skip(!existsSync(AUTH_FILE), '需先运行 `node part1/export-state.mjs` 用 Gmail 手动登录并导出会话');
  test.use({ storageState: AUTH_FILE });

  test('1) Portfolio 路由：未连账户显示 Connect Portfolio 空状态引导', async ({ page }) => {
    await page.goto(`${BASE}/?tab=portfolio`);
    // 未连账户 → 主区应呈现「连接账户」引导（区别于真实 watch 列表）
    await expect(page.getByText(/Connect Portfolio/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Watch your portfolio 24\/7/i)).toBeVisible();
  });

  test('2) Alerts 路由：未连账户显示 Set up Alpha Radar 空状态引导', async ({ page }) => {
    await page.goto(BASE);
    // 通过点击首页 Alerts chip 进入（比 ?tab= 查询参数更可靠，与 onboarding test 3 同模式）
    await page.getByText('Alerts').click();
    // :has-text() 匹配包含该文本的任意元素（"Alpha Radar" 在页面出现 28 处，需 .first() 避开 strict mode）
    await expect(page.locator(':has-text("Alpha Radar")').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(':has-text("Connect Portfolio")').first()).toBeVisible();
  });

  test('3) 聊天可触发建 watch：输入并提交指令，消息进入对话', async ({ page }) => {
    await page.goto(BASE);
    // 先激活首页聊天面板（agent-chat-tab），composer 才可见
    await page.getByTestId('agent-chat-tab').click();
    const box = page.getByRole('textbox');
    await expect(box).toBeVisible({ timeout: 30_000 });
    await box.click();
    await box.type(WATCH_CMD);
    await box.press('Enter');
    // 用户消息进入对话区即过（不依赖助手回复；验证输入链路 + 指令被接受）
    await expect(page.getByText(WATCH_CMD)).toBeVisible({ timeout: 15_000 });
  });
});
