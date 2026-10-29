"use client";

import * as React from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { useAtomValue } from "jotai";
import { Star } from "lucide-react";
import type { Marker as MlMarker } from "maplibre-gl";

import { companyAtom } from "@/atoms/company.store";
import { getServiceLimits } from "@/lib/services";
import { roadApi, type RoadDetail } from "@/lib/autoscuole/road/client";
import { roadCarImages, roadMarkerSymbol, ROAD_IMAGES } from "@/lib/autoscuole/road/symbols";
import { cn } from "@/lib/utils";
import {
  addHtmlMarker,
  escapeHtml,
  htmlElement,
  lineBounds,
  toLngLat,
  upsertRoute,
  useRoadMap,
} from "./road-map";
import {
  durationMin,
  firstName,
  formatPlate,
  hhmm,
  km,
  longDay,
  minutesBetween,
  ROAD_MAP_BOX_CLASS,
  RoadMapFallback,
  RoadMarkerStyles,
  RoadStatusChip,
  romeYmd,
  SentimentCounts,
  SymbolTile,
  ZoomControls,
} from "./road-ui";

const POLL_MS = 5000;
type RoadView = "live" | "today" | "history" | "hotspots";
const VIEW_LABEL: Record<RoadView, string> = {
  live: "Dal vivo",
  today: "Guide di oggi",
  history: "Storico",
  hotspots: "Punti critici",
};

/**
 * Dettaglio di una guida registrata con Road (W2): percorso, segnalazioni in
 * ordine di tempo, pagellino. Se la guida è ancora in corso si aggiorna da
 * sola ogni 5 s (a scheda visibile).
 */
