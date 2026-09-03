import { test, expect, Page, Browser } from '@playwright/test';
import { loadDashboard, DashboardData } from './helpers/common';
import { parseIsoDate, daysBetween } from './helpers/parse';

/**
 * 风险表校验。
 * 风险是按天重新评级的（页面写明 "Each risk is rated every day"），
 * 所以除了枚举值合法性，日期新鲜度也是硬指标 —— 评级过期意味着
 * 这套风险结论已经不可信。
 */
test.describe('风险表 @data', () => {
  test.describe.configure({ mode: 'serial' });

  let page: Page;
  let data: DashboardData;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ({ page, data } = await loadDashboard(browser));
  });

  test.afterAll(async () => {
    await page?.close();
  });

  const VALID_PRIORITY = ['High', 'Medium', 'Low'];
  const VALID_TREND = ['stable', 'improving', 'worsening'];

  test('风险条目数量与字段完整性', () => {
    expect(data.risks.length, '风险条目过少，数据可能未加载完').toBeGreaterThanOrEqual(5);

    const empty = data.risks
      .filter((r) => !r.category.trim() || !r.risk.trim() || !r.signal.trim())
      .map((r) => JSON.stringify(r));
    expect(empty, `存在空字段的风险行：${empty.join(' ; ')}`).toEqual([]);
  });

  test('优先级只能是 High / Medium / Low', () => {
    const bad = data.risks
      .filter((r) => !VALID_PRIORITY.includes(r.priority))
      .map((r) => `${r.risk}="${r.priority}"`);
    expect(bad, `优先级取值非法：${bad.join(' ; ')}`).toEqual([]);
  });

  test('趋势只能是 stable / improving / worsening', () => {
    const bad: string[] = [];
    data.risks.forEach((r) => {
      const matched = VALID_TREND.filter((t) => r.trend.toLowerCase().includes(t));
      if (matched.length !== 1) {
        bad.push(`${r.risk}="${r.trend}"`);
      }
    });
    expect(bad, `趋势取值非法或不唯一：${bad.join(' ; ')}`).toEqual([]);
  });

  test('风险名称不重复', () => {
    const names = data.risks.map((r) => r.risk.toLowerCase());
    const dup = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dup, `存在重复风险条目：${dup.join(', ')}`).toEqual([]);
  });

  test('每条风险的最近信号都带日期，且不是未来日期', () => {
    const bad: string[] = [];
    data.risks.forEach((r) => {
      const d = parseIsoDate(r.signal);
      if (!d) {
        bad.push(`${r.risk}：信号文本中没有日期 → "${r.signal.slice(0, 60)}…"`);
        return;
      }
      const lag = daysBetween(new Date(), d);
      if (lag < 0) bad.push(`${r.risk}：信号日期 ${r.signal.match(/\d{4}-\d{2}-\d{2}/)?.[0]} 来自未来`);
    });
    expect(bad, bad.join(' ; ')).toEqual([]);
  });

  test('信号日期不早于 90 天（超出一个季度说明信号源已失效）', () => {
    // 注意区分两个概念：
    //   Trend / Priority —— 每日重评，反映的是「当前判断」
    //   Latest signal    —— 与该风险相关的**最新事件**日期，取决于是否真的发生了新闻，
    //                      没有新事件时日期会停留不动（页面会明说 "No ... item addressed"），
    //                      这是正常表现，不能按「每日更新」来要求。
    // 所以这里只守住 90 天这条「信号管道是否还活着」的下限。
    const stale: string[] = [];
    data.risks.forEach((r) => {
      const d = parseIsoDate(r.signal);
      if (!d) return;
      const lag = daysBetween(new Date(), d);
      if (lag > 90) {
        stale.push(`${r.risk}：${r.signal.match(/\d{4}-\d{2}-\d{2}/)?.[0]}（${lag} 天前）`);
      }
    });
    expect(stale, `以下风险信号已超过 90 天未更新：${stale.join(' ; ')}`).toEqual([]);
  });

  test('信号管道整体健康：至少有一条风险在最近 30 天内有新信号', () => {
    // 如果**所有**风险的信号日期都很旧，说明信号抓取管道整体停摆了 ——
    // 单条陈旧是正常的，全部陈旧才是故障。
    const recent = data.risks.filter((r) => {
      const d = parseIsoDate(r.signal);
      return d !== null && daysBetween(new Date(), d) <= 30;
    });

    const lags = data.risks
      .map((r) => daysBetween(new Date(), parseIsoDate(r.signal)!))
      .sort((a, b) => a - b);

    expect(
      recent.length,
      `没有任何风险信号落在最近 30 天内（最旧 ${Math.max(...lags)} 天，最新 ${Math.min(...lags)} 天），信号管道疑似停摆`
    ).toBeGreaterThan(0);
  });

  test('信号文本是有实质内容的句子，不是占位符', () => {
    const short = data.risks
      .filter((r) => r.signal.replace(/\d{4}-\d{2}-\d{2}/, '').trim().length < 40)
      .map((r) => `${r.risk}="${r.signal}"`);
    expect(short, `信号文本过短，疑似占位：${short.join(' ; ')}`).toEqual([]);
  });

  test('风险分类覆盖多个维度（不是单一类别堆砌）', () => {
    const categories = new Set(data.risks.map((r) => r.category));
    expect(categories.size, `风险分类过于单一：${[...categories].join(', ')}`).toBeGreaterThanOrEqual(3);
  });
});
