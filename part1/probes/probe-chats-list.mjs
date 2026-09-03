import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
import { chromium } from '@playwright/test';

const BASE='https://alva.ai';
const AUTH = resolve(__dirname, '..', '.auth', 'alva.json');
const b=await chromium.launch();
const ctx=await b.newContext({storageState:AUTH});

const p1=await ctx.newPage();
await p1.goto(`${BASE}/chat?id=2095394210798796800`,{waitUntil:'domcontentloaded'});
await p1.waitForTimeout(4000);
const directUrl=p1.url();
const direct=await p1.evaluate(()=>{
  const t=document.body.innerText;
  return { hasTitle:/AMD Below \$100 Alert/i.test(t), snippet:t.split('\n').filter(l=>/AMD Below|Build|Automation/i.test(l)).slice(0,3) };
});

const p2=await ctx.newPage();
await p2.goto(BASE,{waitUntil:'domcontentloaded'});
await p2.waitForTimeout(4000);
const home=await p2.evaluate(()=>{
  const t=document.body.innerText;
  const lines=t.split('\n').map(l=>l.trim()).filter(Boolean);
  const idx=lines.findIndex(l=>/^Chats$/i.test(l));
  const after=idx>=0?lines.slice(idx+1, idx+12):[];
  return { hasChatsSection: idx>=0, afterChatsHeader: after, containsAmdBuild:/AMD Below \$100 Alert/i.test(t), contains2095:t.includes('2095394210798796800') };
});

console.log('DIRECT_URL:', directUrl);
console.log('DIRECT:', JSON.stringify(direct,null,2));
console.log('HOME_CHATS:', JSON.stringify(home,null,2));
await b.close();
