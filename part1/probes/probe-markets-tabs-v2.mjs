// v2：精确判定 /markets/AMD?tab=X 是否真的定位并高亮对应 tab + 内容是否切换
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
import { chromium } from '@playwright/test';

const AUTH = resolve(__dirname, '..', '.auth', 'alva.json');
const browser = await chromium.launch();
const context = await browser.newContext({ storageState: AUTH, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const labels = ['Overview', 'Narratives', 'Anomalies', 'News', 'Smart Money', 'Earnings'];

async function inspect(tab) {
  const url = `https://alva.ai/markets/AMD?tab=${tab}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // 轮询等待正文稳定（最多 12s）
  let prev = -1;
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(1000);
    const len = await page.evaluate(() => (document.body.innerText || '').length);
    if (len === prev && len > 400) break;
    prev = len;
  }
  const r = await page.evaluate((labels) => {
    const out = { finalUrl: location.href };
    // 找 tablist 里的 tab 按钮
    const tabBtns = [...document.querySelectorAll('[role="tablist"] [role="tab"], [role="tab"]')];
    const found = tabBtns.length ? tabBtns : [...document.querySelectorAll('button')].filter((b) => labels.includes((b.innerText || '').trim()));
    out.tabs = found.map((b) => ({
      label: (b.innerText || '').trim(),
      selected: b.getAttribute('aria-selected'),
      dataState: b.getAttribute('data-state'),
      cls: (b.className || '').slice(0, 60),
    }));
    const body = document.body.innerText || '';
    out.len = body.length;
    // 各 tab 的特征词，用来判断当前渲染的是哪个面板内容
    out.markers = {
      overview: /At Close|Market Cap|52-Week|Previous Close/i.test(body),
      narratives: /narrative/i.test(body),
      anomalies: /anomal/i.test(body),
      news: /news/i.test(body),
      smartmoney: /smart money|insider|institutional/i.test(body),
      earnings: /Earnings Release|Call Transcript|EPS/i.test(body),
    };
    return out;
  }, labels);
  const active = r.tabs.filter((t) => t.selected === 'true' || t.dataState === 'active');
  console.log(`\n=== ?tab=${tab} ===`);
  console.log('  最终URL:', r.finalUrl);
  console.log('  aria-selected=true 的tab:', JSON.stringify(active.map((t) => t.label)));
  console.log('  正文长:', r.len, '| 内容特征:', JSON.stringify(r.markers));
  if (r.tabs.length && r.tabs.length <= 8) console.log('  tab明细:', JSON.stringify(r.tabs.map((t) => ({ l: t.label, s: t.selected, ds: t.dataState }))));
  return r;
}

for (const t of ['overview', 'narratives', 'anomalies', 'news', 'smart-money', 'earnings']) {
  await inspect(t);
}

await context.close();
await browser.close();
