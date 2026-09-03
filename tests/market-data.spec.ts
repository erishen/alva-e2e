import { test, expect, Page, Browser } from '@playwright/test';
import { loadDashboard, DashboardData } from './helpers/common';
import { kpi } from './helpers/extract';
import { parseMoney, parsePercent, parseIsoDate, daysBetween } from './helpers/parse';

/**
 * 行情 KPI 校验。
 *
 * 原则：不写死具体数值（行情每天都在变），只校验
 *   ① 格式可解析  ② 数值落在合理区间  ③ 指标之间能通过公式互相印证
 * 第 ③ 类是最有价值的 —— 它能抓出「某个指标算错了」这种真实的业务 bug。
 */
test.describe('行情 KPI @data', () => {
  test.describe.configure({ mode: 'serial' });

  let page: Page;
  let data: DashboardData;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ({ page, data } = await loadDashboard(browser));
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test('SPOT 是合法价格且大于 0', () => {
    const spot = parseMoney(kpi(data, 'Spot').value);
    expect(spot, `SPOT 无法解析为金额："${kpi(data, 'Spot').value}"`).not.toBeNull();
    expect(spot!).toBeGreaterThan(0);
    expect(spot!, '美股单价不应超过 10 万美元').toBeLessThan(100_000);
  });

  test('涨跌幅指标可解析且幅度在合理范围（±100% 以内）', () => {
    for (const label of ['30d return', 'YTD return', 'vs SPX 30d']) {
      const pct = parsePercent(kpi(data, label).value);
      expect(pct, `${label} 无法解析为百分比："${kpi(data, label).value}"`).not.toBeNull();
      expect(Math.abs(pct!), `${label} 涨跌幅超出合理范围`).toBeLessThan(1000);
    }
  });

  test('涨跌方向的样式标记与数值符号一致（涨红跌绿的显示不反向）', () => {
    const wrong: string[] = [];
    for (const k of data.kpis) {
      const pct = parsePercent(k.value);
      if (pct === null) continue;

      const classes = k.valueCls.split(/\s+/);
      if (classes.includes('neg') && pct >= 0) {
        wrong.push(`${k.label}=${k.value} 标了 neg 但值为非负`);
      }
      if (classes.includes('pos') && pct <= 0) {
        wrong.push(`${k.label}=${k.value} 标了 pos 但值为非正`);
      }
    }
    expect(wrong, `涨跌样式与数值符号不一致：${wrong.join(' ; ')}`).toEqual([]);
  });

  test('52 周高点必须不低于当前股价', () => {
    const spot = parseMoney(kpi(data, 'Spot').value)!;
    const high = parseMoney(kpi(data, '52w high').value)!;
    expect(high, `52w high 无法解析："${kpi(data, '52w high').value}"`).not.toBeNull();
    expect(
      high,
      `52 周高点 ${high} 低于当前股价 ${spot}，逻辑不成立`
    ).toBeGreaterThanOrEqual(spot);
  });

  test('「距高点回撤」可由股价与 52 周高点算出（交叉校验）', () => {
    const spot = parseMoney(kpi(data, 'Spot').value)!;
    const high = parseMoney(kpi(data, '52w high').value)!;
    const shown = parsePercent(kpi(data, '52w high').sub);

    expect(shown, `副标题不是回撤百分比："${kpi(data, '52w high').sub}"`).not.toBeNull();

    const expected = ((spot - high) / high) * 100;
    // 页面数值保留 2 位小数，容差取 0.05 个百分点
    expect(
      Math.abs(expected - shown!),
      `回撤计算不一致：由 SPOT ${spot} 与 52w high ${high} 算得 ${expected.toFixed(2)}%，页面显示 ${shown}%`
    ).toBeLessThan(0.05);
  });

  test('回撤方向正确：股价低于高点时回撤为负', () => {
    const spot = parseMoney(kpi(data, 'Spot').value)!;
    const high = parseMoney(kpi(data, '52w high').value)!;
    const shown = parsePercent(kpi(data, '52w high').sub)!;

    if (spot < high) {
      expect(shown, '股价低于 52 周高点时，回撤应为负值').toBeLessThan(0);
    } else {
      expect(shown, '股价等于 52 周高点时，回撤应为 0').toBe(0);
    }
  });

  test('估值倍数均为正数', () => {
    for (const label of ['Market cap', 'P/E', 'P/S', 'EV / EBITDA']) {
      const raw = kpi(data, label).value;
      const n = label === 'Market cap' ? parseMoney(raw) : Number(raw.replace('×', ''));
      expect(n, `${label} 无法解析："${raw}"`).not.toBeNaN();
      expect(n, `${label} 应为正数`).toBeGreaterThan(0);
    }
  });

  test('市值量级合理（十亿级以上，否则单位换算出错）', () => {
    const mc = parseMoney(kpi(data, 'Market cap').value)!;
    expect(mc, '市值应大于 10 亿美元').toBeGreaterThan(1e9);
    expect(mc, '市值不应超过 10 万亿美元').toBeLessThan(1e13);
  });

  test('行情数据标注了口径与取数日期', () => {
    // TTM / as of close 等口径说明缺失会让数字无法解读
    for (const label of ['P/E', 'P/S', 'EV / EBITDA']) {
      expect(kpi(data, label).sub, `${label} 缺少口径说明`).not.toBe('');
    }

    const asOf = parseIsoDate(kpi(data, 'Spot').sub);
    expect(asOf, `SPOT 缺少 as-of 日期："${kpi(data, 'Spot').sub}"`).not.toBeNull();

    const lag = daysBetween(new Date(), asOf!);
    expect(lag, `行情日期早于今天太多（${kpi(data, 'Spot').sub}）`).toBeLessThanOrEqual(7);
    expect(lag, `行情日期来自未来（${kpi(data, 'Spot').sub}）`).toBeGreaterThanOrEqual(0);
  });

  test('YTD 与 30 日涨跌幅口径不同，不应恰好相等', () => {
    const ytd = parsePercent(kpi(data, 'YTD return').value)!;
    const d30 = parsePercent(kpi(data, '30d return').value)!;
    expect(
      ytd,
      'YTD 与 30 日涨跌幅完全相同，疑似两个指标取了同一份数据'
    ).not.toBe(d30);
  });
});
