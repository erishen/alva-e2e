import { Page, expect, FrameLocator, Browser } from '@playwright/test';
import { dashboardFrame, extractDashboard, DashboardData } from './extract';
import { PLAYBOOK_PATH as CONFIG_PLAYBOOK_PATH } from '../../playwright.config';

/**
 * 被测 playbook 路径：单一事实来源是 playwright.config.ts（从 .env 读取，
 * 无代码内默认值）。这里 re-export 供各 spec 使用。
 */
export const PLAYBOOK_PATH = CONFIG_PLAYBOOK_PATH;

export const PAGE_TITLE = 'AMD Deep-Dive';
export const COMPANY_NAME = 'Advanced Micro Devices';

/**
 * 仪表盘数据是渐进填充的：骨架（—/Loading…）先渲染，行情/财报数字
 * 要等 20+ 个 API 串行返回后才插入 DOM。所有等待都走这个超时。
 */
export const DATA_TIMEOUT = 90_000;

export { dashboardFrame, extractDashboard };
export type { DashboardData };

/** 导航到 playbook 页面并等待外壳就绪（标题可见） */
export async function gotoPlaybook(page: Page): Promise<void> {
  await page.goto(PLAYBOOK_PATH, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(PAGE_TITLE).first()).toBeVisible();
}

/**
 * 拿到内容仪表盘（用于需要走 locator 的可见性断言）。
 * 正文不在主文档里，而在 <iframe title="Dashboard"> 中。
 */
export function dashboard(page: Page): FrameLocator {
  return page.frameLocator('iframe[title="Dashboard"]');
}

/** iframe 内唯一的语义化 h1（主文档没有任何 h1~h6） */
export function companyHeading(page: Page) {
  return dashboard(page).getByRole('heading', {
    name: /Advanced Micro Devices/,
  });
}

/**
 * 等待仪表盘数据真正填充完成。
 *
 * 不能只等「公司名可见」—— 骨架期标题就已经在了，那时数字全是 —。
 * 这里用三个信号同时成立才算就绪：
 *   1. 至少一个 KPI 值是真实价格（$xxx）
 *   2. 可比公司表至少有 5 个 ticker
 *   3. 财务表至少有 15 个数据行
 * 三者都满足才说明行情、财报、可比三组数据都到位了。
 */
export async function waitForDataReady(
  page: Page,
  timeout = DATA_TIMEOUT
): Promise<void> {
  const frame = await dashboardFrame(page);
  await frame.waitForFunction(
    () => {
      const vals = [...document.querySelectorAll('.kpi-value')].map((e) =>
        (e.textContent || '').trim()
      );
      const hasPrice = vals.some((v) => /^\$\d/.test(v));
      const comps = document.querySelectorAll('.comps-grid .cg-tk').length;
      const finRows = document.querySelectorAll('.table-row.table-body-row').length;

      // 估值倍数的 `sub` 口径（"TTM P/E" 等）是页面最晚填充的字段之一：
      // 早期快照里 kpi-value 已是价格、但 kpi-sub 还是空占位。若不等它，
      // valuation.spec 的「带 TTM 口径说明」断言会偶发误红（value 就绪、sub 未就绪）。
      // 因此把「估值 KPI 的 value 已是数字且 sub 含 TTM」也作为就绪信号。
      const valuationReady = ['P/E', 'P/S', 'EV / EBITDA'].every((label) => {
        const cell = [...document.querySelectorAll('.kpi-cell')].find(
          (c) =>
            (c.querySelector('.kpi-label')?.textContent || '')
              .trim()
              .toLowerCase() === label.toLowerCase()
        );
        if (!cell) return false;
        const v = (cell.querySelector('.kpi-value')?.textContent || '').trim();
        const sub = (cell.querySelector('.kpi-sub')?.textContent || '')
          .toUpperCase();
        return /^[$\d]/.test(v) && sub.includes('TTM');
      });

      return hasPrice && comps >= 5 && finRows >= 15 && valuationReady;
    },
    undefined,
    { timeout }
  );
}

/**
 * 打开页面并抓取一份完整数据快照。
 *
 * 数据是只读的，一个 describe 内共享一次加载即可 —— 每个用例都重新 goto
 * 会让套件慢到不可用（单次加载 20~40 秒）。
 */
export async function loadDashboard(
  browser: Browser
): Promise<{ page: Page; data: DashboardData }> {
  const page = await browser.newPage();
  await gotoPlaybook(page);
  await waitForDataReady(page);
  const data = await extractDashboard(page);
  return { page, data };
}
