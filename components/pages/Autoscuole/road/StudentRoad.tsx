"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import type { Marker as MlMarker } from "maplibre-gl";

import { cn } from "@/lib/utils";
import { roadApi, type RoadStudentHotspot, type RoadStudentItem, type RoadStudentRoad } from "@/lib/autoscuole/road/client";
import { evaluationSummary, evaluationSummaryLabel } from "@/lib/autoscuole/evaluation-sheet";
import { EvaluationRows, type EvaluationRow } from "../EvaluationRows";
import {
  addHtmlMarker,
  htmlElement,
  lineBounds,
  raiseRoute,
  removeRoute,
  toLngLat,
  upsertRoute,
  useRoadMap,
} from "./road-map";
import { RoadMapFallback, SymbolTile } from "./road-ui";
import { RouteThumb } from "./RoadExamRoutesSection";
import { useCompanyHotspots } from "./road-hotspot-match";
import { currentUrl, hotspotHref, rememberList, rememberPrev, roadViewHref, sessionHref } from "./road-nav";

/**
 * Reglo Road nella scheda allievo (web). REG-716/REG-720: una tab «Road» con
 * numeri, andamento, i suoi punti critici e le ultime guide; nella tab «Note»
 * resta solo una riga di testo sotto la guida, che apre il dettaglio in Road
 * (il ritorno riporta qui). Dati da `GET /road/students/[id]` (titolare:
 * tutte; istruttore: le sue). In cima l'ultimo pagellino e la mappa con
 * tutti i percorsi sovrapposti (Ricca, punti 6 e 10).
 */

