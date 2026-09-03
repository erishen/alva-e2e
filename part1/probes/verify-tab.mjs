// 确认 ?tab= 深链真的切换并高亮对应 tab（用英文标签匹配，因为会话渲染英文）。
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
import { chromium } from '@playwright/test';

const AUTH = resolve(__dirname, '..', '.auth', 'alva.json');
const browser = await chromium.launch();

for (const tab of ['tasks', 'alerts', 'memory', 'files']) {
  const context = await browser.newContext({ storageState: AUTH, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`https://alva.ai/?tab=${tab}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(10000);
  const info = await page.evaluate(() => {
    const labels = ['Chat', 'Tasks', 'Alerts', 'Memory', 'Files'];
    const chips = Array.from(document.querySelectorAll('button')).filter((b) => labels.includes((b.innerText || '').trim()));
    const active = chips.find((c) => {
      const cls = (c.className || '').toString();
      return c.getAttribute('aria-selected') === 'true' || /active|selected|current|\[aria-pressed="true"\]/i.test(cls) || c.getAttribute('aria-pressed') === 'true';
    });
    const all = chips.map((c) => ({ text: (c.innerText || '').trim(), cls: (c.className || '').toString().slice(0, 30) }));
    return { url: location.href, active: active ? (active.innerText || '').trim() : '(none)', chips: all };
  });
  console.log(`?tab=${tab} → active=${info.active} | chips=${JSON.stringify(info.chips.map((c) => c.text))}`);
  await context.close();
}
await browser.close();
