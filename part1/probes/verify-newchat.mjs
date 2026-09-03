// 对比「New Chat」(/new_chat) 与「Channel」：左栏加 Channel 入口、各自渲染差异。
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

// 1) 左栏找所有含 Channel / + / New 的按钮
const sidebarBtns = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('nav button, nav a, [role="navigation"] button, [role="navigation"] a, aside button, aside a').forEach((el) => {
    const t = (el.innerText || '').trim();
    if (/channel|\+|\bnew\b|add|create/i.test(t)) out.push({ text: t.slice(0, 30), href: el.getAttribute('href') || null, tag: el.tagName });
  });
  return out;
});
console.log('=== 左栏 Channel/+/New 相关按钮 ===');
console.log(JSON.stringify(sidebarBtns, null, 2));

// 2) New Chat 路由渲染
await page.goto('https://alva.ai/new_chat', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(8000);
const newChat = await page.evaluate(() => {
  const main = document.querySelector('main') || document.body;
  const composer = !!document.querySelector('[role="textbox"], div[contenteditable="true"], textarea');
  return { url: location.href, hasComposer: composer, heading: (document.querySelector('h1') || {}).innerText || '(no h1)', text: (main.innerText || '').trim().slice(0, 400) };
});
console.log('\n=== /new_chat ===');
console.log(JSON.stringify(newChat, null, 2));

// 3) 尝试点「加 Channel」按钮（若有），看跳转/弹窗
await page.goto('https://alva.ai/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
const addBtn = page.locator('nav button, aside button').filter({ hasText: /channel/i }).first();
let addResult = '(no add-channel button found)';
try {
  if (await addBtn.count()) {
    await addBtn.click({ timeout: 4000 });
    await page.waitForTimeout(3000);
    addResult = JSON.stringify({ url: page.url(), bodyText: ((await page.locator('body').innerText()).slice(0, 300)) });
  }
} catch (e) {
  addResult = 'click err: ' + e.message.slice(0, 80);
}
console.log('\n=== 点击加 Channel 结果 ===');
console.log(addResult);

await context.close();
await browser.close();
