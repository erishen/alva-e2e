// 对比左侧栏「Alva」(/) 与「for-you」(/channel/5346) 两个入口的内容区别。
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
import { chromium } from '@playwright/test';

const AUTH = resolve(__dirname, '..', '.auth', 'alva.json');
const browser = await chromium.launch();

for (const [name, url] of [['Alva', 'https://alva.ai/'], ['for-you', 'https://alva.ai/channel/5346']]) {
  const context = await browser.newContext({ storageState: AUTH, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);
  const info = await page.evaluate(() => {
    const main = document.querySelector('main') || document.body;
    const h1 = document.querySelector('h1');
    const heading = h1 ? h1.innerText.trim() : '(no h1)';
    // 主区前 600 字可见文本
    const text = (main.innerText || '').trim().slice(0, 600);
    // 主区里是否出现频道/feed 类标识
    const clues = [];
    document.querySelectorAll('[class*="channel"],[class*="feed"],[class*=" Channel"],[class*=" Feed"]').forEach((el) => {
      const t = (el.getAttribute('aria-label') || el.innerText || '').trim().slice(0, 30);
      if (t) clues.push(t);
    });
    return { url: location.href, heading, clues: [...new Set(clues)].slice(0, 8), text };
  });
  console.log(`\n===== ${name} (${info.url}) =====`);
  console.log('heading :', info.heading);
  console.log('clues   :', JSON.stringify(info.clues));
  console.log('--- 主区文本(前600字) ---');
  console.log(info.text);
  await context.close();
}
await browser.close();
