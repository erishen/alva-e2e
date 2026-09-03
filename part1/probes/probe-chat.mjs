// 用 Playwright 原生交互真正发送一条消息，并定位助手回复节点。
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
import { chromium } from '@playwright/test';

const AUTH = resolve(__dirname, '..', '.auth', 'alva.json');
const BASE = process.env.BASE_URL ?? 'https://alva.ai';

const browser = await chromium.launch();
const context = await browser.newContext({ storageState: AUTH });
const page = await context.newPage();
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
await page.getByTestId('agent-chat-tab').click().catch(() => {});
await page.waitForTimeout(2000);

const box = page.getByRole('textbox');
await box.click();
await box.type('What is the current price of AAPL?');
await box.press('Enter');
console.log('已发送，等待助手回复…');

// 等助手回复出现（消息气泡数增加，或文本出现 $ 价格）
await page.waitForTimeout(25000);

const dump = await page.evaluate(() => {
  // 抓取对话区所有较长文本块
  const blocks = Array.from(document.querySelectorAll('div, p, span, article'))
    .map((e) => e.innerText?.trim())
    .filter((t) => t && t.length > 20 && t.length < 1200);
  // 助手消息常含 $ 或 "AAPL"
  const withPrice = blocks.filter((t) => /\$|\bAAPL\b/i.test(t));
  return { total: blocks.length, withPrice: withPrice.slice(-4) };
});
console.log('含价格的文本块 :', JSON.stringify(dump, null, 2));

await browser.close();
