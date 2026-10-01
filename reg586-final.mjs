import { chromium } from 'playwright';
const BASE='https://staging.reglo.it';
const OUT='/tmp/hiro-design/reg-586';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:1000},locale:'it-IT'});
const p=await ctx.newPage();
await p.goto(`${BASE}/it/sign-in`,{waitUntil:'domcontentloaded'});
await p.fill('input[type="email"]','titolare@reglo.it'); await p.fill('input[type="password"]','RegloTest2026!');
await p.click('button[type="submit"]'); await p.waitForTimeout(7000);

const combos=async()=>p.evaluate(()=>{
  const d=document.querySelector('[role="dialog"]');
  const v=Array.from(d.querySelectorAll('[role="combobox"]')).map(e=>(e.textContent||'').trim());
  return {istruttore:v[0],veicolo:v[1]};
});
const openForm=async()=>{
  await p.goto(`${BASE}/it/user/autoscuole?tab=agenda`,{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(6000);
  await p.keyboard.press('Escape'); await p.waitForTimeout(600);
  await p.mouse.click(1144,142); await p.waitForTimeout(1000);
  await p.mouse.click(1341,217); await p.waitForTimeout(1200);
  await p.locator('text=Appuntamento').first().click(); await p.waitForTimeout(2200);
};
const pickStudent=async(i)=>{
  await p.locator('[role="dialog"] input[placeholder="Cerca allievo..."]').click();
  await p.waitForTimeout(1200);
  const l=await p.evaluate((idx)=>{
    const panel=Array.from(document.querySelectorAll('div')).find(d=>getComputedStyle(d).position==='fixed'&&getComputedStyle(d).zIndex==='60');
    const rows=Array.from(panel.querySelectorAll('button'));
    const t=(rows[idx]?.textContent||'').trim(); rows[idx]?.click(); return t;
  },i);
  await p.waitForTimeout(3000);
  return l.split('allievo')[0];
};

for (const i of [0,4,7,10,13]) {
  await openForm();
  const vuoto=await combos();
  const nome=await pickStudent(i);
  const pieno=await combos();
  console.log(`[${String(i).padStart(2)}] ${nome.padEnd(22)} apertura veic="${vuoto.veicolo}" → ${pieno.istruttore.padEnd(16)} veic="${pieno.veicolo}"`);
  if (i===7) await p.locator('[role="dialog"]').last().screenshot({path:`${OUT}/dopo-form.png`});
}

// cambio istruttore dopo l'allievo: il veicolo deve seguirlo
await openForm();
const nome=await pickStudent(0);
const a=await combos();
await p.evaluate(()=>document.querySelectorAll('[role="dialog"] [role="combobox"]')[0].click());
await p.waitForTimeout(1800);
const istrs=await p.evaluate(()=>Array.from(document.querySelectorAll('[role="option"]')).map(e=>(e.textContent||'').trim()));
await p.evaluate(()=>{const o=document.querySelectorAll('[role="option"]');o[1].click();});
await p.waitForTimeout(2500);
const c=await combos();
console.log(`CAMBIO ISTRUTTORE su ${nome}: ${a.istruttore}/"${a.veicolo}" → ${c.istruttore}/"${c.veicolo}"`);
await p.locator('[role="dialog"]').last().screenshot({path:`${OUT}/dopo-cambio-istruttore.png`});

// scelta a mano: deve sopravvivere al re-render
await openForm();
const nome2=await pickStudent(0);
const base=await combos();
await p.evaluate(()=>document.querySelectorAll('[role="dialog"] [role="combobox"]')[1].click());
await p.waitForTimeout(1800);
const vOpts=await p.evaluate(()=>Array.from(document.querySelectorAll('[role="option"]')).map(e=>(e.textContent||'').trim()));
await p.evaluate(()=>{const o=document.querySelectorAll('[role="option"]');o[o.length-1].click();});
await p.waitForTimeout(2500);
const manuale=await combos();
console.log(`SCELTA A MANO su ${nome2}: prefill="${base.veicolo}" → scelto="${manuale.veicolo}" (opzioni ${JSON.stringify(vOpts)})`);
await b.close();
