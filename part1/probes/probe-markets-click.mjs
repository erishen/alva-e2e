// 点击 markets/AMD 各 tab，捕获点击后 URL 的 ?tab= 真实值，反推深链参数名
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
import { chromium } from '@playwright/test';

const AUTH = resolve(__dirname, '..', '.auth', 'alva.json');
const browser = await chromium.launch();
const context = await browser.newContext({ storageState: AUTH, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const labels = ['Overview', 'Narratives', 'Anomalies', 'News', 'Smart Money', 'Earnings'];
await page.goto('https://alva.ai/markets/AMD', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);

for (const label of labels) {
  // 找文本精确等于 label 的 tab 按钮
  const btn = page.locator('[role="tab"]', { hasText: label }).first();
  let ok = false;
  try {
    await btn.click({ timeout: 4000 });
    ok = true;
  } catch {
    // 退路：按可见文本定位
    try { await page.getByText(label, { exact: true }).first().click({ timeout: 4000 }); ok = true; } catch {}
  }
  await page.waitForTimeout(2500);
  const url = page.url();
  const sel = await page.evaluate((label) => {
    const t = [...document.querySelectorAll('[role="tab"]')].find((b) => (b.innerText || '').trim() === label);
    return t ? t.getAttribute('aria-selected') : 'NOT_FOUND';
  }, label);
  console.log(`点击[${label}] -> URL=${url} | 该tab aria-selected=${sel} | 点击成功=${ok}`);
}

await context.close();
await browser.close();
