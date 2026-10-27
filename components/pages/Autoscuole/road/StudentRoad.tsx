"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Marker as MlMarker } from "maplibre-gl";

import { cn } from "@/lib/utils";
import { roadApi, type RoadDetail, type RoadStudentItem } from "@/lib/autoscuole/road/client";
import { roadMarkerSymbol } from "@/lib/autoscuole/road/symbols";
import {
  addHtmlMarker,
  escapeHtml,
  htmlElement,
  lineBounds,
  toLngLat,
  upsertRoute,
  useRoadMap,
} from "./road-map";
import { RoadMapFallback, RoadMarkerStyles, SentimentCounts, SymbolTile } from "./road-ui";

/**
 * REG-638 Reglo Road nel dettaglio allievo (web): striscia «Percorso Road» sotto
 * la guida e percorso aperto nello stesso pannello, senza passare dalla sezione
 * Road. Dati da `GET /road/students/[id]` (titolare: tutte; istruttore: le sue).
 */

const km = (m: number) => (m / 1000).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const mins = (sec: number) => (sec > 0 && sec < 60 ? "<1" : String(Math.floor(sec / 60)));
const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });

/** Percorsi Road dell'allievo per guida (`appointmentId` → riassunto). */
export function useStudentRoad(studentId: string | null, enabled: boolean) {
  const [byLesson, setByLesson] = React.useState<Map<string, RoadStudentItem>>(new Map());
  React.useEffect(() => {
    setByLesson(new Map());
    if (!enabled || !studentId) return;
    const ctrl = new AbortController();
    roadApi
      .student(studentId, ctrl.signal)
      .then((res) => setByLesson(new Map(res.items.map((it) => [it.appointmentId, it]))))
      .catch(() => {
        // Road è un di più nel dettaglio allievo: se non risponde, la lista resta com'è.
      });
    return () => ctrl.abort();
  }, [studentId, enabled]);
  return byLesson;
}

/** Miniatura del percorso: la mappa si monta solo quando la riga è a schermo. */
function RouteThumb({ track }: { track: Array<[number, number]> }) {
  const boxRef = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "120px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={boxRef} className="relative h-[76px] w-[112px] shrink-0 overflow-hidden rounded-[11px] bg-[#f4f1ea]">
      {visible ? <ThumbMap track={track} /> : null}
    </div>
  );
}

function ThumbMap({ track }: { track: Array<[number, number]> }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const { handle } = useRoadMap(ref, { center: track[0] ?? [45.07, 7.68], zoom: 13 });
  React.useEffect(() => {
    if (!handle || track.length < 2) return;
    const coords = track.map((p) => toLngLat(p));
    upsertRoute(handle.map, "thumb", coords, { width: 3, color: "#111111", opacity: 1 });
    const b = lineBounds(handle.lib, coords);
    if (b) handle.map.fitBounds(b, { padding: 8, duration: 0 });
  }, [handle, track]);
  return (
    <div className="absolute inset-0 [&_.maplibregl-ctrl-attrib]:hidden [&_.maplibregl-ctrl-bottom-right]:hidden">
      <div ref={ref} className="pointer-events-none h-full w-full" />
    </div>
  );
}

