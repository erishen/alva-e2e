// 探测真实登录后的 Alva 页面结构，用于回填 onboarding.spec.ts 的占位定位器。
// 用法：node part1/probe.mjs
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
await page.waitForTimeout(8000);

const url = page.url();
const cookies = await context.cookies();
const authPresent = cookies.some((c) => c.name === 'authorization');
const iframeTitles = await page.evaluate(() =>
  Array.from(document.querySelectorAll('iframe'))
    .map((f) => f.getAttribute('title'))
    .filter(Boolean)
);
const bodyText = (await page.locator('body').innerText()).slice(0, 2000);
const visibleButtons = await page
  .locator('button, a')
  .allInnerTexts()
  .then((t) => t.filter(Boolean).slice(0, 40));

console.log('=== 探针结果 ===');
console.log('最终 URL :', url);
console.log('authorization cookie 存在 :', authPresent);
console.log('iframe 标题 :', JSON.stringify(iframeTitles));
console.log('--- body 可见文本(前 2000 字) ---');
console.log(bodyText);
console.log('--- 可见按钮/链接(前 40) ---');
console.log(JSON.stringify(visibleButtons, null, 2));

await browser.close();
