import { chromium } from 'playwright';
const BASE='https://staging.reglo.it';
const OUT='/tmp/hiro-design/reg-586';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:1000},locale:'it-IT'});
const p=await ctx.newPage();
await p.goto(`${BASE}/it/sign-in`,{waitUntil:'domcontentloaded'});
await p.fill('input[type="email"]','titolare@reglo.it'); await p.fill('input[type="password"]','RegloTest2026!');
await p.click('button[type="submit"]'); await p.waitForTimeout(7000);
await p.keyboard.press('Escape'); await p.waitForTimeout(800);
await p.mouse.click(1144,142); await p.waitForTimeout(1500);

const combos=async()=>p.evaluate(()=>{
  const dlg=document.querySelector('[role="dialog"]');
  const v=Array.from(dlg.querySelectorAll('[role="combobox"]')).map(e=>(e.textContent||'').trim());
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
  return p.evaluate((idx)=>{
    const panel=Array.from(document.querySelectorAll('div')).find(d=>getComputedStyle(d).position==='fixed' && getComputedStyle(d).zIndex==='60');
    const rows=Array.from(panel.querySelectorAll('button'));
    const label=(rows[idx]?.textContent||'').trim();
    rows[idx]?.click();
    return label.split('allievo')[0];
  },i);
};
const closeForm=async()=>{};

for (const i of [0,1,4,7,10]) {
  await openForm();
  const vuoto=await combos();
  const nome=await pickStudent(i);
  await p.waitForTimeout(3000);
  const pieno=await combos();
  console.log(`[${i}] ${nome.padEnd(22)} apertura={istr:"${vuoto.istruttore}", veic:"${vuoto.veicolo}"} → dopo allievo={istr:"${pieno.istruttore}", veic:"${pieno.veicolo}"}`);
  if (i===0) await p.locator('[role="dialog"]').last().screenshot({path:`${OUT}/dopo-form.png`});
  await closeForm();
}
await b.close();
