// 验证 /markets/AMD 的 ?tab= 深链：是否能定位到具体 tab + 真实行情是否渲染
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
import { chromium } from '@playwright/test';

const AUTH = resolve(__dirname, '..', '.auth', 'alva.json');
const browser = await chromium.launch();
const context = await browser.newContext({ storageState: AUTH, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

// 候选 tab 值（基于已知 Tabs: Overview/Narratives/Anomalies/News/Smart Money/Earnings）
const candidates = ['overview', 'narratives', 'anomalies', 'news', 'smartmoney', 'smart-money', 'earnings'];

async function probeTab(tab) {
  const url = `https://alva.ai/markets/AMD?tab=${tab}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const info = await page.evaluate(() => {
    const finalUrl = location.href;
    // 找 tab 按钮（常见 role=tab / button 含文本）
    const tabEls = [...document.querySelectorAll('[role="tab"], button')].filter((b) => {
      const t = (b.innerText || '').trim().toLowerCase();
      return ['overview', 'narratives', 'anomalies', 'news', 'smart money', 'earnings'].some((k) => t.includes(k));
    });
    const active = tabEls
      .filter((b) => b.getAttribute('aria-selected') === 'true' || b.getAttribute('data-state') === 'active' || b.className?.includes('active'))
      .map((b) => (b.innerText || '').trim());
    const body = document.body.innerText || '';
    // 抓取价格信号
    const priceMatch = body.match(/\$[\d,]+\.\d{2}/);
    const hasAlvaAgent = /Alva Agent/i.test(body);
    const hasError = /not found|404|something went wrong|channel has no main/i.test(body);
    return { finalUrl, activeTabs: active, price: priceMatch?.[0] || null, hasAlvaAgent, hasError, bodyLen: body.length };
  });
  console.log(`\n=== ?tab=${tab} ===`);
  console.log('  最终URL:', info.finalUrl);
  console.log('  高亮tab:', JSON.stringify(info.activeTabs));
  console.log('  行情价:', info.price, '| Alva Agent区:', info.hasAlvaAgent, '| 报错:', info.hasError, '| 文本长:', info.bodyLen);
}

for (const c of candidates) {
  await probeTab(c);
}

// 对照：不带 tab 参数
await probeTab('(无参数 base)'.replace('(无参数 base)', ''));
await page.goto('https://alva.ai/markets/AMD', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
const base = await page.evaluate(() => {
  const tabEls = [...document.querySelectorAll('[role="tab"], button')].filter((b) => {
    const t = (b.innerText || '').trim().toLowerCase();
    return ['overview', 'narratives', 'anomalies', 'news', 'smart money', 'earnings'].some((k) => t.includes(k));
  });
  const active = tabEls.filter((b) => b.getAttribute('aria-selected') === 'true' || b.className?.includes('active')).map((b) => (b.innerText || '').trim());
  return { activeTabs: active, body: (document.body.innerText || '').slice(0, 200) };
});
console.log('\n=== 无参数 /markets/AMD 默认高亮tab:', JSON.stringify(base.activeTabs));

await context.close();
await browser.close();
