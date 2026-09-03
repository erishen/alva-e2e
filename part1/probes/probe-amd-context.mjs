import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
import { chromium } from '@playwright/test';

const BASE='https://alva.ai';
const AUTH = resolve(__dirname, '..', '.auth', 'alva.json');
const b=await chromium.launch();
const ctx=await b.newContext({storageState:AUTH});

async function locate(url){
  const p=await ctx.newPage();
  await p.goto(url,{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(5000);
  const res=await p.evaluate(()=>{
    const out=[];
    const walk=(el,depth)=>{
      for(const c of el.children){
        const txt=(c.innerText||'').trim();
        if(/AMD Below \$100 Alert/i.test(txt)) out.push({tag:c.tagName, cls:(c.className&&c.className.toString().slice(0,50)), txt:txt.slice(0,60)});
        walk(c,depth+1);
      }
    };
    walk(document.body,0);
    return out.slice(0,8);
  });
  console.log('URL:',url,'\nMATCHES:',JSON.stringify(res,null,2));
  await p.close();
}
await locate(BASE);
await locate(`${BASE}/markets/AMD`);
await b.close();
