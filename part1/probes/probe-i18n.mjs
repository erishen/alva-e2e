import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
import { chromium } from '@playwright/test';

const BASE = 'https://alva.ai';
const AUTH = resolve(__dirname, '..', '.auth', 'alva.json');
const b = await chromium.launch();
const ctx = await b.newContext({ storageState: AUTH });

// 强制中文 locale：i18next 通常读 localStorage 的 i18nextLng
const pages = ['/', '/?tab=tasks', '/?tab=alerts', '/markets/AMD'];
for (const path of pages) {
  const p = await ctx.newPage();
  await p.addInitScript(() => { try { localStorage.setItem('i18nextLng', 'zh'); } catch (e) {} });
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5000);
  const res = await p.evaluate(() => {
    const t = document.body.innerText;
    const lng = (() => { try { return localStorage.getItem('i18nextLng'); } catch (e) { return null; } })();
    // 抽取「看起来像英文 UI 文案」的片段：含空格的英文词组，排除纯数字/URL/专有名词短串
    const lines = t.split('\n').map(l => l.trim()).filter(Boolean);
    const engLines = lines.filter(l => /[A-Za-z]{3,}/.test(l) && /[a-z]{2,}\s/.test(l));
    return { url: location.pathname + location.search, lng, engSample: engLines.slice(0, 40) };
  });
  console.log(`\n=== ${res.url} (lng=${res.lng}) ===`);
  console.log(res.engSample.join(' | '));
  await p.close();
}
await b.close();
