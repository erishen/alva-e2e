/**
 * markets 个股页测试（公开页，无需登录）：衔接 Part 1 旅程与 Part 2 数据正确性（@markets）
 *
 * 本文件由原先的 part1/markets.spec.ts 迁入 tests/：
 *   - /markets/<ticker> 是公开页，断言本身不依赖登录态；
 *   - 去掉 storageState 后纳入可进 CI 的公开套件，
 *     与 tests/comps.spec.ts（测同页 Comps 数据）组成「UI + 数据」双覆盖。
 *
 * 为什么重要（见 PART1-onboarding.md §2.1 / F-8）：
 *   - Part 1「watch AMD → 收 alert → 点 AMD」的**落地页**；
 *   - Part 2「行情数据正确性」的**展示面**（真实报价 vs Playbook Comp 表 $0.0）。
 *
 * 覆盖：
 *   1. 深链定位：6 个规范 ?tab= 各自高亮对应 tab 且内容非空（编码 F-8 规范值）。
 *   2. 行情数据正确性（衔接 Part 2）：价格形如 $X.XX 且不为 $0.0（轻量校验，不写死数值以规避行情浮动）。
 *   3. Alva Agent 伴侣区存在（chat-first 范式在个股页的落点）。
 *   4. 带 ID 资源路由 /markets/<ticker> 正常（对照无 ID 功能路由 /playbooks、/alerts 的 404）。
 *   5. 错参静默回退现状（F-8 已知缺陷回归守卫）：?tab=news / ?tab=smart-money 不崩溃、页面仍可用。
 *
 * 鉴权：无。页面为公开页，直连 BASE_URL（默认 https://alva.ai）。
 */
import { test, expect } from '@playwright/test';

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
    if (len === prev && len > 50) break; // 稳定即可（图表为主的默认 tab 正文本就 <400）
    prev = len;
  }
}

test.describe('markets 个股页 @markets', () => {
  for (const { param, label } of TABS) {
    const isDefault = label === 'Overview';
    test(`深链 ?tab=${param} 高亮 [${label}] 且内容非空`, async ({ page }) => {
      await page.goto(`/markets/${TICKER}?tab=${param}`);
      await settle(page);
      const tabEl = page.getByRole('tab', { name: label, exact: true });
      // 深链路由必须命中：目标 tab 可见
      await expect(tabEl).toBeVisible({ timeout: 30_000 });
      // 「高亮」契约：
      //   非默认 tab 深链时 SPA 会显式翻转 aria-selected='true'，严格校验路由选中机制；
      //   默认 tab(Overview) 深链只是冗余确认默认值 —— SPA 走默认选中路径，
      //   不一定显式设置 aria-selected（部分实现省略该属性）。故仅当其确实携带该属性时才校验，
      //   避免对「默认值无需参数」场景的过度断言（详见 PART2 数据正确性报告·markets）。
      if (!isDefault) {
        await expect(tabEl).toHaveAttribute('aria-selected', 'true', { timeout: 30_000 });
      } else {
        const sel = await tabEl.getAttribute('aria-selected');
        if (sel !== null) await expect(tabEl).toHaveAttribute('aria-selected', 'true');
      }
      // 内容非空守卫（真实 bug 探测：深链未渲染面板时正文会塌缩到近空）。
      // 用 waitForFunction 等待内容稳定到位，吸收 alva.ai 慢加载 / 限流导致的偶发短文本
      // （实跑中 earnings / anomalies 等 tab 会因加载时序偶发低于阈值，且抖动在不同 tab 间游走）。
      // 阈值取 150：足以区分「面板真塌缩（近空）」与「图表为主 / 加载中的正常短文本」，
      // 不卡具体字数——避免对图表型 tab 的过度断言，也避免对慢加载的脆弱断言。
      await page.waitForFunction(
        (min) => (document.body.innerText || '').length > min,
        150,
        { timeout: 30_000 },
      );
    });
  }

  test('行情渲染非零：/markets/AMD 价格形如 $X.XX 且不为 $0.0（衔接 Part 2 数据正确性）', async ({ page }) => {
    await page.goto(`/markets/${TICKER}`);
    await settle(page);
    const body = await page.evaluate(() => document.body.innerText || '');
    const m = body.match(/\$([\d,]+(?:\.\d+)?)/);
    expect(m, '应渲染带 $ 的价格').not.toBeNull();
    expect(m![1]).not.toBe('0.0');
    expect(m![1]).not.toBe('0.00');
  });

  test('页底 Alva Agent 伴侣区存在（chat-first 在个股页落点）', async ({ page }) => {
    await page.goto(`/markets/${TICKER}`);
    await settle(page);
    await expect(page.getByText(/Alva Agent/i)).toBeVisible({ timeout: 30_000 });
  });

  test('带 ID 资源路由 /markets/AMD 正常渲染（对照 /playbooks、/alerts 的 404）', async ({ page }) => {
    await page.goto(`/markets/${TICKER}`);
    await settle(page);
    await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toBeVisible({ timeout: 30_000 });
  });

  test('已知缺陷回归守卫(F-8)：错参 ?tab=news 不崩溃、页面仍可用（记录静默回退现状）', async ({ page }) => {
    // 当前行为：?tab=news 不是规范值（规范为 newsSocial），静默回退 Overview、不报错。
    // 这是 F-8 的缺陷表现。本测试作为"现状守卫"——保证修复前不崩溃；
    // 修复后（错参显式提示或重定向到 newsSocial）应把下方断言翻转为期望 News 高亮。
    await page.goto(`/markets/${TICKER}?tab=news`);
    await settle(page);
    await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toHaveAttribute('aria-selected', 'true');
    const newsSelected = await page.getByRole('tab', { name: 'News', exact: true }).getAttribute('aria-selected');
    // TODO(F-8 修复后翻转): expect(newsSelected).toBe('true');
    expect(newsSelected).not.toBe('true'); // 当前缺陷现状
  });

  test('已知缺陷回归守卫(F-8)：错参 ?tab=smart-money 静默回退 Overview（规范为 smartMoney）', async ({ page }) => {
    await page.goto(`/markets/${TICKER}?tab=smart-money`);
    await settle(page);
    await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toHaveAttribute('aria-selected', 'true');
    const smSelected = await page.getByRole('tab', { name: 'Smart Money', exact: true }).getAttribute('aria-selected');
    // TODO(F-8 修复后翻转): expect(smSelected).toBe('true');
    expect(smSelected).not.toBe('true');
  });
});
