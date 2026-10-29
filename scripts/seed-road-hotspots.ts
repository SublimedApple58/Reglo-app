/**
 * REG-643 — dati di prova dei punti critici Road (SOLO dev e staging).
 *
 * Nell'autoscuola attiva di titolare@reglo.it crea 8 guide passate (completate)
 * con tracciato e segnalazioni «da migliorare» attorno a tre incroci di Torino:
 * - Via Roma / Piazza San Carlo, «Precedenza»: 6 errori, 3 allievi → punto critico;
 * - Corso Vittorio / Porta Nuova, «Rotonda»: 4 errori, 3 allievi → punto critico;
 * - Via Po, «Stop»: 3 errori di UN allievo → sotto soglia, non deve comparire;
 * più qualche «fatto bene» che non conta.
 * Righe riconoscibili: `RoadMarker.clientId` e `AutoscuolaAppointment.notes`
 * iniziano con `seed-road-hotspots`. Idempotente: prima toglie le vecchie.
 *
 *   DOTENV_CONFIG_PATH=.env.dev NODE_OPTIONS=--require=dotenv/config npx tsx scripts/seed-road-hotspots.ts
 *   … --remove   per togliere solo i dati di prova
 */
import { readFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";

const TAG = "seed-road-hotspots";
const OWNER_EMAIL = "titolare@reglo.it";

const SPOTS = {
  precedenza: { lat: 45.0677, lng: 7.6828, street: "Via Roma", alt: "Piazza San Carlo", label: "Precedenza" },
  rotonda: { lat: 45.0623, lng: 7.6787, street: "Corso Vittorio Emanuele II", alt: "Via Sacchi", label: "Rotonda" },
  stop: { lat: 45.0693, lng: 7.6915, street: "Via Po", alt: "Via Po", label: "Stop" },
} as const;

// [giorni fa, allievo (indice), istruttore (indice), segnalazioni]
const LESSONS: Array<[number, number, number, Array<keyof typeof SPOTS | "good">]> = [
  [40, 0, 0, ["precedenza", "rotonda", "good"]],
  [33, 1, 0, ["precedenza", "precedenza"]],
  [26, 2, 1, ["precedenza", "rotonda", "good"]],
  [19, 0, 1, ["precedenza"]],
  [12, 1, 0, ["rotonda", "good"]],
  [9, 2, 1, ["precedenza"]],
  [5, 1, 1, ["rotonda"]],
  [2, 3, 0, ["stop", "stop", "stop", "good"]],
];

async function main() {
  // Mai in produzione: serve un env esplicito di dev o staging E un DB diverso da quello di .env.prod.
  const envFile = process.env.DOTENV_CONFIG_PATH ?? "";
  const env = /\.env\.dev$/.test(envFile) ? "dev" : /\.env\.staging$/.test(envFile) ? "staging" : null;
  if (!env || (process.env.APP_ENV ?? "").toLowerCase() === "prod") throw new Error("Solo con DOTENV_CONFIG_PATH=.env.dev o .env.staging.");
  const host = (url: string | undefined) => (url ? new URL(url).host : "");
  let prodHost = "";
  try {
    const prod = readFileSync(join(process.cwd(), ".env.prod"), "utf8").match(/^DATABASE_URL="?([^"\n]+)/m)?.[1];
    prodHost = host(prod);
  } catch {
    // Nessun .env.prod qui: niente da confrontare.
  }
  if (!process.env.DATABASE_URL || host(process.env.DATABASE_URL) === prodHost) throw new Error("DATABASE_URL è quello di produzione: fermo.");
  const remove = process.argv.includes("--remove");
  const prisma = new PrismaClient();
  try {
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: OWNER_EMAIL }, select: { activeCompanyId: true } });
    const companyId = owner.activeCompanyId;
    if (!companyId) throw new Error("Il titolare di test non ha un'autoscuola attiva.");

    const old = await prisma.autoscuolaAppointment.findMany({
      where: { companyId, notes: { startsWith: TAG } },
      select: { id: true },
    });
    // Le sessioni, i lotti di punti e le segnalazioni se ne vanno in cascata.
    await prisma.autoscuolaAppointment.deleteMany({ where: { id: { in: old.map((a) => a.id) } } });
    console.log(`[${env}] tolte ${old.length} guide di prova`);
    if (remove) return;

    const instructors = await prisma.autoscuolaInstructor.findMany({
      where: { companyId, status: { not: "inactive" } },
      orderBy: { name: "asc" },
      take: 2,
      select: { id: true },
    });
    const students = await prisma.companyMember.findMany({
      where: { companyId, autoscuolaRole: "STUDENT" },
      orderBy: { userId: "asc" },
      take: 4,
      select: { userId: true },
    });
    const vehicle = await prisma.autoscuolaVehicle.findFirst({
      where: { companyId, licenseCategory: "B" },
      select: { id: true },
    });
    if (instructors.length < 2 || students.length < 4) throw new Error("Servono 2 istruttori e 4 allievi.");

    let n = 0;
    for (const [daysAgo, si, ii, marks] of LESSONS) {
      const startsAt = new Date(Date.now() - daysAgo * 86_400_000);
      startsAt.setUTCHours(9, 0, 0, 0);
      const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
      const appointment = await prisma.autoscuolaAppointment.create({
        data: {
          companyId,
          type: "guida",
          status: "completed",
          startsAt,
          endsAt,
          studentId: students[si].userId,
          instructorId: instructors[ii].id,
          vehicleId: vehicle?.id ?? null,
          bookingSource: "road",
          notes: `${TAG} (REG-643)`,
        },
      });
      // Tracciato finto: una linea che passa dai tre incroci, un punto ogni 5 s.
      const via = [SPOTS.stop, SPOTS.precedenza, SPOTS.rotonda];
      const points: Array<[number, number, number, number, number, number]> = [];
      for (let k = 0; k < via.length - 1; k++) {
        for (let j = 0; j < 40; j++) {
          const t = j / 40;
          points.push([
            startsAt.getTime() + points.length * 5000,
            via[k].lat + (via[k + 1].lat - via[k].lat) * t,
            via[k].lng + (via[k + 1].lng - via[k].lng) * t,
            8,
            200,
            5,
          ]);
        }
      }
      const session = await prisma.roadSession.create({
        data: {
          companyId,
          appointmentId: appointment.id,
          instructorId: instructors[ii].id,
          studentId: students[si].userId,
          vehicleId: vehicle?.id ?? null,
          status: "completed",
          startedAt: startsAt,
          endedAt: endsAt,
          distanceMeters: 1900,
          durationSec: 60 * 60,
          pointCount: points.length,
          lastSeq: 0,
          batches: { create: [{ seq: 0, points }] },
        },
      });
      for (const [j, kind] of marks.entries()) {
        const spot = kind === "good" ? SPOTS.precedenza : SPOTS[kind];
        // Sparse entro ~25 m: le segnalazioni non cadono mai sullo stesso metro.
        const jitter = () => (Math.random() - 0.5) * 0.0004;
        await prisma.roadMarker.create({
          data: {
            companyId,
            sessionId: session.id,
            clientId: `${TAG}-${session.id}-${j}`,
            kind: kind === "good" ? "specchietti" : kind,
            label: kind === "good" ? "Specchietti" : spot.label,
            lat: spot.lat + jitter(),
            lng: spot.lng + jitter(),
            street: j % 2 ? spot.alt : spot.street,
            sentiment: kind === "good" ? "good" : "bad",
            recordedAt: new Date(startsAt.getTime() + (10 + j * 7) * 60_000),
          },
        });
      }
      n++;
    }
    console.log(`[${env}] create ${n} guide di prova con segnalazioni (autoscuola ${companyId})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
