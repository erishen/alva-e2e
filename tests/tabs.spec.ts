import { test, expect, Page, Browser } from '@playwright/test';
import {
  gotoPlaybook,
  waitForDataReady,
  dashboard,
  DATA_TIMEOUT,
} from './helpers/common';

/**
 * Tab 导航。
 *
 * 实测结论（决定了这里的断言方式）：
 *   1. Tab 是 <div class="tab-item">，没有 role="tab" / aria-selected
 *      —— 可访问性缺失，只能靠 class="active" 判断当前选中项。
 *   2. 切换 Tab 只改变各 section 的**可见性**，数据始终在 DOM 里
 *      （切 Tab 前后 textContent 快照完全一致）。
 *   所以这里断言的是「active 状态切换 + 目标区块可见」，
 *   数据正确性由 data-*.spec / market-data 等用例负责，不在这里重复。
 */
const TABS: Array<{ tab: string; panel: RegExp }> = [
  { tab: 'Overview', panel: /Market snapshot/ },
  { tab: 'Thesis', panel: /Bull case/i },
  { tab: 'Financials', panel: /Valuation snapshot/i },
  { tab: 'Comps', panel: /Competitive landscape/i },
  { tab: 'Catalysts', panel: /upcoming events/i },
  { tab: 'Risks', panel: /break the AMD thesis/i },
  { tab: 'News & Social', panel: /press releases/i },
];

test.describe('Tab 导航 @ui', () => {
  test.describe.configure({ mode: 'serial' });

  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    page = await browser.newPage();
    await gotoPlaybook(page);
    await waitForDataReady(page);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  /**
   * 页面里其实有 3 组 Tab 栏，容易混淆：
   *   主导航    .tab-underline  → Overview / Thesis / Financials / Comps / ...
   *   Catalysts .tab-pill       → Upcoming / Delivered / Missed
   *   News      .tab-pill       → All / News / X
   * 每组各自维护一个 active，因此断言「只有一个 active」时必须限定在主导航内。
   */
  const mainTabBar = () => dashboard(page).locator('.tab-underline');
  const mainTab = (name: string) => mainTabBar().locator('.tab-item', { hasText: name }).first();

  test('主 Tab 栏完整显示七个标签', async () => {
    for (const { tab } of TABS) {
      await expect(mainTab(tab)).toBeVisible();
    }
  });

  test('默认选中 Overview', async () => {
    await expect(mainTab('Overview')).toHaveClass(/active/);
  });

  for (const { tab, panel } of TABS) {
    test(`点击 ${tab}：该 Tab 变为选中态且对应区块可见`, async () => {
      const tabEl = mainTab(tab);
      await expect(tabEl).toBeVisible();
      await tabEl.click();

      // 选中态：目标 tab 带 active，且主导航内只有这一个 active
      await expect(tabEl).toHaveClass(/active/);
      const activeCount = await mainTabBar().locator('.tab-item.active').count();
      expect(activeCount, `主导航内同时有 ${activeCount} 个 Tab 处于选中态`).toBe(1);

      // 目标区块可见。注意：面板里存在隐藏的引导句（如 Thesis 的
      // "…the AMD bull case…"），必须过滤出真正可见的元素再断言。
      await expect(
        dashboard(page).getByText(panel).filter({ visible: true }).first()
      ).toBeVisible({ timeout: DATA_TIMEOUT });
    });
  }

  test('七个 Tab 可以依次来回切换（状态不卡死）', async () => {
    for (const { tab } of [...TABS].reverse()) {
      await mainTab(tab).click();
      await expect(mainTab(tab)).toHaveClass(/active/);
    }

    // 回到 Overview 仍应正常
    await mainTab('Overview').click();
    await expect(
      dashboard(page).getByText(/Market snapshot/).filter({ visible: true }).first()
    ).toBeVisible({ timeout: DATA_TIMEOUT });
  });

  test('子 Tab 计数自洽：News 的 All 等于各分类之和', async () => {
    // News 子 Tab 形如 "All 5" / "News 3" / "X 2" —— 总数应等于分项之和，
    // 对不上说明筛选逻辑或计数取错了口径。
    // 该子 Tab 栏只在 News & Social 面板激活时才可见，先切过去。
    await mainTab('News & Social').click();
    await expect(mainTab('News & Social')).toHaveClass(/active/);

    const newsBar = dashboard(page).locator('.tab-pill').filter({ hasText: 'All' });
    await expect(newsBar).toBeVisible({ timeout: DATA_TIMEOUT });

    const counts = await newsBar.locator('.tab-item').evaluateAll((els) =>
      els.map((e) => {
        const t = (e.textContent || '').trim();
        const m = /(.+?)\s+(\d+)$/.exec(t);
        return m ? { label: m[1].trim(), count: Number(m[2]) } : null;
      })
    );

    expect(counts.length, '未识别到 News 子 Tab 计数').toBeGreaterThanOrEqual(3);
    const all = counts.find((c) => c && c.label === 'All');
    expect(all, `未找到 All 计数：${JSON.stringify(counts)}`).toBeTruthy();

    const parts = counts.filter((c) => c && c.label !== 'All') as {
      label: string;
      count: number;
    }[];
    const sum = parts.reduce((s, p) => s + p.count, 0);
    expect(
      sum,
      `子 Tab 计数不自洽：All=${all!.count}，分项合计 ${sum}（${parts
        .map((p) => `${p.label} ${p.count}`)
        .join(' + ')}）`
    ).toBe(all!.count);
  });
});
