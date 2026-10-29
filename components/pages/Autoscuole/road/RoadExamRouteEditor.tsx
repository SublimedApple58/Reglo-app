"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useAtomValue } from "jotai";
import { Check, X } from "lucide-react";
import type { GeoJSONSource, MapMouseEvent, Marker as MlMarker } from "maplibre-gl";

import { companyAtom } from "@/atoms/company.store";
import { getAutoscuolaVehicles } from "@/lib/actions/autoscuole.actions";
import { roadApi, RoadApiError, type RoadExamRoute } from "@/lib/autoscuole/road/client";
import {
  editorLengthMeters,
  joinedPath,
  legKey,
  legsFor,
  missingLegRuns,
  splitPathAtWaypoints,
} from "@/lib/autoscuole/road/exam-route-editor";
import {
  EXAM_ROUTE_MAX_WAYPOINTS,
  EXAM_ROUTE_NAME_MAX,
  EXAM_ROUTE_SITE_MAX,
  pathLengthMeters,
  type LatLng,
} from "@/lib/autoscuole/road/exam-routes";
import { ROAD_IMAGES } from "@/lib/autoscuole/road/symbols";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { LoadingDots } from "@/components/ui/loading-dots";
import { cn } from "@/lib/utils";
import { addHtmlMarker, htmlElement, lineBounds, toLngLat, useRoadMap } from "./road-map";
import { km, ROAD_MAP_BOX_CLASS, RoadMapFallback, RoadMarkerStyles, ZoomControls } from "./road-ui";

/** Attesa dopo l'ultima modifica prima di chiedere l'aggancio: più punti messi di fila = una richiesta. */
const SNAP_DEBOUNCE_MS = 350;
const EASE = "cubic-bezier(0.2, 0, 0, 1)";
const MAP_EASE_MS = 260;
const FALLBACK_CENTER: [number, number] = [45.07, 7.68];

type Waypoint = { id: string; at: LatLng };
type SnapState = { kind: "idle" } | { kind: "busy" } | { kind: "error"; message: string };

let wpSeq = 0;
const newWp = (at: LatLng): Waypoint => ({ id: `wp${++wpSeq}`, at });
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export type ExamRouteEditorSource =
  | { kind: "new" }
  | { kind: "edit"; id: string }
  | { kind: "session"; sessionId: string; fromMs: number | null; toMs: number | null };

/**
 * Editor a pagina intera dei percorsi d'esame (REG-645, strada B).
 *
 * Il titolare clicca la mappa per mettere i punti, li trascina, li toglie, o
 * clicca sulla linea per aggiungerne uno in mezzo. La linea segue le strade
 * vere: l'aggancio (`/road/exam-routes/snap`, Google Routes) parte solo quando
 * un punto viene lasciato, aggiunto o tolto (attesa di 350 ms) o al
 * salvataggio, mai durante il trascinamento, e chiede solo i tratti che
 * mancano: i tratti già agganciati stanno in memoria per coppia di punti.
 * I tratti non ancora agganciati si vedono dritti e tratteggiati.
 */
