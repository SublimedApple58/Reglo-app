/**
 * REG-591 — annulla le guide prenotate SOPRA un istruttore che in
 * quell'orario stava accompagnando una guida di gruppo o un esame.
 *
 * Fino al fix, il motore di disponibilità guardava solo `instructorId`: chi
 * accompagnava (`AutoscuolaAppointmentInstructor`) risultava libero, e gli
 * allievi si sono prenotati sopra. Queste righe sono il danno già fatto, non
 * un caso teorico: il fix impedisce le prossime, non toglie queste.
 *
 * Decisione di Tiziano (2026-10-02): resta l'esame / la guida di gruppo, si
 * annulla la guida singola finita sopra, e l'allievo riceve la notifica.
 *
 * COME: passa da `annulFutureAppointment`, lo stesso percorso del bottone
 * "Annulla guida" — quindi niente scritture a mano: stato, crediti e push
 * all'allievo li gestisce il prodotto. `fault: "school"` perché la colpa è
 * nostra (l'ha permesso il nostro bug), così all'allievo non tocca nessuna
 * penale.
 *
 * Idempotente: una guida già annullata viene saltata.
 *
 *   # elenco, senza toccare niente
 *   DOTENV_CONFIG_PATH=.env.prod NODE_OPTIONS=--require=dotenv/config \
 *     npx ts-node --compiler-options '{"module":"commonjs"}' \
 *     scripts/reg-591-cancel-overlapping-bookings.ts
 *
 *   # esecuzione
 *   ... scripts/reg-591-cancel-overlapping-bookings.ts --apply
 */

/* eslint-disable @typescript-eslint/no-var-requires */
// Il `baseUrl` di questo repo sta FUORI da `compilerOptions` (tsconfig.json:2),
// e tsconfig-paths lo salta: senza questo gancio gli import "@/..." della
// catena non si risolvono fuori da Next. Va prima dei require.
const NodeModule = require("module");
const nodePath = require("path");
const REPO_ROOT = nodePath.join(__dirname, "..");
const originalResolve = NodeModule._resolveFilename;
NodeModule._resolveFilename = function (request: string, ...rest: unknown[]) {
  // `server-only` esiste per far fallire il BUILD di Next se un modulo server
  // finisce in un client component. Fuori da Next esplode e basta: qui si
  // disinnesca su un modulo vuoto.
  if (request === "server-only") return originalResolve.call(this, "path", ...rest);
  const target = request.startsWith("@/")
    ? nodePath.join(REPO_ROOT, request.slice(2))
    : request;
  return originalResolve.call(this, target, ...rest);
};

const { prisma } = require("../db/prisma");
const { annulFutureAppointment } = require("../lib/autoscuole/operational-cancellation");

export {};

const APPLY = process.argv.includes("--apply");

type Row = {
  id: string;
  companyId: string;
  company: string;
  instructor: string;
  student: string | null;
  studentId: string | null;
  startsAt: Date;
  endsAt: Date | null;
  overlapType: string;
  overlapStartsAt: Date;
  overlapEndsAt: Date | null;
  bookingSource: string | null;
};

const fmt = (d: Date | null) =>
  d
    ? d.toLocaleString("it-IT", {
        timeZone: "Europe/Rome",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

async function main() {
  // La guida "sopra" è una guida SINGOLA (non una riga-posto di gruppo, non un
  // esame): è quella che va tolta. La riga "sotto" è l'impegno da accompagnatore.
  const rows = (await prisma.$queryRawUnsafe(`
    select distinct on (a.id)
      a.id, a."companyId", c.name as company, i.name as instructor,
      u.name as student, a."studentId", a."startsAt", a."endsAt",
      a."bookingSource",
      b.type as "overlapType", b."startsAt" as "overlapStartsAt", b."endsAt" as "overlapEndsAt"
    from "AutoscuolaAppointment" a
    join "AutoscuolaAppointmentInstructor" ci on a."instructorId" = ci."instructorId"
    join "AutoscuolaAppointment" b on b.id = ci."appointmentId"
    join "AutoscuolaInstructor" i on i.id = ci."instructorId"
    join "Company" c on c.id = a."companyId"
    left join "User" u on u.id = a."studentId"
    where a.id <> b.id
      and a."groupLessonId" is null
      and a.type <> 'esame'
      and a.status not in ('cancelled', 'completed', 'no_show')
      and b.status <> 'cancelled'
      and a."endsAt" is not null and b."endsAt" is not null
      and a."startsAt" < b."endsAt" and a."endsAt" > b."startsAt"
      and a."startsAt" > now()
    order by a.id, a."startsAt"
  `)) as Row[];

  if (!rows.length) {
    console.log("Nessuna sovrapposizione da sistemare.");
    return;
  }

  console.log(`\n${rows.length} guid${rows.length === 1 ? "a" : "e"} da annullare:\n`);
  for (const r of rows) {
    console.log(
      `  · ${r.company} — ${r.student ?? "allievo ignoto"}\n` +
        `    guida   ${fmt(r.startsAt)}–${fmt(r.endsAt)?.slice(-5)}  (prenotata: ${r.bookingSource ?? "?"})\n` +
        `    sopra a ${r.overlapType === "esame" ? "un ESAME" : "una GUIDA DI GRUPPO"} ` +
        `${fmt(r.overlapStartsAt)}–${fmt(r.overlapEndsAt)?.slice(-5)} che ${r.instructor} accompagna\n` +
        `    id ${r.id}\n`,
    );
  }

  if (!APPLY) {
    console.log("Prova a vuoto: non ho toccato niente. Aggiungi --apply per annullarle.\n");
    return;
  }

  console.log("Annullo (con notifica all'allievo, colpa dell'autoscuola)…\n");
  let ok = 0;
  for (const r of rows) {
    const res = await annulFutureAppointment({
      companyId: r.companyId,
      appointmentId: r.id,
      // Il nostro bug, non l'allievo: nessuna penale a suo carico.
      fault: "school",
    });
    if (res.success) {
      ok += 1;
      console.log(`  ✓ ${r.student ?? r.id} — ${fmt(r.startsAt)}`);
    } else {
      console.log(`  ✗ ${r.student ?? r.id} — ${fmt(r.startsAt)}: ${res.message ?? "errore"}`);
    }
  }
  console.log(`\n${ok}/${rows.length} annullate.\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
