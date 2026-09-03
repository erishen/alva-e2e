/**
 * Part 1 登录链路脚手架（注册 → Automation → Playbook → Alert + AI 一致性）。
 *
 * ⚠️ 默认跳过：无凭据时不运行，避免污染 Part 2 数据套件的绿集。
 *    填好 part1/.env（ALVA_EMAIL / ALVA_PASSWORD）后才会执行。
 *
 * ⚠️ 选择器是占位骨架：Alva 的 DOM 类名/流程可能已变。
 *    跑之前请先用 `node` 探测脚本确认真实结构（同 Part 2 的做法），再回填下方 locator。
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'https://alva.ai';
const EMAIL = process.env.ALVA_EMAIL ?? '';
const PASSWORD = process.env.ALVA_PASSWORD ?? '';
const WATCH_TICKER = process.env.WATCH_TICKER ?? 'NVDA';

test.describe('登录链路探索式测试 @part1', () => {
  // 无凭据 → 整组跳过（避免污染 Part 2 数据套件的绿集）
  test.skip(!(EMAIL && PASSWORD), '需要提供 ALVA_EMAIL / ALVA_PASSWORD');

  test('注册 → 进入应用', async ({ page }) => {
    await page.goto(`${BASE}/signup`);
    // TODO: 回填真实选择器
    await page.getByLabel(/email/i).fill(EMAIL);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole('button', { name: /create account|sign up/i }).click();
    // 预期：注册后落在应用内（侧边栏 / 工作台可见）
    await expect(page.getByText(/portfolio|watchlist|explore/i)).toBeVisible();
  });

  test('建 Portfolio Watch Automation', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.getByLabel(/email/i).fill(EMAIL);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole('button', { name: /log ?in/i }).click();

    // TODO: 导航到 Automations → New → 添加标的 + 阈值
    await page.getByRole('link', { name: /automation/i }).click();
    await page.getByRole('button', { name: /new|create/i }).click();
    await page.getByLabel(/ticker|symbol/i).fill(WATCH_TICKER);
    await page.getByRole('button', { name: /save|create/i }).click();

    // 预期：新建的 automation 出现在列表里
    await expect(page.getByText(WATCH_TICKER)).toBeVisible();
  });

  test('建 Playbook', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.getByLabel(/email/i).fill(EMAIL);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole('button', { name: /log ?in/i }).click();

    // TODO: New Playbook → 选标的 → 生成
    await page.getByRole('button', { name: /new playbook/i }).click();
    await page.getByLabel(/ticker|symbol/i).fill(WATCH_TICKER);
    await page.getByRole('button', { name: /generate|build/i }).click();

    // 预期：Playbook 渲染出仪表盘（含行情 KPI）
    const frame = page.frameLocator('iframe[title="Dashboard"]');
    await expect(frame.getByText(WATCH_TICKER)).toBeVisible({ timeout: 60000 });
  });

  test('配置 Alert 并验证收到', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.getByLabel(/email/i).fill(EMAIL);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole('button', { name: /log ?in/i }).click();

    // TODO: 打开某个 Playbook → 配置 Alert（价格/事件触发）→ 保存
    await page.getByRole('button', { name: /alert/i }).click();
    await page.getByRole('button', { name: /save|enable/i }).click();

    // 预期：Alert 出现在 Alert 中心 / 通知列表
    await page.getByRole('link', { name: /alert/i }).click();
    await expect(page.getByText(WATCH_TICKER)).toBeVisible();
  });

  test('AI 一致性：Agent 回答引用的价格应与页面行情一致', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.getByLabel(/email/i).fill(EMAIL);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole('button', { name: /log ?in/i }).click();

    // 打开 Playbook，先读页面上的 SPOT 价格
    const frame = page.frameLocator('iframe[title="Dashboard"]');
    const spotText = (await frame.getByText(/spot/i).first().innerText()).trim();

    // 让 Alva Agent 回答关于该标的价格的问题
    const input = page.getByPlaceholder(/ask|message/i);
    await input.fill('What is the current spot price shown on this page?');
    await input.press('Enter');

    // 预期：Agent 回答里出现的价格应与页面 SPOT 同量级（容差 1%）
    const answer = await page.getByTestId('agent-answer').innerText();
    expect(answer, 'Agent 未给出任何价格数字').toMatch(/\$[\d,]+(\.\d+)?/);
    // TODO: 解析 answer 中的价格，与 spotText 做 ±1% 交叉校验
  });
});
