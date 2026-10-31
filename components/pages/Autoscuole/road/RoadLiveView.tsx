"use client";

import * as React from "react";
import type { Marker as MlMarker } from "maplibre-gl";
import { MapPin } from "lucide-react";

import { roadApi, type RoadLive, type RoadLiveSession } from "@/lib/autoscuole/road/client";
import { RoadLiveReturn } from "./RoadLiveReturn";
import { roadCarImages, roadMarkerSymbol, ROAD_IMAGES } from "@/lib/autoscuole/road/symbols";
import { cn } from "@/lib/utils";
import {
  addHtmlMarker,
  escapeHtml,
  htmlElement,
  lineBounds,
  placeMarkerElement,
  raiseRoute,
  removeRoute,
  toLngLat,
  upsertRoute,
  useRoadMap,
} from "./road-map";
import {
  Car3D,
  carLabel,
  hhmm,
  initials,
  instructorTint,
  km,
  LiveDot,
  MarkerPill,
  minutesBetween,
  PinIcon,
  ROAD_MAP_BOX_CLASS,
  RoadMapFallback,
  RoadMarkerStyles,
  shortDay,
  signalLostLabel,
  SymbolTile,
  ZoomControls,
} from "./road-ui";

const POLL_MS = 5000;
const MOVE_MS = 1000;
/** Senza sede né auto: l'Italia intera. */
const ITALY: [number, number] = [42.5, 12.5];

type LngLat = [number, number];
type Track = { lastSeq: number; coords: LngLat[] };
type CarEntry = {
  marker: MlMarker;
  el: HTMLElement;
  pos: LngLat;
  heading: number;
  raf: number | null;
};

