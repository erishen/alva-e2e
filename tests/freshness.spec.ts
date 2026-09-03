import { test, expect, Page, Browser } from '@playwright/test';
import { loadDashboard, DashboardData } from './helpers/common';
import { kpi } from './helpers/extract';
import { parseIsoDate, parseDisplayDate, daysBetween } from './helpers/parse';

/**
 * 数据新鲜度。
 *
 * 不同数据源的合理更新节奏不一样，不能用同一个阈值：
 *   行情      T-1（美股收盘后更新，跨周末最多滞后 3 天）
 *   AI 摘要   每日
 *   分析师评级 每日
 *   财报      按季（披露后才会变）
 * 阈值按各自节奏设定，过松会漏掉「停止更新」这类静默故障。
 */
test.describe('数据新鲜度 @data', () => {
  test.describe.configure({ mode: 'serial' });

  let page: Page;
  let data: DashboardData;
  const today = new Date();

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ({ page, data } = await loadDashboard(browser));
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test('行情快照的更新时间不晚于今天，且不超过 2 天', () => {
    const m = /Updated\s+([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})/.exec(data.allText);
    expect(m, '页面未标注行情快照更新时间').not.toBeNull();

    const updated = parseDisplayDate(m![1]);
    expect(updated, `更新时间无法解析："${m![1]}"`).not.toBeNull();

    const lag = daysBetween(today, updated!);
    expect(lag, `更新时间来自未来：${m![1]}`).toBeGreaterThanOrEqual(0);
    expect(lag, `行情快照已 ${lag} 天未更新（${m![1]}），超过 2 天阈值`).toBeLessThanOrEqual(2);
  });

  test('股价取数日期在最近一周内（美股 T-1，跨周末可滞后 3 天）', () => {
    const asOf = parseIsoDate(kpi(data, 'Spot').sub);
    expect(asOf, `SPOT 缺少 as-of 日期："${kpi(data, 'Spot').sub}"`).not.toBeNull();

    const lag = daysBetween(today, asOf!);
    expect(lag, `股价日期来自未来：${kpi(data, 'Spot').sub}`).toBeGreaterThanOrEqual(0);
    expect(lag, `股价数据滞后 ${lag} 天（${kpi(data, 'Spot').sub}），超过 7 天`).toBeLessThanOrEqual(7);
  });

  test('财报数据的取数日期存在且不在未来（按季更新，阈值 120 天）', () => {
    const m = /As of\s+(\d{4}-\d{2}-\d{2})/.exec(data.allText);
    expect(m, '页面未标注财报数据取数日期').not.toBeNull();

    const asOf = parseIsoDate(m![1]);
    expect(asOf, `财报取数日期无法解析："${m![1]}"`).not.toBeNull();

    const lag = daysBetween(today, asOf!);
    expect(lag, `财报取数日期来自未来：${m![1]}`).toBeGreaterThanOrEqual(0);
    expect(lag, `财报数据已 ${lag} 天未更新（${m![1]}），超过 120 天`).toBeLessThanOrEqual(120);
  });

  test('分析师评级每日刷新，滞后不应超过 7 天', () => {
    const refreshed = parseIsoDate(data.analyst.refreshedOn);
    expect(refreshed, `未找到评级刷新日期："${data.analyst.refreshedOn}"`).not.toBeNull();

    const lag = daysBetween(today, refreshed!);
    expect(lag, `评级日期来自未来：${data.analyst.refreshedOn}`).toBeGreaterThanOrEqual(0);
    expect(lag, `评级数据已 ${lag} 天未更新`).toBeLessThanOrEqual(7);
  });

  test('页面所有时间戳都能解析，不存在畸形日期', () => {
    const bad: string[] = [];
    data.timestamps.forEach((ts) => {
      const hasDate =
        parseIsoDate(ts) !== null || parseDisplayDate(ts) !== null || !/\d{4}/.test(ts);
      if (!hasDate) bad.push(ts);
    });
    expect(bad, `存在无法解析的时间戳：${bad.join(' ; ')}`).toEqual([]);
  });

  test('已报告财报的期间结束日期早于今天', () => {
    const m = /period ended\s+(\d{4}-\d{2}-\d{2})/.exec(data.allText);
    expect(m, '未标注财报期间结束日期').not.toBeNull();

    const periodEnd = parseIsoDate(m![1]);
    const lag = daysBetween(today, periodEnd!);
    expect(lag, `财报期间结束日期来自未来：${m![1]}`).toBeGreaterThanOrEqual(0);
  });
});
