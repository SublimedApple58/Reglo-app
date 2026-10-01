import { chromium } from 'playwright';
const BASE='https://staging.reglo.it';
const OUT='/tmp/hiro-design/reg-586';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:1000},locale:'it-IT'});
const p=await ctx.newPage();
await p.goto(`${BASE}/it/sign-in`,{waitUntil:'domcontentloaded'});
await p.fill('input[type="email"]','titolare@reglo.it'); await p.fill('input[type="password"]','RegloTest2026!');
await p.click('button[type="submit"]'); await p.waitForTimeout(7000);
await p.keyboard.press('Escape'); await p.waitForTimeout(600);
await p.mouse.click(1144,142); await p.waitForTimeout(1200);
await p.mouse.click(1341,217); await p.waitForTimeout(1200);
await p.locator('text=Appuntamento').first().click(); await p.waitForTimeout(2200);

await p.locator('[role="dialog"] input[placeholder="Cerca allievo..."]').click();
await p.waitForTimeout(1200);
const nome=await p.evaluate(()=>{
  const panel=Array.from(document.querySelectorAll('div')).find(d=>getComputedStyle(d).position==='fixed'&&getComputedStyle(d).zIndex==='60');
  const rows=Array.from(panel.querySelectorAll('button'));
  const l=(rows[7]?.textContent||'').trim(); rows[7]?.click(); return l;
});
await p.waitForTimeout(3000);
console.log('allievo:',nome);
console.log('dialog?',await p.evaluate(()=>({dlgs:document.querySelectorAll('[role="dialog"]').length,combos:document.querySelectorAll('[role="dialog"] [role="combobox"]').length})));
// apri la select Veicolo e conta le opzioni
await p.evaluate(()=>document.querySelectorAll('[role="dialog"] [role="combobox"]')[1].click());
await p.waitForTimeout(2000);
const opts=await p.evaluate(()=>Array.from(document.querySelectorAll('[role="option"]')).map(e=>(e.textContent||'').trim()));
console.log('opzioni veicolo per questo allievo:',opts.length,JSON.stringify(opts));
await p.keyboard.press('Escape'); await p.waitForTimeout(800);
// cambia istruttore e guarda se il veicolo si aggiorna
await p.evaluate(()=>document.querySelectorAll('[role="dialog"] [role="combobox"]')[0].click());
await p.waitForTimeout(2000);
const istr=await p.evaluate(()=>Array.from(document.querySelectorAll('[role="option"]')).map(e=>(e.textContent||'').trim()));
console.log('istruttori:',JSON.stringify(istr));
await p.evaluate(()=>document.querySelectorAll('[role="option"]')[1].click());
await p.waitForTimeout(2500);
const after=await p.evaluate(()=>{const d=document.querySelector('[role="dialog"]');const v=Array.from(d.querySelectorAll('[role="combobox"]')).map(e=>(e.textContent||'').trim());return{istr:v[0],veic:v[1]};});
console.log('dopo cambio istruttore:',JSON.stringify(after));
await b.close();