const km = (m: number) => (m / 1000).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
const longDay = (iso: string) => {
  const s = new Date(iso).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Rome" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const RECENT = 5;

/** Le guide Road dell'allievo e i suoi punti critici, più l'indice per guida (`appointmentId`). */
export function useStudentRoad(studentId: string | null, enabled: boolean) {
  const [data, setData] = React.useState<RoadStudentRoad | null>(null);
  React.useEffect(() => {
    setData(null);
    if (!enabled || !studentId) return;
    const ctrl = new AbortController();
    roadApi
      .student(studentId, ctrl.signal)
      .then(setData)
      .catch(() => {
        // Road è un di più nella scheda allievo: se non risponde, il resto resta com'è.
        if (!ctrl.signal.aborted) setData({ items: [], hotspots: [] });
      });
    return () => ctrl.abort();
  }, [studentId, enabled]);
  const byLesson = React.useMemo(
    () => new Map((data?.items ?? []).map((it) => [it.appointmentId, it])),
    [data],
  );
  return { data, byLesson };
}

/** Apre il dettaglio in Road ricordando la scheda (il ritorno dice «‹ <allievo>»). */
function useOpenSessionHref() {
  const locale = useLocale();
  return (item: RoadStudentItem, all: RoadStudentItem[]) => ({
    href: sessionHref(locale, item.id, "student", currentUrl()),
    onClick: () => {
      rememberList(all.map((x) => x.id));
      rememberPrev();
    },
  });
}

/** Tab «Note»: sotto la guida, una riga di testo che porta al percorso in Road. */
export function StudentRoadLine({ item, all }: { item: RoadStudentItem; all: RoadStudentItem[] }) {
  const open = useOpenSessionHref();
  const { href, onClick } = open(item, all);
  return (
    <Link
      href={href}
      onClick={onClick}
      data-testid="student-road-line"
      className="mt-2.5 inline-flex max-w-full items-center gap-1 text-[13px] text-[#6a6a6a] transition-colors duration-200 hover:text-[#111111]"
    >
      <span className="truncate">
        <b className="font-semibold text-[#111111]">Percorso Road</b> · {km(item.distanceMeters)} km
        {item.markerBad ? ` · ${item.markerBad} da migliorare` : item.markerCount ? "" : " · nessuna segnalazione"}
      </span>
      <ChevronRight className="size-3.5 shrink-0" strokeWidth={2.2} />
    </Link>
  );
}

export type StudentLastEvaluation = {
  lessonId: string;
  startsAt: string;
  instructorName: string | null;
  rows: EvaluationRow[];
};

/** Tab «Road» della scheda allievo (REG-720). */
export function StudentRoadTab({
  studentId,
  studentName,
  data,
  lastEvaluation,
}: {
  studentId: string;
  studentName: string;
  data: RoadStudentRoad | null;
  lastEvaluation?: StudentLastEvaluation | null;
}) {
  const locale = useLocale();
  const open = useOpenSessionHref();
  const company = useCompanyHotspots(Boolean(data?.hotspots?.length));
  const first = studentName.trim().split(/\s+/)[0] || "l'allievo";

  if (!data) {
    return (
      <div className="space-y-3" data-testid="student-road-tab">
        <div className="h-20 animate-pulse rounded-2xl bg-[#f7f7f7]" />
        <div className="h-[340px] animate-pulse rounded-[18px] bg-[#f7f7f7]" />
      </div>
    );
  }

  const items = data.items;
  const hotspots = (data.hotspots ?? []).slice(0, 6);
  if (!items.length) {
    return (
      <div className="pt-6" data-testid="student-road-tab">
        {lastEvaluation ? <LastEvaluationCard evaluation={lastEvaluation} className="mb-7" /> : null}
        <b className="block text-[15px] font-semibold text-[#111111]">Ancora nessuna guida con Road</b>
        <p className="mt-1 text-[13.5px] leading-[1.5] text-[#6a6a6a]">
          Quando l&apos;istruttore registra una guida di {first} con Road, qui trovi percorsi, errori e dove sbaglia più spesso.
        </p>
      </div>
    );
  }

  const meters = items.reduce((a, s) => a + s.distanceMeters, 0);
  const bad = items.reduce((a, s) => a + (s.markerBad ?? 0), 0);
  // Andamento: dalla più vecchia alla più recente delle ultime tre.
  const last3 = items.slice(0, 3);
  const trend =
    last3.length >= 2
      ? { from: last3[last3.length - 1].markerBad ?? 0, to: last3[0].markerBad ?? 0, n: last3.length }
      : null;

  return (
    <div className="leading-[1.25]" data-testid="student-road-tab">
      {lastEvaluation ? <LastEvaluationCard evaluation={lastEvaluation} className="mb-7" /> : null}
      <div className="grid grid-cols-3">
        <Stat value={String(items.length)} label={items.length === 1 ? "guida in Road" : "guide in Road"} />
        <Stat value={km(meters)} unit="km" label="percorsi" divided />
        <Stat value={String(bad)} label="da migliorare" divided />
      </div>
      {trend ? (
        <p className="mt-3.5 text-[13.5px] text-[#6a6a6a]" data-testid="student-road-trend">
          Ultime {trend.n} guide:{" "}
          <b className="font-semibold text-[#111111]">
            {trend.from === trend.to
              ? `${trend.to} ${trend.to === 1 ? "errore" : "errori"} a guida`
              : `da ${trend.from} a ${trend.to} ${trend.to === 1 ? "errore" : "errori"}`}
          </b>
        </p>
      ) : null}

      <AllRoutesMap items={items} />

      {hotspots.length ? (
        <>
          <div className="mt-7 flex items-baseline justify-between gap-3">
            <h3 className="text-[16px] font-semibold text-[#111111]">Dove sbaglia</h3>
            <Link
              href={roadViewHref(locale, "hotspots")}
              onClick={rememberPrev}
              className="text-[13.5px] font-semibold text-[#111111] underline decoration-[#c8c8c8] underline-offset-[3px] transition-colors duration-200 hover:decoration-[#111111]"
            >
              Punti critici
            </Link>
          </div>
          <HotspotsMiniMap hotspots={hotspots} />
          <div className="mt-1">
            {hotspots.map((h, i) => {
              const match = company.find(h);
              const body = (
                <>
                  <span className="grid size-6 place-items-center rounded-full bg-[#111111] text-[12px] font-semibold text-white">{i + 1}</span>
                  <SymbolTile kind={h.kind} size={34} sentiment="bad" />
                  <span className="min-w-0">
                    <b className="block truncate text-[14.5px] font-semibold text-[#111111]">{h.street ?? h.label}</b>
                    <span className="block truncate text-[13px] text-[#6a6a6a]">
                      {h.label}
                      {match && match.students > 1 ? ` · ci sbagliano anche altri ${match.students - 1}` : ""}
                      {match?.examRoutes.length ? " · sul percorso d'esame" : ""}
                    </span>
                  </span>
                  <span className="text-right text-[13px] tabular-nums text-[#6a6a6a]">
                    <b className="block text-[15px] font-semibold text-[#111111]">{h.errors}</b>
                    {h.errors === 1 ? "volta" : "volte"}
                  </span>
                </>
              );
              const cls = "grid grid-cols-[24px_34px_minmax(0,1fr)_auto_14px] items-center gap-3 border-b border-[#f0f0f0] py-3";
              return match ? (
                <Link
                  key={h.key}
                  href={hotspotHref(locale, match.key)}
                  onClick={rememberPrev}
                  data-testid="student-road-hotspot"
                  className={cn(cls, "transition-colors duration-200 hover:bg-[#fafafa]")}
                >
                  {body}
                  <ChevronRight className="size-3.5 text-[#b0b0b0]" strokeWidth={2.2} />
                </Link>
              ) : (
                <div key={h.key} className={cls} data-testid="student-road-hotspot">
                  {body}
                  <span />
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      <h3 className="mt-7 text-[16px] font-semibold text-[#111111]">Ultime guide</h3>
      <div className="mt-1">
        {items.slice(0, RECENT).map((it) => {
          const { href, onClick } = open(it, items);
          return (
            <Link
              key={it.id}
              href={href}
              onClick={onClick}
              data-testid="student-road-session"
              className="grid grid-cols-[64px_minmax(0,1fr)_auto_14px] items-center gap-3.5 border-b border-[#f0f0f0] py-3 transition-colors duration-200 hover:bg-[#fafafa]"
            >
              <RouteThumb path={it.thumb} width={64} height={48} />
              <span className="min-w-0">
                <b className="block truncate text-[14.5px] font-semibold text-[#111111]">{longDay(it.startedAt)}</b>
                <span className="block truncate text-[13px] tabular-nums text-[#6a6a6a]">
                  {hhmm(it.startedAt)}
                  {it.plan ? " · col giro" : ""}
                </span>
              </span>
              <span className="text-right text-[13px] tabular-nums text-[#6a6a6a]">
                <b className="block text-[14.5px] font-semibold text-[#111111]">{km(it.distanceMeters)} km</b>
                {it.markerBad ? `${it.markerBad} da migliorare` : "nessun errore"}
              </span>
              <ChevronRight className="size-3.5 text-[#b0b0b0]" strokeWidth={2.2} />
            </Link>
          );
        })}
      </div>
      <Link
        href={roadViewHref(locale, "history", { student: studentId, days: "all" })}
        onClick={rememberPrev}
        data-testid="student-road-all"
        className="flex items-center justify-between py-4 text-[14.5px] font-semibold text-[#111111]"
      >
        Tutte le guide di {first} in Road
        <ChevronRight className="size-4" strokeWidth={2.2} />
      </Link>
    </div>
  );
}

/** «Ultimo pagellino»: le voci della guida valutata più di recente. */
function LastEvaluationCard({ evaluation, className }: { evaluation: StudentLastEvaluation; className?: string }) {
  const label = evaluationSummaryLabel(evaluationSummary(evaluation.rows));
  return (
    <section className={className} data-testid="student-road-last-evaluation">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[16px] font-semibold text-[#111111]">Ultimo pagellino</h3>
        {label ? <span className="text-[13px] font-semibold tabular-nums text-[#111111]">{label}</span> : null}
      </div>
      <p className="mt-0.5 text-[13px] text-[#6a6a6a]">
        {longDay(evaluation.startsAt)}
        {evaluation.instructorName ? ` · ${evaluation.instructorName}` : ""}
      </p>
      <EvaluationRows rows={evaluation.rows} className="mt-3 rounded-[14px] px-4" />
    </section>
  );
}

/**
 * Le tracce da inquadrare: quelle entro 25 km dal centro mediano. Una traccia
 * isolata lontana (GPS impazzito, prova fuori zona) si disegna lo stesso ma
 * non allarga la vista a mezza Italia.
 */
function framedTracks(items: RoadStudentItem[]) {
  const centers = items.map((it) => {
    const n = it.thumb.length;
    return [it.thumb.reduce((a, p) => a + p[0], 0) / n, it.thumb.reduce((a, p) => a + p[1], 0) / n] as const;
  });
  const median = (xs: number[]) => {
    const sorted = [...xs].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  const lat = median(centers.map((c) => c[0]));
  const lng = median(centers.map((c) => c[1]));
  const kmPerDegLng = 111 * Math.cos((lat * Math.PI) / 180);
  const near = items.filter((_, i) => {
    const dLat = (centers[i][0] - lat) * 111;
    const dLng = (centers[i][1] - lng) * kmPerDegLng;
    return Math.hypot(dLat, dLng) <= 25;
  });
  return near.length ? near : items;
}

const ALL_ROUTES = "srt-all";
const ALL_ROUTES_HIT = "srt-all-hit";
const ALL_ROUTES_HOVER = "srt-hover";

/**
 * «Tutti i percorsi»: le miniature (60 punti) di ogni guida sovrapposte. Le
 * più recenti sono nere e sopra, le vecchie sfumano verso il fondo; passando
 * su una traccia si accende col bordo bianco, il clic apre quella guida.
 */
function AllRoutesMap({ items }: { items: RoadStudentItem[] }) {
  const router = useRouter();
  const open = useOpenSessionHref();
  const drawable = React.useMemo(() => items.filter((it) => it.thumb.length >= 2), [items]);
  const ref = React.useRef<HTMLDivElement>(null);
  const start = drawable[0]?.thumb[0] ?? [45.07, 7.68];
  const { handle, failed } = useRoadMap(ref, { center: start, zoom: 13 });
  const [hover, setHover] = React.useState<{ item: RoadStudentItem; x: number; y: number } | null>(null);
  const hoverIdRef = React.useRef<string | null>(null);

  // Riferimenti sempre aggiornati per i listener della mappa (registrati una volta).
  const byIdRef = React.useRef(new Map<string, RoadStudentItem>());
  byIdRef.current = new Map(drawable.map((it) => [it.id, it]));
  const openRef = React.useRef<(item: RoadStudentItem) => void>(() => {});
  openRef.current = (item) => {
    const { href, onClick } = open(item, items);
    onClick();
    router.push(href);
  };

  React.useEffect(() => {
    if (!handle) return;
    const { map } = handle;
    const n = drawable.length;
    // Dalla più vecchia alla più recente: l'ultima disegnata sta sopra.
    const features = drawable
      .map((it, i) => ({
        type: "Feature" as const,
        properties: { id: it.id, age: n > 1 ? i / (n - 1) : 0 },
        geometry: { type: "LineString" as const, coordinates: it.thumb.map((p) => toLngLat(p)) },
      }))
      .reverse();
    const data = { type: "FeatureCollection" as const, features };
    const src = map.getSource(ALL_ROUTES) as { setData?: (d: typeof data) => void } | undefined;
    if (src?.setData) src.setData(data);
    else {
      map.addSource(ALL_ROUTES, { type: "geojson", data });
      map.addLayer({
        id: `${ALL_ROUTES}-c`,
        type: "line",
        source: ALL_ROUTES,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#ffffff",
          "line-width": ["interpolate", ["linear"], ["get", "age"], 0, 7, 1, 5],
          "line-opacity": ["interpolate", ["linear"], ["get", "age"], 0, 0.9, 1, 0.45],
        },
      });
      map.addLayer({
        id: ALL_ROUTES,
        type: "line",
        source: ALL_ROUTES,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["interpolate", ["linear"], ["get", "age"], 0, "#111111", 0.5, "#77736b", 1, "#c4bfb3"],
          "line-width": ["interpolate", ["linear"], ["get", "age"], 0, 3.4, 1, 2.2],
          "line-opacity": ["interpolate", ["linear"], ["get", "age"], 0, 1, 1, 0.75],
        },
      });
      // Fascia invisibile più larga: le tracce sottili si prendono col mouse.
      map.addLayer({
        id: ALL_ROUTES_HIT,
        type: "line",
        source: ALL_ROUTES,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#000000", "line-width": 14, "line-opacity": 0 },
      });
    }
    const pts = framedTracks(drawable).flatMap((it) => it.thumb.map((p) => toLngLat(p)));
    const b = lineBounds(handle.lib, pts);
    if (b) map.fitBounds(b, { padding: 36, duration: 0, maxZoom: 15 });
  }, [handle, drawable]);

  React.useEffect(() => {
    if (!handle) return;
    const { map, lib } = handle;
    // La rotella resta allo scorrimento della scheda: zoom coi pulsanti o col doppio clic.
    map.scrollZoom.disable();
    const nav = new lib.NavigationControl({ showCompass: false });
    map.addControl(nav, "top-right");

    const clear = () => {
      hoverIdRef.current = null;
      removeRoute(map, ALL_ROUTES_HOVER);
      map.getCanvas().style.cursor = "";
      setHover(null);
    };
    const onMove = (e: { point: { x: number; y: number }; features?: Array<{ properties?: Record<string, unknown> }> }) => {
      const id = e.features?.[0]?.properties?.id;
      const item = typeof id === "string" ? byIdRef.current.get(id) : undefined;
      if (!item) return clear();
      map.getCanvas().style.cursor = "pointer";
      if (hoverIdRef.current !== item.id) {
        hoverIdRef.current = item.id;
        upsertRoute(map, ALL_ROUTES_HOVER, item.thumb.map((p) => toLngLat(p)), { width: 4.5, color: "#111111", opacity: 1 });
        raiseRoute(map, ALL_ROUTES_HOVER);
      }
      setHover({ item, x: e.point.x, y: e.point.y });
    };
    const onClick = (e: { features?: Array<{ properties?: Record<string, unknown> }> }) => {
      const id = e.features?.[0]?.properties?.id;
      const item = typeof id === "string" ? byIdRef.current.get(id) : undefined;
      if (item) openRef.current(item);
    };
    map.on("mousemove", ALL_ROUTES_HIT, onMove);
    map.on("mouseleave", ALL_ROUTES_HIT, clear);
    map.on("click", ALL_ROUTES_HIT, onClick);
    return () => {
      map.off("mousemove", ALL_ROUTES_HIT, onMove);
      map.off("mouseleave", ALL_ROUTES_HIT, clear);
      map.off("click", ALL_ROUTES_HIT, onClick);
      map.removeControl(nav);
    };
  }, [handle]);

  if (!drawable.length) return null;
  return (
    <section className="mt-7" data-testid="student-road-all-routes">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[16px] font-semibold text-[#111111]">Tutti i percorsi</h3>
        <span className="text-[13px] tabular-nums text-[#6a6a6a]">
          {drawable.length === 1 ? "1 guida" : `${drawable.length} guide`}
        </span>
      </div>
      <div className="relative mt-3 h-[340px] overflow-hidden rounded-[18px] border border-[#ebebeb] bg-[#f4f1ea] md:h-[380px]">
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-300 ease-out [&_.maplibregl-ctrl-group]:!overflow-hidden [&_.maplibregl-ctrl-group]:!rounded-xl [&_.maplibregl-ctrl-group]:!shadow-[0_2px_10px_rgba(0,0,0,0.12)] [&_.maplibregl-ctrl-bottom-right]:origin-bottom-right [&_.maplibregl-ctrl-bottom-right]:scale-90",
            handle ? "opacity-100" : "opacity-0",
          )}
        >
          <div ref={ref} className="h-full w-full" />
        </div>
        {!handle ? <RoadMapFallback failed={failed} /> : null}
        <AnimatePresence>
          {hover ? (
            <div
              key="srt-tip"
              className="pointer-events-none absolute z-10"
              style={{
                left: hover.x,
                top: hover.y,
                transform: `translate(${hover.x > 260 ? "calc(-100% - 12px)" : "12px"}, -50%)`,
              }}
            >
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                className="whitespace-nowrap rounded-xl bg-white px-3 py-2 text-[12.5px] leading-[1.35] shadow-[0_6px_20px_rgba(0,0,0,0.14)]"
                data-testid="student-road-route-tip"
              >
                <b className="block font-semibold text-[#111111]">{longDay(hover.item.startedAt)}</b>
                <span className="tabular-nums text-[#6a6a6a]">
                  {hhmm(hover.item.startedAt)} · {km(hover.item.distanceMeters)} km
                  {hover.item.markerBad ? ` · ${hover.item.markerBad} da migliorare` : ""}
                </span>
              </motion.div>
            </div>
          ) : null}
        </AnimatePresence>
      </div>
      <div className="mt-2.5 flex items-center gap-2.5 text-[12.5px] text-[#6a6a6a]">
        <span className="flex items-center gap-1.5">
          <i className="block h-[3px] w-5 rounded-full bg-[#111111]" />
          Più recenti
        </span>
        <span className="flex items-center gap-1.5">
          <i className="block h-[2px] w-5 rounded-full bg-[#c4bfb3]" />
          Meno recenti
        </span>
        <span className="ml-auto hidden sm:inline">Clic su un percorso per aprire la guida</span>
      </div>
    </section>
  );
}

/** Mini-mappa dei punti dell'allievo: aloni rossi e numeri, niente interazione. */
function HotspotsMiniMap({ hotspots }: { hotspots: RoadStudentHotspot[] }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const { handle, failed } = useRoadMap(ref, { center: [hotspots[0].lat, hotspots[0].lng], zoom: 14 });
  const markersRef = React.useRef<MlMarker[]>([]);
  React.useEffect(() => {
    if (!handle) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = hotspots.map((h, i) =>
      addHtmlMarker(handle, toLngLat(h), htmlElement(`<div><div class="srh"><i></i><b>${i + 1}</b></div></div>`)),
    );
    const pts = hotspots.map((h) => toLngLat(h));
    const b = pts.length > 1 ? lineBounds(handle.lib, pts) : null;
    if (b) handle.map.fitBounds(b, { padding: 44, duration: 0, maxZoom: 16 });
    else handle.map.jumpTo({ center: pts[0], zoom: 15 });
  }, [handle, hotspots]);
  React.useEffect(() => () => markersRef.current.forEach((m) => m.remove()), []);
  return (
    <div className="relative mt-3 h-[200px] overflow-hidden rounded-[18px] border border-[#ebebeb] bg-[#f4f1ea]" data-testid="student-road-map">
      <style>{`.srh{position:relative;width:0;height:0}.srh i{position:absolute;left:-44px;top:-44px;width:88px;height:88px;border-radius:50%;background:radial-gradient(rgba(220,38,38,.42),rgba(220,38,38,0) 70%)}.srh b{position:absolute;left:-12px;top:-12px;width:24px;height:24px;border-radius:50%;background:#111;color:#fff;border:2px solid #fff;font:600 12px/20px inherit;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.25)}`}</style>
      <div className="pointer-events-none absolute inset-0 [&_.maplibregl-ctrl-bottom-right]:origin-bottom-right [&_.maplibregl-ctrl-bottom-right]:scale-90">
        <div ref={ref} className="h-full w-full" />
      </div>
      {!handle ? <RoadMapFallback failed={failed} /> : null}
    </div>
  );
}

function Stat({ value, unit, label, divided }: { value: string; unit?: string; label: string; divided?: boolean }) {
  return (
    <div className={cn(divided && "border-l border-[#ececec] pl-4")}>
      <b className="text-[24px] font-semibold tabular-nums tracking-[-0.6px] text-[#111111]">
        {value}
        {unit ? <small className="ml-[3px] text-[13px] font-medium text-[#6a6a6a]">{unit}</small> : null}
      </b>
      <span className="block text-[12.5px] text-[#6a6a6a]">{label}</span>
    </div>
  );
}
