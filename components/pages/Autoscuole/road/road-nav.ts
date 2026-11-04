"use client";

/**
 * REG-716 — navigazione di Road (web). Due livelli: le tab di sezione
 * (`/road?view=`) e le pagine figlie (dettaglio guida, editor percorso).
 * Le pagine figlie non hanno breadcrumb: hanno un solo «‹ <dove eri>».
 *
 * - `back`: l'URL esatto da cui si è arrivati (filtri, punto critico aperto),
 *   passato in query. Se la pagina prima nella cronologia è proprio quella, il
 *   ritorno fa `router.back()` e tornano anche lo scroll e «Carica altre».
 * - lista: gli id delle guide della lista da cui si apre il dettaglio, in
 *   sessionStorage, per il su/giù «2 di 5».
 *
 * sessionStorage può mancare (finestra privata, storage bloccato): ogni
 * accesso è protetto e senza storage si torna con il link normale.
 */

export type RoadView = "live" | "today" | "history" | "hotspots" | "routes";
/** Da dove si apre il dettaglio di una guida. */
export type RoadFrom = RoadView | "student";

export const ROAD_VIEWS: Array<{ value: RoadView; label: string; subtitle: string }> = [
  { value: "live", label: "Dal vivo", subtitle: "Le auto in guida adesso" },
  { value: "today", label: "Oggi", subtitle: "Le guide in auto di oggi" },
  { value: "history", label: "Storico", subtitle: "Le guide registrate, dalla più recente" },
  { value: "hotspots", label: "Punti critici", subtitle: "Dove gli allievi sbagliano più spesso" },
  { value: "routes", label: "Percorsi d'esame", subtitle: "I giri che la Motorizzazione fa fare all'esame" },
];

export const ROAD_VIEW_LABEL: Record<RoadView, string> = Object.fromEntries(
  ROAD_VIEWS.map((v) => [v.value, v.label]),
) as Record<RoadView, string>;

export function normalizeRoadView(v: string | null | undefined): RoadView {
  return ROAD_VIEWS.some((x) => x.value === v) && v ? (v as RoadView) : "live";
}

export function normalizeRoadFrom(v: string | null | undefined): RoadFrom {
  return v === "student" ? "student" : normalizeRoadView(v);
}

export const roadBase = (locale: string) => `/${locale}/user/autoscuole/road`;

export function roadViewHref(locale: string, view: RoadView, params?: Record<string, string | null | undefined>) {
  const q = new URLSearchParams();
  if (view !== "live") q.set("view", view);
  for (const [k, v] of Object.entries(params ?? {})) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${roadBase(locale)}?${s}` : roadBase(locale);
}

/** Scheda allievo aperta (REG-720), di default sulla tab Road. */
export function studentHref(locale: string, studentId: string, pane: "road" | "summary" = "road") {
  return `/${locale}/user/autoscuole?tab=students&student=${encodeURIComponent(studentId)}&pane=${pane}`;
}

/** Punto critico aperto (REG-719): la chiave del punto sta nell'URL. */
export function hotspotHref(locale: string, key: string) {
  return roadViewHref(locale, "hotspots", { point: key });
}

export function currentUrl() {
  if (typeof window === "undefined") return "";
  return `${window.location.pathname}${window.location.search}`;
}

/** Link al dettaglio guida che ricorda da dove si parte. */
export function sessionHref(locale: string, sessionId: string, from: RoadFrom, back?: string | null) {
  const q = new URLSearchParams({ from });
  const b = back ?? currentUrl();
  if (b) q.set("back", b);
  return `${roadBase(locale)}/${encodeURIComponent(sessionId)}?${q}`;
}

/** Un `back` valido è solo un percorso interno (niente redirect verso fuori). */
export function safeBack(v: string | null | undefined): string | null {
  return v && v.startsWith("/") && !v.startsWith("//") ? v : null;
}

const LIST_KEY = "reglo-road-nav:list";
const PREV_KEY = "reglo-road-nav:prev";

function read<T>(key: string): T | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage non disponibile: il su/giù e il ritorno «morbido» non ci sono, i link sì */
  }
}

/** Gli id della lista da cui si apre il dettaglio (per il su/giù). */
export function rememberList(ids: string[]) {
  write(LIST_KEY, ids.slice(0, 200));
}

export function readList(): string[] {
  const v = read<unknown>(LIST_KEY);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/**
 * Da chiamare subito prima di una navigazione «in avanti» dentro Road: segna
 * che la pagina precedente della cronologia è `currentUrl()`.
 */
export function rememberPrev() {
  write(PREV_KEY, currentUrl());
}

/** `true` se tornare con `router.back()` riporta proprio a `target`. */
export function canGoBackTo(target: string | null) {
  if (!target || typeof window === "undefined" || window.history.length < 2) return false;
  return read<string>(PREV_KEY) === target;
}
