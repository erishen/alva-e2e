// 直接深链（非点击）验证正确驼峰参数 newsSocial / smartMoney 是否真定位 + 渲染内容
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
import { chromium } from '@playwright/test';

const AUTH = resolve(__dirname, '..', '.auth', 'alva.json');
const browser = await chromium.launch();
const context = await browser.newContext({ storageState: AUTH, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

async function deep(tab, expectLabel) {
  await page.goto(`https://alva.ai/markets/AMD?tab=${tab}`, { waitUntil: 'domcontentloaded' });
  let prev = -1;
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(1000);
    const len = await page.evaluate(() => (document.body.innerText || '').length);
    if (len === prev && len > 400) break;
    prev = len;
  }
  const r = await page.evaluate((expectLabel) => {
    const t = [...document.querySelectorAll('[role="tab"]')].find((b) => (b.innerText || '').trim() === expectLabel);
    return {
      selected: t ? t.getAttribute('aria-selected') : 'NOT_FOUND',
      len: (document.body.innerText || '').length,
    };
  }, expectLabel);
  console.log(`直接深链 ?tab=${tab} -> 目标tab[${expectLabel}] aria-selected=${r.selected} | 正文长=${r.len}`);
}

await deep('newsSocial', 'News');
await deep('smartMoney', 'Smart Money');
// 对照组：错参数应静默回退
await deep('news', 'News');       // 期望回退 Overview
await deep('smart-money', 'Smart Money'); // 期望回退 Overview

await context.close();
await browser.close();