function bearing(a: LngLat, b: LngLat) {
  const r = (x: number) => (x * Math.PI) / 180;
  const y = Math.sin(r(b[0] - a[0])) * Math.cos(r(b[1]));
  const x = Math.cos(r(a[1])) * Math.sin(r(b[1])) - Math.sin(r(a[1])) * Math.cos(r(b[1])) * Math.cos(r(b[0] - a[0]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function carPosition(s: RoadLiveSession, track: Track | undefined): { pos: LngLat; heading: number } | null {
  const coords = track?.coords ?? [];
  const tail = coords.at(-1);
  const pos: LngLat | null = s.last ? toLngLat(s.last) : (tail ?? null);
  if (!pos) return null;
  let heading = s.last?.heading ?? null;
  if (heading == null && coords.length > 1) heading = bearing(coords[Math.max(0, coords.length - 4)], coords[coords.length - 1]);
  return { pos, heading: heading ?? 0 };
}

/** Avanzamento sulla durata della guida (0–1). */
function progress(s: RoadLiveSession, now: number) {
  const start = new Date(s.lesson.startsAt).getTime();
  const end = new Date(s.lesson.endsAt).getTime();
  if (end <= start) return 0;
  return Math.min(1, Math.max(0, (now - start) / (end - start)));
}

export function RoadLiveView({ onOpen }: { onOpen: (sessionId: string) => void }) {
  const [live, setLive] = React.useState<RoadLive | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [trackVersion, setTrackVersion] = React.useState(0);
  const tracksRef = React.useRef(new Map<string, Track>());
  const inFlight = React.useRef(false);
  const trackLoadedOnce = React.useRef(false);

  // ── polling: ogni 5 s, solo a scheda visibile ─────────────────────────────
  const tick = React.useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const data = await roadApi.live();
      setLive(data);
      setLoadError(null);
      const tracks = tracksRef.current;
      let changed = false;
      await Promise.all(
        data.sessions.map(async (s) => {
          const t = tracks.get(s.id);
          if (t && s.lastSeq <= t.lastSeq) return;
          // Primo giro: tutto il percorso; poi solo i lotti nuovi.
          const res = await roadApi.track(s.id, t ? t.lastSeq : -1);
          const cur = tracks.get(s.id) ?? { lastSeq: -1, coords: [] };
          for (const p of res.points) cur.coords.push([p[1], p[0]]);
          cur.lastSeq = Math.max(cur.lastSeq, res.lastSeq);
          tracks.set(s.id, cur);
          changed = true;
        }),
      );
      const ids = new Set(data.sessions.map((s) => s.id));
      for (const id of [...tracks.keys()]) {
        if (!ids.has(id)) {
          tracks.delete(id);
          changed = true;
        }
      }
      setSelectedId((cur) => (cur && !ids.has(cur) ? null : cur));
      if (changed || !trackLoadedOnce.current) {
        trackLoadedOnce.current = true;
        setTrackVersion((v) => v + 1);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Impossibile caricare le guide in corso.");
    } finally {
      inFlight.current = false;
    }
  }, []);

  React.useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      if (!alive || document.visibilityState !== "visible") return;
      timer = setTimeout(() => void tick().then(schedule), POLL_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void tick().then(schedule);
      else clearTimeout(timer);
    };
    void tick().then(schedule);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [tick]);

  // ── mappa ─────────────────────────────────────────────────────────────────
  const containerRef = React.useRef<HTMLDivElement>(null);
  const { handle, failed } = useRoadMap(containerRef, { center: ITALY, zoom: 5 });
  const carsRef = React.useRef(new Map<string, CarEntry>());
  const symbolsRef = React.useRef(new Map<string, MlMarker>());
  const baseRef = React.useRef<MlMarker | null>(null);
  // REG-657: gli altri luoghi dell'autoscuola, col loro segnaposto.
  const placesRef = React.useRef(new Map<string, MlMarker>());
  const fittedRef = React.useRef(false);

  const sessions = React.useMemo(() => live?.sessions ?? [], [live]);

  React.useEffect(() => {
    if (!handle || !live) return;
    const { map } = handle;
    const tracks = tracksRef.current;
    const ids = new Set(sessions.map((s) => s.id));

    // percorsi
    for (const s of sessions) {
      const coords = tracks.get(s.id)?.coords ?? [];
      const pos = carPosition(s, tracks.get(s.id));
      // la linea arriva fino all'auto (anche se l'ultimo lotto non è ancora arrivato)
      const line = pos && coords.length ? [...coords, pos.pos] : coords;
      if (line.length < 2) continue;
      const selected = s.id === selectedId;
      upsertRoute(
        map,
        `road-s-${s.id}`,
        line,
        selected
          ? { width: 6.5, color: "#111111", opacity: 1 }
          : { width: 4.5, color: instructorTint(s.lesson.instructor), opacity: 0.55 },
      );
    }
    if (selectedId) raiseRoute(map, `road-s-${selectedId}`);
    for (const layer of map.getStyle().layers ?? []) {
      const m = /^road-s-(.+)$/.exec(layer.id);
      if (m && !m[1].endsWith("-c") && !ids.has(m[1])) removeRoute(map, layer.id);
    }

    // sede
    if (live.base && !baseRef.current) {
      const el = htmlElement(
        `<div class="road-sede"><img src="${ROAD_IMAGES.base}" alt=""><span>${escapeHtml(live.base.name)}</span></div>`,
      );
      baseRef.current = addHtmlMarker(handle, toLngLat(live.base), el, "bottom");
    }

    // luoghi (REG-657): un segnaposto diverso dalla sede
    const placeIds = new Set((live.places ?? []).map((p) => p.id));
    for (const p of live.places ?? []) {
      if (placesRef.current.has(p.id)) continue;
      placesRef.current.set(p.id, addHtmlMarker(handle, toLngLat(p), placeMarkerElement(p.name)));
    }
    for (const [id, mk] of placesRef.current) {
      if (!placeIds.has(id)) {
        mk.remove();
        placesRef.current.delete(id);
      }
    }

    // segnalazioni (le ultime di ogni guida)
    const wanted = new Set<string>();
    for (const s of sessions) {
      for (const m of s.recentMarkers) {
        wanted.add(m.id);
        if (symbolsRef.current.has(m.id)) continue;
        const el = htmlElement(
          `<div class="road-sg ${m.sentiment ?? ""}" title="${escapeHtml(m.label)}"><img src="${roadMarkerSymbol(m.kind)}" alt=""></div>`,
        );
        symbolsRef.current.set(m.id, addHtmlMarker(handle, toLngLat(m), el));
      }
    }
    for (const [id, mk] of symbolsRef.current) {
      if (!wanted.has(id)) {
        mk.remove();
        symbolsRef.current.delete(id);
      }
    }

    // auto (dopo i simboli: stanno sopra)
    for (const s of sessions) {
      const at = carPosition(s, tracks.get(s.id));
      if (!at) continue;
      const tint = instructorTint(s.lesson.instructor);
      const label = carLabel(s.lesson.instructor?.name, s.lesson.student?.name);
      const selected = s.id === selectedId;
      let car = carsRef.current.get(s.id);
      if (!car) {
        const el = htmlElement(
          `<div class="road-car"><div class="halo"></div><div class="body"><img src="${roadCarImages(s.lesson.carColor).top}" alt=""></div><div class="lab"><i></i><span></span></div></div>`,
        );
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          setSelectedId((cur) => (cur === s.id ? null : s.id));
        });
        const marker = addHtmlMarker(handle, at.pos, el);
        car = { marker, el, pos: at.pos, heading: at.heading, raf: null };
        carsRef.current.set(s.id, car);
        setCarHeading(car, at.heading);
      } else if (car.pos[0] !== at.pos[0] || car.pos[1] !== at.pos[1]) {
        animateCar(car, at.pos, at.heading);
      }
      // il veicolo della guida può cambiare: tieni l'auto nel colore giusto
      const carImg = car.el.querySelector(".body img") as HTMLImageElement;
      const carSrc = roadCarImages(s.lesson.carColor).top;
      if (carImg.getAttribute("src") !== carSrc) carImg.setAttribute("src", carSrc);
      const lab = car.el.querySelector(".lab") as HTMLElement;
      (lab.querySelector("i") as HTMLElement).style.background = tint;
      (lab.querySelector("i") as HTMLElement).textContent = initials(s.lesson.instructor?.name);
      (lab.querySelector("span") as HTMLElement).textContent = label;
      car.el.classList.toggle("sel", selected);
      // REG-695: segnale perso → auto grigia, senza alone.
      car.el.classList.toggle("stale", signalLostLabel(s, live.now) != null);
      // la selezionata sopra le altre
      car.marker.getElement().style.zIndex = selected ? "3" : "2";
    }
    for (const [id, car] of carsRef.current) {
      if (!ids.has(id)) {
        if (car.raf) cancelAnimationFrame(car.raf);
        car.marker.remove();
        carsRef.current.delete(id);
      }
    }

    // inquadratura: una volta sola, appena ci sono i percorsi
    if (!fittedRef.current && trackVersion > 0) {
      fittedRef.current = true;
      const pts: LngLat[] = [];
      for (const s of sessions) {
        pts.push(...(tracks.get(s.id)?.coords ?? []));
        const at = carPosition(s, tracks.get(s.id));
        if (at) pts.push(at.pos);
      }
      if (live.base) pts.push(toLngLat(live.base));
      const b = pts.length > 1 ? lineBounds(handle.lib, pts) : null;
      // a destra resta lo spazio della card della guida selezionata
      if (b) map.fitBounds(b, { padding: { top: 80, bottom: 70, left: 60, right: 400 }, duration: 0, maxZoom: 15 });
      else if (pts.length === 1) map.jumpTo({ center: pts[0], zoom: 14 });
    }
  }, [handle, live, sessions, selectedId, trackVersion]);

  // pulizia marker allo smontaggio
  React.useEffect(() => {
    const cars = carsRef.current;
    const symbols = symbolsRef.current;
    const places = placesRef.current;
    return () => {
      for (const c of cars.values()) if (c.raf) cancelAnimationFrame(c.raf);
      cars.clear();
      symbols.clear();
      places.clear();
      baseRef.current = null;
    };
  }, []);

  // Selezione: se l'auto è fuori vista (o sotto la card), la mappa la raggiunge.
  React.useEffect(() => {
    if (!handle || !selectedId) return;
    const car = carsRef.current.get(selectedId);
    if (!car) return;
    const { map } = handle;
    const p = map.project(car.pos);
    const w = map.getContainer().clientWidth;
    const h = map.getContainer().clientHeight;
    const outside = p.x < 40 || p.x > w - 40 || p.y < 40 || p.y > h - 40;
    // la card (330×~400 in alto a destra) la coprirebbe
    const underCard = p.x > w - 370 && p.y < 420;
    if (outside || underCard) {
      map.easeTo({ center: car.pos, offset: [-170, 60], duration: 600, essential: true });
    }
  }, [handle, selectedId]);

  const now = live ? Date.now() : 0;
  const selected = sessions.find((s) => s.id === selectedId) ?? null;
  const markerTotal = sessions.reduce((sum, s) => sum + s.markerCount, 0);

  return (
    <div className="grid gap-5 lg:grid-cols-[404px_minmax(0,1fr)]">
      <RoadMarkerStyles />
      {/* ── pannello sinistro ── */}
      <div
        className="flex h-auto flex-col rounded-[24px] border border-[#ebebeb] px-4 pb-4 pt-5 leading-[1.25] lg:h-[calc(100vh-230px)] lg:min-h-[560px]"
        data-testid="road-live-panel"
      >
        <div className="flex items-baseline justify-between px-1.5">
          <b className="text-lg font-semibold tracking-[-0.3px] text-[#111111]">In giro adesso</b>
          <span className="text-[13px] text-[#6a6a6a]">
            {live ? `${shortDay(live.now)} · ${hhmm(live.now)}` : ""}
          </span>
        </div>
        <div className="flex gap-[22px] border-b border-[#ebebeb] px-1.5 pb-4 pt-3.5">
          <Kpi value={live ? sessions.length : null} label="auto in guida" />
          <Kpi value={live ? live.atBase.length : null} label="auto in sede" />
          <Kpi value={live ? markerTotal : null} label="segnalazioni" />
        </div>

        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 [scrollbar-width:thin]">
          {!live && !loadError ? (
            <div className="mt-3 grid gap-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-[88px] animate-pulse rounded-[20px] bg-[#f7f7f7]" />
              ))}
            </div>
          ) : null}
          {loadError && !live ? <p className="px-1.5 pt-4 text-[13.5px] text-[#6a6a6a]">{loadError}</p> : null}

          {live && sessions.length === 0 ? (
            <div className="px-1.5 pt-5" data-testid="road-live-empty">
              <p className="text-[15px] font-medium text-[#111111]">Nessuna guida in corso in questo momento.</p>
              <p className="mt-1 text-[13px] leading-[1.5] text-[#6a6a6a]">
                Quando un istruttore entra in Road, la sua auto compare qui e sulla mappa.
              </p>
            </div>
          ) : null}

          {sessions.length ? (
            <div className="mt-3 grid gap-2">
              {sessions.map((s) => {
                const tint = instructorTint(s.lesson.instructor);
                const isSel = s.id === selectedId;
                const lost = live ? signalLostLabel(s, live.now) : null;
                return (
                  <button
                    key={s.id}
                    type="button"
                    data-testid="road-live-row"
                    onClick={() => setSelectedId((cur) => (cur === s.id ? null : s.id))}
                    className={cn(
                      "relative grid cursor-pointer grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-[20px] border py-3 pb-4 pl-2.5 pr-3.5 text-left transition-colors",
                      isSel
                        ? "border-[#111111] bg-white shadow-[inset_0_0_0_1px_#111111]"
                        : "border-transparent hover:bg-[#fafafa]",
                    )}
                  >
                    <Car3D color={s.lesson.carColor} tint={tint} label={initials(s.lesson.instructor?.name)} stale={!!lost} />
                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-semibold tracking-[-0.2px] text-[#111111]">
                        {s.lesson.instructor?.name ?? "Istruttore"}
                      </div>
                      <div className="mt-px truncate text-[13.5px] text-[#444444]">
                        con {s.lesson.student?.name ?? "allievo"}
                      </div>
                      {lost ? (
                        // al posto della via e mai troncato: è l'informazione che conta
                        <div className="mt-[3px] text-[12.5px] font-medium leading-[1.35] text-[#222222]" data-testid="road-live-signal">
                          {lost}
                        </div>
                      ) : s.last?.street ? (
                        <div className="mt-[3px] flex items-center gap-1 truncate text-[12.5px] text-[#6a6a6a]">
                          <PinIcon />
                          <span className="truncate">{s.last.street}</span>
                        </div>
                      ) : null}
                    </div>
                    <div className="grid justify-items-end gap-1.5 text-right">
                      <div className="text-sm font-semibold tabular-nums text-[#111111]">
                        {minutesBetween(s.startedAt, now)} min
                      </div>
                      <RoadLiveReturn s={s} now={now} />
                      <MarkerPill count={s.markerCount} kinds={s.markerKinds} good={s.markerGood} bad={s.markerBad} />
                    </div>
                    <div className="absolute bottom-[7px] left-3.5 right-3.5 h-[3px] overflow-hidden rounded-sm bg-[#f0f0f0]">
                      <i
                        className="block h-[3px] origin-left rounded-sm transition-transform duration-700 ease-out"
                        style={{ background: tint, transform: `scaleX(${progress(s, now)})` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}

          {live && live.atBase.length ? (
            <>
              <div className="mx-1.5 mb-1.5 mt-[18px] text-[11.5px] font-semibold uppercase tracking-[0.7px] text-[#6a6a6a]">
                In sede
              </div>
              <div className="grid gap-2">
                {live.atBase.map((v) => (
                  <div
                    key={v.id}
                    className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-3 rounded-[20px] py-3 pl-2.5 pr-3.5 opacity-75"
                  >
                    <Car3D color={v.carColor} />
                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-semibold tracking-[-0.2px] text-[#111111]">{v.name}</div>
                      <div className="mt-0.5 text-[12.5px] text-[#6a6a6a]">
                        {v.freeUntil ? `Libera fino alle ${hhmm(v.freeUntil)}` : "Libera"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* ── mappa ── */}
      <div className={cn(ROAD_MAP_BOX_CLASS, "h-[560px] lg:h-[calc(100vh-230px)] lg:min-h-[560px]")} data-testid="road-live-map">
        <div className="absolute inset-0">
          {/* MapLibre mette position:relative sul contenitore: niente absolute qui */}
          <div ref={containerRef} className="h-full w-full" />
        </div>
        {!handle ? <RoadMapFallback failed={failed} /> : null}

        <div className="absolute bottom-4 left-4 z-[3] flex gap-1.5">
          <div className="flex h-8 items-center gap-[7px] rounded-2xl bg-white px-3 text-[13px] font-medium text-[#222] shadow-[0_1px_6px_rgba(0,0,0,0.1)]">
            <i className="size-[9px] rounded-full bg-[#111111]" />
            Percorso fatto
          </div>
          <div className="flex h-8 items-center gap-[7px] rounded-2xl bg-white px-3 text-[13px] font-medium text-[#222] shadow-[0_1px_6px_rgba(0,0,0,0.1)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={roadMarkerSymbol("stop")} alt="" width={16} />
            Segnalazione
          </div>
          {live?.places?.length ? (
            <div className="flex h-8 items-center gap-[7px] rounded-2xl bg-white px-3 text-[13px] font-medium text-[#222] shadow-[0_1px_6px_rgba(0,0,0,0.1)]">
              <MapPin className="size-3.5 text-[#3a3a3a]" strokeWidth={2} />
              Luogo
            </div>
          ) : null}
        </div>

        {selected && live ? (
          <SelectedCard s={selected} now={now} lost={signalLostLabel(selected, live.now)} onOpen={() => onOpen(selected.id)} />
        ) : null}

        {handle ? (
          <ZoomControls onIn={() => handle.map.zoomIn()} onOut={() => handle.map.zoomOut()} />
        ) : null}
      </div>
    </div>
  );
}

function Kpi({ value, label }: { value: number | null; label: string }) {
  return (
    <div>
      <b className="block text-2xl font-semibold tabular-nums tracking-[-0.6px] text-[#111111]">
        {value ?? "–"}
      </b>
      <span className="text-[12.5px] text-[#6a6a6a]">{label}</span>
    </div>
  );
}

function SelectedCard({
  s,
  now,
  lost,
  onOpen,
}: {
  s: RoadLiveSession;
  now: number;
  /** REG-695: «Ultimo segnale 4 min fa», null se il segnale c'è. */
  lost: string | null;
  onOpen: () => void;
}) {
  // senza segnale la velocità è vecchia: non la si mostra come «adesso»
  const speed = !lost && s.last?.speed != null ? Math.round(s.last.speed * 3.6) : null;
  const vehicle = s.lesson.vehicle?.name;
  const phone = s.lesson.instructor?.phone;
  return (
    <div
      className="absolute right-[18px] top-[18px] z-[5] w-[330px] rounded-[24px] leading-[1.25] bg-white p-[18px] shadow-[0_22px_50px_rgba(0,0,0,0.22),0_2px_6px_rgba(0,0,0,0.06)]"
      data-testid="road-live-card"
    >
      <div className="flex items-center justify-between text-[11.5px] font-semibold uppercase tracking-[0.7px] text-[#6a6a6a]">
        {lost ? (
          <span className="normal-case tracking-normal text-[13px] font-semibold text-[#111111]" data-testid="road-live-card-signal">
            {lost}
          </span>
        ) : (
          <span className="flex items-center gap-[7px]">
            <LiveDot />
            Guida in corso
          </span>
        )}
        <b className="text-[13px] normal-case tracking-normal text-[#111111]">{minutesBetween(s.startedAt, now)} min</b>
      </div>
      <h3 className="mt-2 text-[21px] font-semibold tracking-[-0.4px] text-[#111111]">
        {s.lesson.student?.name ?? "Allievo"}
      </h3>
      <div className="mt-0.5 text-[13.5px] text-[#6a6a6a]">
        {[`con ${s.lesson.instructor?.name ?? "istruttore"}`, vehicle, `${hhmm(s.lesson.startsAt)} – ${hhmm(s.lesson.endsAt)}`]
          .filter(Boolean)
          .join(" · ")}
      </div>
      <RoadLiveReturn s={s} now={now} className="mt-1 text-[13.5px]" />
      <div className="mt-3.5 grid grid-cols-3 border-y border-[#ebebeb] py-3">
        <Stat value={`${km(s.distanceMeters)} km`} label="percorsi" />
        <Stat value={speed != null ? `${speed} km/h` : "–"} label="adesso" />
        <Stat value={String(s.markerCount)} label="segnalazioni" />
      </div>
      {s.recentMarkers.slice(0, 2).map((m) => (
        <div key={m.id} className="mt-3 flex items-center gap-2.5">
          <SymbolTile kind={m.kind} sentiment={m.sentiment} />
          <div className="min-w-0 flex-1">
            <b className="block truncate text-sm font-medium text-[#222222]">{m.label}</b>
            {m.street ? <span className="mt-px block truncate text-[12.5px] text-[#6a6a6a]">{m.street}</span> : null}
          </div>
          <time className="ml-auto text-[13px] text-[#6a6a6a]">{hhmm(m.recordedAt)}</time>
        </div>
      ))}
      <div className={cn("mt-4 grid gap-2", phone ? "grid-cols-[1fr_auto]" : "grid-cols-1")}>
        <button
          type="button"
          onClick={onOpen}
          className="grid h-11 cursor-pointer place-items-center rounded-[22px] bg-[#111111] px-[18px] text-[14.5px] font-semibold text-white transition-colors hover:bg-[#2a2a2a]"
        >
          Apri la guida
        </button>
        {phone ? (
          <a
            href={`tel:${phone.replace(/\s+/g, "")}`}
            className="grid h-11 place-items-center rounded-[22px] bg-[#f2f2f2] px-[18px] text-[14.5px] font-semibold text-[#111111] transition-colors hover:bg-[#e8e8e8]"
          >
            Chiama
          </a>
        ) : null}
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <b className="block text-lg font-semibold tabular-nums text-[#111111]">{value}</b>
      <span className="text-xs text-[#6a6a6a]">{label}</span>
    </div>
  );
}

// ─── animazione auto ────────────────────────────────────────────────────────

function setCarHeading(car: CarEntry, deg: number) {
  car.heading = deg;
  const body = car.el.querySelector(".body") as HTMLElement | null;
  if (body) body.style.transform = `rotate(${deg}deg)`;
}

/** Sposta l'auto verso la nuova posizione in ~1 s (interpolazione lineare). */
function animateCar(car: CarEntry, to: LngLat, toHeading: number) {
  if (car.raf) cancelAnimationFrame(car.raf);
  const from = car.pos;
  const fromHeading = car.heading;
  const dh = ((toHeading - fromHeading + 540) % 360) - 180; // giro più corto
  const t0 = performance.now();
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / MOVE_MS);
    const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    const p: LngLat = [from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e];
    car.marker.setLngLat(p);
    car.pos = p;
    setCarHeading(car, fromHeading + dh * e);
    car.raf = k < 1 ? requestAnimationFrame(step) : null;
  };
  car.pos = from;
  car.raf = requestAnimationFrame(step);
  // a fine corsa la posizione è esattamente quella nuova
  setTimeout(() => {
    if (!car.raf) car.pos = to;
  }, MOVE_MS + 50);
}

