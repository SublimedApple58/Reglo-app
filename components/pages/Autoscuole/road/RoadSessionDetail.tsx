"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { useAtomValue } from "jotai";
import { CalendarDays, ChevronDown, ChevronRight, ChevronUp, MoreHorizontal, Star } from "lucide-react";
import type { Marker as MlMarker } from "maplibre-gl";

import { companyAtom } from "@/atoms/company.store";
import { getServiceLimits } from "@/lib/services";
import { roadApi, type RoadDetail, type RoadHotspot } from "@/lib/autoscuole/road/client";
import { parseRoadCustomMarkers } from "@/lib/autoscuole/road/catalog";
import { RoadMarkerEditor } from "./RoadMarkerEditor";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { nearestIndex } from "@/lib/autoscuole/road/exam-route-editor";
import { pathLengthMeters, type LatLng } from "@/lib/autoscuole/road/exam-routes";
import { roadCarImages, roadMarkerSymbol } from "@/lib/autoscuole/road/symbols";
import { cn } from "@/lib/utils";
import {
  addHtmlMarker,
  escapeHtml,
  htmlElement,
  lineBounds,
  removeRoute,
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
import {
  hotspotHref,
  readList,
  rememberPrev,
  ROAD_VIEW_LABEL,
  roadViewHref,
  safeBack,
  sessionHref,
  studentHref,
  type RoadFrom,
} from "./road-nav";
import { RoadBackLink } from "./road-nav-ui";
import { useCompanyHotspots } from "./road-hotspot-match";

const POLL_MS = 5000;
const EASE = "cubic-bezier(0.2, 0, 0, 1)";
/** Tratto scelto per «Usa come percorso d'esame»: indici nel tracciato. */
type Trim = { a: number; b: number };

/**
 * Dettaglio di una guida registrata con Road (W2): percorso, segnalazioni in
 * ordine di tempo, pagellino. Se la guida è ancora in corso si aggiorna da
 * sola ogni 5 s (a scheda visibile).
 */
export function RoadSessionDetail({ sessionId, from }: { sessionId: string; from: RoadFrom }) {
  const locale = useLocale();
  const router = useRouter();
  const company = useAtomValue(companyAtom);
  const isOwner = company?.role === "admin";
  const [trim, setTrim] = React.useState<Trim | null>(null);
  const studentSees = getServiceLimits(company?.services ?? null, "AUTOSCUOLE").studentNotesEnabled === true;
  const [detail, setDetail] = React.useState<RoadDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const base = `/${locale}/user/autoscuole/road`;
  const searchParams = useSearchParams();
  const back = safeBack(searchParams.get("back"));
  const hotspots = useCompanyHotspots(isOwner);

  // Su/giù tra le guide della lista da cui si è aperto il dettaglio (REG-719).
  const [list, setList] = React.useState<string[]>([]);
  React.useEffect(() => setList(readList()), []);
  const pos = list.indexOf(sessionId);
  const goTo = React.useCallback(
    (id: string | undefined) => {
      if (!id) return;
      router.replace(sessionHref(locale, id, from, back), { scroll: false });
    },
    [router, locale, from, back],
  );
  const prevId = pos > 0 ? list[pos - 1] : undefined;
  const nextId = pos >= 0 && pos < list.length - 1 ? list[pos + 1] : undefined;
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) || t?.isContentEditable) return;
      if (e.key === "k") goTo(prevId);
      if (e.key === "j") goTo(nextId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, prevId, nextId]);

  // Road novembre R3: segnalazione in modifica e «Sposta sulla mappa» (un clic sulla mappa).
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [moving, setMoving] = React.useState(false);
  const feedback = useFeedbackToast();
  const customMarkers = React.useMemo(
    () =>
      parseRoadCustomMarkers(
        (getServiceLimits(company?.services ?? null, "AUTOSCUOLE") as Record<string, unknown>).roadCustomMarkers,
      ),
    [company?.services],
  );
  const reloadDetail = React.useCallback(async () => {
    const d = await roadApi.session(sessionId);
    setDetail(d);
  }, [sessionId]);
  const editing = detail?.markers.find((m) => m.id === editingId) ?? null;

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
  // Su/giù cambia guida senza smontare la pagina: si riparte da zero.
  const shownRef = React.useRef(sessionId);
  React.useEffect(() => {
    if (shownRef.current === sessionId) return;
    shownRef.current = sessionId;
    fittedRef.current = false;
    setDetail(null);
    setError(null);
    setTrim(null);
  }, [sessionId]);

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
      // REG-657: la partenza è un punto con l'orario, non l'icona della sede
      // (si parte anche da un luogo o da casa dell'allievo).
      markersRef.current.push(
        addHtmlMarker(
          handle,
          start,
          htmlElement(`<div><div class="road-start-lab">Partenza ${hhmm(detail.startedAt)}</div></div>`),
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
    // REG-665: soste di almeno 5 minuti (la traccia pulita le accorpa in un punto).
    (detail.stops ?? []).forEach((st) => {
      const at = toLngLat([st.lat, st.lng]);
      markersRef.current.push(addHtmlMarker(handle, at, htmlElement(`<div class="road-stop"></div>`)));
      markersRef.current.push(
        addHtmlMarker(handle, at, htmlElement(`<div><div class="road-start-lab">Sosta ${st.minutes} min</div></div>`), "bottom"),
      );
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

  React.useEffect(() => {
    if (!handle || !moving || !editing) return;
    const { map } = handle;
    const canvas = map.getCanvas();
    canvas.style.cursor = "crosshair";
    const onClick = async (e: { lngLat: { lat: number; lng: number } }) => {
      setMoving(false);
      try {
        await roadApi.updateMarker(sessionId, editing.id, { lat: e.lngLat.lat, lng: e.lngLat.lng });
        await reloadDetail();
      } catch (err) {
        feedback.error({ description: err instanceof Error ? err.message : "Segnalazione non spostata." });
      }
    };
    map.once("click", onClick);
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && setMoving(false);
    window.addEventListener("keydown", onKey);
    return () => {
      map.off("click", onClick);
      canvas.style.cursor = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [handle, moving, editing, sessionId, reloadDetail, feedback]);

  // ── «Usa come percorso d'esame» (REG-645): due maniglie scorrono sul tracciato ──
  const trimming = trim != null;
  const trimRef = React.useRef<Trim | null>(null);
  trimRef.current = trim;
  React.useEffect(() => {
    if (!handle || !detail || !trimming) return;
    const { map } = handle;
    const track: LatLng[] = detail.track.map((p) => [p[0], p[1]]);
    const coords = track.map(toLngLat);
    upsertRoute(map, "road-detail", coords, { width: 6, color: "#c3bcae", opacity: 1 });
    markersRef.current.forEach((m) => (m.getElement().style.visibility = "hidden"));
    const drawSel = (t: Trim) =>
      upsertRoute(map, "road-trim", coords.slice(t.a, t.b + 1), { width: 6, color: "#111111", opacity: 1 });
    drawSel(trimRef.current!);
    // Tutto il tracciato in vista, sopra la card del tratto.
    const bounds = lineBounds(handle.lib, coords);
    if (bounds) {
      const small = map.getContainer().clientWidth < 640;
      map.fitBounds(bounds, {
        padding: small ? { top: 60, left: 40, right: 40, bottom: 190 } : { top: 60, left: 440, right: 80, bottom: 60 },
        duration: 260,
        essential: true,
        maxZoom: 16,
      });
    }
    const handles = (["a", "b"] as const).map((side) => {
      const el = htmlElement(
        `<div class="road-trim-h"><b data-testid="road-trim-${side === "a" ? "start" : "end"}"></b><span>${side === "a" ? "Inizio" : "Fine"}</span></div>`,
      );
      const marker = new handle.lib.Marker({ element: el, draggable: true, anchor: "center" })
        .setLngLat(coords[trimRef.current![side]])
        .addTo(map);
      marker.on("dragstart", () => el.classList.add("drag"));
      marker.on("drag", () => {
        const ll = marker.getLngLat();
        const t = trimRef.current!;
        const { index } = nearestIndex(track, [ll.lat, ll.lng]);
        const next = side === "a" ? { a: Math.min(index, t.b - 1), b: t.b } : { a: t.a, b: Math.max(index, t.a + 1) };
        trimRef.current = next;
        drawSel(next);
        setTrim(next);
      });
      marker.on("dragend", () => {
        el.classList.remove("drag");
        marker.setLngLat(coords[trimRef.current![side]]);
      });
      return marker;
    });
    return () => {
      handles.forEach((m) => m.remove());
      markersRef.current.forEach((m) => (m.getElement().style.visibility = ""));
      // Uscendo dalla pagina la mappa è già stata smontata: niente da ripristinare.
      try {
        removeRoute(map, "road-trim");
        upsertRoute(map, "road-detail", coords, { width: 6, color: "#111111", opacity: 1 });
      } catch {
        /* mappa già rimossa */
      }
    };
  }, [handle, detail, trimming]);

  const trimInfo = React.useMemo(() => {
    if (!trim || !detail) return null;
    const part: LatLng[] = detail.track.slice(trim.a, trim.b + 1).map((p) => [p[0], p[1]]);
    return {
      meters: pathLengthMeters(part),
      from: new Date(detail.track[trim.a][2]),
      to: new Date(detail.track[trim.b][2]),
    };
  }, [trim, detail]);

  const continueTrim = () => {
    if (!trim || !detail) return;
    const q = new URLSearchParams({
      session: detail.id,
      fromMs: String(detail.track[trim.a][2]),
      toMs: String(detail.track[trim.b][2]),
    });
    router.push(`${base}/percorsi/nuovo?${q}`);
  };

  const studentId = detail?.lesson.student?.id ?? null;
  const backLabel =
    from === "student" ? detail?.lesson.student?.name ?? "Allievo" : ROAD_VIEW_LABEL[from];
  const backHref =
    back ?? (from === "student" && studentId ? studentHref(locale, studentId) : roadViewHref(locale, from === "student" ? "history" : from));

  if (error && !detail) {
    return (
      <div className="py-16 text-center">
        <p className="text-[15px] text-[#222222]">{error}</p>
        <Link href={backHref} className="mt-3 inline-block text-[14px] font-semibold text-[#111111] underline">
          Torna indietro
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
      <style>{`
.road-trim-h{width:0;height:0;cursor:grab}
.road-trim-h b{position:absolute;left:-11px;top:-11px;width:22px;height:22px;border-radius:50%;background:#fff;border:5px solid #111;box-shadow:0 2px 8px rgba(0,0,0,.28);transition:transform 200ms ${EASE}}
.road-trim-h span{position:absolute;left:0;top:-38px;transform:translateX(-50%);height:26px;padding:0 10px;border-radius:13px;background:#111;color:#fff;font-size:12px;font-weight:600;display:grid;place-items:center;white-space:nowrap;font-family:inherit;pointer-events:none}
.road-trim-h.drag{cursor:grabbing}
.road-trim-h.drag b{transform:scale(1.2)}
.road-trim-card{animation:road-trim-in 240ms ${EASE} backwards}
@keyframes road-trim-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
`}</style>
      {/* REG-716: niente breadcrumb. Un solo ritorno e, se si arriva da una lista, su/giù. */}
      <div className="sticky top-0 z-[6] -mx-4 flex items-center justify-between gap-3 border-b border-[#ebebeb] bg-white/95 px-4 py-2 backdrop-blur-md sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
        <RoadBackLink href={backHref} label={backLabel} />
        {pos >= 0 && list.length > 1 ? (
          <div className="flex items-center gap-1.5" data-testid="road-detail-stepper">
            <span className="mr-1 hidden text-[13.5px] tabular-nums text-[#6a6a6a] sm:inline">
              {pos + 1} di {list.length}
            </span>
            <StepButton label="Guida prima nella lista (K)" disabled={!prevId} onClick={() => goTo(prevId)}>
              <ChevronUp className="size-4" strokeWidth={2.2} />
            </StepButton>
            <StepButton label="Guida dopo nella lista (J)" disabled={!nextId} onClick={() => goTo(nextId)}>
              <ChevronDown className="size-4" strokeWidth={2.2} />
            </StepButton>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 pb-5 pt-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[25px] font-semibold leading-tight tracking-[-0.6px] text-[#111111] sm:text-[28px]">
            {detail ? (
              <>
                {studentId ? (
                  <Link
                    href={studentHref(locale, studentId)}
                    onClick={rememberPrev}
                    data-testid="road-detail-student"
                    className="underline decoration-transparent decoration-[1.5px] underline-offset-4 transition-colors duration-200 hover:decoration-[#111111]"
                  >
                    {student}
                  </Link>
                ) : (
                  student
                )}{" "}
                <span className="block text-[18px] font-medium text-[#6a6a6a] sm:inline sm:text-[28px]">
                  con{" "}
                  {lesson?.instructor ? (
                    <Link
                      href={roadViewHref(locale, "history", { instructor: lesson.instructor.id })}
                      onClick={rememberPrev}
                      className="underline decoration-transparent decoration-[1.5px] underline-offset-4 transition-colors duration-200 hover:decoration-[#6a6a6a]"
                    >
                      {instructor}
                    </Link>
                  ) : (
                    instructor
                  )}
                </span>
              </>
            ) : (
              <span className="inline-block h-8 w-72 max-w-full animate-pulse rounded-lg bg-[#f2f2f2] align-middle" />
            )}
          </h1>
          <p className="mt-1 text-[14.5px] text-[#6a6a6a]">
            {detail ? (
              <>
                <RoadStatusChip kind={active ? "live" : detail.status === "abandoned" ? "auto" : "done"} />
                {" · "}
                {[
                  longDay(detail.startedAt),
                  `${hhmm(detail.startedAt)} – ${endIso ? hhmm(endIso) : "in corso"}`,
                  vehicle,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </>
            ) : (
              " "
            )}
          </p>
        </div>
        {detail ? (
          <div className="flex items-center gap-2">
            <Link
              href={`/${locale}/user/autoscuole?tab=agenda&date=${romeYmd(detail.lesson.startsAt)}`}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-[22px] bg-[#f2f2f2] px-[18px] text-[14.5px] font-semibold text-[#111111] transition-colors duration-200 hover:bg-[#e8e8e8] sm:flex-none"
            >
              <CalendarDays className="size-4" strokeWidth={1.9} />
              Apri in agenda
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Altre azioni"
                data-testid="road-detail-more"
                className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full bg-[#f2f2f2] text-[#111111] outline-none transition-colors duration-200 hover:bg-[#e8e8e8]"
              >
                <MoreHorizontal className="size-5" strokeWidth={1.9} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 rounded-[14px] p-1.5 shadow-dropdown">
                {isOwner && !active && detail.track.length >= 2 ? (
                  <DropdownMenuItem
                    data-testid="road-use-as-exam"
                    disabled={trimming}
                    onSelect={() => setTrim({ a: 0, b: detail.track.length - 1 })}
                    className="flex-col items-start gap-0.5 rounded-[10px] px-3 py-2.5"
                  >
                    <span className="text-[14.5px] font-medium text-[#111111]">Usa come percorso d&apos;esame</span>
                    <span className="text-[12.5px] text-[#6a6a6a]">Scegli il tratto sulla mappa</span>
                  </DropdownMenuItem>
                ) : null}
                {studentId ? (
                  <DropdownMenuItem asChild className="rounded-[10px] px-3 py-2.5 text-[14.5px] font-medium">
                    <Link href={roadViewHref(locale, "history", { student: studentId, days: "all" })} onClick={rememberPrev}>
                      Tutte le guide di {firstName(student)}
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                {studentId ? (
                  <DropdownMenuItem asChild className="rounded-[10px] px-3 py-2.5 text-[14.5px] font-medium">
                    <Link href={studentHref(locale, studentId)} onClick={rememberPrev}>
                      Scheda di {firstName(student)}
                    </Link>
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className={cn(ROAD_MAP_BOX_CLASS, "h-[340px] sm:h-[480px] lg:h-[calc(100vh-260px)] lg:min-h-[520px]")}>
          <div className="absolute inset-0">
          {/* MapLibre mette position:relative sul contenitore: niente absolute qui */}
          <div ref={containerRef} className="h-full w-full" />
        </div>
          {!handle ? <RoadMapFallback failed={failed} /> : null}
          {moving && editing ? (
            <div
              data-testid="road-move-banner"
              className="road-trim-card absolute left-1/2 top-3 z-[5] flex -translate-x-1/2 items-center gap-4 whitespace-nowrap rounded-2xl bg-[#111111] py-2.5 pl-[18px] pr-2.5 text-[14px] font-medium text-white shadow-[0_12px_24px_-10px_rgba(0,0,0,0.5)]"
            >
              Clicca sulla mappa dove va «{editing.label}»
              <button
                type="button"
                onClick={() => setMoving(false)}
                className="cursor-pointer rounded-xl bg-white/15 px-3 py-1.5 font-semibold transition-colors duration-200 hover:bg-white/25"
              >
                Annulla
              </button>
            </div>
          ) : null}
          {handle ? (
            <div className={trimming ? "max-sm:hidden" : undefined}>
              <ZoomControls onIn={() => handle.map.zoomIn()} onOut={() => handle.map.zoomOut()} />
            </div>
          ) : null}
          {trimming && trimInfo ? (
            <div
              data-testid="road-trim-card"
              className="road-trim-card absolute bottom-3 left-3 right-3 z-[4] rounded-[20px] bg-white px-[18px] py-4 shadow-[0_4px_24px_rgba(0,0,0,0.16)] sm:bottom-4 sm:left-4 sm:right-auto sm:w-[380px]"
            >
              <div className="flex items-baseline justify-between gap-3">
                <b className="text-[15.5px] font-semibold text-[#111111]">Scegli il tratto dell&apos;esame</b>
                <span className="shrink-0 text-[13px] tabular-nums text-[#6a6a6a]">
                  <b className="text-[17px] font-semibold text-[#111111]">{km(trimInfo.meters)}</b> km
                </span>
              </div>
              <p className="mt-1 text-[13.5px] leading-[1.45] text-[#6a6a6a]">
                <span className="tabular-nums">
                  {hhmm(trimInfo.from)} – {hhmm(trimInfo.to)}
                </span>
                <span className="max-sm:hidden"> · Trascina Inizio e Fine lungo il percorso, poi lo sistemi nell&apos;editor.</span>
                <span className="sm:hidden"> · Trascina Inizio e Fine.</span>
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setTrim(null)}
                  className="grid h-11 cursor-pointer place-items-center rounded-[22px] bg-[#f2f2f2] text-[14.5px] font-semibold text-[#111111] transition-colors duration-200 hover:bg-[#e8e8e8]"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  data-testid="road-trim-continue"
                  onClick={continueTrim}
                  className="grid h-11 cursor-pointer place-items-center rounded-[22px] bg-[#111111] text-[14.5px] font-semibold text-white transition-colors duration-200 hover:bg-[#2a2a2a]"
                >
                  Continua
                </button>
              </div>
            </div>
          ) : null}
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

          {detail?.plan?.stops.length ? (
            <RoadPlanBlock
              plan={detail.plan}
              reached={detail.planReached ?? null}
              hotspotFor={(stop) => (stop.source === "exam" ? null : hotspots.find(stop))}
              locale={locale}
            />
          ) : null}

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
                    "grid grid-cols-[26px_40px_minmax(0,1fr)_auto_auto] items-center gap-2.5 py-2.5",
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
                      <MarkerPlaceLinks
                        hotspot={m.sentiment === "good" ? null : hotspots.find(m)}
                        number={hotspots.number}
                        locale={locale}
                      />
                    </span>
                  </div>
                  <time className="text-[13.5px] tabular-nums text-[#6a6a6a]">{hhmm(m.recordedAt)}</time>
                  <button
                    type="button"
                    aria-label={`Modifica ${m.label}`}
                    aria-expanded={editingId === m.id}
                    onClick={() => {
                      setMoving(false);
                      setEditingId((cur) => (cur === m.id ? null : m.id));
                    }}
                    className={cn(
                      "grid size-[30px] cursor-pointer place-items-center rounded-full text-[#6a6a6a] transition-colors duration-200 hover:bg-[#f2f2f2] hover:text-[#111111]",
                      editingId === m.id && "bg-white text-[#111111] shadow-[0_0_0_1px_rgba(17,17,17,0.08)]",
                    )}
                    data-testid="road-marker-edit"
                  >
                    <MoreHorizontal className="size-4" strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {editing && detail ? (
            <RoadMarkerEditor
              key={editing.id}
              sessionId={detail.id}
              marker={editing}
              custom={customMarkers}
              moving={moving}
              onMove={() => setMoving((v) => !v)}
              onClose={() => {
                setMoving(false);
                setEditingId(null);
              }}
              onChanged={reloadDetail}
            />
          ) : null}

          {detail?.hotspotChecks?.length ? <RoadHotspotChecksBlock checks={detail.hotspotChecks} /> : null}

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

          {studentId ? (
            <Link
              href={roadViewHref(locale, "history", { student: studentId, days: "all" })}
              onClick={rememberPrev}
              data-testid="road-detail-student-history"
              className="flex items-center justify-between gap-3 rounded-[22px] border border-[#ebebeb] px-5 py-4 transition-colors duration-200 hover:bg-[#fafafa]"
            >
              <b className="text-[15px] font-semibold text-[#111111]">Le guide di {firstName(student)} in Road</b>
              <ChevronRight className="size-4 shrink-0 text-[#b0b0b0]" strokeWidth={2} />
            </Link>
          ) : null}

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

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-9 cursor-pointer place-items-center rounded-full border border-[#e4e4e4] bg-white text-[#111111] transition-colors duration-200 hover:bg-[#f4f4f4] disabled:cursor-default disabled:opacity-35 disabled:hover:bg-white"
    >
      {children}
    </button>
  );
}

const placeLinkClass =
  "font-medium text-[#111111] underline decoration-[#c8c8c8] underline-offset-[3px] transition-colors duration-200 hover:decoration-[#111111]";

/** REG-719: dove cade una segnalazione — il punto critico e i percorsi d'esame che ci passano. */
function MarkerPlaceLinks({
  hotspot,
  number,
  locale,
}: {
  hotspot: RoadHotspot | null;
  number: (key: string) => number;
  locale: string;
}) {
  if (!hotspot) return null;
  return (
    <>
      {" · "}
      <Link href={hotspotHref(locale, hotspot.key)} onClick={rememberPrev} className={placeLinkClass} data-testid="road-marker-hotspot">
        punto critico {number(hotspot.key)}
      </Link>
      {hotspot.examRoutes.map((r) => (
        <React.Fragment key={r.id}>
          {" · "}
          <Link href={`/${locale}/user/autoscuole/road/percorsi/${r.id}`} onClick={rememberPrev} className={placeLinkClass}>
            sul percorso d&apos;esame {r.name}
          </Link>
        </React.Fragment>
      ))}
    </>
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

/**
 * REG-677: i ripassi «Meglio / No» che l'istruttore ha toccato passando sui
 * punti critici dell'allievo, in ordine di tempo. Testo semplice, niente pillole.
 */
function RoadHotspotChecksBlock({ checks }: { checks: NonNullable<RoadDetail["hotspotChecks"]> }) {
  return (
    <div className="rounded-[22px] border border-[#ebebeb] px-5 py-[18px]" data-testid="road-detail-hotspot-checks">
      <h4 className="flex items-baseline justify-between text-[15.5px] font-semibold text-[#111111]">
        Ripassi sui punti critici
        <span className="text-[13px] font-medium text-[#6a6a6a]">in ordine di tempo</span>
      </h4>
      <div className="mt-1.5">
        {checks.map((c, i) => (
          <div
            key={c.id}
            className={cn(
              "grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-2.5 py-2.5",
              i > 0 && "border-t border-[#f2f2f2]",
            )}
          >
            <SymbolTile kind={c.kind} size={40} />
            <div className="min-w-0">
              <b className="block truncate text-[14.5px] font-medium text-[#111111]">{c.label}</b>
              <time className="text-[13px] tabular-nums text-[#6a6a6a]">{hhmm(c.recordedAt)}</time>
            </div>
            <span className={cn("text-[13.5px]", c.outcome === "better" ? "font-medium text-[#111111]" : "text-[#6a6a6a]")}>
              {c.outcome === "better" ? "Meglio" : "Ancora no"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * REG-651: il giro proposto alla partenza, con le tappe raggiunte. L'esito lo
 * calcola il server a «Termina guida» (tracciato entro 40 m, percorso d'esame
 * coperto al 60%): finché la guida è in corso le tappe non hanno ancora esito.
 */
type PlanStopItem = NonNullable<RoadDetail["plan"]>["stops"][number];

function RoadPlanBlock({
  plan,
  reached,
  hotspotFor,
  locale,
}: {
  plan: NonNullable<RoadDetail["plan"]>;
  reached: NonNullable<RoadDetail["planReached"]> | null;
  hotspotFor: (stop: PlanStopItem) => RoadHotspot | null;
  locale: string;
}) {
  const done = reached ? reached.reached.length : null;
  return (
    <div className="rounded-[22px] border border-[#ebebeb] px-5 py-[18px]" data-testid="road-detail-plan">
      <h4 className="flex items-baseline justify-between text-[15.5px] font-semibold text-[#111111]">
        Giro
        <span className="text-[13px] font-medium text-[#6a6a6a]">
          {done == null
            ? `${plan.stops.length} ${plan.stops.length === 1 ? "tappa" : "tappe"} · circa ${plan.minutes} min`
            : `${done} ${done === 1 ? "tappa raggiunta" : "tappe raggiunte"} su ${reached!.total}`}
        </span>
      </h4>
      <div className="mt-1.5">
        {plan.stops.map((stop, i) => {
          const ok = reached?.reached.includes(stop.key) ?? null;
          return (
            <div
              key={stop.key}
              data-testid="road-detail-plan-stop"
              className={cn(
                "grid grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-2.5 py-2.5",
                i > 0 && "border-t border-[#f2f2f2]",
              )}
            >
              <div
                className={cn(
                  "grid size-6 place-items-center rounded-full text-xs font-semibold",
                  ok === false ? "bg-[#f2f2f2] text-[#6a6a6a]" : "bg-[#111111] text-white",
                )}
              >
                {i + 1}
              </div>
              <div className="min-w-0">
                <StopTitle stop={stop} hotspot={hotspotFor(stop)} locale={locale} />
                <span className="text-[13px] text-[#6a6a6a]">{stop.reason}</span>
              </div>
              {ok == null ? null : (
                <span className={cn("text-[13.5px]", ok ? "font-medium text-[#111111]" : "text-[#6a6a6a]")}>
                  {ok ? "Raggiunta" : "Non raggiunta"}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Titolo della tappa del giro: porta al punto critico o al percorso d'esame (REG-719). */
function StopTitle({ stop, hotspot, locale }: { stop: PlanStopItem; hotspot: RoadHotspot | null; locale: string }) {
  const examId = stop.source === "exam" && stop.key.startsWith("exam:") ? stop.key.slice(5) : null;
  const href = examId ? `/${locale}/user/autoscuole/road/percorsi/${examId}` : hotspot ? hotspotHref(locale, hotspot.key) : null;
  const cls = "block truncate text-[14.5px] font-medium text-[#111111]";
  if (!href) return <b className={cls}>{stop.title}</b>;
  return (
    <Link
      href={href}
      onClick={rememberPrev}
      data-testid="road-plan-stop-link"
      className={cn(cls, "underline decoration-[#c8c8c8] underline-offset-[3px] transition-colors duration-200 hover:decoration-[#111111]")}
    >
      {stop.title}
    </Link>
  );
}
