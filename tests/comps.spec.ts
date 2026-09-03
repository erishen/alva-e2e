import { test, expect, Page, Browser, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'fs';
import path from 'path';
import { loadDashboard, DashboardData } from './helpers/common';
import { kpi, FinTable, CompRow, dashboardFrame } from './helpers/extract';
import { parseMoney, parseMultiple, isEmptyValue } from './helpers/parse';

/**
 * 可比公司（Comps）校验。
 *
 * 这一组最有价值的是「跨组件交叉校验」：同一个指标在 Comps 表和
 * 财报表里各出现一次，两者必须相等 —— 这类断言能抓出取数口径不一致、
 * 单位换算错误、缓存串号等真实数据故障，而单看任意一边都发现不了。
 */
test.describe('可比公司 @data', () => {
  test.describe.configure({ mode: 'serial' });

  let page: Page;
  let data: DashboardData;
  let annual: FinTable;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ({ page, data } = await loadDashboard(browser));
    annual = data.tables.find(
      (t) => t.kind === 'Metric' && t.headers[1]?.startsWith('FY')
    )!;
  });

  test.afterAll(async () => {
    await page?.close();
  });

  const companies = () => data.comps.filter((c) => !c.summary);
  const amd = () => data.comps.find((c) => c.ticker === 'AMD');

  test('AMD 本公司在可比表中（Core position）', () => {
    expect(amd(), '可比公司表中缺少 AMD 自身').toBeDefined();
    expect(amd()!.summary, 'AMD 不应是汇总行').toBe(false);
  });

  test('财年列头可识别（用于跨表对齐）', () => {
    expect(
      data.compsFyLabels.length,
      `可比表财年列头未识别到：${JSON.stringify(data.compsFyLabels)}`
    ).toBeGreaterThan(0);
  });

  test('每家公司：毛利不超过营收（毛利率不可能 > 100%）', () => {
    const violations: string[] = [];
    companies().forEach((c) => {
      c.periods.forEach((p, i) => {
        const fy = data.compsFyLabels[i] ?? `#${i}`;
        const rev = parseMoney(p.revenue);
        const gp = parseMoney(p.gp);

        if (rev !== null && gp !== null && gp > rev) {
          violations.push(`${c.ticker} ${fy}: 毛利 ${p.gp} > 营收 ${p.revenue}`);
        }
      });
    });
    expect(violations, `毛利超过营收：${violations.join(' ; ')}`).toEqual([]);
  });

  test('每家公司：EBITDA 不超过营收（超出即为量纲或列错位）', () => {
    // 注意：这里不能断言「EBITDA ≤ 毛利」。晶圆代工厂（如 TSM）的折旧
    // 计入营业成本，会同时压低毛利；而 EBITDA 加回折旧后可能反而高于毛利
    // （实测 TSM FY25：毛利 $71.8B < EBITDA $84.2B，属正常会计表现）。
    // 因此对重资产公司只能守住「EBITDA ≤ 营收」这条硬边界。
    const violations: string[] = [];
    companies().forEach((c) => {
      c.periods.forEach((p, i) => {
        const fy = data.compsFyLabels[i] ?? `#${i}`;
        const rev = parseMoney(p.revenue);
        const ebitda = parseMoney(p.ebitda);

        if (rev !== null && ebitda !== null && ebitda > rev) {
          violations.push(`${c.ticker} ${fy}: EBITDA ${p.ebitda} > 营收 ${p.revenue}`);
        }
      });
    });
    expect(violations, `EBITDA 超过营收：${violations.join(' ; ')}`).toEqual([]);
  });

  test('每家公司股价为正数', () => {
    const bad = companies()
      .filter((c) => {
        const p = parseMoney(c.price);
        return p === null || p <= 0;
      })
      .map((c) => `${c.ticker}="${c.price}"`);
    expect(bad, `股价异常：${bad.join(', ')}`).toEqual([]);
  });

  test('P/E 要么是倍数要么是 NM（不能出现第三种写法）', () => {
    const bad: string[] = [];
    companies().forEach((c) => {
      c.periods.forEach((p, i) => {
        const fy = data.compsFyLabels[i] ?? `#${i}`;
        if (isEmptyValue(p.pe) || p.pe === 'NM') return;
        if (parseMultiple(p.pe) === null) {
          bad.push(`${c.ticker} ${fy} P/E="${p.pe}"`);
        }
      });
    });
    expect(bad, `P/E 格式异常：${bad.join(' ; ')}`).toEqual([]);
  });

  test('【跨表校验】AMD 的营收与年度财报表完全一致', () => {
    const a = amd()!;
    const revenueRow = annual.rows.find((r) => r.metric === 'Revenue')!;

    const mismatches: string[] = [];
    a.periods.forEach((p, i) => {
      const fy = data.compsFyLabels[i] ?? annual.headers[i + 1];
      // 财报表的列顺序与可比表一致（FY23, FY24, FY25, ...）
      const expected = revenueRow.cells[i]?.text;
      if (expected && p.revenue !== expected) {
        mismatches.push(`${fy}: 可比表 ${p.revenue} != 财报表 ${expected}`);
      }
    });
    expect(mismatches, `AMD 营收在两个组件中不一致：${mismatches.join(' ; ')}`).toEqual([]);
  });

  test('【跨表校验】AMD 的 EBITDA 与年度财报表完全一致', () => {
    const a = amd()!;
    const ebitdaRow = annual.rows.find((r) => r.metric === 'EBITDA')!;

    const mismatches: string[] = [];
    a.periods.forEach((p, i) => {
      const fy = data.compsFyLabels[i] ?? annual.headers[i + 1];
      const expected = ebitdaRow.cells[i]?.text;
      if (expected && p.ebitda !== expected) {
        mismatches.push(`${fy}: 可比表 ${p.ebitda} != 财报表 ${expected}`);
      }
    });
    expect(mismatches, `AMD EBITDA 在两个组件中不一致：${mismatches.join(' ; ')}`).toEqual([]);
  });

  test('【跨组件校验】可比表 AMD 股价与行情 SPOT 一致（允许四舍五入）', () => {
    const spot = parseMoney(kpi(data, 'Spot').value)!;
    const compsPrice = parseMoney(amd()!.price)!;

    expect(compsPrice, `可比表股价无法解析："${amd()!.price}"`).not.toBeNull();
    // 可比表保留 1 位小数，行情保留 2 位，差值不应超过 0.05
    expect(
      Math.abs(spot - compsPrice),
      `股价不一致：行情 SPOT ${spot} vs 可比表 ${compsPrice}`
    ).toBeLessThan(0.05);
  });

  test('汇总行（Average / Median）存在且含有数据', () => {
    const summaries = data.comps.filter((c) => c.summary);
    expect(summaries.length, '缺少 Average/Median 汇总行').toBeGreaterThanOrEqual(2);

    summaries.forEach((s) => {
      const hasData = s.periods.some((p) => !isEmptyValue(p.revenue));
      expect(hasData, `汇总行 ${s.ticker} 没有任何数据`).toBe(true);
    });
  });

  test('汇总行的毛利率不高于同期最高公司毛利率（中位数不应越界）', () => {
    const median = data.comps.find((c) => c.ticker === 'Median');
    if (!median) return; // 没有中位数行则跳过

    median.periods.forEach((p, i) => {
      const med = parseMoney(p.gp);
      if (med === null) return;

      const peers = companies()
        .map((c) => parseMoney(c.periods[i]?.gp ?? ''))
        .filter((v): v is number => v !== null);
      if (!peers.length) return;

      const fy = data.compsFyLabels[i] ?? `#${i}`;
      expect(med, `${fy} 中位数毛利 ${p.gp} 低于所有同业`).toBeGreaterThanOrEqual(Math.min(...peers));
      expect(med, `${fy} 中位数毛利 ${p.gp} 高于所有同业`).toBeLessThanOrEqual(Math.max(...peers));
    });
  });

  // 已知数据缺陷（已在 /markets/AMD 可比表真机验证）：
  // 可比表的 EV 与 Market cap 两列全部渲染成 $0.0（整列 11 行含聚合行一致缺失，
  // 疑似 Comps 视图下未接入数据源 / 字段预留未渲染，而非随机取数失败；但无论
  // 根因为何，AMD 系千亿美元级公司，显示 $0.0 客观即为错误数据）。
  // 作为正式用例保持「活跃失败」状态 —— 缺陷修复后本例会变绿，套件整体也回归全绿；
  // 这样数据回归不会让这个 bug 悄悄溜过。
  // 守卫强度：不仅拒绝 0 / 空，还要求量级达到十亿级（可比公司均为超大盘，
  // 任一 EV/市值 < $1B 即视为数据错误或算错，避免缺陷被「修成别的非零错值」悄悄放过）。
  //
  // 证据留存：本缺陷是「渲染成 $0.0」的可见问题，除断言外额外抓截图到 evidence/
  // 并 attach 到 HTML 报告，使评审人无需重跑即见真实页面状态。截图为「交付级证据」，
  // 需一眼自解释，故做了四重增强：
  //   1. 切到 Comps Tab，让可比表可见（正文在跨域 iframe 内，且可比表仅在此 Tab 激活
  //      时可见，display:none 时截不出内容）；
  //   2. 注入红色高亮：EV（第 1 个 .cg-num）/ Market cap（第 2 个 .cg-num）两列加红框
  //      + 浅红底，让 $0.0 缺陷列一眼可见；
  //   3. 注入红色标注横幅（fixed 顶栏）："⚠ 缺陷证据：EV / Market cap 两列全部 = $0.0…"；
  //   4. 截两张：comps-ev-mc-zero.png = .comps-grid 元素（精准锁定缺陷列）；
  //      comps-full.png = iframe 整页（含区块标题/上下文，证明是真实页面，并带文字标注）。
  // 注意（早期版本截出白屏的根因，已规避）：必须用 beforeAll 里真正加载好的 page
  // （模块级变量）经 dashboardFrame() 取 iframe 截；不能用 test fixture 自动分配的
  // 空白 page（从没 goto 过任何地址 → 纯白屏），也不能用 page.screenshot()（跨域
  // OOPIF 整页留白）。
  // （视频由 playwright.config.ts 的 video:'retain-on-failure' 自动留存在 test-results/，
  //  但本组 serial+beforeAll 共享页面用例录的是空白 fixture page，不可靠，不依赖）
  test('EV 与 Market cap 应有真实数值（当前全部为 $0.0，已知缺陷）', async ({}, testInfo) => {
    const FLOOR = 1e9; // 十亿级：可比公司（AMD/INTC/NVDA/QCOM/TSM/ARM/AVGO/MRVL）均为超大盘
    const bad = data.comps
      .filter((c) => {
        const ev = parseMoney(c.ev);
        const mc = parseMoney(c.marketCap);
        return ev === 0 || mc === 0 || ev === null || mc === null || ev < FLOOR || mc < FLOOR;
      })
      .map((c) => `${c.ticker}: EV=${c.ev} MC=${c.marketCap}`);

    // 抓证据（增强版）：切到 Comps Tab → 等比表可见 → 注入高亮 + 文字标注 → 截双图
    const frame = await dashboardFrame(page);
    const compsTab = frame
      .locator('.tab-underline .tab-item', { hasText: 'Comps' })
      .first();
    await compsTab.click();
    const grid = frame.locator('.comps-grid');
    await expect(grid, '切到 Comps Tab 后可比表应可见').toBeVisible({ timeout: 30_000 });

    // 高亮 EV / Market cap 两列（红框 + 浅红底）：第 1、2 个 .cg-num 即 EV / MC
    await frame.addStyleTag({
      content: `
        .comps-grid .cg-tk + .cg-num,
        .comps-grid .cg-tk + .cg-num + .cg-num {
          outline: 3px solid #e02424 !important;
          outline-offset: -3px !important;
          background: rgba(224, 36, 36, 0.10) !important;
        }
      `,
    });
    // 文字标注横幅（fixed 顶栏，红底白字，截图中即见缺陷说明）
    await frame.evaluate(() => {
      if (document.getElementById('d1-defect-banner')) return;
      const banner = document.createElement('div');
      banner.id = 'd1-defect-banner';
      banner.textContent =
        '⚠ 缺陷证据：EV / Market cap 两列全部 = $0.0（AMD 为千亿级公司，客观为错误数据）';
      banner.style.cssText =
        'position:fixed;top:0;left:0;right:0;z-index:2147483647;' +
        'background:#e02424;color:#fff;' +
        'font:600 14px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;' +
        'padding:8px 14px;box-shadow:0 2px 8px rgba(0,0,0,.3);';
      document.body.appendChild(banner);
    });

    mkdirSync('evidence', { recursive: true });
    // 主证据：精准锁定缺陷列的网格截图（带红框高亮）
    const shotPath = path.join('evidence', 'comps-ev-mc-zero.png');
    await grid.screenshot({ path: shotPath });
    await testInfo.attach('comps-ev-mc-zero', {
      path: shotPath,
      contentType: 'image/png',
    });
    // 上下文证据：Comps Tab 激活时其他区块是 display:none，视口里正好是整段可比表。
    // 抬高浏览器视口高度以容纳整段，再截 iframe 的 body（Locator.screenshot 在本版本
    // 不支持 fullPage、Frame 也无 screenshot 方法，故用「抬视口 + 视口截图」技巧拿到
    // 完整可比区块上下文，含区块标题/红框高亮/文字标注横幅，证明是真实 AMD 页面）。
    await page.setViewportSize({ width: 1440, height: 4000 });
    const fullPath = path.join('evidence', 'comps-full.png');
    await frame.locator('body').screenshot({ path: fullPath });
    await testInfo.attach('comps-full-context', {
      path: fullPath,
      contentType: 'image/png',
    });

    expect(bad, `以下公司 EV/市值 为 0 / 空 / 或量级异常（已知缺陷，疑似未接入数据源）：${bad.join(' ; ')}`).toEqual([]);
  });
});
