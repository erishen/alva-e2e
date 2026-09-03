import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
import { chromium } from '@playwright/test';

const BASE='https://alva.ai';
const AUTH = resolve(__dirname, '..', '.auth', 'alva.json');
const b=await chromium.launch();
const ctx=await b.newContext({storageState:AUTH});
const p=await ctx.newPage();
await p.goto(`${BASE}/?tab=alerts`,{waitUntil:'domcontentloaded'});
await p.waitForTimeout(4500);
const txt=await p.evaluate(()=>document.body.innerText);
console.log('ALERTS_HAS_AMD:', /AMD Below \$100|break below \$100|AMD.*alert/i.test(txt));
console.log('SNIPPET:', txt.slice(0,300).replace(/\n+/g,' | '));
await b.close();
