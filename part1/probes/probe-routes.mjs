// 探测 Alva 各功能路由的真实结构与可点击入口，用于回填 onboarding.spec.ts。
// 用法：node part1/probe-routes.mjs
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
import { chromium } from '@playwright/test';

const AUTH = resolve(__dirname, '..', '.auth', 'alva.json');
const BASE = process.env.BASE_URL ?? 'https://alva.ai';

const routes = [
  '/portfolio',
  '/markets',
  '/explore',
  '/playbooks',
  '/alerts',
  '/automations',
  '/tasks',
  '/channels',
];

const browser = await chromium.launch();
const context = await browser.newContext({ storageState: AUTH });
const page = await context.newPage();

for (const r of routes) {
  try {
    await page.goto(BASE + r, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    const url = page.url();
    const h1 = await page
      .locator('h1, h2')
      .allInnerTexts()
      .then((t) => t.filter(Boolean).slice(0, 3));
    const buttons = await page
      .locator('button, a')
      .allInnerTexts()
      .then((t) => [...new Set(t.filter(Boolean))].slice(0, 25));
    const placeholder = await page
      .locator('textarea, input')
      .first()
      .getAttribute('placeholder')
      .catch(() => null);
    console.log(`\n=== ${r} ===`);
    console.log('  URL      :', url);
    console.log('  H1/H2    :', JSON.stringify(h1));
    console.log('  placeholder:', placeholder);
    console.log('  buttons  :', JSON.stringify(buttons));
  } catch (e) {
    console.log(`\n=== ${r} === ERROR:`, e.message.split('\n')[0]);
  }
}

await browser.close();
