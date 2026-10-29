"use client";

import * as React from "react";
import { useAtomValue } from "jotai";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { GeoJSONSource, Marker as MlMarker } from "maplibre-gl";

import { companyAtom } from "@/atoms/company.store";
import { getServiceLimits } from "@/lib/services";
import { getAutoscuolaInstructors, getAutoscuolaVehicles } from "@/lib/actions/autoscuole.actions";
import { CUSTOM_KIND_PREFIX, parseRoadCustomMarkers, ROAD_BASE_MARKERS } from "@/lib/autoscuole/road/catalog";
import {
  roadApi,
  type RoadExamRoute,
  type RoadHotspot,
  type RoadHotspotDetail,
  type RoadHotspots,
} from "@/lib/autoscuole/road/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { addHtmlMarker, escapeHtml, htmlElement, lineBounds, toLngLat, useRoadMap, type RoadMapHandle } from "./road-map";
import {
  hhmm,
  ROAD_MAP_BOX_CLASS,
  RoadMapFallback,
  SENTIMENT_BAD,
  shortDay,
  SymbolTile,
  ZoomControls,
} from "./road-ui";

const ALL = "all";
const PERIODS = [
  { value: "30", label: "Ultimi 30 giorni" },
  { value: "90", label: "Ultimi 3 mesi" },
  { value: "365", label: "Ultimo anno" },
] as const;

/** Arancio caldo dei punti «con alcuni errori» (il rosso è quello di «da migliorare»). */
const HOT_SOME = "#f59e0b";
/** Curva unica delle transizioni: veloce, decelerata, senza rimbalzo. */
const EASE = "cubic-bezier(0.2, 0, 0, 1)";
const MAP_EASE_MS = 280;

type Option = { value: string; label: string };

/**
 * «Punti critici» (REG-644): dove gli allievi dell'autoscuola sbagliano più
 * spesso. Mappa di calore + lista numerata (dalle API REG-643); al tocco di un
 * punto il pannello mostra allievi e guide, e ogni guida apre il dettaglio.
 * Le animazioni (pannello, puntine, mappa) restano anche con «Riduci
 * movimento»: per MapLibre serve `essential: true`.
 */
