/**
 * Part 1 ↔ Part 2 衔接测试：markets 个股页（@part1 @markets）
 *
 * 为什么是衔接区（见 PART1-onboarding.md §2.1 / F-8）：
 *   - Part 1「watch AMD → 收 alert → 点 AMD」的**落地页**；
 *   - Part 2「行情数据正确性」的**展示面**（真实报价 vs Playbook Comp 表 $0.0）。
 *
 * 覆盖：
 *   1. 深链定位：6 个规范 ?tab= 各自高亮对应 tab 且内容非空（编码 F-8 规范值）。
 *   2. 行情数据正确性（衔接 Part 2）：价格形如 $X.XX 且不为 $0.0（仅轻量校验，
 *      不写死数值以规避行情浮动 → 避免 flaky）。
 *   3. Alva Agent 伴侣区存在（chat-first 范式在个股页的落点）。
 *   4. 带 ID 资源路由 /markets/<ticker> 正常（对照无 ID 功能路由 /playbooks、/alerts 的 404）。
 *   5. 错参静默回退现状（F-8 已知缺陷回归守卫）：?tab=news / ?tab=smart-money 不崩溃、
 *      页面仍可用；一旦规范修复（错参显式提示/重定向），把断言翻转为期望 News/Smart Money 高亮。
 *
 * 鉴权：复用 export-state.mjs 导出的会话；无文件则整组跳过，不污染 Part 2 绿集。
 */
import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.BASE_URL ?? 'https://alva.ai';
const AUTH_FILE = resolve(__dirname, '.auth', 'alva.json');
const TICKER = process.env.WATCH_TICKER ?? 'AMD';

// markets 页 6 个 tab 的**规范** ?tab= 值（探针反推：newsSocial / smartMoney 为驼峰，见 F-8）
const TABS = [
  { param: 'overview', label: 'Overview' },
  { param: 'narratives', label: 'Narratives' },
  { param: 'anomalies', label: 'Anomalies' },
  { param: 'newsSocial', label: 'News' },
  { param: 'smartMoney', label: 'Smart Money' },
  { param: 'earnings', label: 'Earnings' },
];

// 等待 SPA 内容稳定：轮询 body 文本长度直到不变（最多 ~12s）
async function settle(page: import('@playwright/test').Page) {
  let prev = -1;
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(1000);
    const len = await page.evaluate(() => (document.body.innerText || '').length);
    if (len === prev && len > 400) break;
    prev = len;
  }
}

test.describe('markets 个股页衔接测试 @part1 @markets', () => {
  test.skip(!existsSync(AUTH_FILE), '需先运行 `node part1/export-state.mjs` 用 Gmail 手动登录并导出会话');

  test.use({ storageState: AUTH_FILE });

  for (const { param, label } of TABS) {
    test(`深链 ?tab=${param} 高亮 [${label}] 且内容非空`, async ({ page }) => {
      await page.goto(`${BASE}/markets/${TICKER}?tab=${param}`);
      await settle(page);
      const tabEl = page.getByRole('tab', { name: label, exact: true });
      await expect(tabEl).toHaveAttribute('aria-selected', 'true', { timeout: 30_000 });
      // 深链是否成功的真正契约是「目标 tab 高亮」(上一行已断言)。长度仅证明页面渲染、
      // 非空白/报错。注意 Overview 本身文字极少(~422 字，图表为主)，故阈值取 >400 而非更高。
      const len = await page.evaluate(() => (document.body.innerText || '').length);
      expect(len).toBeGreaterThan(400);
      // 静默回退的捕获由下方「错参回归守卫」用例负责（断言 News/Smart Money 不高亮）。
    });
  }

  test('行情渲染非零：/markets/AMD 价格形如 $X.XX 且不为 $0.0（衔接 Part 2 数据正确性）', async ({ page }) => {
    await page.goto(`${BASE}/markets/${TICKER}`);
    await settle(page);
    const body = await page.evaluate(() => document.body.innerText || '');
    const m = body.match(/\$([\d,]+(?:\.\d+)?)/);
    expect(m, '应渲染带 $ 的价格').not.toBeNull();
    expect(m![1]).not.toBe('0.0');
    expect(m![1]).not.toBe('0.00');
  });

  test('页底 Alva Agent 伴侣区存在（chat-first 在个股页落点）', async ({ page }) => {
    await page.goto(`${BASE}/markets/${TICKER}`);
    await settle(page);
    await expect(page.getByText(/Alva Agent/i)).toBeVisible({ timeout: 30_000 });
  });

  test('带 ID 资源路由 /markets/AMD 正常渲染（对照 /playbooks、/alerts 的 404）', async ({ page }) => {
    await page.goto(`${BASE}/markets/${TICKER}`);
    await settle(page);
    await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toBeVisible({ timeout: 30_000 });
  });

  test('已知缺陷回归守卫(F-8)：错参 ?tab=news 不崩溃、页面仍可用（记录静默回退现状）', async ({ page }) => {
    // 当前行为：?tab=news 不是规范值（规范为 newsSocial），静默回退 Overview、不报错。
    // 这是 F-8 的缺陷表现。本测试作为"现状守卫"——保证修复前不崩溃；
    // 修复后（错参显式提示或重定向到 newsSocial）应把下方断言翻转为期望 News 高亮。
    await page.goto(`${BASE}/markets/${TICKER}?tab=news`);
    await settle(page);
    await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toHaveAttribute('aria-selected', 'true');
    const newsSelected = await page.getByRole('tab', { name: 'News', exact: true }).getAttribute('aria-selected');
    // TODO(F-8 修复后翻转): expect(newsSelected).toBe('true');
    expect(newsSelected).not.toBe('true'); // 当前缺陷现状
  });

  test('已知缺陷回归守卫(F-8)：错参 ?tab=smart-money 静默回退 Overview（规范为 smartMoney）', async ({ page }) => {
    await page.goto(`${BASE}/markets/${TICKER}?tab=smart-money`);
    await settle(page);
    await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toHaveAttribute('aria-selected', 'true');
    const smSelected = await page.getByRole('tab', { name: 'Smart Money', exact: true }).getAttribute('aria-selected');
    // TODO(F-8 修复后翻转): expect(smSelected).toBe('true');
    expect(smSelected).not.toBe('true');
  });
});
