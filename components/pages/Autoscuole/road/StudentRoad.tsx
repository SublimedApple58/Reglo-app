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
 * tutte; istruttore: le sue). Sotto i numeri la mappa con
 * tutti i percorsi sovrapposti (Ricca, punto 6).
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

/** Tab «Road» della scheda allievo (REG-720). */
export function StudentRoadTab({
  studentId,
  studentName,
  data,
  instructorByLesson,
}: {
  studentId: string;
  studentName: string;
  data: RoadStudentRoad | null;
  /** Istruttore per guida (`appointmentId`), dal registro: nell'elenco dei percorsi. */
  instructorByLesson?: Map<string, string | null>;
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

      <AllRoutesMap items={items} instructorByLesson={instructorByLesson} />

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
const LIST_PREVIEW = 6;

/**
 * Un colore per guida, dalla palette istruttori dell'agenda
 * (`INSTRUCTOR_COLOR_CHOICES`) senza blu, azzurro, indaco e ciano, un tono più
 * scuro (Tailwind 600) per restare sobri e leggibili sul fondo caldo. Ordine
 * pensato perché due guide vicine nel tempo abbiano tinte lontane.
 */
const ROUTE_COLORS = [
  "#E11D48", // corallo
  "#059669", // smeraldo
  "#D97706", // ambra
  "#7C3AED", // viola
  "#0D9488", // teal
  "#EA580C", // arancio
  "#C026D3", // fucsia
  "#65A30D", // lime
  "#DB2777", // rosa
  "#57534E", // pietra
];
const routeColor = (i: number) => ROUTE_COLORS[i % ROUTE_COLORS.length];
const shortDay = (iso: string) => {
  const s = new Date(iso).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Rome" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/**
 * «Tutti i percorsi»: le miniature (60 punti) di ogni guida sovrapposte, ognuna
 * col suo colore (le recenti più spesse e piene, le vecchie più trasparenti).
 * Sotto, l'elenco delle guide: passando su una riga o su una traccia quella
 * si accende e le altre si attenuano; il clic apre la guida.
 */
function AllRoutesMap({
  items,
  instructorByLesson,
}: {
  items: RoadStudentItem[];
  instructorByLesson?: Map<string, string | null>;
}) {
  const router = useRouter();
  const open = useOpenSessionHref();
  const drawable = React.useMemo(() => items.filter((it) => it.thumb.length >= 2), [items]);
  const colorById = React.useMemo(() => new Map(drawable.map((it, i) => [it.id, routeColor(i)])), [drawable]);
  const ref = React.useRef<HTMLDivElement>(null);
  const start = drawable[0]?.thumb[0] ?? [45.07, 7.68];
  const { handle, failed } = useRoadMap(ref, { center: start, zoom: 13 });
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [tip, setTip] = React.useState<{ id: string; x: number; y: number } | null>(null);
  const [showAll, setShowAll] = React.useState(false);

  // Riferimenti sempre aggiornati per i listener della mappa (registrati una volta).
  const byIdRef = React.useRef(new Map<string, RoadStudentItem>());
  byIdRef.current = new Map(drawable.map((it) => [it.id, it]));
  const openItem = (item: RoadStudentItem) => {
    const { href, onClick } = open(item, items);
    onClick();
    router.push(href);
  };
  const openRef = React.useRef(openItem);
  openRef.current = openItem;

  React.useEffect(() => {
    if (!handle) return;
    const { map } = handle;
    const n = drawable.length;
    // Dalla più vecchia alla più recente: l'ultima disegnata sta sopra.
    const features = drawable
      .map((it, i) => ({
        type: "Feature" as const,
        properties: { id: it.id, age: n > 1 ? i / (n - 1) : 0, color: routeColor(i) },
        geometry: { type: "LineString" as const, coordinates: it.thumb.map((p) => toLngLat(p)) },
      }))
      .reverse();
    const data = { type: "FeatureCollection" as const, features };
    const src = map.getSource(ALL_ROUTES) as { setData?: (d: typeof data) => void } | undefined;
    if (src?.setData) src.setData(data);
    else {
      const fade = { duration: 220, delay: 0 };
      map.addSource(ALL_ROUTES, { type: "geojson", data });
      map.addLayer({
        id: `${ALL_ROUTES}-c`,
        type: "line",
        source: ALL_ROUTES,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#ffffff",
          "line-width": ["interpolate", ["linear"], ["get", "age"], 0, 8, 1, 5],
          "line-opacity": ["interpolate", ["linear"], ["get", "age"], 0, 0.95, 1, 0.5],
        },
      });
      map.addLayer({
        id: ALL_ROUTES,
        type: "line",
        source: ALL_ROUTES,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": ["interpolate", ["linear"], ["get", "age"], 0, 4.6, 1, 2.6],
          "line-opacity": ["interpolate", ["linear"], ["get", "age"], 0, 1, 1, 0.5],
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
      // Attenuare e riaccendere le tracce in dissolvenza, mai di botto.
      map.setPaintProperty(ALL_ROUTES, "line-opacity-transition", fade);
      map.setPaintProperty(`${ALL_ROUTES}-c`, "line-opacity-transition", fade);
    }
    const pts = framedTracks(drawable).flatMap((it) => it.thumb.map((p) => toLngLat(p)));
    const b = lineBounds(handle.lib, pts);
    if (b) map.fitBounds(b, { padding: 36, duration: 0, maxZoom: 15 });
  }, [handle, drawable]);

  // Traccia attiva (dalla mappa o dall'elenco): sopra e piena, le altre attenuate.
  React.useEffect(() => {
    if (!handle) return;
    const { map } = handle;
    if (!map.getLayer(ALL_ROUTES)) return;
    const item = activeId ? byIdRef.current.get(activeId) : undefined;
    if (!item) {
      map.setPaintProperty(ALL_ROUTES, "line-opacity", ["interpolate", ["linear"], ["get", "age"], 0, 1, 1, 0.5]);
      map.setPaintProperty(`${ALL_ROUTES}-c`, "line-opacity", ["interpolate", ["linear"], ["get", "age"], 0, 0.95, 1, 0.5]);
      removeRoute(map, ALL_ROUTES_HOVER);
      return;
    }
    map.setPaintProperty(ALL_ROUTES, "line-opacity", 0.16);
    map.setPaintProperty(`${ALL_ROUTES}-c`, "line-opacity", 0.12);
    upsertRoute(map, ALL_ROUTES_HOVER, item.thumb.map((p) => toLngLat(p)), {
      width: 5.5,
      color: colorById.get(item.id) ?? "#111111",
      opacity: 1,
    });
    raiseRoute(map, ALL_ROUTES_HOVER);
  }, [handle, activeId, colorById]);

  React.useEffect(() => {
    if (!handle) return;
    const { map, lib } = handle;
    // La rotella resta allo scorrimento della scheda: zoom coi pulsanti o col doppio clic.
    map.scrollZoom.disable();
    const nav = new lib.NavigationControl({ showCompass: false });
    map.addControl(nav, "top-right");

    const clear = () => {
      map.getCanvas().style.cursor = "";
      setActiveId(null);
      setTip(null);
    };
    const onMove = (e: { point: { x: number; y: number }; features?: Array<{ properties?: Record<string, unknown> }> }) => {
      const id = e.features?.[0]?.properties?.id;
      if (typeof id !== "string" || !byIdRef.current.has(id)) return clear();
      map.getCanvas().style.cursor = "pointer";
      setActiveId(id);
      setTip({ id, x: e.point.x, y: e.point.y });
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
  const tipItem = tip ? byIdRef.current.get(tip.id) : undefined;
  const listed = showAll ? drawable : drawable.slice(0, LIST_PREVIEW);
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
          {tip && tipItem ? (
            <div
              key="srt-tip"
              className="pointer-events-none absolute z-10"
              style={{
                left: tip.x,
                top: tip.y,
                transform: `translate(${tip.x > 260 ? "calc(-100% - 12px)" : "12px"}, -50%)`,
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
                <b className="block font-semibold text-[#111111]">{longDay(tipItem.startedAt)}</b>
                <span className="tabular-nums text-[#6a6a6a]">
                  {hhmm(tipItem.startedAt)} · {km(tipItem.distanceMeters)} km
                  {tipItem.markerBad ? ` · ${tipItem.markerBad} da migliorare` : ""}
                </span>
              </motion.div>
            </div>
          ) : null}
        </AnimatePresence>
      </div>

      <ul className="mt-2" onMouseLeave={() => setActiveId(null)} data-testid="student-road-routes-list">
        <AnimatePresence initial={false}>
          {listed.map((it) => {
            const instructor = instructorByLesson?.get(it.appointmentId) ?? null;
            const dimmed = activeId !== null && activeId !== it.id;
            return (
              <motion.li
                key={it.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <button
                  type="button"
                  onMouseEnter={() => setActiveId(it.id)}
                  onFocus={() => setActiveId(it.id)}
                  onBlur={() => setActiveId(null)}
                  onClick={() => openItem(it)}
                  data-testid="student-road-routes-row"
                  className={cn(
                    "grid w-full cursor-pointer grid-cols-[10px_minmax(0,1fr)_auto_14px] items-center gap-3 rounded-xl px-2 py-2 text-left transition-[background-color,opacity] duration-200 ease-out",
                    activeId === it.id ? "bg-[#f5f5f5]" : "hover:bg-[#f7f7f7]",
                    dimmed && "opacity-45",
                  )}
                >
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: colorById.get(it.id) }} aria-hidden />
                  <span className="min-w-0 truncate text-[13.5px] text-[#6a6a6a]">
                    <b className="font-semibold text-[#111111]">{shortDay(it.startedAt)}</b>
                    <span className="tabular-nums"> · {hhmm(it.startedAt)}</span>
                    {instructor ? ` · ${instructor}` : ""}
                  </span>
                  <span className="text-[13px] font-semibold tabular-nums text-[#111111]">{km(it.distanceMeters)} km</span>
                  <ChevronRight className="size-3.5 text-[#b0b0b0]" strokeWidth={2.2} />
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      {drawable.length > LIST_PREVIEW ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          data-testid="student-road-routes-more"
          className="mt-1 cursor-pointer px-2 py-1.5 text-[13.5px] font-semibold text-[#111111] underline decoration-[#c8c8c8] underline-offset-[3px] transition-colors duration-200 hover:decoration-[#111111]"
        >
          {showAll ? "Mostra meno" : `Mostra tutte le ${drawable.length} guide`}
        </button>
      ) : null}
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
