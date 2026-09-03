// 精确定位 Alerts/Tasks/Memory/Files 按钮：坐标 + 周边 section 文案 + 左栏全量。
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
import { chromium } from '@playwright/test';

const AUTH = resolve(__dirname, '..', '.auth', 'alva.json');
const BASE = process.env.BASE_URL ?? 'https://alva.ai';

const browser = await chromium.launch();
const context = await browser.newContext({ storageState: AUTH, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);

const data = await page.evaluate(() => {
  const targets = ['Alerts', 'Tasks', 'Memory', 'Files'];
  const buttons = Array.from(document.querySelectorAll('button')).filter((b) => {
    const t = (b.innerText || '').trim();
    return targets.includes(t);
  });
  const located = buttons.map((b) => {
    const r = b.getBoundingClientRect();
    // 向上找最近的非空文本兄弟/父标题，定位它属于哪个 section
    let p = b.parentElement;
    let sectionHint = '';
    for (let i = 0; i < 5 && p; i++) {
      const prev = p.previousElementSibling;
      if (prev && (prev.innerText || '').trim()) {
        sectionHint = (prev.innerText || '').trim().slice(0, 50);
        break;
      }
      p = p.parentElement;
    }
    return {
      text: (b.innerText || '').trim(),
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      belowFold: r.y > window.innerHeight,
      sectionHint,
    };
  });

  // 左栏全量：放宽到整个左侧 320px 宽区域里的可点击文本
  const sidebarEls = Array.from(document.querySelectorAll('a, button')).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.x < 340 && r.width > 0 && r.height > 0 && (el.innerText || '').trim();
  });
  const sidebar = sidebarEls.map((el) => ({ text: (el.innerText || '').trim().slice(0, 30), tag: el.tagName, href: el.getAttribute('href') || null }));

  return { located, sidebar };
});

console.log('=== 4 个按钮精确定位 ===');
console.log(JSON.stringify(data.located, null, 2));
console.log('\n=== 左侧 340px 内全部可点击项（左栏真实全貌）===');
console.log(JSON.stringify(data.sidebar, null, 2));
await browser.close();