export function RoadExamRouteEditor({ source }: { source: ExamRouteEditorSource }) {
  const locale = useLocale();
  const router = useRouter();
  const toast = useFeedbackToast();
  const company = useAtomValue(companyAtom);
  const isOwner = company?.role === "admin";
  const settingsHref = `/${locale}/user/autoscuole?tab=settings&pane=road`;

  const [loaded, setLoaded] = React.useState(source.kind === "new");
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [examSite, setExamSite] = React.useState("");
  const [categories, setCategories] = React.useState<string[]>([]);
  const [knownCategories, setKnownCategories] = React.useState<string[]>([]);
  const [sourceSessionId, setSourceSessionId] = React.useState<string | null>(null);
  const [existing, setExisting] = React.useState<RoadExamRoute | null>(null);

  const [waypoints, setWaypoints] = React.useState<Waypoint[]>([]);
  const waypointsRef = React.useRef<Waypoint[]>([]);
  waypointsRef.current = waypoints;
  const [selected, setSelected] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);
  /** Linea salvata (o della guida) finché i punti non cambiano: si salva così com'è. */
  const basePathRef = React.useRef<LatLng[] | null>(null);
  const geometryDirtyRef = React.useRef(false);

  // Tratti agganciati per coppia di punti; quelli in volo non si richiedono due volte.
  const legCache = React.useRef(new Map<string, LatLng[]>());
  const inflight = React.useRef(new Set<string>());
  const [legsVersion, setLegsVersion] = React.useState(0);
  const [snap, setSnap] = React.useState<SnapState>({ kind: "idle" });
  const snapTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [saving, setSaving] = React.useState(false);
  const [archiving, setArchiving] = React.useState(false);
  const [base, setBase] = React.useState<{ name: string; lat: number; lng: number } | null>(null);

  const seedLegs = React.useCallback((path: LatLng[], wps: LatLng[]) => {
    const legs = splitPathAtWaypoints(path, wps);
    if (!legs) return;
    legs.forEach((leg, i) => legCache.current.set(legKey(wps[i], wps[i + 1]), leg));
  }, []);

  // ── caricamento ──
  React.useEffect(() => {
    const ctrl = new AbortController();
    void getAutoscuolaVehicles().then((res) => {
      if (!res.success || !res.data) return;
      setKnownCategories([...new Set(res.data.map((v) => v.licenseCategory).filter(Boolean) as string[])].sort());
    });
    roadApi
      .live(ctrl.signal)
      .then((l) => setBase(l.base))
      .catch(() => undefined);

    const start = (wps: LatLng[], path: LatLng[]) => {
      basePathRef.current = path.length >= 2 ? path : null;
      seedLegs(path, wps);
      setWaypoints(wps.map(newWp));
      setLegsVersion((v) => v + 1);
    };
    if (source.kind === "edit") {
      roadApi
        .examRoutes(ctrl.signal, { archived: true })
        .then((list) => {
          const r = list.find((x) => x.id === source.id);
          if (!r) throw new RoadApiError("Percorso non trovato.");
          setExisting(r);
          setName(r.name);
          setExamSite(r.examSite ?? "");
          setCategories(r.licenseCategories);
          setSourceSessionId(r.sourceSessionId);
          start(r.waypoints, r.path);
          setLoaded(true);
        })
        .catch((e: unknown) => {
          if (!ctrl.signal.aborted) setLoadError(e instanceof Error ? e.message : "Percorso non trovato.");
        });
    } else if (source.kind === "session") {
      roadApi
        .examRouteFromSession(
          { sessionId: source.sessionId, fromMs: source.fromMs, toMs: source.toMs },
          ctrl.signal,
        )
        .then((d) => {
          setSourceSessionId(d.sourceSessionId);
          start(d.waypoints, d.path);
          setDirty(true);
          setLoaded(true);
        })
        .catch((e: unknown) => {
          if (!ctrl.signal.aborted) setLoadError(e instanceof Error ? e.message : "Guida non trovata.");
        });
    }
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Patente di partenza: quella dei veicoli, se ce n'è una sola.
  React.useEffect(() => {
    if (source.kind !== "edit" && knownCategories.length === 1 && categories.length === 0) {
      setCategories(knownCategories);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knownCategories]);

  // ── aggancio ──
  const runSnap = React.useCallback(async (): Promise<boolean> => {
    const wps = waypointsRef.current.map((w) => w.at);
    if (wps.length < 2) return true;
    const cache = legCache.current;
    const runs = missingLegRuns(wps, (k) => cache.has(k) || inflight.current.has(k));
    if (!runs.length) {
      // Restano solo tratti già in volo: si aspetta che arrivino.
      const waiting = missingLegRuns(wps, (k) => cache.has(k));
      if (!waiting.length) {
        setSnap({ kind: "idle" });
        return true;
      }
    }
    setSnap({ kind: "busy" });
    const results = await Promise.all(
      runs.map(async (run) => {
        const part = wps.slice(run.from, run.from + run.legs + 1);
        const keys = part.slice(1).map((b, i) => legKey(part[i], b));
        keys.forEach((k) => inflight.current.add(k));
        try {
          const res = await roadApi.snapExamRoute(part);
          res.segments.forEach((seg, i) => {
            if (keys[i] && seg.length >= 2) cache.set(keys[i], seg);
          });
          return null;
        } catch (e) {
          return e instanceof Error ? e.message : "Non riesco ad agganciare il percorso alle strade.";
        } finally {
          keys.forEach((k) => inflight.current.delete(k));
        }
      }),
    );
    setLegsVersion((v) => v + 1);
    const error = results.find(Boolean);
    const current = waypointsRef.current.map((w) => w.at);
    const stillMissing = missingLegRuns(current, (k) => cache.has(k) || inflight.current.has(k)).length > 0;
    if (error) {
      setSnap({ kind: "error", message: error });
      return false;
    }
    if (stillMissing) {
      // Nel frattempo il titolare ha cambiato ancora qualcosa.
      return runSnap();
    }
    setSnap(inflight.current.size ? { kind: "busy" } : { kind: "idle" });
    return true;
  }, []);

  const scheduleSnap = React.useCallback(() => {
    clearTimeout(snapTimer.current);
    snapTimer.current = setTimeout(() => void runSnap(), SNAP_DEBOUNCE_MS);
  }, [runSnap]);

  React.useEffect(() => () => clearTimeout(snapTimer.current), []);

  const commit = React.useCallback(
    (next: Waypoint[]) => {
      geometryDirtyRef.current = true;
      setDirty(true);
      setWaypoints(next);
      waypointsRef.current = next;
      scheduleSnap();
    },
    [scheduleSnap],
  );

  const legs = React.useMemo(
    () => legsFor(waypoints.map((w) => w.at), (k) => legCache.current.get(k)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [waypoints, legsVersion],
  );
  const showBase = !geometryDirtyRef.current && basePathRef.current != null && legs.some((l) => !l);
  const lengthMeters = showBase
    ? pathLengthMeters(basePathRef.current!)
    : editorLengthMeters(
        waypoints.map((w) => w.at),
        legs,
      );
  const pendingLegs = showBase ? 0 : legs.filter((l) => !l).length;

  // ── mappa ──
  const containerRef = React.useRef<HTMLDivElement>(null);
  const { handle, failed } = useRoadMap(containerRef, { center: FALLBACK_CENTER, zoom: 13 });
  const markersRef = React.useRef(new Map<string, MlMarker>());
  const baseMarkerRef = React.useRef<MlMarker | null>(null);
  const fittedRef = React.useRef(false);

  /** Disegna i tratti; `override` = punti durante un trascinamento (niente state, niente rete). */
  const draw = React.useCallback(
    (override?: LatLng[]) => {
      if (!handle) return;
      const { map } = handle;
      const wps = override ?? waypointsRef.current.map((w) => w.at);
      const features: Array<GeoJSON.Feature<GeoJSON.LineString, { leg: number; snapped: boolean }>> = [];
      if (!override && !geometryDirtyRef.current && basePathRef.current) {
        features.push({
          type: "Feature",
          properties: { leg: -1, snapped: true },
          geometry: { type: "LineString", coordinates: basePathRef.current.map(toLngLat) },
        });
      } else {
        for (let i = 0; i + 1 < wps.length; i++) {
          const seg = legCache.current.get(legKey(wps[i], wps[i + 1]));
          features.push({
            type: "Feature",
            properties: { leg: i, snapped: Boolean(seg) },
            geometry: { type: "LineString", coordinates: (seg ?? [wps[i], wps[i + 1]]).map(toLngLat) },
          });
        }
      }
      const data: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
      const src = map.getSource("er-legs") as GeoJSONSource | undefined;
      if (src) src.setData(data);
      else {
        map.addSource("er-legs", { type: "geojson", data });
        map.addLayer({
          id: "er-legs-c",
          type: "line",
          source: "er-legs",
          filter: ["==", ["get", "snapped"], true],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#ffffff", "line-width": 11 },
        });
        map.addLayer({
          id: "er-legs",
          type: "line",
          source: "er-legs",
          filter: ["==", ["get", "snapped"], true],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#111111", "line-width": 5.5 },
        });
        map.addLayer({
          id: "er-legs-p",
          type: "line",
          source: "er-legs",
          filter: ["==", ["get", "snapped"], false],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#6a6a6a", "line-width": 3.5, "line-dasharray": [1.2, 1.6] },
        });
        map.addLayer({
          id: "er-hit",
          type: "line",
          source: "er-legs",
          paint: { "line-color": "#000000", "line-width": 22, "line-opacity": 0 },
        });
      }
    },
    [handle],
  );

  React.useEffect(() => draw(), [draw, waypoints, legsVersion]);

  // Puntine dei punti: una per punto (per id), trascinabili.
  const selectRef = React.useRef(setSelected);
  React.useEffect(() => {
    if (!handle) return;
    const live = markersRef.current;
    const ids = new Set(waypoints.map((w) => w.id));
    for (const [id, m] of live) {
      if (!ids.has(id)) {
        m.remove();
        live.delete(id);
      }
    }
    waypoints.forEach((w, i) => {
      const label = i === 0 ? "P" : i === waypoints.length - 1 && waypoints.length > 1 ? "A" : String(i + 1);
      let m = live.get(w.id);
      if (!m) {
        const el = htmlElement(
          `<div class="er-wp"><b data-testid="road-exam-wp" class="${fittedRef.current ? "new" : ""}"></b></div>`,
        );
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          selectRef.current(w.id);
        });
        m = new handle.lib.Marker({ element: el, draggable: true, anchor: "center" }).setLngLat(toLngLat(w.at)).addTo(handle.map);
        m.on("dragstart", () => {
          selectRef.current(w.id);
          el.classList.add("drag");
        });
        m.on("drag", () => {
          const ll = m!.getLngLat();
          const wps = waypointsRef.current.map((x) => (x.id === w.id ? ([ll.lat, ll.lng] as LatLng) : x.at));
          geometryDirtyRef.current = true;
          draw(wps);
        });
        m.on("dragend", () => {
          el.classList.remove("drag");
          const ll = m!.getLngLat();
          const at: LatLng = [round6(ll.lat), round6(ll.lng)];
          commit(waypointsRef.current.map((x) => (x.id === w.id ? { ...x, at } : x)));
        });
        live.set(w.id, m);
      } else {
        m.setLngLat(toLngLat(w.at));
      }
      const el = m.getElement();
      el.querySelector("b")!.textContent = label;
      el.classList.toggle("sel", selected === w.id);
      el.classList.toggle("end", label === "P" || label === "A");
    });
  }, [handle, waypoints, selected, draw, commit]);

  React.useEffect(() => {
    const live = markersRef.current;
    return () => {
      live.forEach((m) => m.remove());
      live.clear();
      baseMarkerRef.current?.remove();
    };
  }, []);

  // Sede dell'autoscuola come riferimento.
  React.useEffect(() => {
    if (!handle || !base) return;
    baseMarkerRef.current?.remove();
    baseMarkerRef.current = addHtmlMarker(
      handle,
      [base.lng, base.lat],
      htmlElement(`<div class="road-sede small" style="pointer-events:none"><img src="${ROAD_IMAGES.base}" alt=""></div>`),
      "bottom",
    );
  }, [handle, base]);

  // Inquadratura iniziale: il percorso, altrimenti la sede.
  React.useEffect(() => {
    if (!handle || fittedRef.current || !loaded) return;
    const pts = basePathRef.current ?? waypoints.map((w) => w.at);
    if (pts.length >= 2) {
      const b = lineBounds(handle.lib, pts.map(toLngLat));
      if (b) handle.map.fitBounds(b, { padding: 70, duration: 0, maxZoom: 16 });
      fittedRef.current = true;
    } else if (base) {
      handle.map.jumpTo({ center: [base.lng, base.lat], zoom: 14.5 });
      fittedRef.current = true;
    }
  }, [handle, loaded, base, waypoints]);

  // Clic: sulla linea = punto in mezzo; altrove = punto in fondo.
  React.useEffect(() => {
    if (!handle) return;
    const { map } = handle;
    const onClick = (e: MapMouseEvent) => {
      if (!loaded) return;
      if ((e.originalEvent.target as HTMLElement | null)?.closest?.(".er-wp")) return;
      const wps = waypointsRef.current;
      if (wps.length >= EXAM_ROUTE_MAX_WAYPOINTS) {
        toast.error({ description: `Al massimo ${EXAM_ROUTE_MAX_WAYPOINTS} punti per percorso.` });
        return;
      }
      const at: LatLng = [round6(e.lngLat.lat), round6(e.lngLat.lng)];
      const hit = map.queryRenderedFeatures(
        [
          [e.point.x - 6, e.point.y - 6],
          [e.point.x + 6, e.point.y + 6],
        ],
        { layers: ["er-hit"] },
      );
      let leg = hit.length ? Number(hit[0].properties?.leg ?? -1) : -1;
      if (hit.length && leg < 0) leg = closestStraightLeg(wps.map((w) => w.at), at);
      const wp = newWp(at);
      const next = leg >= 0 ? [...wps.slice(0, leg + 1), wp, ...wps.slice(leg + 1)] : [...wps, wp];
      setSelected(wp.id);
      commit(next);
    };
    const onEnter = () => (map.getCanvas().style.cursor = "copy");
    const onLeave = () => (map.getCanvas().style.cursor = "crosshair");
    map.getCanvas().style.cursor = "crosshair";
    map.on("click", onClick);
    map.on("mouseenter", "er-hit", onEnter);
    map.on("mouseleave", "er-hit", onLeave);
    return () => {
      map.off("click", onClick);
      map.off("mouseenter", "er-hit", onEnter);
      map.off("mouseleave", "er-hit", onLeave);
    };
  }, [handle, loaded, commit, toast]);

  const remove = React.useCallback(
    (id: string) => {
      setSelected((s) => (s === id ? null : s));
      commit(waypointsRef.current.filter((w) => w.id !== id));
    },
    [commit],
  );

  // Canc / Backspace toglie il punto scelto; Esc lo deseleziona.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "Escape") setSelected(null);
      if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        e.preventDefault();
        remove(selected);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, remove]);

  // Modifiche non salvate: il browser chiede prima di uscire.
  React.useEffect(() => {
    if (!dirty || saving) return;
    const onBefore = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, [dirty, saving]);

  const focusPoint = (w: Waypoint) => {
    setSelected(w.id);
    handle?.map.easeTo({ center: toLngLat(w.at), duration: MAP_EASE_MS, essential: true });
  };

  // ── salvataggio ──
  const save = async () => {
    if (saving) return;
    if (!name.trim()) {
      toast.error({ description: "Dai un nome al percorso." });
      return;
    }
    if (waypoints.length < 2) {
      toast.error({ description: "Metti almeno la partenza e l'arrivo sulla mappa." });
      return;
    }
    setSaving(true);
    try {
      let path: LatLng[] | null = null;
      if (!geometryDirtyRef.current && basePathRef.current) path = basePathRef.current;
      else {
        clearTimeout(snapTimer.current);
        const ok = await runSnap();
        path = ok ? joinedPath(legsFor(waypointsRef.current.map((w) => w.at), (k) => legCache.current.get(k))) : null;
      }
      if (!path) {
        toast.error({ description: "Il percorso non segue ancora le strade: riprova l'aggancio." });
        return;
      }
      const body = {
        name: name.trim(),
        examSite: examSite.trim() || null,
        licenseCategories: categories,
        waypoints: waypointsRef.current.map((w) => w.at),
        path,
        ...(sourceSessionId ? { sourceSessionId } : {}),
      };
      if (existing) await roadApi.updateExamRoute(existing.id, body);
      else await roadApi.createExamRoute(body);
      setDirty(false);
      toast.success({ description: existing ? "Percorso aggiornato." : "Percorso d'esame salvato." });
      router.push(settingsHref);
    } catch (e) {
      toast.error({ description: e instanceof Error ? e.message : "Impossibile salvare il percorso." });
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    if (!existing || archiving) return;
    setArchiving(true);
    try {
      await roadApi.archiveExamRoute(existing.id);
      setDirty(false);
      toast.success({ description: "Percorso archiviato." });
      router.push(settingsHref);
    } catch (e) {
      toast.error({ description: e instanceof Error ? e.message : "Impossibile archiviare il percorso." });
      setArchiving(false);
    }
  };

  if (company && !isOwner) {
    return <Message text="Solo il titolare può modificare i percorsi d'esame." href={settingsHref} />;
  }
  if (loadError) return <Message text={loadError} href={settingsHref} />;

  const title =
    source.kind === "edit" ? existing?.name ?? "Percorso d'esame" : "Nuovo percorso d'esame";
  const allCategories = [...new Set([...knownCategories, ...categories, ...(knownCategories.length ? [] : ["B"])])].sort();
  const hint =
    waypoints.length === 0
      ? "Clicca sulla mappa dove parte il percorso."
      : waypoints.length === 1
        ? "Ora clicca dove arriva, o il prossimo punto da cui passa."
        : null;

  return (
    <div className="w-full lg:-mt-2.5" data-testid="road-exam-editor">
      <RoadMarkerStyles />
      <EditorStyles />
      <nav className="flex min-w-0 items-center gap-2 text-[13.5px] text-[#6a6a6a]" aria-label="Percorso">
        <Link href={`/${locale}/user/autoscuole?tab=settings`} className="shrink-0 hover:text-[#111111]">
          Impostazioni
        </Link>
        <span>›</span>
        <Link href={settingsHref} className="shrink-0 hover:text-[#111111]">
          Reglo Road
        </Link>
        <span>›</span>
        <b className="truncate font-medium text-[#111111]">{source.kind === "edit" ? "Modifica percorso" : "Nuovo percorso"}</b>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-4 pb-5 pt-2.5">
        <div className="min-w-0">
          <h1 className="truncate text-[28px] font-semibold leading-tight tracking-[-0.6px] text-[#111111]">{title}</h1>
          <p className="mt-[3px] text-[14.5px] text-[#6a6a6a]">
            {source.kind === "session"
              ? "Dal percorso della guida: sposta, aggiungi o togli i punti se serve."
              : "Metti i punti sulla mappa: la linea segue le strade."}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            href={settingsHref}
            className="grid h-11 place-items-center rounded-[22px] bg-[#f2f2f2] px-[18px] text-[14.5px] font-semibold text-[#111111] transition-colors duration-200 hover:bg-[#e8e8e8]"
          >
            Annulla
          </Link>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !loaded}
            data-testid="road-exam-save"
            className="grid h-11 min-w-[150px] cursor-pointer place-items-center rounded-[22px] bg-[#111111] px-[18px] text-[14.5px] font-semibold text-white transition-colors duration-200 hover:bg-[#2a2a2a] disabled:cursor-default disabled:opacity-40"
          >
            {saving ? <LoadingDots /> : "Salva percorso"}
          </button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className={cn(ROAD_MAP_BOX_CLASS, "h-[440px] lg:h-[calc(100vh-250px)] lg:min-h-[540px]")}>
          <div className="absolute inset-0">
            <div ref={containerRef} className="h-full w-full" data-testid="road-exam-map" />
          </div>
          {!handle ? <RoadMapFallback failed={failed} /> : null}
          {handle ? <ZoomControls onIn={() => handle.map.zoomIn()} onOut={() => handle.map.zoomOut()} /> : null}
          <div className="pointer-events-none absolute left-3 right-3 top-3 z-[3] flex flex-col items-start gap-2 sm:left-4 sm:top-4">
            {hint && loaded && handle ? (
              <div key={hint} className="er-card pointer-events-auto max-w-[340px] rounded-2xl bg-white px-4 py-3 text-[14px] leading-[1.4] text-[#222222] shadow-[0_2px_14px_rgba(0,0,0,0.12)]">
                {hint}
              </div>
            ) : null}
            {snap.kind !== "idle" ? (
              <div
                key={snap.kind}
                data-testid="road-exam-snap"
                className="er-card pointer-events-auto flex max-w-[360px] items-center gap-2.5 rounded-2xl bg-white px-4 py-2.5 text-[13.5px] text-[#222222] shadow-[0_2px_14px_rgba(0,0,0,0.12)]"
              >
                {snap.kind === "busy" ? (
                  <>
                    <LoadingDots />
                    Aggancio alle strade…
                  </>
                ) : (
                  <>
                    <span className="min-w-0">{snap.message}</span>
                    <button
                      type="button"
                      onClick={() => void runSnap()}
                      className="shrink-0 cursor-pointer font-semibold text-[#111111] underline underline-offset-2"
                    >
                      Riprova
                    </button>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid content-start gap-3.5 leading-[1.25]">
          <div className="rounded-[22px] border border-[#ebebeb] px-5 py-[18px]">
            <label className="block text-[13px] font-medium text-[#6a6a6a]" htmlFor="er-name">
              Nome
            </label>
            <input
              id="er-name"
              value={name}
              maxLength={EXAM_ROUTE_NAME_MAX}
              onChange={(e) => {
                setName(e.target.value);
                setDirty(true);
              }}
              placeholder="Es. Giro della Motorizzazione"
              className="mt-1.5 h-11 w-full rounded-xl border border-[#d9d9d9] bg-white px-3.5 text-[15px] text-[#222222] outline-none transition-colors duration-200 placeholder:text-[#9a9a9a] focus:border-[#111111]"
            />
            <label className="mt-4 block text-[13px] font-medium text-[#6a6a6a]" htmlFor="er-site">
              Sede d&apos;esame <span className="font-normal text-[#9a9a9a]">(facoltativa)</span>
            </label>
            <input
              id="er-site"
              value={examSite}
              maxLength={EXAM_ROUTE_SITE_MAX}
              onChange={(e) => {
                setExamSite(e.target.value);
                setDirty(true);
              }}
              placeholder="Es. Motorizzazione, via Bertola"
              className="mt-1.5 h-11 w-full rounded-xl border border-[#d9d9d9] bg-white px-3.5 text-[15px] text-[#222222] outline-none transition-colors duration-200 placeholder:text-[#9a9a9a] focus:border-[#111111]"
            />
            <div className="mt-4 text-[13px] font-medium text-[#6a6a6a]">Patenti</div>
            <div className="mt-1.5 flex flex-wrap gap-2" role="group" aria-label="Patenti">
              {allCategories.map((c) => {
                const on = categories.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setCategories((cur) => (on ? cur.filter((x) => x !== c) : [...cur, c].sort()));
                      setDirty(true);
                    }}
                    className={cn(
                      "flex h-10 min-w-[64px] cursor-pointer items-center justify-center gap-1.5 rounded-xl border px-3 text-[14px] font-semibold transition-colors duration-200",
                      on
                        ? "border-[#111111] bg-[#111111] text-white"
                        : "border-[#d9d9d9] bg-white text-[#222222] hover:border-[#9a9a9a]",
                    )}
                  >
                    {on ? <Check className="size-3.5" strokeWidth={2.4} /> : null}
                    {c}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[12.5px] text-[#6a6a6a]">
              {categories.length ? "Il giro proporrà il percorso agli allievi di queste patenti." : "Nessuna scelta: vale per tutte le patenti."}
            </p>
          </div>

          <div className="rounded-[22px] border border-[#ebebeb] px-5 py-[18px]">
            <div className="grid grid-cols-2">
              <div>
                <b className="block text-[26px] font-semibold tabular-nums tracking-[-0.7px] text-[#111111]" data-testid="road-exam-km">
                  {waypoints.length >= 2 ? km(lengthMeters) : "–"}
                  <small className="ml-1 text-sm font-medium tracking-normal text-[#6a6a6a]">km</small>
                </b>
                <span className="text-[12.5px] text-[#6a6a6a]">Lunghezza</span>
              </div>
              <div className="border-l border-[#ebebeb] pl-4">
                <b className="block text-[26px] font-semibold tabular-nums tracking-[-0.7px] text-[#111111]">
                  {waypoints.length}
                  <small className="ml-1 text-sm font-medium tracking-normal text-[#6a6a6a]">di {EXAM_ROUTE_MAX_WAYPOINTS}</small>
                </b>
                <span className="text-[12.5px] text-[#6a6a6a]">Punti</span>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-[13px] text-[#6a6a6a]">
              {waypoints.length < 2 ? (
                "Servono almeno partenza e arrivo."
              ) : pendingLegs > 0 || snap.kind === "busy" ? (
                <>
                  <span className="size-2 rounded-full bg-[#9a9a9a]" />
                  {snap.kind === "error" ? "Alcuni tratti non seguono ancora le strade." : "Aggancio alle strade in corso."}
                </>
              ) : (
                <>
                  <span className="size-2 rounded-full bg-[#16a34a]" />
                  Segue le strade.
                </>
              )}
            </div>
          </div>

          <div className="rounded-[22px] border border-[#ebebeb] px-5 py-[18px]" data-testid="road-exam-points">
            <h4 className="flex items-baseline justify-between text-[15.5px] font-semibold text-[#111111]">
              Punti <span className="text-[13px] font-medium text-[#6a6a6a]">in ordine di passaggio</span>
            </h4>
            {waypoints.length === 0 ? (
              <p className="py-2.5 text-[13.5px] leading-[1.45] text-[#6a6a6a]">
                Ancora nessun punto. Clicca sulla mappa: il primo è la partenza, l&apos;ultimo l&apos;arrivo.
              </p>
            ) : (
              <div className="mt-1.5 max-h-[360px] overflow-y-auto">
                {waypoints.map((w, i) => {
                  const label = i === 0 ? "Partenza" : i === waypoints.length - 1 ? "Arrivo" : `Punto ${i + 1}`;
                  const leg = i > 0 ? legs[i - 1] : null;
                  const prev = i > 0 ? waypoints[i - 1].at : null;
                  const meters = prev ? (leg ? pathLengthMeters(leg) : editorLengthMeters([prev, w.at], [null])) : 0;
                  return (
                    <div
                      key={w.id}
                      data-testid="road-exam-row"
                      className={cn(
                        "er-row group grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 py-2 transition-colors duration-200",
                        selected === w.id ? "bg-[#f4f4f4]" : "hover:bg-[#fafafa]",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => focusPoint(w)}
                        className={cn(
                          "grid size-7 cursor-pointer place-items-center rounded-full text-[12.5px] font-semibold",
                          i === 0 || i === waypoints.length - 1 ? "bg-[#111111] text-white" : "border-2 border-[#111111] bg-white text-[#111111]",
                        )}
                        aria-label={`Vai a ${label}`}
                      >
                        {i === 0 ? "P" : i === waypoints.length - 1 ? "A" : i + 1}
                      </button>
                      <button type="button" onClick={() => focusPoint(w)} className="min-w-0 cursor-pointer text-left">
                        <b className="block text-[14.5px] font-medium text-[#111111]">{label}</b>
                        <span className="text-[12.5px] tabular-nums text-[#6a6a6a]">
                          {i === 0 ? "Inizio del percorso" : `${leg || showBase ? "" : "≈ "}${km(meters)} km dal punto prima`}
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Togli ${label}`}
                        onClick={() => remove(w.id)}
                        className="grid size-[34px] cursor-pointer place-items-center rounded-[10px] text-[#6a6a6a] transition-colors duration-200 hover:bg-[#ececec] hover:text-[#111111]"
                      >
                        <X className="size-[18px]" strokeWidth={1.8} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="mt-2 border-t border-[#f2f2f2] pt-3 text-[12.5px] leading-[1.45] text-[#6a6a6a]">
              Trascina un punto per spostarlo. Clicca sulla linea per aggiungerne uno in mezzo. Con un punto scelto, Canc lo toglie.
            </p>
          </div>

          {existing && !existing.archivedAt ? (
            <button
              type="button"
              onClick={() => void archive()}
              disabled={archiving}
              className="justify-self-start px-1 py-1 text-[13.5px] font-semibold text-[#6a6a6a] underline-offset-2 transition-colors duration-200 hover:text-[#111111] hover:underline"
            >
              {archiving ? <LoadingDots /> : "Archivia percorso"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Tratto (in linea d'aria) più vicino a un punto: per inserire sulla linea salvata. */
function closestStraightLeg(wps: LatLng[], p: LatLng) {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i + 1 < wps.length; i++) {
    const [a, b] = [wps[i], wps[i + 1]];
    const dx = b[1] - a[1];
    const dy = b[0] - a[0];
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((p[1] - a[1]) * dx + (p[0] - a[0]) * dy) / len2)) : 0;
    const d = Math.hypot(p[1] - (a[1] + t * dx), p[0] - (a[0] + t * dy));
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function Message({ text, href }: { text: string; href: string }) {
  return (
    <div className="py-16 text-center">
      <p className="text-[15px] text-[#222222]">{text}</p>
      <Link href={href} className="mt-3 inline-block text-[14px] font-semibold text-[#111111] underline">
        Torna a Reglo Road
      </Link>
    </div>
  );
}

/** Puntine dell'editor e comparsa delle card: 220 ms, decelerate, senza rimbalzo. */
function EditorStyles() {
  return (
    <style>{`
.er-wp{width:0;height:0;cursor:grab}
.er-wp b{position:absolute;left:-15px;top:-15px;width:30px;height:30px;border-radius:50%;background:#fff;color:#111;border:2.5px solid #111;font-size:12.5px;font-weight:600;display:grid;place-items:center;box-shadow:0 2px 8px rgba(0,0,0,.22);font-family:inherit;transition:transform 200ms ${EASE},box-shadow 200ms ${EASE}}
.er-wp.end b{background:#111;color:#fff;border-color:#fff}
.er-wp.sel b{transform:scale(1.16);box-shadow:0 0 0 4px rgba(17,17,17,.18),0 4px 12px rgba(0,0,0,.25)}
.er-wp.drag{cursor:grabbing}
.er-wp.drag b{transform:scale(1.22);box-shadow:0 0 0 6px rgba(17,17,17,.14),0 8px 18px rgba(0,0,0,.28)}
.er-wp b.new{animation:er-pop 220ms ${EASE} backwards}
@keyframes er-pop{from{opacity:0;transform:scale(.55)}to{opacity:1;transform:scale(1)}}
.er-card{animation:er-in 220ms ${EASE} both}
.er-row{animation:er-in 200ms ${EASE} both}
@keyframes er-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
`}</style>
  );
}
