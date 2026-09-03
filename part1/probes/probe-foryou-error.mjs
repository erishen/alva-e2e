// 复现 for-you 频道直接提问报错：channel has no main session
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
import { chromium } from '@playwright/test';

const AUTH = resolve(__dirname, '..', '.auth', 'alva.json');
const browser = await chromium.launch();

const context = await browser.newContext({ storageState: AUTH, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

// 抓失败的网络请求，看后端返回
const apiErrors = [];
page.on('response', (r) => {
  const u = r.url();
  if ((u.includes('/api/') || u.includes('channel') || u.includes('session') || u.includes('message')) && !r.ok()) {
    apiErrors.push({ status: r.status(), url: u });
  }
});
page.on('requestfailed', (req) => {
  apiErrors.push({ failed: true, url: req.url(), err: req.failure()?.errorText });
});

console.log('=== 1) 打开 for-you 频道 ===');
await page.goto('https://alva.ai/channel/5346', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(8000);

const before = await page.evaluate(() => {
  const body = document.body.innerText || '';
  const composer = document.querySelector('[role="textbox"], div[contenteditable="true"], textarea');
  return {
    hasComposer: !!composer,
    composerPlaceholder: composer?.getAttribute('placeholder') || composer?.getAttribute('data-placeholder') || '',
    bodyLen: body.length,
    bodyHead: body.slice(0, 600),
  };
});
console.log('for-you 是否有输入框:', before.hasComposer);
console.log('输入框占位符:', JSON.stringify(before.composerPlaceholder));
console.log('页面文本头:', before.bodyHead.replace(/\n/g, ' | '));

console.log('\n=== 2) 在 for-you 里直接发一条问题 ===');
const question = '帮我分析一下 AMD 现在的估值';
if (before.hasComposer) {
  // 多尝试定位输入框
  let box = null;
  for (const sel of ['[role="textbox"]', 'div[contenteditable="true"]', 'textarea', 'input']) {
    const el = page.locator(sel).first();
    if (await el.count()) {
      try {
        await el.click({ timeout: 4000 });
        await page.keyboard.type(question, { delay: 40 });
        box = sel;
        break;
      } catch { /* try next */ }
    }
  }
  console.log('已输入的选择器:', box);
  await page.keyboard.press('Enter');
} else {
  console.log('没有输入框，尝试直接找发送按钮');
}
await page.waitForTimeout(6000);

const after = await page.evaluate(() => {
  const body = document.body.innerText || '';
  // 找报错相关文本
  const lines = body.split('\n').map((s) => s.trim()).filter(Boolean);
  const errIdx = lines.findIndex((l) => /error|occurred|session|no main/i.test(l));
  return {
    bodyLen: body.length,
    errorNear: errIdx >= 0 ? lines.slice(Math.max(0, errIdx - 2), errIdx + 3) : null,
    fullTail: lines.slice(-15),
  };
});
console.log('发消息后页面尾段:', after.fullTail);
console.log('报错附近文本:', after.errorNear);

console.log('\n=== 3) 网络层失败请求 ===');
console.log(JSON.stringify(apiErrors, null, 2));

// 对照：Alva 普通频道能否正常发（应有 main session）
console.log('\n=== 4) 对照：Alva 主频道(/channel/alva 或首页) 发消息 ===');
await page.goto('https://alva.ai/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
const alvaProbe = await page.evaluate(() => {
  const c = document.querySelector('[role="textbox"], div[contenteditable="true"], textarea');
  return { hasComposer: !!c, placeholder: c?.getAttribute('placeholder') || '' };
});
console.log('Alva 首页输入框:', alvaProbe);

await context.close();
await browser.close();
