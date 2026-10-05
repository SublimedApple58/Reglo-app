/**
 * REG-500 — porta i numeri di telefono in formato E.164 (`+39…`).
 *
 * Perché serve: in produzione 911 numeri su 1233 sono salvati in forma
 * nazionale (`3331234567`). WhatsApp pretende l'E.164: con i numeri così, il
 * 74% degli invii fallirebbe il giorno in cui il canale viene acceso — e
 * fallirebbe *dopo* aver speso il messaggio, non prima.
 *
 * Cosa NON fa: non inventa prefissi internazionali. Un numero che non si
 * riconosce resta com'è e finisce nell'elenco dei dubbi, perché cambiare il
 * recapito di una persona in base a un'ipotesi è peggio che lasciarlo rotto.
 *
 * A vuoto di default. `--apply` per scrivere.
 *
 *   DOTENV_CONFIG_PATH=.env.prod NODE_OPTIONS=--require=dotenv/config \
 *     npx ts-node --transpile-only \
 *     --compiler-options '{"module":"commonjs","moduleResolution":"node","target":"ES2021","esModuleInterop":true}' \
 *     scripts/reg-500-backfill-e164.ts
 */
/* eslint-disable @typescript-eslint/no-var-requires */
const NodeModule = require("module");
const nodePath = require("path");
const REPO_ROOT = nodePath.join(__dirname, "..");
const originalResolve = NodeModule._resolveFilename;
NodeModule._resolveFilename = function (request: string, ...rest: unknown[]) {
  if (request === "server-only") return originalResolve.call(this, "path", ...rest);
  const target = request.startsWith("@/")
    ? nodePath.join(REPO_ROOT, request.slice(2))
    : request;
  return originalResolve.call(this, target, ...rest);
};

const { prisma } = require("../db/prisma");
const { normalizeToE164 } = require("../lib/phone-e164");

export {};

const APPLY = process.argv.includes("--apply");

async function main() {
  const users = await prisma.user.findMany({
    where: { phone: { not: null } },
    select: { id: true, name: true, phone: true },
  });

  const daCorreggere: Array<{ id: string; da: string; a: string }> = [];
  const dubbi: Array<{ nome: string; phone: string; motivo: string }> = [];
  let giaOk = 0;

  for (const user of users) {
    const phone: string = user.phone ?? "";
    if (!phone.trim()) continue;
    const res = normalizeToE164(phone);
    if (!res.ok) {
      dubbi.push({ nome: user.name ?? "—", phone, motivo: res.reason });
      continue;
    }
    if (res.e164 === phone) {
      giaOk += 1;
      continue;
    }
    daCorreggere.push({ id: user.id, da: phone, a: res.e164 });
  }

  console.log(`\nNumeri in anagrafica: ${users.length}`);
  console.log(`  già in E.164:        ${giaOk}`);
  console.log(`  da correggere:       ${daCorreggere.length}`);
  console.log(`  non riconosciuti:    ${dubbi.length}  ← restano com'erano\n`);

  for (const row of daCorreggere.slice(0, 10)) {
    console.log(`  ${row.da}  →  ${row.a}`);
  }
  if (daCorreggere.length > 10) console.log(`  … e altri ${daCorreggere.length - 10}`);

  if (dubbi.length) {
    console.log(`\nDa guardare a mano:`);
    for (const row of dubbi.slice(0, 15)) {
      console.log(`  ${row.phone.padEnd(20)} ${row.motivo}  (${row.nome})`);
    }
    if (dubbi.length > 15) console.log(`  … e altri ${dubbi.length - 15}`);
  }

  if (!APPLY) {
    console.log(`\nProva a vuoto: non ho scritto niente. Aggiungi --apply per correggerli.\n`);
    return;
  }

  let fatti = 0;
  for (const row of daCorreggere) {
    await prisma.user.update({ where: { id: row.id }, data: { phone: row.a } });
    fatti += 1;
  }
  console.log(`\n${fatti} numeri portati in E.164.\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