export function StudentRoadStrip({ item, onOpen }: { item: RoadStudentItem; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="student-road-strip"
      className="mt-3 flex w-full cursor-pointer items-center gap-3.5 rounded-[16px] border border-[#ececec] bg-white py-2 pl-2 pr-3.5 text-left transition-colors hover:bg-[#fafafa]"
    >
      <RouteThumb track={item.thumb} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[14.5px] font-semibold text-[#111111]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/nav/road-3d.png" alt="" className="size-5 object-contain" />
          Percorso Road
        </div>
        <div className="mt-0.5 text-[13px] text-[#6a6a6a]">
          {km(item.distanceMeters)} km · {mins(item.durationSec)} min · {item.markerCount}{" "}
          {item.markerCount === 1 ? "segnalazione" : "segnalazioni"}
        </div>
        <SentimentCounts good={item.markerGood} bad={item.markerBad} className="mt-1 text-[12.5px]" />
      </div>
      <span className="flex items-center gap-1 whitespace-nowrap text-[13.5px] font-semibold text-[#111111]">
        Vedi percorso
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.2" strokeLinecap="round">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </span>
    </button>
  );
}

/** Percorso di una guida dentro il pannello allievo. */
export function StudentRoadPanel({
  sessionId,
  backLabel,
  onBack,
}: {
  sessionId: string;
  backLabel: string;
  onBack: () => void;
}) {
  const params = useParams<{ locale?: string }>();
  const locale = params?.locale ?? "it";
  const [detail, setDetail] = React.useState<RoadDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    const ctrl = new AbortController();
    roadApi
      .session(sessionId, ctrl.signal)
      .then(setDetail)
      .catch((e) => {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "Percorso non disponibile.");
      });
    return () => ctrl.abort();
  }, [sessionId]);

  const ref = React.useRef<HTMLDivElement>(null);
  const { handle, failed } = useRoadMap(ref, { center: [45.07, 7.68], zoom: 13 });
  const markersRef = React.useRef<MlMarker[]>([]);
  React.useEffect(() => {
    if (!handle || !detail) return;
    const coords = detail.track.map((p) => toLngLat([p[0], p[1]]));
    if (coords.length >= 2) upsertRoute(handle.map, "student-road", coords, { width: 6, color: "#111111", opacity: 1 });
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    if (coords[0]) markersRef.current.push(addHtmlMarker(handle, coords[0], htmlElement(`<div class="road-start"></div>`)));
    detail.markers.forEach((m) => {
      const el = htmlElement(
        `<div><div class="road-sg ${m.sentiment ?? ""}" title="${escapeHtml(m.label)}"><img src="${roadMarkerSymbol(m.kind)}" alt=""></div></div>`,
      );
      markersRef.current.push(addHtmlMarker(handle, toLngLat(m), el));
    });
    const b = lineBounds(handle.lib, [...coords, ...detail.markers.map((m) => toLngLat(m))]);
    if (b) handle.map.fitBounds(b, { padding: 40, duration: 0 });
  }, [handle, detail]);
  React.useEffect(() => () => markersRef.current.forEach((m) => m.remove()), []);

  const lesson = detail?.lesson;
  const day = detail
    ? new Date(detail.startedAt).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Rome" })
    : "";
  const good = detail?.markers.filter((m) => m.sentiment === "good").length ?? 0;
  const bad = detail?.markers.filter((m) => m.sentiment === "bad").length ?? 0;

  return (
    <div data-testid="student-road-panel">
      <RoadMarkerStyles />
      <button
        type="button"
        onClick={onBack}
        className="flex cursor-pointer items-center gap-1.5 text-[14px] text-[#6a6a6a] hover:text-[#111111]"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
        {backLabel}
      </button>

      <div className="mt-3 flex items-center gap-2 text-[12px] uppercase tracking-[0.6px] text-[#6a6a6a]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/nav/road-3d.png" alt="" className="size-[18px] object-contain" />
        Percorso Road
      </div>
      {error ? (
        <p className="py-6 text-[14px] text-[#6a6a6a]">{error}</p>
      ) : (
        <>
          <h3 className="mt-1.5 text-[22px] font-semibold leading-tight tracking-[-0.4px] text-[#111111]">
            {detail ? (
              <>
                <span className="capitalize">{day}</span> · {hhmm(detail.startedAt)} –{" "}
                {detail.endedAt ? hhmm(detail.endedAt) : "in corso"}
              </>
            ) : (
              <span className="inline-block h-7 w-72 animate-pulse rounded-lg bg-[#f2f2f2] align-middle" />
            )}
          </h3>
          <p className="mt-0.5 text-[14px] text-[#6a6a6a]">
            {lesson ? [lesson.instructor?.name ? `con ${lesson.instructor.name}` : null, lesson.vehicle?.name].filter(Boolean).join(" · ") : " "}
          </p>

          <div className="relative mt-4 h-[280px] overflow-hidden rounded-[18px] bg-[#f4f1ea]">
            <div ref={ref} className="h-full w-full" />
            {!handle ? <RoadMapFallback failed={failed} /> : null}
          </div>

          <div className="mt-4 grid grid-cols-3">
            <Stat value={detail ? km(detail.distanceMeters) : "–"} unit="km" label="Percorsi" />
            <Stat value={detail ? mins(detail.durationSec) : "–"} unit="min" label="Di guida" divided />
            <Stat value={detail ? String(detail.markers.length) : "–"} label="Segnalazioni" divided />
          </div>
          <SentimentCounts good={good} bad={bad} className="mt-3" />

          <div className="mt-1.5">
            {detail?.markers.map((m, i) => (
              <div
                key={m.id}
                className={cn("flex items-center gap-3 py-2.5", i > 0 && "border-t border-[#f2f2f2]")}
              >
                <SymbolTile kind={m.kind} size={40} sentiment={m.sentiment} />
                <div className="min-w-0 flex-1">
                  <b className="block text-[14.5px] font-medium text-[#111111]">{m.label}</b>
                  <span className="text-[13px] text-[#6a6a6a]">
                    {[m.street, m.note ? `«${m.note}»` : null].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <time className="text-[13.5px] tabular-nums text-[#6a6a6a]">{hhmm(m.recordedAt)}</time>
              </div>
            ))}
          </div>

          {detail ? (
            <Link
              href={`/${locale}/user/autoscuole/road/${detail.id}`}
              className="mt-4 inline-grid h-[42px] place-items-center rounded-[21px] bg-[#111111] px-[18px] text-[14px] font-semibold text-white transition-colors hover:bg-black"
            >
              Apri in Road
            </Link>
          ) : null}
        </>
      )}
    </div>
  );
}

function Stat({ value, unit, label, divided }: { value: string; unit?: string; label: string; divided?: boolean }) {
  return (
    <div className={cn(divided && "border-l border-[#ececec] pl-4")}>
      <b className="text-[24px] font-semibold tracking-[-0.6px] text-[#111111]">
        {value}
        {unit ? <small className="ml-[3px] text-[13px] font-medium text-[#6a6a6a]">{unit}</small> : null}
      </b>
      <span className="block text-[12.5px] text-[#6a6a6a]">{label}</span>
    </div>
  );
}
