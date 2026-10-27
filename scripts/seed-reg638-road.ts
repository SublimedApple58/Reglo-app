/**
 * REG-638 Reglo Road — dati di prova per la web «Road» (SOLO DB dev).
 *
 * Sull'autoscuola attiva di titolare@reglo.it crea, con percorsi veri di
 * Torino (`scripts/fixtures/reg638-routes.json`):
 * - 3 guide IN CORSO (sessioni Road attive, segnalazioni) → «Dal vivo»;
 * - oggi: 1 completata con pagellino, 1 non registrata, 1 da iniziare;
 * - 2 guide completate nei giorni scorsi → «Storico».
 * Accende `roadEnabled`, mette la sede a Torino (se non ha coordinate) e due
 * segnalazioni personalizzate di prova (`fx*`).
 *
 * Uso (dalla root del repo):
 *   DOTENV_CONFIG_PATH=.env.dev NODE_OPTIONS=--require=dotenv/config npx tsx scripts/seed-reg638-road.ts
 *   ... scripts/seed-reg638-road.ts --drive     # muove le auto in guida per ~60 s
 *   ... scripts/seed-reg638-road.ts --cleanup   # toglie tutto
 */
import { PrismaClient } from "@prisma/client";
import { Redis } from "@upstash/redis";

import routesJson from "./fixtures/reg638-routes.json";

type LatLng = [number, number];
type Route = { coords: LatLng[]; steps: Array<{ name: string; at: LatLng }> };
const ROUTES = routesJson as unknown as Record<"r1" | "r2" | "r3", Route>;

const prisma = new PrismaClient();
const NOTE = "REG638_SEED Road";
const SEDE: LatLng = [45.064, 7.6772];
const CUSTOM = [
  { id: "fx1", label: "Cambio marcia" },
  { id: "fx2", label: "Partenza in salita" },
];
const mode = process.argv.includes("--cleanup") ? "cleanup" : process.argv.includes("--drive") ? "drive" : "setup";

