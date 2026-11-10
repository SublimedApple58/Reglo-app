import { normalizeExaminers } from "@/lib/autoscuole/exam-examiners";
import { PLAN_MAX_STOPS, type StoredPlan, type StoredPlanStop } from "@/lib/autoscuole/road/lesson-plan";
import type { LatLng } from "@/lib/autoscuole/road/exam-routes";

/**
 * R4 Road Exam — regole pure (niente DB): chi può registrare un esame, nome
 * del percorso registrato, raggruppamento per esaminatore e «Prova il
 * percorso» durante una guida. Decisioni di Tiziano (10/11/2026):
 * - avviano l'istruttore dell'esame, i co-istruttori e il titolare; esame
 *   senza istruttore = qualunque istruttore dell'autoscuola;
 * - solo il tracciato (niente segnalazioni né pagellino);
 * - con due esaminatori il percorso sta sotto entrambi; i percorsi senza
 *   esaminatore li assegna il titolare a mano.
 */

export type RoadSessionMode = "lesson" | "exam";
export const ROAD_SESSION_MODES: readonly RoadSessionMode[] = ["lesson", "exam"];
export const roadSessionMode = (v: unknown): RoadSessionMode => (v === "exam" ? "exam" : "lesson");

export type ExamRouteOrigin = "drawn" | "exam";
export const examRouteOrigin = (v: unknown): ExamRouteOrigin => (v === "exam" ? "exam" : "drawn");

/** Le righe di un esame (una per allievo) che la registrazione usa. */
export type ExamRowLike = {
  id: string;
  type: string;
  status: string;
  startsAt: Date;
  instructorId: string | null;
  coInstructorIds: string[];
  examiners: string[];
};

/**
 * La riga a cui si àncora la sessione: quella con l'id più piccolo fra le righe
 * non annullate. Stabile: chi riapre Road trova la stessa sessione.
 */
export function examAnchorRow<T extends Pick<ExamRowLike, "id" | "status">>(rows: readonly T[]): T | null {
  const live = rows.filter((r) => r.status !== "cancelled");
  if (!live.length) return null;
  return [...live].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
}

/**
 * Chi può avviare Road Exam su queste righe. `instructorId` = istruttore di chi
 * chiede (null se non è istruttore).
 */
export function canStartRoadExam(
  rows: readonly Pick<ExamRowLike, "instructorId" | "coInstructorIds">[],
  who: { isOwner: boolean; instructorId: string | null },
): boolean {
  if (who.isOwner) return true;
  if (!who.instructorId || !rows.length) return false;
  const assigned = new Set<string>();
  for (const r of rows) {
    if (r.instructorId) assigned.add(r.instructorId);
    for (const c of r.coInstructorIds) assigned.add(c);
  }
  // Esame senza istruttore: qualunque istruttore dell'autoscuola.
  if (!assigned.size) return true;
  return assigned.has(who.instructorId);
}

/** Esaminatori di tutte le righe (di solito uguali), puliti e senza doppioni. */
export const examRowsExaminers = (rows: readonly Pick<ExamRowLike, "examiners">[]) =>
  normalizeExaminers(rows.flatMap((r) => r.examiners));

const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

/** «Esame 12 nov · Rossi e Bianchi» (senza esaminatore: «Esame 12 nov · 9:30»). */
export function examRouteName(examAt: Date, examiners: readonly string[], timeZone = "Europe/Rome"): string {
  const parts = new Intl.DateTimeFormat("it-IT", {
    timeZone,
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(examAt);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = `${Number(get("day"))} ${MONTHS[Number(get("month")) - 1] ?? ""}`.trim();
  const who = examiners.length
    ? examiners.length === 1
      ? examiners[0]
      : `${examiners.slice(0, -1).join(", ")} e ${examiners[examiners.length - 1]}`
    : `${Number(get("hour"))}:${get("minute")}`;
  return `Esame ${day} · ${who}`.slice(0, 120);
}

export const NO_EXAMINER_KEY = "";

export type ExaminerGroup<R> = {
  /** Chiave minuscola; `""` = «Senza esaminatore». */
  key: string;
  /** Il nome com'è scritto (la grafia più recente). */
  name: string | null;
  routes: R[];
  lastExamAt: string | null;
};

/**
 * Percorsi raggruppati per esaminatore: un percorso con due esaminatori sta in
 * entrambi i gruppi. Gruppi per esame più recente; «Senza esaminatore» in fondo.
 * Nei gruppi, i percorsi dal più recente (esame o, se disegnato, creazione).
 */
export function groupExamRoutesByExaminer<
  R extends { examiners: string[]; examAt: string | null; createdAt: string },
>(routes: readonly R[]): ExaminerGroup<R>[] {
  const when = (r: R) => r.examAt ?? r.createdAt;
  const sorted = [...routes].sort((a, b) => when(b).localeCompare(when(a)));
  const groups = new Map<string, ExaminerGroup<R>>();
  for (const r of sorted) {
    const names = normalizeExaminers(r.examiners);
    const keys = names.length ? names : [null];
    for (const name of keys) {
      const key = name ? name.toLocaleLowerCase("it") : NO_EXAMINER_KEY;
      let g = groups.get(key);
      if (!g) {
        g = { key, name, routes: [], lastExamAt: null };
        groups.set(key, g);
      }
      g.routes.push(r);
      if (r.examAt && (!g.lastExamAt || r.examAt > g.lastExamAt)) g.lastExamAt = r.examAt;
    }
  }
  return [...groups.values()].sort((a, b) => {
    if (a.key === NO_EXAMINER_KEY) return 1;
    if (b.key === NO_EXAMINER_KEY) return -1;
    const at = (g: ExaminerGroup<R>) => g.lastExamAt ?? when(g.routes[0]);
    return at(b).localeCompare(at(a)) || a.key.localeCompare(b.key);
  });
}

/** La tappa «percorso d'esame» costruita dal server (mai dal telefono). */
export function examStopFromRoute(route: { id: string; name: string; path: LatLng[] }): StoredPlanStop | null {
  if (route.path.length < 2) return null;
  const [sLat, sLng] = route.path[0];
  const [eLat, eLng] = route.path[route.path.length - 1];
  return {
    key: `exam:${route.id}`,
    source: "exam",
    kind: null,
    title: route.name.slice(0, 120),
    reason: "Percorso d'esame da provare",
    lat: sLat,
    lng: sLng,
    minutes: 0,
    examRouteId: route.id,
    endLat: eLat,
    endLng: eLng,
  };
}

/**
 * «Prova il percorso» a guida in corso: il percorso scelto sostituisce un altro
 * percorso d'esame già nel giro e va in fondo; le altre tappe restano. Se il
 * giro è pieno cede l'ultima tappa. `stop` null = togli il percorso d'esame.
 */
export function planWithExamStop(
  current: StoredPlan | null,
  stop: StoredPlanStop | null,
  now = new Date(),
): StoredPlan | null {
  const kept = (current?.stops ?? []).filter((s) => s.source !== "exam");
  const stops = stop ? [...kept.slice(0, PLAN_MAX_STOPS - 1), stop] : kept;
  if (!stops.length) return null;
  return {
    stops,
    minutes: current?.minutes ?? 0,
    chosenAt: current?.chosenAt ?? now.toISOString(),
    custom: true,
  };
}
