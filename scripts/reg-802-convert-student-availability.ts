/**
 * REG-802 — disponibilità allievo dal modello condiviso a quello per giorno.
 *
 * Le righe `AutoscuolaWeeklyAvailability` degli allievi (`ownerType: "student"`)
 * scritte dall'app fino al REG-802 hanno le stesse fasce su ogni giorno attivo
 * (`daysOfWeek` + `ranges`, o i campi piatti se `ranges` è vuoto). Questo script
 * scrive `rangesByDay` copiando quelle fasce su ciascun giorno attivo: SENZA
 * PERDITA, nessun arrotondamento sulle fasce Mattina/Pomeriggio/Sera (lo fa
 * l'app al primo salvataggio dell'allievo). Le righe che hanno già `rangesByDay`
 * restano come sono: lo script è idempotente.
 *
 * I campi piatti non cambiano. Non tocca `availabilityConfirmedAt`: la conferma
 * è dell'allievo, non della conversione.
 *
 * In più stampa quanti allievi incontreranno lo step Disponibilità al prossimo
 * accesso (bloccante / rimandabile), con il criterio di `studentAvailabilityStepMode`.
 *
 * A vuoto di default; `--apply` per scrivere.
 *
 *   DOTENV_CONFIG_PATH=.env.staging NODE_OPTIONS=--require=dotenv/config \
 *     npx ts-node --transpile-only \
 *     --compiler-options '{"module":"commonjs","moduleResolution":"node","target":"ES2021","esModuleInterop":true}' \
 *     scripts/reg-802-convert-student-availability.ts [--apply]
 */
/* eslint-disable @typescript-eslint/no-require-imports */
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
const { defaultToAvailabilityRecord, rangesForDay } = require("../lib/autoscuole/availability-record");
const { studentAvailabilityStepMode } = require("../lib/autoscuole/student-availability");

export {};

const APPLY = process.argv.includes("--apply");

type Range = { startMinutes: number; endMinutes: number };

async function main() {
  const rows = await prisma.autoscuolaWeeklyAvailability.findMany({
    where: { ownerType: "student" },
  });

  let alreadyPerDay = 0;
  let empty = 0;
  // Allievi che hanno davvero delle fasce (righe per giorno o convertibili).
  const withRow = new Set<string>();
  const toConvert: Array<{ id: string; rangesByDay: Record<string, Range[]> }> = [];
  for (const row of rows) {
    if (row.rangesByDay && typeof row.rangesByDay === "object" && Object.keys(row.rangesByDay).length) {
      alreadyPerDay += 1;
      withRow.add(`${row.companyId}:${row.ownerId}`);
      continue;
    }
    const record = defaultToAvailabilityRecord(row);
    const map: Record<string, Range[]> = {};
    for (let day = 0; day <= 6; day += 1) {
      const ranges = (rangesForDay(record, day) as Range[])
        .filter((r) => r.endMinutes > r.startMinutes)
        .map((r) => ({ startMinutes: r.startMinutes, endMinutes: r.endMinutes }));
      if (ranges.length) map[String(day)] = ranges;
    }
    if (!Object.keys(map).length) {
      empty += 1;
      continue;
    }
    toConvert.push({ id: row.id, rangesByDay: map });
    withRow.add(`${row.companyId}:${row.ownerId}`);
  }

  console.log(`Righe allievo: ${rows.length}`);
  console.log(`  già per giorno: ${alreadyPerDay}`);
  console.log(`  senza fasce valide (lasciate stare): ${empty}`);
  console.log(`  da convertire: ${toConvert.length}`);
  for (const c of toConvert.slice(0, 5)) console.log(`    es. ${c.id} → ${JSON.stringify(c.rangesByDay)}`);

  // Quanti incontreranno lo step al prossimo accesso.
  const students = await prisma.companyMember.findMany({
    where: { autoscuolaRole: "STUDENT" },
    select: {
      companyId: true,
      userId: true,
      studentPhase: true,
      activeLicensePathId: true,
      availabilityPromptSnoozedUntil: true,
    },
  });
  const pathCounts = await prisma.autoscuolaLicensePath.groupBy({
    by: ["companyId", "studentId"],
    _count: { _all: true },
  });
  const pathCount = new Map<string, number>(
    pathCounts.map((p: { companyId: string; studentId: string; _count: { _all: number } }) => [
      `${p.companyId}:${p.studentId}`,
      p._count._all,
    ]),
  );
  const tally: Record<string, number> = { required: 0, optional: 0, none: 0 };
  const now = new Date();
  for (const s of students) {
    const key = `${s.companyId}:${s.userId}`;
    const mode = studentAvailabilityStepMode({
      hasAvailability: withRow.has(key),
      studentPhase: s.studentPhase,
      activeLicensePathId: s.activeLicensePathId,
      licensePathCount: pathCount.get(key) ?? 0,
      snoozedUntil: s.availabilityPromptSnoozedUntil,
      now,
    });
    tally[mode] += 1;
  }
  console.log(`Allievi (membri STUDENT): ${students.length}`);
  console.log(`  step Disponibilità BLOCCANTE: ${tally.required}`);
  console.log(`  step Disponibilità rimandabile: ${tally.optional}`);
  console.log(`  nessuno step (le hanno già, o non fanno più guide): ${tally.none}`);

  if (!APPLY) {
    console.log("\nA vuoto: niente scritto. Rilancia con --apply per convertire.");
    return;
  }
  let written = 0;
  for (const c of toConvert) {
    // Condizione su rangesByDay ancora vuoto: se nel frattempo l'allievo ha
    // salvato dall'app, la sua riga nuova vince.
    // (`rangesByDay` è `json`, non `jsonb`: niente filtri di uguaglianza in
    // Prisma, quindi SQL diretto.)
    written += await prisma.$executeRaw`
      UPDATE "AutoscuolaWeeklyAvailability"
      SET "rangesByDay" = ${JSON.stringify(c.rangesByDay)}::json, "updatedAt" = NOW()
      WHERE "id" = ${c.id}::uuid
        AND ("rangesByDay" IS NULL OR "rangesByDay"::text IN ('null', '{}'))`;
  }
  console.log(`\nConvertite: ${written}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
