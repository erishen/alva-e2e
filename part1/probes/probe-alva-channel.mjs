import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
import { chromium } from '@playwright/test';

const BASE = 'https://alva.ai';
const AUTH = resolve(__dirname, '..', '.auth', 'alva.json');
const b = await chromium.launch();
const ctx = await b.newContext({ storageState: AUTH });
const p = await ctx.newPage();
await p.goto(BASE, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(4000);

// 点 Channels 下的 Alva
try {
  await p.getByText('Alva', { exact: true }).first().click({ timeout: 8000 });
} catch (e) {
  console.log('click Alva failed:', e.message);
}
await p.waitForTimeout(3000);

const after = await p.evaluate(() => {
  const t = document.body.innerText;
  const lines = t.split('\n').map((l) => l.trim()).filter(Boolean);
  const idx = lines.findIndex((l) => /^Alva$/i.test(l));
  return {
    url: location.href,
    containsAmdBuild: /AMD Below \$100 Alert/i.test(t),
    nearAlva: idx >= 0 ? lines.slice(idx, idx + 15) : [],
    amdLines: lines.filter((l) => /AMD Below|Build/i.test(l)).slice(0, 5),
  };
});
console.log('AFTER_CLICK_ALVA:', JSON.stringify(after, null, 2));
await b.close();
