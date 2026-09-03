// 深探 for-you 频道(/channel/5346)：是聊天还是 feed？有无内容流？
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
import { chromium } from '@playwright/test';

const AUTH = resolve(__dirname, '..', '.auth', 'alva.json');
const browser = await chromium.launch();

const context = await browser.newContext({ storageState: AUTH, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
await page.goto('https://alva.ai/channel/5346', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);

const probe = await page.evaluate(() => {
  const main = document.querySelector('main') || document.body;
  const hasComposer = !!document.querySelector('[role="textbox"], div[contenteditable="true"], textarea');
  // feed 类元素计数
  const feedish = document.querySelectorAll('[class*="post"],[class*="card"],[class*="item"],[class*="feed"],[class*="article"],[class*="opportunity"],[class*="brief"],[class*="source"],[class*="message"]').length;
  const full = (main.innerText || '').trim();
  return { hasComposer, feedishCount: feedish, len: full.length, text: full.slice(0, 4000) };
});

console.log('for-you 是否有聊天输入框(textbox):', probe.hasComposer);
console.log('feed 类元素数量:', probe.feedishCount);
console.log('主区文本长度:', probe.len);
console.log('--- 主区全文(前4000) ---');
console.log(probe.text);

// 往下滚，看是否有更多内容
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(3000);
const afterScroll = await page.evaluate(() => {
  const main = document.querySelector('main') || document.body;
  return (main.innerText || '').trim().slice(0, 4000);
});
console.log('\n--- 滚动后主区(前4000) ---');
console.log(afterScroll);

await context.close();
await browser.close();
