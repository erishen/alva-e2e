import { test, expect, Page, Browser } from '@playwright/test';
import { loadDashboard, DashboardData } from './helpers/common';
import { finTable, row, FinTable } from './helpers/extract';
import { parseMoney, parsePercent, isEmptyValue } from './helpers/parse';

/**
 * 财报表校验（年度表 + 季度表 + 风险表共用同一套 .table-row 结构）。
 *
 * 断言分三类：
 *   ① 可解析性 —— 每个格子都能还原成数字，格式没跑偏
 *   ② 业务约束 —— 毛利率在 0~100、EBITDA 不低于营业利润、营收为正
 *   ③ 结构连续性 —— 财年/季度列按时间顺序排列，没有错位或重复
 */
test.describe('财报数据 @data', () => {
  test.describe.configure({ mode: 'serial' });

  let page: Page;
  let data: DashboardData;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ({ page, data } = await loadDashboard(browser));
  });

  test.afterAll(async () => {
    await page?.close();
  });

  /** 取某表某指标行、解析为数字数组（空值保留为 null） */
  const nums = (t: FinTable, metric: string, parse: (s: string) => number | null) =>
    row(t, metric).map((c) => (isEmptyValue(c.text) ? null : parse(c.text)));

  test('两张财报表的列头按时间顺序排列（年度表）', () => {
    const annual = data.tables.find(
      (t) => t.kind === 'Metric' && t.headers[1]?.startsWith('FY')
    );
    expect(annual, '未找到年度财报表').toBeDefined();

    const years = annual!.headers.slice(1).map((h) => {
      const m = /^FY(\d{2})(E?)$/.exec(h);
      expect(m, `年度列头格式异常："${h}"`).not.toBeNull();
      return Number('20' + m![1]);
    });

    const sorted = [...years].sort((a, b) => a - b);
    expect(years, `年度列未按顺序排列：${annual!.headers.slice(1).join(', ')}`).toEqual(sorted);
    expect(new Set(years).size, '年度列存在重复').toBe(years.length);
  });

  test('季度表的列头连续（季度号循环、财年不倒退）', () => {
    const q = data.tables.find(
      (t) => t.kind === 'Metric' && /^Q\d FY/.test(t.headers[1] || '')
    );
    expect(q, '未找到季度财报表').toBeDefined();

    const cols = q!.headers.slice(1).map((h) => {
      const m = /^Q(\d)\s+FY(\d{2})(E?)$/.exec(h);
      expect(m, `季度列头格式异常："${h}"`).not.toBeNull();
      return { q: Number(m![1]), fy: Number('20' + m![2]) };
    });

    for (let i = 1; i < cols.length; i++) {
      const prev = cols[i - 1];
      const cur = cols[i];
      // 下一列要么同财年的下一季度，要么跨到下一财年的 Q1
      const okSameYear = cur.fy === prev.fy && cur.q === prev.q + 1;
      const okNextYear = cur.fy === prev.fy + 1 && prev.q === 4 && cur.q === 1;
      expect(
        okSameYear || okNextYear,
        `季度列不连续：${q!.headers[i]} 前一列是 ${q!.headers[i + 1 - 1]}`
      ).toBe(true);
    }
  });

  test('营收全部为正数金额', () => {
    for (const t of data.tables.filter((x) => x.kind === 'Metric')) {
      const revenues = nums(t, 'Revenue', parseMoney);
      expect(revenues.length, `表[${t.headers[1]}] 缺少 Revenue 行`).toBeGreaterThan(0);

      revenues.forEach((v, i) => {
        expect(v, `营收 "${row(t, 'Revenue')[i].text}" 无法解析为金额`).not.toBeNull();
        expect(v!, '营收应为正数').toBeGreaterThan(0);
      });
    }
  });

  test('年度营收逐年增长（AMD 增长叙事，倒退即为数据异常）', () => {
    const annual = data.tables.find(
      (t) => t.kind === 'Metric' && t.headers[1]?.startsWith('FY')
    )!;
    const revenues = nums(annual, 'Revenue', parseMoney) as number[];

    for (let i = 1; i < revenues.length; i++) {
      expect(
        revenues[i],
        `营收未逐年增长：${annual.headers[i]} 的 ${revenues[i]} 未超过 ${annual.headers[i + 1 - 1]} 的 ${revenues[i - 1]}`
      ).toBeGreaterThan(revenues[i - 1]);
    }
  });

  test('毛利率落在 0~100% 区间内', () => {
    for (const t of data.tables.filter((x) => x.kind === 'Metric')) {
      if (!t.rows.some((r) => r.metric === 'Gross margin %')) continue;

      nums(t, 'Gross margin %', parsePercent).forEach((v, i) => {
        if (v === null) return; // 预测列允许为空
        expect(v, `毛利率 "${row(t, 'Gross margin %')[i].text}" 超出 0~100 区间`).toBeGreaterThanOrEqual(0);
        expect(v, `毛利率 "${row(t, 'Gross margin %')[i].text}" 超出 0~100 区间`).toBeLessThanOrEqual(100);
      });
    }
  });

  test('EBITDA 不低于同期营业利润（EBITDA = 营业利润 + 折旧摊销）', () => {
    for (const t of data.tables.filter((x) => x.kind === 'Metric')) {
      if (!t.rows.some((r) => r.metric === 'EBITDA')) continue;
      if (!t.rows.some((r) => r.metric === 'Operating income')) continue;

      const ebitda = nums(t, 'EBITDA', parseMoney);
      const opInc = nums(t, 'Operating income', parseMoney);

      ebitda.forEach((e, i) => {
        const o = opInc[i];
        if (e === null || o === null) return; // 预测列可能为空
        expect(
          e,
          `${t.headers[i + 1]}：EBITDA ${e} 低于营业利润 ${o}，不符合 EBITDA 定义`
        ).toBeGreaterThanOrEqual(o);
      });
    }
  });

  test('净利率落在 -100%~100% 区间内', () => {
    for (const t of data.tables.filter((x) => x.kind === 'Metric')) {
      if (!t.rows.some((r) => r.metric === 'Net margin %')) continue;

      nums(t, 'Net margin %', parsePercent).forEach((v, i) => {
        if (v === null) return;
        expect(Math.abs(v), `净利率 "${row(t, 'Net margin %')[i].text}" 超出 ±100%`).toBeLessThanOrEqual(100);
      });
    }
  });

  test('EPS 可解析且年度表内逐年增长', () => {
    const annual = data.tables.find(
      (t) => t.kind === 'Metric' && t.headers[1]?.startsWith('FY')
    )!;
    const eps = nums(annual, 'EPS (diluted)', parseMoney) as number[];
    expect(eps.length, '年度表缺少 EPS 行').toBeGreaterThan(0);

    eps.forEach((v, i) => {
      expect(v, `EPS "${row(annual, 'EPS (diluted)')[i].text}" 无法解析`).not.toBeNull();
    });

    for (let i = 1; i < eps.length; i++) {
      expect(eps[i], `EPS 未逐年增长（${annual.headers[i + 1]}）`).toBeGreaterThan(eps[i - 1]);
    }
  });

  test('年度营收大于任一单季营收（量纲校验，防止把季度数填进年度表）', () => {
    const annual = data.tables.find(
      (t) => t.kind === 'Metric' && t.headers[1]?.startsWith('FY')
    )!;
    const q = data.tables.find(
      (t) => t.kind === 'Metric' && /^Q\d FY/.test(t.headers[1] || '')
    );

    const annualRev = nums(annual, 'Revenue', parseMoney).filter(
      (v): v is number => v !== null
    );
    const quarterRev = q ? nums(q, 'Revenue', parseMoney).filter((v): v is number => v !== null) : [];

    const minAnnual = Math.min(...annualRev);
    const maxQuarter = Math.max(...quarterRev);
    expect(
      minAnnual,
      `年度最小营收 ${minAnnual} 小于单季最大营收 ${maxQuarter}，量纲可能错位`
    ).toBeGreaterThan(maxQuarter);
  });

  test('预测列与历史列标记正确（E 后缀与 class 一致）', () => {
    for (const t of data.tables.filter((x) => x.kind === 'Metric')) {
      t.headers.slice(1).forEach((h, i) => {
        const isForecastHeader = /E$/.test(h);
        const cellForecast = t.rows[0]?.cells[i]?.forecast;
        expect(
          cellForecast,
          `列头 "${h}" 的预测标记(=${isForecastHeader}) 与单元格 class 标记(=${cellForecast}) 不一致`
        ).toBe(isForecastHeader);
      });
    }
  });

  test('财报口径说明存在（报告期 / 数据来源）', () => {
    // 没有口径说明的财报数字无法判断可信度
    const hasProvenance = data.allText.includes('Reported through') ||
      data.allText.includes('AMD SEC filing');
    expect(hasProvenance, '页面缺少财报数据的报告期或来源说明').toBe(true);
  });
});
