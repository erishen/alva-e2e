import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
import { chromium } from '@playwright/test';

const BASE = 'https://alva.ai';
const AUTH = resolve(__dirname, '..', '.auth', 'alva.json');
const TARGET = `${BASE}/chat?id=2095382872417804288`;

const b = await chromium.launch();
const ctx = await b.newContext({ storageState: AUTH });
const p = await ctx.newPage();
await p.goto(TARGET, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(12000);

const r = await p.evaluate(() => {
  const full = document.body.innerText;
  const composerAt = full.indexOf('Ask Alva anything');
  // 对话历史在 composer 之前；侧栏在更前。取 composer 之前部分，再去掉侧栏噪声
  const beforeComposer = composerAt >= 0 ? full.slice(0, composerAt) : full;
  const sidebarNoise = /^(New Chat|Explore|Portfolio|Markets|Channels|Alva|for-you|Chats|Simple Greeting Conversation|\+3,000 bonus credits|Connect social accounts|claim bonus)\s*$/gm;
  const convo = beforeComposer
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .filter(l => !sidebarNoise.test(l));
  return {
    title: (document.title || '').slice(0, 120),
    convoLines: convo.slice(0, 30),
    hasAutomation: /SpawnTask|Build:.*Alert|Automation created|mcp__alva__|being built and tested|delivery binding|transition test/i.test(full),
  };
});

console.log('TITLE:', r.title);
console.log('HAS_AUTOMATION:', r.hasAutomation);
console.log('--- CONVERSATION AREA (excluding sidebar) ---');
console.log(r.convoLines.join('\n'));

await b.close();
