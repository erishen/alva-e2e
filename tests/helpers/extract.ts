import { Page, Frame } from '@playwright/test';

/**
 * 数据提取层。
 *
 * 重要前提：仪表盘是**单页长文档**，7 个 Tab 只是切换 section 的可见性，
 * 所有 Tab 的数据在首次加载后就全都在 DOM 里（已实测：切 Tab 前后
 * textContent 快照完全一致）。
 *
 * 因此这里统一用 textContent 提取而不是等待可见 —— 数据校验不受
 * 当前激活哪个 Tab 影响，也避免了为每个用例重复加载一次慢速页面。
 *
 * 另一个前提：iframe 里大量内容处于「不可见」状态（innerText 只能拿到
 * 当前激活 section 的 ~9k 字符，而 textContent 能拿到全部约 40k 字符）。
 * 所以提取必须用 querySelectorAll + textContent，不能用 innerText。
 */

/** 拿到仪表盘 iframe 的 Frame 对象（跨域 iframe，Playwright 可直接 evaluate） */
export async function dashboardFrame(page: Page): Promise<Frame> {
  const byName = page.frame({ name: 'playbook-content' });
  if (byName) return byName;
  const fallback = page.frames().find((fr) => fr.url() !== page.url());
  if (!fallback) {
    throw new Error(
      `仪表盘 iframe 未找到。当前 frames: ${page.frames().map((f) => f.url()).join(' | ')}`
    );
  }
  return fallback;
}

// ---------------------- 类型定义 ----------------------

export interface Kpi {
  label: string;
  value: string;
  sub: string;
  /** kpi-value 元素的 class，末尾可能带 pos / neg */
  valueCls: string;
}

export interface FinCell {
  text: string;
  /** 该列是否为预测列（class 含 fin-fy-fcst） */
  forecast: boolean;
}

export interface FinTable {
  /** 第一列表头，如 "Metric" / "Category"，用于区分表类型 */
  kind: string;
  headers: string[];
  rows: { metric: string; cells: FinCell[] }[];
}

export interface CompPeriod {
  revenue: string;
  gp: string;
  ebitda: string;
  pe: string;
}

export interface CompRow {
  ticker: string;
  ev: string;
  marketCap: string;
  price: string;
  periods: CompPeriod[];
  /** summary 行为 Average / Median */
  summary: boolean;
}

export interface AnalystRatings {
  consensus: string;
  median: string;
  rangeLow: string;
  rangeHigh: string;
  coverage30d: string;
  coverage90d: string;
  avgPt30d: string;
  avgPt90d: string;
  refreshedOn: string;
}

export interface RiskRow {
  category: string;
  risk: string;
  signal: string;
  trend: string;
  priority: string;
}

export interface DashboardData {
  kpis: Kpi[];
  tables: FinTable[];
  comps: CompRow[];
  /** 可比公司表的财年分组标签，如 ["FY23", "FY24", "FY25"] */
  compsFyLabels: string[];
  analyst: AnalystRatings;
  risks: RiskRow[];
  /** 营收占比图例，如 ["58%", "27%", "7%", "8%"] */
  revenueMixPct: string[];
  /** 页面上所有 widget-timestamp 文本，如 "Updated Sep 3, 2026" */
  timestamps: string[];
  /** 全站文本，用于口径说明等文案类断言 */
  allText: string;
  /**
   * 所有「数据单元格」的纯文本，用于脏值扫描。
   * 只扫数据格而不扫整篇文本 —— 正文里出现 "null"/"NaN" 子串
   * 可能是正常英文单词（如 annulment），整篇扫描会误报。
   */
  dataCells: string[];
}

// ---------------------- 提取实现 ----------------------

/**
 * 一次性把仪表盘的全部结构化数据抓回来。
 * 只做一次 DOM 遍历，后续所有断言都在 Node 侧对这份快照做 —— 快且可复现。
 */
