// SEO 审计：?tab= 大小写敏感性（重复URL风险）+ title/canonical/robots meta + template 变体 canonical
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
import { chromium } from '@playwright/test';

const AUTH = resolve(__dirname, '..', '.auth', 'alva.json');
const browser = await chromium.launch();
const context = await browser.newContext({ storageState: AUTH, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

async function seoCheck(url, label, expectTab) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // 等内容稳定
  let prev = -1;
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(1000);
    const len = await page.evaluate(() => (document.body.innerText || '').length);
    if (len === prev && len > 400) break;
    prev = len;
  }
  const r = await page.evaluate((expectTab) => {
    const canon = document.querySelector('link[rel="canonical"]');
    const robots = document.querySelector('meta[name="robots"]');
    const og = document.querySelector('meta[property="og:title"]');
    let selected = 'N/A';
    if (expectTab) {
      const t = [...document.querySelectorAll('[role="tab"]')].find((b) => (b.innerText || '').trim() === expectTab);
      selected = t ? t.getAttribute('aria-selected') : 'NOT_FOUND';
    }
    return {
      title: document.title,
      canonical: canon ? canon.getAttribute('href') : 'NONE',
      robots: robots ? robots.getAttribute('content') : 'NONE',
      ogTitle: og ? og.getAttribute('content') : 'NONE',
      selected,
    };
  }, expectTab);
  console.log(`${label}`);
  console.log(`   URL=${url}`);
  console.log(`   title=${JSON.stringify(r.title)}`);
  console.log(`   canonical=${r.canonical} | robots=${r.robots} | 目标tab选中=${r.selected}`);
}

console.log('########## A) markets ?tab= 大小写敏感性（重复 URL 风险）##########');
await seoCheck('https://alva.ai/markets/AMD?tab=newsSocial', '规范驼峰 newsSocial', 'News');
await seoCheck('https://alva.ai/markets/AMD?tab=newssocial', '全小写 newssocial', 'News');
await seoCheck('https://alva.ai/markets/AMD?tab=NEWS', '全大写 NEWS', 'News');
await seoCheck('https://alva.ai/markets/AMD?tab=smartMoney', '规范驼峰 smartMoney', 'Smart Money');
await seoCheck('https://alva.ai/markets/AMD?tab=smartmoney', '全小写 smartmoney', 'Smart Money');

console.log('\n########## B) 各 tab 的 title / canonical / robots ##########');
for (const t of ['overview', 'narratives', 'anomalies', 'newsSocial', 'smartMoney', 'earnings']) {
  await seoCheck(`https://alva.ai/markets/AMD?tab=${t}`, `?tab=${t}`, null);
}
await seoCheck('https://alva.ai/markets/AMD', '基线 /markets/AMD (无参)', null);

console.log('\n########## C) sitemap 里 31 个 ?template= 变体是否有 canonical（近似重复页）##########');
await seoCheck('https://alva.ai/new_chat?template=alva%2Ffintwit-roundtable', 'template=fintwit-roundtable', null);
await seoCheck('https://alva.ai/new_chat?template=alva%2Fbacktest', 'template=backtest', null);
await seoCheck('https://alva.ai/new_chat', '基线 /new_chat', null);

await context.close();
await browser.close();
