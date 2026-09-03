import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
import { chromium } from '@playwright/test';

const BASE='https://alva.ai';
const AUTH = resolve(__dirname, '..', '.auth', 'alva.json');
const b=await chromium.launch();
const ctx=await b.newContext({storageState:AUTH});
const p=await ctx.newPage();
await p.goto(`${BASE}/markets/AMD`,{waitUntil:'domcontentloaded'});
await p.waitForTimeout(5000);
const url=p.url();
const title=await p.title();
const data=await p.evaluate(()=>{
  const t=document.body.innerText;
  return {
    len:t.length,
    snippets: t.split('\n').filter(l=>l.trim().length>2).slice(0,35),
    hasWatch:/watch|alert|monitor/i.test(t),
    hasAddToPortfolio:/portfolio/i.test(t),
    hasPrice:/\$[\d,]/.test(t),
  };
});
console.log('URL:', url);
console.log('TITLE:', title.slice(0,80));
console.log('DATA:', JSON.stringify(data,null,2));
const btns=await p.evaluate(()=>{
  const els=[...document.querySelectorAll('button,a')].filter(e=>/watch|alert|monitor|add|create/i.test(e.innerText||e.getAttribute('aria-label')||''));
  return els.slice(0,15).map(e=>({tag:e.tagName, txt:(e.innerText||'').slice(0,40), aria:e.getAttribute('aria-label')||'', href:e.getAttribute('href')||''}));
});
console.log('ACTION_ELS:', JSON.stringify(btns,null,2));
await b.close();