export async function extractDashboard(page: Page): Promise<DashboardData> {
  const frame = await dashboardFrame(page);

  return frame.evaluate(() => {
    const clean = (s: string | null | undefined): string =>
      (s || '').replace(/\s+/g, ' ').trim();

    const txt = (root: Element | null, sel: string): string =>
      clean(root?.querySelector(sel)?.textContent);

    // --- KPI 卡 ---
    const kpis: Kpi[] = [...document.querySelectorAll('.kpi-cell')].map((cell) => {
      const v = cell.querySelector('.kpi-value');
      return {
        label: txt(cell, '.kpi-label'),
        value: txt(cell, '.kpi-value'),
        sub: txt(cell, '.kpi-sub'),
        valueCls: (v?.className || '').toString(),
      };
    });

    // --- 财务 / 风险表：按 "遇到表头行就开一个新表" 的规则分组 ---
    const tables: FinTable[] = [];
    let current: FinTable | null = null;
    [...document.querySelectorAll('.table-row')].forEach((row) => {
      const cells = [...row.querySelectorAll('[class*="table-cell"]')].map((c) => ({
        text: clean(c.textContent),
        forecast: (c.className || '').toString().includes('fin-fy-fcst'),
      }));
      if (!cells.length) return;

      if ((row.className || '').toString().includes('table-header')) {
        current = { kind: cells[0].text, headers: cells.map((c) => c.text), rows: [] };
        tables.push(current);
      } else if (current) {
        current.rows.push({ metric: cells[0].text, cells: cells.slice(1) });
      }
    });

    // --- 可比公司表 ---
    const comps: CompRow[] = [];
    const grid = document.querySelector('.comps-grid');
    if (grid) {
      [...grid.children].forEach((row) => {
        const ticker = txt(row, '.cg-tk');
        if (!ticker) return;
        const nums = [...row.querySelectorAll('.cg-num')].map((c) => clean(c.textContent));
        // 列序：EV, Market cap, Price, 之后每财年 4 列（Revenue, GP, EBITDA, P/E）
        if (nums.length < 3) return;
        const periods: CompPeriod[] = [];
        for (let i = 3; i + 3 < nums.length + 1; i += 4) {
          periods.push({
            revenue: nums[i] ?? '',
            gp: nums[i + 1] ?? '',
            ebitda: nums[i + 2] ?? '',
            pe: nums[i + 3] ?? '',
          });
        }
        comps.push({
          ticker,
          ev: nums[0],
          marketCap: nums[1],
          price: nums[2],
          periods: periods.filter((p) => p.revenue || p.gp || p.ebitda || p.pe),
          summary: (row.className || '').toString().includes('cg-summary'),
        });
      });
    }

    // --- 可比公司表的财年分组标签 ---
    const compsFyLabels = [...document.querySelectorAll('.cg-fy-super')]
      .map((e) => clean(e.textContent))
      .filter((t) => /^(FY|CY)\s?\d{2}/.test(t));

    // --- 分析师评级 ---
    // sub 字段是说明文字（"median $625.00" / "analysts · avg PT $608"），
    // 这里把其中的金额单独抽出来，避免断言侧再做一次字符串处理。
    const money = (s: string): string => (/\$[\d,.]+/.exec(s) || [''])[0];

    const analyst: AnalystRatings = {
      consensus: txt(document.querySelector('.ar-stat-consensus'), '.ar-stat-value'),
      median: money(txt(document.querySelector('.ar-stat-consensus'), '.ar-stat-sub')),
      rangeLow: '',
      rangeHigh: '',
      coverage30d: txt(document.querySelector('.ar-stat-30d'), '.ar-stat-value'),
      coverage90d: txt(document.querySelector('.ar-stat-90d'), '.ar-stat-value'),
      avgPt30d: money(txt(document.querySelector('.ar-stat-30d'), '.ar-stat-sub')),
      avgPt90d: money(txt(document.querySelector('.ar-stat-90d'), '.ar-stat-sub')),
      refreshedOn: '',
    };
    const rangeVal = txt(document.querySelector('.ar-stat-range'), '.ar-stat-value');
    const rm = /\$?\s*([\d,.]+)\s*[–-]\s*\$?\s*([\d,.]+)/.exec(rangeVal);
    if (rm) {
      analyst.rangeLow = `$${rm[1]}`;
      analyst.rangeHigh = `$${rm[2]}`;
    }
    const refreshed = [...document.querySelectorAll('*')]
      .map((e) => clean(e.textContent))
      .find((t) => /^Refreshed on \d{4}-\d{2}-\d{2}$/.test(t));
    analyst.refreshedOn = refreshed || '';

    // --- 风险表 ---
    const risks: RiskRow[] = [];
    const riskTable = document.querySelector('.risk-table');
    if (riskTable) {
      [...riskTable.querySelectorAll('.table-row')]
        .filter((r) => !(r.className || '').toString().includes('table-header'))
        .forEach((row) => {
          const c = [...row.querySelectorAll('[class*="table-cell"]')].map((x) =>
            clean(x.textContent)
          );
          if (c.length >= 5) {
            risks.push({
              category: c[0],
              risk: c[1],
              signal: c[2],
              trend: c[3],
              priority: c[4],
            });
          }
        });
    }

    // --- 营收占比图例 ---
    const revenueMixPct = [...document.querySelectorAll('.legend-pct')].map((e) =>
      clean(e.textContent)
    );

    // --- 时间戳 ---
    const timestamps = [...document.querySelectorAll('.widget-timestamp')].map((e) =>
      clean(e.textContent)
    );

    // --- 数据单元格（脏值扫描范围）---
    const dataCells = [
      ...document.querySelectorAll(
        '.kpi-value, .kpi-sub, .cg-num, .cg-tk, [class*="table-cell"], ' +
          '.ar-stat-value, .ar-stat-sub, .legend-pct, [class*="fin-col-fy"]'
      ),
    ]
      .map((e) => clean(e.textContent))
      .filter((t) => t.length > 0 && t.length < 200);

    return {
      kpis,
      tables,
      comps,
      compsFyLabels,
      analyst,
      risks,
      revenueMixPct,
      timestamps,
      dataCells,
      allText: clean(document.body.textContent || ''),
    };
  });
}

/** 从 KPI 列表里按 label 取值（大小写不敏感） */
export function kpi(data: DashboardData, label: string): Kpi {
  const found = data.kpis.find(
    (k) => k.label.toLowerCase() === label.toLowerCase()
  );
  if (!found) {
    throw new Error(
      `KPI "${label}" 不存在。现有 KPI: ${data.kpis.map((k) => k.label).join(', ')}`
    );
  }
  return found;
}

/** 从财务表集合里按表头第一格（Metric / Category）找表 */
export function finTable(data: DashboardData, kind: string): FinTable {
  const found = data.tables.find((t) => t.kind === kind);
  if (!found) {
    throw new Error(
      `财务表 "${kind}" 不存在。现有表: ${data.tables.map((t) => t.kind).join(', ')}`
    );
  }
  return found;
}

/** 取某张表里指定指标行的所有单元格文本 */
export function row(
  table: FinTable,
  metric: string
): { text: string; forecast: boolean }[] {
  const found = table.rows.find((r) => r.metric === metric);
  if (!found) {
    throw new Error(
      `指标行 "${metric}" 不存在于表 "${table.kind}"。现有行: ${table.rows
        .map((r) => r.metric)
        .join(', ')}`
    );
  }
  return found.cells;
}