export function RoadSessionDetail({ sessionId, from }: { sessionId: string; from: RoadView }) {
  const locale = useLocale();
  const company = useAtomValue(companyAtom);
  const studentSees = getServiceLimits(company?.services ?? null, "AUTOSCUOLE").studentNotesEnabled === true;
  const [detail, setDetail] = React.useState<RoadDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const base = `/${locale}/user/autoscuole/road`;
  const backHref = from === "live" ? base : `${base}?view=${from}`;

  const active = detail?.status === "active";
  React.useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const d = await roadApi.session(sessionId);
        if (!alive) return;
        setDetail(d);
        setError(null);
        if (d.status === "active") {
          timer = setTimeout(() => {
            if (document.visibilityState === "visible") void load();
            else document.addEventListener("visibilitychange", resume, { once: true });
          }, POLL_MS);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Guida non trovata.");
      }
    };
    const resume = () => void load();
    void load();
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [sessionId]);

  // ── mappa ──
  const containerRef = React.useRef<HTMLDivElement>(null);
  const { handle, failed } = useRoadMap(containerRef, { center: [45.07, 7.68], zoom: 13 });
  const markersRef = React.useRef<MlMarker[]>([]);
  const fittedRef = React.useRef(false);

  React.useEffect(() => {
    if (!handle || !detail) return;
    const { map } = handle;
    const coords = detail.track.map((p) => toLngLat([p[0], p[1]]));
    if (coords.length >= 2) upsertRoute(map, "road-detail", coords, { width: 6, color: "#111111", opacity: 1 });

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    const start = coords[0];
    if (start) {
      markersRef.current.push(addHtmlMarker(handle, start, htmlElement(`<div class="road-start"></div>`)));
      markersRef.current.push(
        addHtmlMarker(
          handle,
          start,
          htmlElement(
            `<div class="road-sede small"><img src="${ROAD_IMAGES.base}" alt=""><span>Partenza ${hhmm(detail.startedAt)}</span></div>`,
          ),
          "bottom",
        ),
      );
    }
    detail.markers.forEach((m, i) => {
      const el = htmlElement(
        `<div><div class="road-num"><b>${i + 1}</b><div class="road-sg ${m.sentiment ?? ""}" title="${escapeHtml(m.label)}"><img src="${roadMarkerSymbol(m.kind)}" alt=""></div></div></div>`,
      );
      markersRef.current.push(addHtmlMarker(handle, toLngLat(m), el));
    });
    if (detail.status === "active" && coords.length) {
      const last = coords[coords.length - 1];
      const prev = coords[Math.max(0, coords.length - 4)];
      const deg = detail.last?.heading ?? (Math.atan2(last[0] - prev[0], last[1] - prev[1]) * 180) / Math.PI;
      const el = htmlElement(
        `<div class="road-car sel"><div class="halo"></div><div class="body" style="transform:rotate(${deg}deg)"><img src="${roadCarImages(detail.lesson.carColor).top}" alt=""></div></div>`,
      );
      markersRef.current.push(addHtmlMarker(handle, last, el));
    }

    if (!fittedRef.current) {
      fittedRef.current = true;
      const pts = [...coords, ...detail.markers.map((m) => toLngLat(m))];
      const b = pts.length > 1 ? lineBounds(handle.lib, pts) : null;
      if (b) map.fitBounds(b, { padding: 60, duration: 0, maxZoom: 16 });
      else if (pts.length === 1) map.jumpTo({ center: pts[0], zoom: 15 });
    }
  }, [handle, detail]);

  React.useEffect(() => () => markersRef.current.forEach((m) => m.remove()), []);

  if (error && !detail) {
    return (
      <div className="py-16 text-center">
        <p className="text-[15px] text-[#222222]">{error}</p>
        <Link href={backHref} className="mt-3 inline-block text-[14px] font-semibold text-[#111111] underline">
          Torna a Road
        </Link>
      </div>
    );
  }

  const lesson = detail?.lesson;
  const student = lesson?.student?.name ?? "Allievo";
  const instructor = lesson?.instructor?.name ?? "istruttore";
  const endIso = detail ? detail.endedAt ?? null : null;
  const minutes = detail
    ? detail.status === "active"
      ? minutesBetween(detail.startedAt, Date.now())
      : durationMin(detail.durationSec)
    : 0;
  const vehicle = lesson?.vehicle ? [lesson.vehicle.name, formatPlate(lesson.vehicle.plate)].filter(Boolean).join(" ") : null;

  return (
    <div className="w-full lg:-mt-2.5" data-testid="road-detail">
      <RoadMarkerStyles />
      <nav className="flex items-center gap-2 text-[13.5px] text-[#6a6a6a]" aria-label="Percorso">
        <Link href={base} className="hover:text-[#111111]">
          Road
        </Link>
        <span>›</span>
        <Link href={backHref} className="hover:text-[#111111]">
          {VIEW_LABEL[from]}
        </Link>
        <span>›</span>
        <b className="font-medium text-[#111111]">{detail ? student : "…"}</b>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-4 pb-5 pt-2.5">
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.6px] text-[#111111]">
            {detail ? (
              <>
                {student} <span className="font-medium text-[#6a6a6a]">con {instructor}</span>
              </>
            ) : (
              <span className="inline-block h-8 w-80 animate-pulse rounded-lg bg-[#f2f2f2] align-middle" />
            )}
          </h1>
          <p className="mt-[3px] text-[14.5px] text-[#6a6a6a]">
            {detail
              ? [
                  longDay(detail.startedAt),
                  `${hhmm(detail.startedAt)} – ${endIso ? hhmm(endIso) : "in corso"}`,
                  vehicle,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : " "}
          </p>
        </div>
        {detail ? (
          <div className="flex items-center gap-2.5">
            <RoadStatusChip kind={active ? "live" : detail.status === "abandoned" ? "auto" : "done"} />
            <Link
              href={`/${locale}/user/autoscuole?tab=agenda&date=${romeYmd(detail.lesson.startsAt)}`}
              className="grid h-11 place-items-center rounded-[22px] bg-[#f2f2f2] px-[18px] text-[14.5px] font-semibold text-[#111111] transition-colors hover:bg-[#e8e8e8]"
            >
              Apri in agenda
            </Link>
          </div>
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className={cn(ROAD_MAP_BOX_CLASS, "h-[480px] lg:h-[calc(100vh-260px)] lg:min-h-[520px]")}>
          <div className="absolute inset-0">
          {/* MapLibre mette position:relative sul contenitore: niente absolute qui */}
          <div ref={containerRef} className="h-full w-full" />
        </div>
          {!handle ? <RoadMapFallback failed={failed} /> : null}
          {handle ? <ZoomControls onIn={() => handle.map.zoomIn()} onOut={() => handle.map.zoomOut()} /> : null}
        </div>

        <div className="grid content-start gap-3.5 leading-[1.25]">
          <div className="rounded-[22px] border border-[#ebebeb] px-5 py-[18px]">
            <div className="grid grid-cols-3">
              <Big value={detail ? km(detail.distanceMeters) : "–"} unit="km" label="Percorsi" />
              <Big value={detail ? String(minutes) : "–"} unit="min" label="Di guida" divided />
              <Big value={detail ? String(detail.markers.length) : "–"} label="Segnalazioni" divided />
            </div>
            {detail ? (
              <SentimentCounts
                className="mt-3"
                good={detail.markers.filter((m) => m.sentiment === "good").length}
                bad={detail.markers.filter((m) => m.sentiment === "bad").length}
              />
            ) : null}
          </div>

          <div className="rounded-[22px] border border-[#ebebeb] px-5 py-[18px]" data-testid="road-detail-markers">
            <h4 className="flex items-baseline justify-between text-[15.5px] font-semibold text-[#111111]">
              Segnalazioni <span className="text-[13px] font-medium text-[#6a6a6a]">in ordine di tempo</span>
            </h4>
            <div className="mt-1.5">
              {detail && detail.markers.length === 0 ? (
                <p className="py-2.5 text-[13.5px] text-[#6a6a6a]">Nessuna segnalazione in questa guida.</p>
              ) : null}
              {detail?.markers.map((m, i) => (
                <div
                  key={m.id}
                  className={cn(
                    "grid grid-cols-[26px_40px_minmax(0,1fr)_auto] items-center gap-2.5 py-2.5",
                    i > 0 && "border-t border-[#f2f2f2]",
                  )}
                >
                  <div className="grid size-6 place-items-center rounded-full bg-[#111111] text-xs font-semibold text-white">
                    {i + 1}
                  </div>
                  <SymbolTile kind={m.kind} size={40} sentiment={m.sentiment} />
                  <div className="min-w-0">
                    <b className="block text-[14.5px] font-medium text-[#111111]">{m.label}</b>
                    <span className="text-[13px] text-[#6a6a6a]">
                      {[m.street, m.note ? `«${m.note}»` : null].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                  <time className="text-[13.5px] tabular-nums text-[#6a6a6a]">{hhmm(m.recordedAt)}</time>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[22px] border border-[#ebebeb] px-5 py-[18px]">
            <h4 className="flex items-baseline justify-between text-[15.5px] font-semibold text-[#111111]">
              Pagellino
              {detail?.evaluation ? (
                <span className="text-[13px] font-medium text-[#6a6a6a]">
                  compilato da {firstName(lesson?.instructor?.name) || "istruttore"} · {hhmm(detail.evaluation.updatedAt)}
                </span>
              ) : null}
            </h4>
            {detail?.evaluation ? (
              <div className="mt-3 grid gap-2">
                {detail.evaluation.items.map((it) => (
                  <div key={it.label} className="flex items-center justify-between gap-3 text-sm text-[#333333]">
                    <span className="min-w-0 truncate">{it.label}</span>
                    {it.notApplicable || it.score == null ? (
                      <span className="text-[13px] text-[#6a6a6a]">Non valutata</span>
                    ) : (
                      <span className="flex gap-0.5" aria-label={`${it.score} su ${it.scaleMax}`}>
                        {Array.from({ length: it.scaleMax }, (_, i) => (
                          <Star
                            key={i}
                            width={15}
                            height={15}
                            strokeWidth={0}
                            className={i < (it.score ?? 0) ? "fill-[#FACC15]" : "fill-[#E7E7EC]"}
                          />
                        ))}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : detail ? (
              <p className="mt-2 text-[13.5px] text-[#6a6a6a]">Pagellino non compilato</p>
            ) : null}
          </div>

          {detail ? (
            <div className="flex items-center gap-2.5 px-1 py-0.5 text-[13px] text-[#6a6a6a]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6a6a6a" strokeWidth="2" className="shrink-0" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5M12 16h.01" />
              </svg>
              {studentSees
                ? `${firstName(student)} vede percorso e segnalazioni nella sua app (Impostazioni › App allievi).`
                : `${firstName(student)} non vede percorso e segnalazioni: si attiva da Impostazioni › App allievi.`}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Big({ value, unit, label, divided }: { value: string; unit?: string; label: string; divided?: boolean }) {
  return (
    <div className={cn(divided && "border-l border-[#ebebeb] pl-4")}>
      <b className="block text-[26px] font-semibold tabular-nums tracking-[-0.7px] text-[#111111]">
        {value}
        {unit ? <small className="ml-1 text-sm font-medium tracking-normal text-[#6a6a6a]">{unit}</small> : null}
      </b>
      <span className="text-[12.5px] text-[#6a6a6a]">{label}</span>
    </div>
  );
}
