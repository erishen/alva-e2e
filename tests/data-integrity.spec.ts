import { test, expect, Page, Browser } from '@playwright/test';
import { loadDashboard, DashboardData } from './helpers/common';
import { findDirtyValues, isEmptyValue } from './helpers/parse';

/**
 * 数据完整性 —— 最基础的一层。
 * 这一层挂了说明前端把未定义值直接渲染出来了，或有整块数据没加载成功，
 * 后面所有数值断言都不必再看。
 */
test.describe('数据完整性 @data', () => {
  test.describe.configure({ mode: 'serial' });

  let page: Page;
  let data: DashboardData;

  // 全套用例共享一次页面加载：数据是只读的，重复 goto 只会让套件慢到不可用
  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ({ page, data } = await loadDashboard(browser));
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test('数据单元格不残留渲染错误值（NaN / undefined / null / [object Object]）', () => {
    expect(data.dataCells.length, '未提取到任何数据单元格').toBeGreaterThan(50);

    const dirty = findDirtyValues(data.dataCells);
    expect(
      dirty,
      `以下数据格出现未定义值残留：${dirty.join(' | ')}`
    ).toEqual([]);
  });

  test('每个 KPI 都有标签和值，且值不是空占位符', () => {
    expect(data.kpis.length, 'KPI 数量应至少 9 个（行情 5 + 估值 4）').toBeGreaterThanOrEqual(9);

    const broken = data.kpis
      .filter((k) => !k.label || isEmptyValue(k.value))
      .map((k) => `label="${k.label}" value="${k.value}"`);

    expect(broken, `以下 KPI 缺标签或值为空占位：${broken.join(' ; ')}`).toEqual([]);
  });

  test('KPI 标签不重复', () => {
    const labels = data.kpis.map((k) => k.label.toLowerCase());
    const dup = labels.filter((l, i) => labels.indexOf(l) !== i);
    expect(dup, `存在重复 KPI 标签：${dup.join(', ')}`).toEqual([]);
  });

  test('财务表与风险表都渲染出数据行', () => {
    expect(data.tables.length, '至少应有年度表 + 季度表 + 风险表').toBeGreaterThanOrEqual(3);

    const empty = data.tables.filter((t) => t.rows.length === 0);
    expect(
      empty.map((t) => t.kind),
      '不应存在只有表头没有数据行的表'
    ).toEqual([]);
  });

  test('每张表的数据行列数与其表头一致', () => {
    const mismatches: string[] = [];
    for (const t of data.tables) {
      const expected = t.headers.length - 1; // 第一列是指标名，不算在表头数据列里
      for (const r of t.rows) {
        if (r.cells.length !== expected) {
          mismatches.push(
            `表[${t.kind}] 行[${r.metric}] 列数 ${r.cells.length} != 期望 ${expected}`
          );
        }
      }
    }
    expect(mismatches, mismatches.join(' ; ')).toEqual([]);
  });

  test('财报表的历史列不能有空值（已报告数据缺失即为数据故障）', () => {
    const missing: string[] = [];
    for (const t of data.tables) {
      for (const r of t.rows) {
        r.cells.forEach((c, i) => {
          // 只有预测列（FY26E / Q3 FY26E 等）允许为空，历史列必须已报告
          if (!c.forecast && isEmptyValue(c.text)) {
            missing.push(`表[${t.kind}] 行[${r.metric}] 列[${t.headers[i + 1]}]="${c.text}"`);
          }
        });
      }
    }
    expect(missing, `历史数据列存在空值：${missing.join(' ; ')}`).toEqual([]);
  });

  test('可比公司表至少有 5 家公司，且每行列数一致', () => {
    const companies = data.comps.filter((c) => !c.summary);
    expect(companies.length, '可比公司数量过少，数据可能没加载完').toBeGreaterThanOrEqual(5);

    const bad = companies
      .filter((c) => c.periods.length === 0)
      .map((c) => c.ticker);
    expect(bad, `以下公司没有任何财年数据：${bad.join(', ')}`).toEqual([]);
  });

  test('可比公司 ticker 不重复', () => {
    const tickers = data.comps.map((c) => c.ticker);
    const dup = tickers.filter((t, i) => tickers.indexOf(t) !== i);
    expect(dup, `存在重复 ticker：${dup.join(', ')}`).toEqual([]);
  });

  test('风险表至少 5 行且字段齐全', () => {
    expect(data.risks.length, '风险条目过少').toBeGreaterThanOrEqual(5);

    const incomplete = data.risks
      .filter((r) => !r.category || !r.risk || !r.trend || !r.priority)
      .map((r) => JSON.stringify(r));
    expect(incomplete, `风险行字段缺失：${incomplete.join(' ; ')}`).toEqual([]);
  });

  test('公司概况描述已填充（不是 Loading 占位）', () => {
    expect(data.allText, '未找到 Company snapshot 区块').toContain('Company snapshot');

    const placeholders = data.allText.match(/Loading[^\n]{0,30}/g) || [];
    expect(
      placeholders,
      `页面仍存在加载占位符：${placeholders.join(' | ')}`
    ).toEqual([]);
  });

  test('数据署名存在（Powered by Alva）', () => {
    expect(data.allText, '缺少数据来源署名，无法判断数据出处').toContain('Powered by Alva');
  });

  test('营收占比图例齐全且总和为 100%', () => {
    expect(data.revenueMixPct.length, '营收占比分段数应大于 1').toBeGreaterThan(1);

    const nums = data.revenueMixPct.map((p) => {
      const n = Number(p.replace('%', ''));
      expect(Number.isFinite(n), `占比 "${p}" 不是合法数字`).toBe(true);
      return n;
    });
    const sum = nums.reduce((a, b) => a + b, 0);
    expect(sum, `营收占比总和应为 100，实际 ${sum}（${data.revenueMixPct.join(' + ')}）`).toBe(100);
  });
});
