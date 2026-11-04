"use client";

import React from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { ChevronRight } from "lucide-react";
import type { Marker as MlMarker } from "maplibre-gl";

import { cn } from "@/lib/utils";
import { roadApi, type RoadStudentHotspot, type RoadStudentItem, type RoadStudentRoad } from "@/lib/autoscuole/road/client";
import { addHtmlMarker, htmlElement, lineBounds, toLngLat, useRoadMap } from "./road-map";
import { RoadMapFallback, SymbolTile } from "./road-ui";
import { RouteThumb } from "./RoadExamRoutesSection";
import { useCompanyHotspots } from "./road-hotspot-match";
import { currentUrl, hotspotHref, rememberList, rememberPrev, roadViewHref, sessionHref } from "./road-nav";

/**
 * Reglo Road nella scheda allievo (web). REG-716/REG-720: una tab «Road» con
 * numeri, andamento, i suoi punti critici e le ultime guide; nella tab «Note»
 * resta solo una riga di testo sotto la guida, che apre il dettaglio in Road
 * (il ritorno riporta qui). Dati da `GET /road/students/[id]` (titolare:
 * tutte; istruttore: le sue).
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
}: {
  studentId: string;
  studentName: string;
  data: RoadStudentRoad | null;
}) {
  const locale = useLocale();
  const open = useOpenSessionHref();
  const company = useCompanyHotspots(Boolean(data?.hotspots?.length));
  const first = studentName.trim().split(/\s+/)[0] || "l'allievo";

  if (!data) {
    return (
      <div className="space-y-3" data-testid="student-road-tab">
        <div className="h-20 animate-pulse rounded-2xl bg-[#f7f7f7]" />
        <div className="h-48 animate-pulse rounded-2xl bg-[#f7f7f7]" />
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