export function RoadHotspotsView({ onOpen }: { onOpen: (sessionId: string) => void }) {
  const company = useAtomValue(companyAtom);
  // Le voci personalizzate stanno nei limits grezzi (`roadCustomMarkers`), non tipizzati in ServiceLimits.
  const rawCustom = (getServiceLimits(company?.services ?? null, "AUTOSCUOLE") as Record<string, unknown>).roadCustomMarkers;
  const customMarkers = React.useMemo(() => parseRoadCustomMarkers(rawCustom), [rawCustom]);

  const [period, setPeriod] = React.useState<string>("90");
  const [instructorId, setInstructorId] = React.useState(ALL);
  const [license, setLicense] = React.useState(ALL);
  const [kind, setKind] = React.useState(ALL);
  const [instructors, setInstructors] = React.useState<Option[]>([]);
  const [licenses, setLicenses] = React.useState<Option[]>([]);

  const [data, setData] = React.useState<RoadHotspots | null>(null);
  const [routes, setRoutes] = React.useState<RoadExamRoute[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<RoadHotspotDetail | null>(null);
  const [detailError, setDetailError] = React.useState<string | null>(null);

  React.useEffect(() => {
    void getAutoscuolaInstructors().then((res) => {
      if (res.success && res.data) setInstructors(res.data.map((i) => ({ value: i.id, label: i.name })));
    });
    void getAutoscuolaVehicles().then((res) => {
      if (!res.success || !res.data) return;
      const cats = [...new Set(res.data.map((v) => v.licenseCategory).filter(Boolean) as string[])].sort();
      setLicenses(cats.map((c) => ({ value: c, label: `Patente ${c}` })));
    });
    const ctrl = new AbortController();
    roadApi
      .examRoutes(ctrl.signal)
      .then(setRoutes)
      .catch(() => undefined);
    return () => ctrl.abort();
  }, []);

  const kinds = React.useMemo<Option[]>(
    () => [
      ...ROAD_BASE_MARKERS.filter((m) => m.key !== "altro").map((m) => ({ value: m.key, label: m.label })),
      ...customMarkers.map((c) => ({ value: `${CUSTOM_KIND_PREFIX}${c.id}`, label: c.label })),
      { value: "altro", label: "Altro" },
    ],
    [customMarkers],
  );

  const params = React.useMemo(
    () => ({
      from: new Date(Date.now() - Number(period) * 86_400_000).toISOString(),
      instructorId: instructorId === ALL ? null : instructorId,
      license: license === ALL ? null : license,
      kind: kind === ALL ? null : kind,
    }),
    [period, instructorId, license, kind],
  );

  React.useEffect(() => {
    const ctrl = new AbortController();
    setError(null);
    setSelected(null);
    roadApi
      .hotspots(params, ctrl.signal)
      .then(setData)
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "Impossibile caricare i punti critici.");
      });
    return () => ctrl.abort();
  }, [params]);

  React.useEffect(() => {
    setDetail(null);
    setDetailError(null);
    if (!selected) return;
    const ctrl = new AbortController();
    roadApi
      .hotspot(selected, params, ctrl.signal)
      .then(setDetail)
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setDetailError(e instanceof Error ? e.message : "Punto non trovato.");
      });
    return () => ctrl.abort();
  }, [selected, params]);

  const hotspots = data?.hotspots ?? null;
  const index = React.useMemo(() => new Map((hotspots ?? []).map((h, i) => [h.key, i + 1])), [hotspots]);
  const current = hotspots?.find((h) => h.key === selected) ?? null;

  // ── mappa ──
  const containerRef = React.useRef<HTMLDivElement>(null);
  const { handle, failed } = useRoadMap(containerRef, { center: [45.07, 7.68], zoom: 13 });
  const pinsRef = React.useRef<Map<string, { marker: MlMarker; el: HTMLElement }>>(new Map());
  const fitKeyRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!handle) return;
    drawExamRoutes(handle, routes);
  }, [handle, routes]);

  React.useEffect(() => {
    if (!handle || !hotspots) return;
    drawHeat(handle, hotspots);
    pinsRef.current.forEach(({ marker }) => marker.remove());
    pinsRef.current.clear();
    hotspots.forEach((h, i) => {
      const el = htmlElement(
        `<div><button type="button" class="road-hs" aria-label="${escapeHtml(`${i + 1}. ${h.street ?? h.label}`)}"><b>${i + 1}</b></button></div>`,
      );
      el.querySelector("button")!.addEventListener("click", () => setSelected((cur) => (cur === h.key ? null : h.key)));
      pinsRef.current.set(h.key, { marker: addHtmlMarker(handle, toLngLat(h), el), el });
    });
    // Inquadra ogni volta che cambiano i filtri (non quando si seleziona un punto).
    const fitKey = JSON.stringify(params);
    if (fitKeyRef.current !== fitKey) {
      fitKeyRef.current = fitKey;
      const pts = [
        ...hotspots.map((h) => toLngLat(h)),
        ...(hotspots.length ? [] : routes.flatMap((r) => r.path.map((p) => toLngLat(p)))),
      ];
      const b = pts.length > 1 ? lineBounds(handle.lib, pts) : null;
      if (b) handle.map.fitBounds(b, { padding: 80, maxZoom: 16, duration: MAP_EASE_MS, essential: true });
      else if (pts.length === 1) handle.map.easeTo({ center: pts[0], zoom: 15, duration: MAP_EASE_MS, essential: true });
    }
  }, [handle, hotspots, params, routes]);

  React.useEffect(() => {
    pinsRef.current.forEach(({ el }, key) => el.querySelector("button")?.classList.toggle("sel", key === selected));
    if (handle && current) {
      handle.map.easeTo({ center: toLngLat(current), duration: MAP_EASE_MS, essential: true });
    }
  }, [selected, current, handle]);

  React.useEffect(() => () => pinsRef.current.forEach(({ marker }) => marker.remove()), []);

  // Sotto lg il pannello sta sotto la mappa: toccato un punto, lo porta in vista.
  const panelRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!selected || window.matchMedia("(min-width: 1024px)").matches) return;
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selected]);

  const maxErrors = hotspots?.[0]?.errors ?? 0;

  return (
    <div className="rounded-[24px] border border-[#ebebeb] leading-[1.25]" data-testid="road-hotspots">
      <HotspotStyles />
      <div className="flex flex-wrap items-end justify-between gap-3 px-5 pb-4 pt-5">
        <div className="min-w-0">
          <b className="block text-lg font-semibold tracking-[-0.3px] text-[#111111]">Punti critici</b>
          <p className="mt-0.5 text-[13.5px] text-[#6a6a6a]">Dove gli allievi sbagliano più spesso, dalle segnalazioni «da migliorare»</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <FilterSelect value={period} onChange={setPeriod} options={[...PERIODS]} />
          <FilterSelect value={instructorId} onChange={setInstructorId} allLabel="Tutti gli istruttori" options={instructors} />
          {licenses.length > 1 ? (
            <FilterSelect value={license} onChange={setLicense} allLabel="Tutte le patenti" options={licenses} />
          ) : null}
          <FilterSelect value={kind} onChange={setKind} allLabel="Tutti gli errori" options={kinds} />
        </div>
      </div>

      <div className="grid border-t border-[#ebebeb] lg:grid-cols-[minmax(0,1fr)_400px]">
        <div
          className={cn(
            ROAD_MAP_BOX_CLASS,
            "h-[340px] rounded-none border-0 sm:h-[420px] lg:h-[calc(100vh-330px)] lg:min-h-[520px] lg:rounded-bl-[24px]",
          )}
        >
          <div className="absolute inset-0">
            <div ref={containerRef} className="h-full w-full" data-testid="road-hotspots-map" />
          </div>
          {!handle ? <RoadMapFallback failed={failed} /> : null}
          {handle ? <ZoomControls onIn={() => handle.map.zoomIn()} onOut={() => handle.map.zoomOut()} /> : null}
          {handle && (hotspots?.length || routes.length) ? <Legend routes={routes.length > 0} /> : null}
        </div>

        <div
          ref={panelRef}
          className="relative min-h-[160px] scroll-mt-20 border-t border-[#ebebeb] lg:max-h-[calc(100vh-330px)] lg:min-h-[520px] lg:overflow-y-auto lg:border-l lg:border-t-0"
        >
          {error ? <p className="px-5 py-5 text-[13.5px] text-[#6a6a6a]">{error}</p> : null}
          {!hotspots && !error ? <ListSkeleton /> : null}

          {hotspots && !current ? (
            <div key="list" className="hs-in" data-testid="road-hotspots-list">
              {hotspots.length === 0 ? (
                <EmptyState totalErrors={data?.totalErrors ?? 0} />
              ) : (
                <ol className="px-3 py-2">
                  {hotspots.map((h, i) => (
                    <li key={h.key}>
                      <HotspotRow
                        n={i + 1}
                        h={h}
                        hot={h.errors >= Math.max(3, maxErrors / 2)}
                        onSelect={() => setSelected(h.key)}
                        divided={i > 0}
                      />
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ) : null}

          {current ? (
            <div key={current.key} className="hs-in" data-testid="road-hotspot-detail">
              <HotspotDetailPanel
                n={index.get(current.key) ?? 0}
                h={current}
                detail={detail}
                error={detailError}
                onBack={() => setSelected(null)}
                onOpen={onOpen}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── mappa: calore e percorsi d'esame ───────────────────────────────────────

const HEAT_SRC = "road-hs-heat";
const EXAM_SRC = "road-hs-exam";

function drawHeat(handle: RoadMapHandle, hotspots: RoadHotspot[]) {
  const { map } = handle;
  const max = Math.max(1, ...hotspots.map((h) => h.errors));
  const data = {
    type: "FeatureCollection" as const,
    features: hotspots.map((h) => ({
      type: "Feature" as const,
      properties: { w: h.errors / max, hot: h.errors >= Math.max(3, max / 2) ? 1 : 0 },
      geometry: { type: "Point" as const, coordinates: toLngLat(h) },
    })),
  };
  const src = map.getSource(HEAT_SRC) as GeoJSONSource | undefined;
  if (src) {
    src.setData(data);
    return;
  }
  map.addSource(HEAT_SRC, { type: "geojson", data });
  map.addLayer({
    id: HEAT_SRC,
    type: "circle",
    source: HEAT_SRC,
    paint: {
      // Alone morbido: più errori = più largo; scala con lo zoom.
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        11,
        ["+", 10, ["*", 16, ["get", "w"]]],
        15,
        ["+", 34, ["*", 46, ["get", "w"]]],
        18,
        ["+", 70, ["*", 90, ["get", "w"]]],
      ],
      "circle-color": ["case", ["==", ["get", "hot"], 1], SENTIMENT_BAD, HOT_SOME],
      "circle-opacity": ["+", 0.26, ["*", 0.22, ["get", "w"]]],
      "circle-blur": 1,
    },
  });
}

function drawExamRoutes(handle: RoadMapHandle, routes: RoadExamRoute[]) {
  const { map } = handle;
  const data = {
    type: "FeatureCollection" as const,
    features: routes
      .filter((r) => r.path.length >= 2)
      .map((r) => ({
        type: "Feature" as const,
        properties: { name: r.name },
        geometry: { type: "LineString" as const, coordinates: r.path.map((p) => toLngLat(p)) },
      })),
  };
  const src = map.getSource(EXAM_SRC) as GeoJSONSource | undefined;
  if (src) {
    src.setData(data);
    return;
  }
  map.addSource(EXAM_SRC, { type: "geojson", data });
  // Sotto il calore: il tratteggio fa da sfondo, i punti restano leggibili.
  const before = map.getLayer(HEAT_SRC) ? HEAT_SRC : undefined;
  map.addLayer(
    {
      id: `${EXAM_SRC}-c`,
      type: "line",
      source: EXAM_SRC,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#ffffff", "line-width": 6, "line-opacity": 0.9 },
    },
    before,
  );
  map.addLayer(
    {
      id: EXAM_SRC,
      type: "line",
      source: EXAM_SRC,
      layout: { "line-cap": "butt", "line-join": "round" },
      paint: { "line-color": "#3a3a3a", "line-width": 2.5, "line-dasharray": [2.2, 1.6] },
    },
    before,
  );
}

// ─── pannello ───────────────────────────────────────────────────────────────

function HotspotRow({
  n,
  h,
  hot,
  onSelect,
  divided,
}: {
  n: number;
  h: RoadHotspot;
  hot: boolean;
  onSelect: () => void;
  divided: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid="road-hotspot-row"
      className={cn(
        "hs-row grid w-full cursor-pointer grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-3 rounded-[18px] px-2.5 py-3.5 text-left hover:bg-[#fafafa]",
        divided && "border-t border-[#f2f2f2]",
      )}
    >
      <span className="mt-px grid size-7 place-items-center rounded-full bg-[#111111] text-[12.5px] font-semibold text-white">{n}</span>
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-semibold tracking-[-0.2px] text-[#111111]">
          {h.street ?? h.label}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[13px] text-[#6a6a6a]">
          <i className="block size-[7px] shrink-0 rounded-full" style={{ background: hot ? SENTIMENT_BAD : HOT_SOME }} aria-hidden />
          <span className="truncate">
            {h.label}
            {h.examRoutes.length ? <b className="font-semibold text-[#111111]"> · sul percorso d&apos;esame</b> : null}
          </span>
        </span>
      </span>
      <span className="text-right">
        <b className="block text-[20px] font-semibold tabular-nums leading-none tracking-[-0.5px] text-[#111111]">{h.errors}</b>
        <span className="mt-1 block text-[12.5px] text-[#6a6a6a]">{h.students} allievi</span>
      </span>
    </button>
  );
}

function HotspotDetailPanel({
  n,
  h,
  detail,
  error,
  onBack,
  onOpen,
}: {
  n: number;
  h: RoadHotspot;
  detail: RoadHotspotDetail | null;
  error: string | null;
  onBack: () => void;
  onOpen: (sessionId: string) => void;
}) {
  return (
    <div className="px-5 pb-5 pt-3.5">
      <button
        type="button"
        onClick={onBack}
        className="-ml-2 flex h-9 cursor-pointer items-center gap-1 rounded-full pl-1 pr-3 text-[13.5px] font-medium text-[#444444] transition-colors duration-200 hover:bg-[#f4f4f4] hover:text-[#111111]"
      >
        <ChevronLeft className="size-4" strokeWidth={2} />
        Tutti i punti
      </button>

      <div className="mt-2.5 flex items-start gap-3">
        <SymbolTile kind={h.kind} size={40} sentiment="bad" />
        <div className="min-w-0">
          <h3 className="text-[19px] font-semibold leading-tight tracking-[-0.4px] text-[#111111]">
            <span className="text-[#6a6a6a]">{n}.</span> {h.street ?? h.label}
          </h3>
          <p className="mt-0.5 text-[13.5px] text-[#6a6a6a]">
            {h.label} · ultima volta {shortDay(h.lastAt).toLowerCase()}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 rounded-[18px] border border-[#ebebeb] px-4 py-3.5">
        <Num value={h.errors} label="Errori" />
        <Num value={h.students} label="Allievi" divided />
        <Num value={h.sessions} label="Guide" divided />
      </div>

      {h.examRoutes.length ? (
        <p className="mt-3.5 flex items-start gap-2.5 text-[13.5px] text-[#333333]">
          <svg width="22" height="12" viewBox="0 0 22 12" className="mt-[3px] shrink-0" aria-hidden>
            <path d="M1 6h20" stroke="#3a3a3a" strokeWidth="2.5" strokeDasharray="4.5 3.5" />
          </svg>
          <span>
            Sta sul percorso d&apos;esame{" "}
            <b className="font-semibold text-[#111111]">{h.examRoutes.map((r) => `«${r.name}»`).join(", ")}</b>: vale la pena
            ripassarlo prima dell&apos;esame.
          </span>
        </p>
      ) : null}

      {error ? <p className="mt-4 text-[13.5px] text-[#6a6a6a]">{error}</p> : null}
      {!detail && !error ? (
        <div className="mt-5 grid gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[52px] animate-pulse rounded-[14px] bg-[#f7f7f7]" />
          ))}
        </div>
      ) : null}

      {detail ? (
        <>
          <h4 className="mt-5 text-[14.5px] font-semibold text-[#111111]">Allievi che ci sbagliano</h4>
          <div className="mt-1">
            {detail.students.map((s, i) => (
              <div key={s.id} className={cn("flex items-center justify-between py-2 text-[14px]", i > 0 && "border-t border-[#f2f2f2]")}>
                <span className="truncate text-[#222222]">{s.name ?? "Allievo"}</span>
                <span className="shrink-0 tabular-nums text-[#6a6a6a]">{s.errors === 1 ? "1 volta" : `${s.errors} volte`}</span>
              </div>
            ))}
          </div>

          <h4 className="mt-5 text-[14.5px] font-semibold text-[#111111]">Le guide</h4>
          <div className="mt-1 grid">
            {detail.sessions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onOpen(s.id)}
                data-testid="road-hotspot-session"
                className="hs-row -mx-2 grid cursor-pointer grid-cols-[86px_minmax(0,1fr)_auto_16px] items-center gap-3 rounded-[14px] px-2 py-2.5 text-left hover:bg-[#fafafa]"
              >
                <span className="whitespace-nowrap text-[13.5px] font-semibold text-[#111111]">
                  {shortDay(s.startedAt)}
                  <span className="block text-[12px] font-normal tabular-nums text-[#6a6a6a]">{hhmm(s.startedAt)}</span>
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium text-[#111111]">{s.student?.name ?? "Allievo"}</span>
                  <span className="block truncate text-[12.5px] text-[#6a6a6a]">con {s.instructor?.name ?? "istruttore"}</span>
                </span>
                <span className="text-[12.5px] tabular-nums text-[#6a6a6a]">{s.errors === 1 ? "1 errore" : `${s.errors} errori`}</span>
                <ChevronRight className="size-4 text-[#b0b0b0]" strokeWidth={2} />
              </button>
            ))}
          </div>
          {detail.hiddenSessions > 0 ? (
            <p className="mt-2 text-[12.5px] text-[#6a6a6a]">
              {detail.hiddenSessions === 1 ? "Un'altra guida" : `Altre ${detail.hiddenSessions} guide`} di altri istruttori.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function Num({ value, label, divided }: { value: number; label: string; divided?: boolean }) {
  return (
    <div className={cn(divided && "border-l border-[#ebebeb] pl-4")}>
      <b className="block text-[22px] font-semibold tabular-nums tracking-[-0.6px] text-[#111111]">{value}</b>
      <span className="text-[12.5px] text-[#6a6a6a]">{label}</span>
    </div>
  );
}

function EmptyState({ totalErrors }: { totalErrors: number }) {
  return (
    <div className="px-6 py-8" data-testid="road-hotspots-empty">
      <b className="block text-[16px] font-semibold text-[#111111]">Ancora nessun punto critico</b>
      <p className="mt-1.5 text-[14px] leading-[1.45] text-[#555555]">
        Un punto compare quando almeno due allievi sbagliano nello stesso posto, per tre volte in tutto. Più guide si
        registrano con Road, più la mappa diventa precisa.
      </p>
      <p className="mt-3 text-[13px] text-[#6a6a6a]">
        {totalErrors === 0
          ? "In questo periodo non ci sono segnalazioni «da migliorare»."
          : totalErrors === 1
            ? "In questo periodo c'è 1 segnalazione «da migliorare», ancora isolata."
            : `In questo periodo ci sono ${totalErrors} segnalazioni «da migliorare», ancora isolate.`}
      </p>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="grid gap-2 p-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[64px] animate-pulse rounded-[18px] bg-[#f7f7f7]" />
      ))}
    </div>
  );
}

function Legend({ routes }: { routes: boolean }) {
  return (
    <div className="absolute left-3 top-3 z-[3] flex max-w-[calc(100%-24px)] sm:bottom-3 sm:top-auto sm:max-w-none flex-wrap items-center gap-x-3.5 gap-y-1 rounded-[14px] bg-white/95 px-3.5 py-2 text-[12.5px] text-[#444444] shadow-[0_2px_10px_rgba(0,0,0,0.10)]">
      <span className="flex items-center gap-1.5">
        <i className="block size-2.5 rounded-full" style={{ background: SENTIMENT_BAD }} /> molti errori
      </span>
      <span className="flex items-center gap-1.5">
        <i className="block size-2.5 rounded-full" style={{ background: HOT_SOME }} /> alcuni
      </span>
      {routes ? (
        <span className="flex items-center gap-1.5">
          <svg width="20" height="8" viewBox="0 0 20 8" aria-hidden>
            <path d="M1 4h18" stroke="#3a3a3a" strokeWidth="2.2" strokeDasharray="4 3" />
          </svg>
          percorso d&apos;esame
        </span>
      ) : null}
    </div>
  );
}

/** Puntine e transizioni (200–260 ms, decelerate, senza overshoot; mai spente da «Riduci movimento»). */
function HotspotStyles() {
  return (
    <style>{`
@keyframes road-hs-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.hs-in{animation:road-hs-in 240ms ${EASE} both}
.hs-row{transition:background-color 200ms ${EASE}}
.road-hs{display:block;padding:0;border:0;background:none;cursor:pointer}
.road-hs b{width:30px;height:30px;border-radius:50%;background:#111;color:#fff;font-size:13px;font-weight:600;display:grid;place-items:center;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.25);font-family:inherit;transition:transform 220ms ${EASE},box-shadow 220ms ${EASE}}
.road-hs:hover b{transform:scale(1.08)}
.road-hs.sel b{transform:scale(1.18);box-shadow:0 0 0 4px rgba(17,17,17,.14),0 4px 14px rgba(0,0,0,.3)}
`}</style>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
  allLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  allLabel?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-full min-w-0 gap-1.5 rounded-full border-[#dddddd] bg-white px-3 text-[13px] font-medium text-[#222222] sm:w-auto sm:min-w-[140px] sm:max-w-[220px] sm:gap-2 sm:px-3.5 sm:text-[13.5px] [&>span]:truncate [&>span]:text-left">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-[320px]">
        {allLabel ? <SelectItem value={ALL}>{allLabel}</SelectItem> : null}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
