import { test, expect, Page, Browser } from '@playwright/test';
import { loadDashboard, DashboardData } from './helpers/common';
import { kpi, FinTable } from './helpers/extract';
import {
  parseMoney,
  parseMultiple,
  parseCount,
  parseIsoDate,
  daysBetween,
  relativeDiff,
} from './helpers/parse';

/**
 * 估值与分析师评级校验。
 *
 * 重点是「估值倍数必须能被基础数据反推验证」：
 * 市值 ÷ P/S 应当等于 TTM 营收，而这个 TTM 营收又能从季度表独立算出来。
 * 三者一旦对不上，说明倍数、市值、营收里至少有一个取错了口径。
 */
test.describe('估值与分析师评级 @data', () => {
  test.describe.configure({ mode: 'serial' });

  let page: Page;
  let data: DashboardData;
  let quarterly: FinTable;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ({ page, data } = await loadDashboard(browser));
    quarterly = data.tables.find(
      (t) => t.kind === 'Metric' && /^Q\d FY/.test(t.headers[1] || '')
    )!;
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test('估值倍数都是正数，且带 TTM 口径说明', () => {
    for (const label of ['P/E', 'P/S', 'EV / EBITDA']) {
      const raw = kpi(data, label).value;
      const v = parseMultiple(raw);
      expect(v, `${label}="${raw}" 不是合法倍数`).not.toBeNull();
      expect(v!, `${label} 应为正数`).toBeGreaterThan(0);
      expect(
        kpi(data, label).sub.toUpperCase(),
        `${label} 缺少 TTM 口径说明`
      ).toContain('TTM');
    }
  });

  test('【跨表校验】市值 ÷ P/S 等于季度表算出的 TTM 营收', () => {
    const marketCap = parseMoney(kpi(data, 'Market cap').value)!;
    const ps = parseMultiple(kpi(data, 'P/S').value)!;

    // TTM = 季度表里全部「已报告」季度（非预测列）的营收之和
    const revRow = quarterly.rows.find((r) => r.metric === 'Revenue')!;
    const ttmRevenue = revRow.cells
      .filter((c) => !c.forecast)
      .reduce((sum, c) => sum + (parseMoney(c.text) ?? 0), 0);

    expect(ttmRevenue, 'TTM 营收为 0，季度表数据异常').toBeGreaterThan(0);

    const implied = marketCap / ps;
    const diff = relativeDiff(implied, ttmRevenue);

    expect(
      diff,
      `P/S 反推营收 ${implied.toFixed(2)}B 与季度表 TTM 营收 ${ttmRevenue.toFixed(2)}B 相差 ${(diff * 100).toFixed(2)}%，超出 3% 容差`
    ).toBeLessThan(0.03);
  });

  test('估值口径标注的截止季度与季度表最后一个已报告季度一致', () => {
    // 页面标注形如 "TTM through Q2 FY26"，季度表最后一个历史列应同为 Q2 FY26
    const m = /TTM through\s+(Q\d FY\d{2})/i.exec(data.allText);
    expect(m, '页面未标注 TTM 截止季度').not.toBeNull();

    const revRow = quarterly.rows.find((r) => r.metric === 'Revenue')!;
    const lastReported = revRow.cells
      .map((c, i) => ({ c, header: quarterly.headers[i + 1] }))
      .filter((x) => !x.c.forecast)
      .pop();

    expect(
      lastReported?.header.replace(/\s+/g, ' ').trim(),
      `TTM 口径标注为 ${m![1]}，但季度表最后一个已报告季度是 ${lastReported?.header}`
    ).toBe(m![1]);
  });

  test('【跨表校验】P/E 与 TTM 每股收益方向一致（盈利为正、亏损为 NM）', () => {
    const pe = parseMultiple(kpi(data, 'P/E').value)!;
    const epsRow = quarterly.rows.find((r) => r.metric === 'EPS (diluted)')!;
    const ttmEps = epsRow.cells
      .filter((c) => !c.forecast)
      .reduce((sum, c) => sum + (parseMoney(c.text) ?? 0), 0);

    expect(ttmEps, 'TTM 每股收益为 0，无法计算 P/E').toBeGreaterThan(0);

    // P/E 与股价/TTM EPS 同量级即可（估值快照与行情快照取数日不同，允许 10% 偏差）
    const spot = parseMoney(kpi(data, 'Spot').value)!;
    const impliedPe = spot / ttmEps;
    const diff = relativeDiff(impliedPe, pe);
    expect(
      diff,
      `P/E ${pe} 与 股价/TTM EPS（${spot}/${ttmEps.toFixed(2)}）= ${impliedPe.toFixed(1)} 相差过大`
    ).toBeLessThan(0.1);
  });

  test('目标价：一致预期落在最低~最高区间内', () => {
    const { consensus, rangeLow, rangeHigh } = data.analyst;
    const c = parseMoney(consensus);
    const lo = parseMoney(rangeLow);
    const hi = parseMoney(rangeHigh);

    expect(c, `一致预期目标价无法解析："${consensus}"`).not.toBeNull();
    expect(lo, `区间下沿无法解析："${rangeLow}"`).not.toBeNull();
    expect(hi, `区间上沿无法解析："${rangeHigh}"`).not.toBeNull();

    expect(hi!, '区间上沿应大于下沿').toBeGreaterThan(lo!);
    expect(c!, `一致预期 ${consensus} 不在区间 [${rangeLow}, ${rangeHigh}] 内`).toBeGreaterThanOrEqual(lo!);
    expect(c!, `一致预期 ${consensus} 不在区间 [${rangeLow}, ${rangeHigh}] 内`).toBeLessThanOrEqual(hi!);
  });

  test('分析师覆盖数：90 天不少于 30 天（累计口径）且均为正数', () => {
    const d30 = parseCount(data.analyst.coverage30d);
    const d90 = parseCount(data.analyst.coverage90d);

    expect(d30, `30 天覆盖数无法解析："${data.analyst.coverage30d}"`).not.toBeNull();
    expect(d90, `90 天覆盖数无法解析："${data.analyst.coverage90d}"`).not.toBeNull();
    expect(d30!, '30 天覆盖数应为正数').toBeGreaterThan(0);
    expect(d90!, `90 天覆盖数 ${d90} 不应少于 30 天的 ${d30}`).toBeGreaterThanOrEqual(d30!);
  });

  test('各口径平均目标价均为正数金额', () => {
    for (const [label, raw] of [
      ['一致预期', data.analyst.consensus],
      ['中位数', data.analyst.median],
      ['30 日均值', data.analyst.avgPt30d],
      ['90 日均值', data.analyst.avgPt90d],
    ] as const) {
      const v = parseMoney(raw);
      expect(v, `${label}目标价无法解析："${raw}"`).not.toBeNull();
      expect(v!, `${label}目标价应为正数`).toBeGreaterThan(0);
    }
  });

  test('评级数据标注了刷新日期且足够新鲜', () => {
    const refreshed = parseIsoDate(data.analyst.refreshedOn);
    expect(refreshed, `未找到评级刷新日期："${data.analyst.refreshedOn}"`).not.toBeNull();

    const lag = daysBetween(new Date(), refreshed!);
    expect(lag, `评级数据来自未来：${data.analyst.refreshedOn}`).toBeGreaterThanOrEqual(0);
    expect(lag, `评级数据过期：${data.analyst.refreshedOn}（${lag} 天前）`).toBeLessThanOrEqual(7);
  });

  test('财报日历：下一次财报日期晚于上一次', () => {
    // Earnings monitor 里同时有 next / last 两个日期，顺序颠倒即为数据错误
    const next = /Next earnings[\s\S]{0,200}?([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})/.exec(data.allText);
    const last = /Last reported[\s\S]{0,200}?([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})/.exec(data.allText);

    expect(next, '未找到下一次财报日期').not.toBeNull();
    expect(last, '未找到上一次财报日期').not.toBeNull();

    const nd = new Date(next![1]);
    const ld = new Date(last![1]);
    expect(Number.isNaN(nd.getTime()), `下次财报日期无法解析：${next![1]}`).toBe(false);
    expect(Number.isNaN(ld.getTime()), `上次财报日期无法解析：${last![1]}`).toBe(false);
    expect(nd.getTime(), `下次财报 ${next![1]} 应晚于上次 ${last![1]}`).toBeGreaterThan(ld.getTime());
  });
});
