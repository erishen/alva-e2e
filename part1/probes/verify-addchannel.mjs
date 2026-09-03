// 找左栏「加 Channel」图标按钮：列出左侧 340px 内所有可点元素的 aria-label/title/text/class。
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
import { chromium } from '@playwright/test';

const AUTH = resolve(__dirname, '..', '.auth', 'alva.json');
const browser = await chromium.launch();
const context = await browser.newContext({ storageState: AUTH, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
await page.goto('https://alva.ai/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);

const els = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('a, button').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.x > 340 || r.width === 0) return;
    const label = el.getAttribute('aria-label') || el.getAttribute('title') || '';
    const text = (el.innerText || '').trim();
    if (!text && !label) return; // 跳过纯图标无标识的（但仍记下）
    out.push({
      x: Math.round(r.x), y: Math.round(r.y),
      tag: el.tagName,
      text: text.slice(0, 24),
      aria: label.slice(0, 30),
      cls: (el.className || '').toString().slice(0, 36),
    });
  });
  return out;
});
console.log('=== 左栏(含图标按钮)全部可点元素 ===');
console.log(JSON.stringify(els, null, 2));
await context.close();
await browser.close();
