/**
 * REG-665 — calcola e salva la traccia pulita (e agganciata alla strada con
 * Google Roads) delle sessioni Road finite che non ce l'hanno ancora. Le stesse
 * cose che il dettaglio della guida farebbe alla prima apertura, fatte prima.
 * Costo: ~6–8 richieste Google per un'ora di guida (≈ 0,07 € a guida).
 *
 *   DOTENV_CONFIG_PATH=.env.prod NODE_OPTIONS=--require=dotenv/config npx tsx scripts/road/backfill-clean-tracks.ts [--company <id>]          # conta
 *   ... scripts/road/backfill-clean-tracks.ts --company <id> --prod --yes                                                                       # scrive
 */
import { PrismaClient, type Prisma } from "@prisma/client";

import { buildCleanTrack, needsRebuild } from "../../lib/autoscuole/road/clean-track";
import type { RoadPoint } from "../../lib/autoscuole/road/geo";

const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const arg = (f: string) => (has(f) ? args[args.indexOf(f) + 1] : undefined);
const WRITE = has("--prod") && has("--yes");
const CONCURRENCY = 4;

async function main() {
  const db = new PrismaClient();
  const companyId = arg("--company");
  const host = (process.env.DATABASE_URL ?? "").split("@")[1]?.split("/")[0] ?? "?";
  console.log(`DB ${host} · ${WRITE ? "SCRITTURA" : "prova (nessuna scrittura né chiamata a Google)"}${companyId ? ` · company ${companyId}` : ""}`);
  const sessions = await db.roadSession.findMany({
    where: { status: { not: "active" }, ...(companyId ? { companyId } : {}) },
    select: { id: true, cleanTrack: true },
  });
  const todo = sessions.filter((s) => needsRebuild(s.cleanTrack)).map((s) => s.id);
  console.log(`sessioni finite: ${sessions.length} · da calcolare: ${todo.length}`);
  if (!WRITE) return db.$disconnect();

  let snapped = 0;
  let fallback = 0;
  let stops = 0;
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    await Promise.all(
      todo.slice(i, i + CONCURRENCY).map(async (id) => {
        const batches = await db.roadPointBatch.findMany({ where: { sessionId: id }, orderBy: { seq: "asc" }, select: { points: true } });
        const points = batches.flatMap((b) => (Array.isArray(b.points) ? (b.points as unknown as RoadPoint[]) : []));
        const track = await buildCleanTrack(points);
        if (track.snapped) snapped++;
        else fallback++;
        stops += track.stops.length;
        await db.roadSession.update({
          where: { id },
          data: { cleanTrack: track as unknown as Prisma.InputJsonValue, distanceMeters: track.distanceMeters },
        });
      }),
    );
    process.stdout.write(`\r${Math.min(i + CONCURRENCY, todo.length)}/${todo.length}`);
  }
  console.log(`\nagganciate: ${snapped} · solo pulite (da riprovare): ${fallback} · soste: ${stops}`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
