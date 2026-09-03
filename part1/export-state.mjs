// 手动登录并导出 storageState，供 part1/onboarding.spec.ts 复用登录态。
//
// 为什么不是填密码：你用 Gmail / Google SSO 登录 Alva，Playwright 无法重放 Google 登录
// （Google 会拦截自动化、常需 2FA）。所以这里只负责「打开浏览器 → 你手动登录 →
// 自动把会话存成文件」，全程不接触你的密码。
//
// 触发保存的方式：脚本打开浏览器后不做任何自动判断，由你自己掌握节奏。
// 登录完成后【直接关闭浏览器窗口】，close 事件触发，脚本把最近一次抓到的
// 会话快照写入 part1/.auth/alva.json（已被 .gitignore 忽略，切勿提交）。
//
// Cloudflare 绕过策略：通过 CDP（Chrome DevTools Protocol）连接系统真实 Chrome。
// Chrome 以完全正常的参数启动（无 --enable-automation 等任何自动化标记），
// Playwright 仅作为"远程控制"附加上去。对 Cloudflare/Turnstile 来说这就是真人浏览器。
//
// 用法：
//   node part1/export-state.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL ?? 'https://alva.ai';
const OUT = resolve(__dirname, '.auth', 'alva.json');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

if (!existsSync(CHROME_PATH)) {
  console.error('未找到 Google Chrome。请安装：brew install --cask google-chrome');
  process.exit(1);
}

const DEBUG_PORT = 19222;
const USER_DATA_DIR = resolve(tmpdir(), 'alva-cdp-profile');

// 用最普通的参数启动 Chrome（和用户双击图标一模一样），仅加调试端口
const chromeProc = spawn(CHROME_PATH, [
  `--remote-debugging-port=${DEBUG_PORT}`,
  `--user-data-dir=${USER_DATA_DIR}`,
  '--no-first-run',
  '--no-default-browser-check',
], {
  stdio: 'ignore',
  detached: true,
});
chromeProc.unref(); // 让 Chrome 进程独立于脚本生命周期

// 等 Chrome 就绪
await new Promise((resolve) => setTimeout(resolve, 2000));

// 通过 CDP 连接——这是关键：Playwright 不启动浏览器，只是"遥控"
let browser;
try {
  browser = await chromium.connectOverCDP(`http://localhost:${DEBUG_PORT}`);
} catch (e) {
  console.error(`无法连接到 Chrome（端口 ${DEBUG_PORT}）。请确认 Chrome 已启动。`);
  console.error(e.message);
  process.exit(1);
}

const context = browser.contexts()[0];
const page = context.pages()[0] ?? await context.newPage();

console.log(`请在打开的 Chrome 中用 Gmail 手动登录 ${BASE} …`);
console.log('登录完成后，直接关闭 Chrome 窗口即可，脚本会自动保存会话。');
await page.goto(BASE);

// 持续抓取最新会话快照
let snapshot = null;
const timer = setInterval(async () => {
  try {
    snapshot = await context.storageState();
  } catch {
    clearInterval(timer);
  }
}, 1000);

// 等用户关闭浏览器窗口
await new Promise((r) => context.on('close', r));
clearInterval(timer);

if (snapshot && snapshot.cookies && snapshot.cookies.length > 0) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(snapshot, null, 2));
  console.log(`已保存登录态（含 ${snapshot.cookies.length} 个 cookie）→ ${OUT}`);
} else {
  console.log('未检测到登录 cookie，未写入有效会话。请确认已在浏览器中完成登录后再试。');
}
