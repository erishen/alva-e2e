// 探测 chat composer 里 `/` 触发的 skills 列表，看是否有专门建 watch/automation 的入口。
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'https://alva.ai';
const AUTH = resolve(__dirname, '..', '.auth', 'alva.json');
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: AUTH });
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);

// 激活首页聊天面板
await page.getByTestId('agent-chat-tab').click();
const box = page.getByRole('textbox');
await box.click({ timeout: 15000 });
await box.type('/');
await page.waitForTimeout(2500);

// 抓所有与 watch/automation/alert/monitor/portfolio/radar 相关的可点项
const items = await page.evaluate(() => {
  const pick = ['button', '[role=option]', '[role=menuitem]', 'li', 'a', 'div'];
  const out = [];
  for (const sel of pick) {
    for (const el of document.querySelectorAll(sel)) {
      const t = (el.textContent || '').trim();
      if (t && /automation|watch|alert|radar|monitor|portfolio|track/i.test(t) && el.children.length <= 2) {
        out.push(t);
      }
    }
  }
  return [...new Set(out)].slice(0, 50);
});
console.log('SKILL/ENTRY ITEMS:', JSON.stringify(items, null, 2));

// 看看是否有专门的 "Automations" 路由或入口
const links = await page.evaluate(() => {
  return [...document.querySelectorAll('a')].map(a => a.getAttribute('href')).filter(h => h && /automation|watch|alert|radar/i.test(h));
});
console.log('AUTOMATION-LIKE LINKS:', JSON.stringify([...new Set(links)], null, 2));

await browser.close();
