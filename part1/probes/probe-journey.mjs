// 探测 Part 1 旅程真实 UI 路径：Portfolio / Alerts 路由 + 聊天如何建 watch/automation
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
import { chromium } from '@playwright/test';

const AUTH = resolve(__dirname, '..', '.auth', 'alva.json');
const BASE = 'https://alva.ai';

const browser = await chromium.launch();
const context = await browser.newContext({ storageState: AUTH, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

async function dumpMain(label, sel = 'main, [role=main], #root > div') {
  const txt = await page.evaluate(() => document.body.innerText.slice(0, 600));
  console.log(`\n===== ${label} =====`);
  console.log(txt.replace(/\n{2,}/g, '\n').trim());
}

try {
  // 1) Portfolio 路由
  await page.goto(`${BASE}/?tab=portfolio`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await dumpMain('PORTFOLIO (?tab=portfolio)');

  // 2) Alerts 路由
  await page.goto(`${BASE}/?tab=alerts`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await dumpMain('ALERTS (?tab=alerts)');

  // 3) 首页聊天 composer：是否支持 /skills
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const composer = await page.evaluate(() => {
    const els = [...document.querySelectorAll('[contenteditable], input, textarea')];
    return els.map((e) => ({
      tag: e.tagName,
      role: e.getAttribute('role'),
      placeholder: e.getAttribute('placeholder') || e.textContent?.slice(0, 40),
    }));
  });
  console.log('\n===== COMPOSER 候选 =====');
  console.log(JSON.stringify(composer, null, 2));

  // 4) 试发一条建 watch 指令（用正确的可见 composer）
  console.log('\n===== 试发建 watch 指令（不连账户） =====');
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    const box = page.getByRole('textbox', { name: /Ask Alva anything/i });
    await box.click({ timeout: 8000 });
    await box.type('watch AMD stock price and alert me if it drops below $100', { delay: 20 });
    await page.keyboard.press('Enter');
    console.log('已发送，等待 agent 回复最多 50s...');
    await page.waitForTimeout(50000);
    const after = await page.evaluate(() => document.body.innerText.slice(-1000));
    console.log('回复区尾部：\n' + after.replace(/\n{2,}/g, '\n').trim());
  } catch (e) {
    console.log('发消息/等回复失败（可能 LLM 限流）：', e.message);
  }

  console.log('\n===== console errors =====');
  console.log(errors.slice(0, 10).join('\n') || '(none)');
} finally {
  await browser.close();
}