const R = (x: number) => (x * Math.PI) / 180;
const hav = (a: LatLng, b: LatLng) => {
  const h =
    Math.sin(R(b[0] - a[0]) / 2) ** 2 + Math.cos(R(a[0])) * Math.cos(R(b[0])) * Math.sin(R(b[1] - a[1]) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
};
const bearing = (a: LatLng, b: LatLng) => {
  const y = Math.sin(R(b[1] - a[1])) * Math.cos(R(b[0]));
  const x = Math.cos(R(a[0])) * Math.sin(R(b[0])) - Math.sin(R(a[0])) * Math.cos(R(b[0])) * Math.cos(R(b[1] - a[1]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};
const dist = (c: LatLng[]) => c.slice(1).reduce((s, p, i) => s + hav(c[i], p), 0);
const nearest = (coords: LatLng[], p: LatLng) => {
  let best = 0;
  let bd = Infinity;
  coords.forEach((c, i) => {
    const d = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
};
const streetAt = (route: Route, idx: number) => {
  let name = route.steps[0].name;
  for (const st of route.steps) if (nearest(route.coords, st.at) <= idx) name = st.name;
  return name;
};
const min = (n: number) => n * 60000;

async function context() {
  if (!/\.env\.dev$/.test(process.env.DOTENV_CONFIG_PATH ?? "")) {
    throw new Error("seed-reg638-road gira solo su dev (DOTENV_CONFIG_PATH=.env.dev).");
  }
  const owner = await prisma.user.findUniqueOrThrow({
    where: { email: "titolare@reglo.it" },
    select: { activeCompanyId: true },
  });
  if (!owner.activeCompanyId) throw new Error("Il titolare di prova non ha un'autoscuola attiva.");
  return owner.activeCompanyId;
}

async function bumpSettingsCache(companyId: string) {
  if (!process.env.UPSTASH_REDIS_REST_URL) return;
  const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN! });
  await redis.incr(`${process.env.CACHE_NS ?? "autoscuole:v1"}:${companyId}:settings:version`);
}

async function setLimits(companyId: string, patch: (l: Record<string, unknown>) => Record<string, unknown>) {
  const svc = await prisma.companyService.findFirstOrThrow({ where: { companyId, serviceKey: "AUTOSCUOLE" } });
  const limits = patch({ ...((svc.limits ?? {}) as Record<string, unknown>) });
  await prisma.companyService.update({ where: { id: svc.id }, data: { limits: limits as object } });
  await bumpSettingsCache(companyId);
}

async function cleanup(companyId: string) {
  // Sessioni, lotti, segnalazioni e pagellino cadono in cascata con le guide.
  const { count } = await prisma.autoscuolaAppointment.deleteMany({ where: { companyId, notes: NOTE } });
  await prisma.autoscuolaLocation.updateMany({
    where: { companyId, latitude: SEDE[0], longitude: SEDE[1] },
    data: { latitude: null, longitude: null },
  });
  await setLimits(companyId, (l) => {
    const custom = Array.isArray(l.roadCustomMarkers) ? (l.roadCustomMarkers as Array<{ id: string }>) : [];
    const kept = custom.filter((c) => !c.id.startsWith("fx"));
    if (kept.length) l.roadCustomMarkers = kept;
    else delete l.roadCustomMarkers;
    return l;
  });
  return count;
}

type LessonInput = {
  companyId: string;
  instructorId: string;
  studentId: string;
  vehicleId: string;
  startMin: number;
  route?: Route;
  frac?: number;
  status: "active" | "completed" | "none-past" | "none-future";
  markers?: Array<{ kind: string; label: string; at: number; note?: string }>;
  evaluation?: number[];
};

async function lesson(i: LessonInput) {
  const now = Date.now();
  const startsAt = new Date(now + min(i.startMin));
  const endsAt = new Date(startsAt.getTime() + min(60));
  const apptStatus =
    i.status === "active" ? "checked_in" : i.status === "completed" || i.status === "none-past" ? "completed" : "scheduled";
  const a = await prisma.autoscuolaAppointment.create({
    data: {
      companyId: i.companyId,
      studentId: i.studentId,
      instructorId: i.instructorId,
      vehicleId: i.vehicleId,
      type: "guida",
      types: ["guida"],
      startsAt,
      endsAt,
      status: apptStatus,
      notes: NOTE,
    },
  });
  if (!i.route || (i.status !== "active" && i.status !== "completed")) return a;

  const coords = i.route.coords.slice(0, Math.max(2, Math.round(i.route.coords.length * (i.frac ?? 1))));
  const startT = startsAt.getTime() + min(1);
  const endT = i.status === "active" ? now - 4000 : endsAt.getTime() - min(5);
  const step = (endT - startT) / (coords.length - 1);
  const pts = coords.map((c, k) => {
    const prev = coords[Math.max(0, k - 1)];
    const speed = k ? Math.min(14, hav(prev, c) / (step / 1000)) : 0;
    return [Math.round(startT + k * step), c[0], c[1], Math.round(speed * 10) / 10, Math.round(bearing(coords[Math.max(0, k - 3)], c)), 6];
  });
  const last = pts[pts.length - 1];
  const session = await prisma.roadSession.create({
    data: {
      companyId: i.companyId,
      appointmentId: a.id,
      instructorId: i.instructorId,
      studentId: i.studentId,
      vehicleId: i.vehicleId,
      status: i.status,
      startedAt: new Date(startT),
      endedAt: i.status === "active" ? null : new Date(endT),
      distanceMeters: Math.round(dist(coords)),
      durationSec: i.status === "active" ? 0 : Math.round((endT - startT) / 1000),
      pointCount: pts.length,
      lastSeq: Math.ceil(pts.length / 20) - 1,
      lastLat: last[1],
      lastLng: last[2],
      lastSpeed: i.status === "active" ? 7.4 : last[3],
      lastHeading: last[4],
      lastStreet: streetAt(i.route, coords.length - 1),
      lastPointAt: new Date(last[0]),
    },
  });
  for (let seq = 0; seq * 20 < pts.length; seq++) {
    await prisma.roadPointBatch.create({ data: { sessionId: session.id, seq, points: pts.slice(seq * 20, seq * 20 + 20) } });
  }
  for (const [n, m] of (i.markers ?? []).entries()) {
    const idx = Math.min(coords.length - 1, Math.round(coords.length * m.at));
    await prisma.roadMarker.create({
      data: {
        sessionId: session.id,
        companyId: i.companyId,
        clientId: `reg638seed-${session.id.slice(0, 8)}-${n}`,
        kind: m.kind,
        label: m.label,
        note: m.note ?? null,
        lat: coords[idx][0],
        lng: coords[idx][1],
        street: streetAt(i.route, idx),
        recordedAt: new Date(pts[idx][0]),
      },
    });
  }
  if (i.evaluation) {
    const items = await prisma.autoscuolaEvaluationItem.findMany({
      where: { companyId: i.companyId, archivedAt: null },
      orderBy: { position: "asc" },
    });
    for (const [k, it] of items.slice(0, i.evaluation.length).entries()) {
      await prisma.autoscuolaAppointmentEvaluation.create({ data: { appointmentId: a.id, itemId: it.id, score: i.evaluation[k] } });
    }
  }
  return a;
}

async function setup(companyId: string) {
  const instructors = await prisma.autoscuolaInstructor.findMany({
    where: { companyId, status: "active", color: { not: null } },
    orderBy: { name: "asc" },
    take: 3,
  });
  const students = await prisma.companyMember.findMany({
    where: { companyId, autoscuolaRole: "STUDENT", user: { email: { endsWith: "@reglo.it" } } },
    orderBy: { userId: "asc" },
    take: 5,
    select: { userId: true },
  });
  const vehicles = await prisma.autoscuolaVehicle.findMany({
    where: { companyId, status: "active", licenseCategory: "B" },
    orderBy: { name: "asc" },
    take: 4,
  });
  if (instructors.length < 3 || students.length < 5 || vehicles.length < 4) {
    throw new Error("Servono 3 istruttori con colore, 5 allievi e 4 auto B sull'autoscuola di prova.");
  }
  const [I1, I2, I3] = instructors.map((x) => x.id);
  const [S1, S2, S3, S4, S5] = students.map((s) => s.userId);
  const [V1, V2, V3, V4] = vehicles.map((v) => v.id);

  const sede = await prisma.autoscuolaLocation.findFirst({ where: { companyId }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] });
  if (sede && sede.latitude == null) {
    await prisma.autoscuolaLocation.update({ where: { id: sede.id }, data: { latitude: SEDE[0], longitude: SEDE[1] } });
  }
  await setLimits(companyId, (l) => {
    const custom = Array.isArray(l.roadCustomMarkers) ? (l.roadCustomMarkers as Array<{ id: string }>) : [];
    return { ...l, roadEnabled: true, roadCustomMarkers: [...custom.filter((c) => !c.id.startsWith("fx")), ...CUSTOM] };
  });

  const base = { companyId };
  // dal vivo
  await lesson({ ...base, instructorId: I1, studentId: S1, vehicleId: V1, startMin: -55, route: ROUTES.r1, frac: 0.9, status: "active",
    markers: [
      { kind: "distanza", label: "Distanza di sicurezza", at: 0.3 },
      { kind: "precedenza", label: "Precedenza", at: 0.5 },
      { kind: "stop", label: "Stop", at: 0.8 },
    ] });
  await lesson({ ...base, instructorId: I2, studentId: S2, vehicleId: V2, startMin: -35, route: ROUTES.r2, frac: 0.57, status: "active",
    markers: [
      { kind: "precedenza", label: "Precedenza", at: 0.35 },
      { kind: "semaforo", label: "Semaforo", at: 0.8 },
    ] });
  await lesson({ ...base, instructorId: I3, studentId: S3, vehicleId: V3, startMin: -15, route: ROUTES.r3, frac: 0.5, status: "active" });
  // oggi
  await lesson({ ...base, instructorId: I1, studentId: S4, vehicleId: V1, startMin: -180, route: ROUTES.r1, status: "completed",
    markers: [
      { kind: "distanza", label: "Distanza di sicurezza", at: 0.25 },
      { kind: "precedenza", label: "Precedenza", at: 0.55 },
      { kind: "stop", label: "Stop", at: 0.85, note: "non ha guardato a destra" },
    ],
    evaluation: [3, 4, 4, 2] });
  await lesson({ ...base, instructorId: I3, studentId: S5, vehicleId: V4, startMin: -120, status: "none-past" });
  await lesson({ ...base, instructorId: I2, studentId: S1, vehicleId: V2, startMin: 90, status: "none-future" });
  // storico
  await lesson({ ...base, instructorId: I2, studentId: S5, vehicleId: V2, startMin: -60 * 24 - 60, route: ROUTES.r2, status: "completed",
    markers: [{ kind: "custom:fx1", label: "Cambio marcia", at: 0.4 }] });
  await lesson({ ...base, instructorId: I3, studentId: S2, vehicleId: V3, startMin: -60 * 48 - 120, route: ROUTES.r3, status: "completed" });
}

/** Fa avanzare le auto in guida: un lotto ogni 5 s per ~60 s (per vedere l'animazione). */
async function drive(companyId: string) {
  const sessions = await prisma.roadSession.findMany({ where: { companyId, status: "active", appointment: { notes: NOTE } } });
  const routes = [ROUTES.r1, ROUTES.r2, ROUTES.r3];
  for (let tick = 0; tick < 12; tick++) {
    for (const s of sessions) {
      const [latest] = await prisma.roadPointBatch.findMany({ where: { sessionId: s.id }, orderBy: { seq: "desc" }, take: 1 });
      const lp = (latest.points as number[][]).at(-1)!;
      const route = routes.reduce((best, r) => (hav(r.coords[nearest(r.coords, [lp[1], lp[2]])], [lp[1], lp[2]]) < hav(best.coords[nearest(best.coords, [lp[1], lp[2]])], [lp[1], lp[2]]) ? r : best));
      const idx = nearest(route.coords, [lp[1], lp[2]]);
      const next = route.coords.slice(idx + 1, idx + 4);
      if (!next.length) continue;
      const t = Date.now();
      const pts = next.map((c, k) => [t - (next.length - 1 - k) * 1500, c[0], c[1], 7 + k, Math.round(bearing(route.coords[idx + k], c)), 5]);
      const lastPt = pts[pts.length - 1];
      await prisma.roadPointBatch.create({ data: { sessionId: s.id, seq: latest.seq + 1, points: pts } });
      await prisma.roadSession.update({
        where: { id: s.id },
        data: {
          lastSeq: latest.seq + 1,
          pointCount: { increment: pts.length },
          distanceMeters: { increment: Math.round(dist([[lp[1], lp[2]], ...next])) },
          lastLat: lastPt[1],
          lastLng: lastPt[2],
          lastHeading: lastPt[4],
          lastSpeed: lastPt[3],
          lastStreet: streetAt(route, idx + next.length),
          lastPointAt: new Date(lastPt[0]),
        },
      });
    }
    console.log(`→ giro ${tick + 1}/12`);
    await new Promise((r) => setTimeout(r, 5000));
  }
}

async function main() {
  const companyId = await context();
  if (mode === "drive") return drive(companyId);
  const removed = await cleanup(companyId);
  console.log(`→ ripulite ${removed} guide di prova`);
  if (mode === "cleanup") return;
  await setup(companyId);
  console.log("→ Road di prova pronta");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
