"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";

import { roadApi, type RoadHistoryItem } from "@/lib/autoscuole/road/client";
import { getAutoscuolaInstructors, getAutoscuolaStudentsList } from "@/lib/actions/autoscuole.actions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingDots } from "@/components/ui/loading-dots";
import {
  Car3D,
  durationMin,
  hhmm,
  initials,
  instructorTint,
  km,
  MarkerPill,
  shortDay,
} from "./road-ui";

const PAGE = 20;
const ALL = "all";

const PERIODS = [
  { value: "7", label: "Ultimi 7 giorni" },
  { value: "30", label: "Ultimi 30 giorni" },
  { value: "90", label: "Ultimi 3 mesi" },
  { value: ALL, label: "Da sempre" },
] as const;

type Option = { value: string; label: string };

/**
 * «Storico»: guide registrate con Road (chiuse), dalla più recente. Filtri
 * istruttore / allievo / periodo, «Carica altre» a cursore.
 */
export function RoadHistoryView({ onOpen }: { onOpen: (sessionId: string) => void }) {
  const [instructorId, setInstructorId] = React.useState(ALL);
  const [studentId, setStudentId] = React.useState(ALL);
  const [period, setPeriod] = React.useState<string>("30");
  const [items, setItems] = React.useState<RoadHistoryItem[] | null>(null);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [instructors, setInstructors] = React.useState<Option[]>([]);
  const [students, setStudents] = React.useState<Option[]>([]);

  React.useEffect(() => {
    void getAutoscuolaInstructors().then((res) => {
      if (res.success && res.data) {
        setInstructors(res.data.map((i) => ({ value: i.id, label: i.name })));
      }
    });
    void getAutoscuolaStudentsList().then((res) => {
      if (res.success) {
        setStudents(
          [...res.data]
            .sort((a, b) => a.name.localeCompare(b.name, "it"))
            .map((s) => ({ value: s.id, label: s.name })),
        );
      }
    });
  }, []);

  const params = React.useMemo(() => {
    const from = period === ALL ? null : new Date(Date.now() - Number(period) * 86400000).toISOString();
    return {
      from,
      instructorId: instructorId === ALL ? null : instructorId,
      studentId: studentId === ALL ? null : studentId,
      limit: PAGE,
    };
  }, [period, instructorId, studentId]);

  React.useEffect(() => {
    const ctrl = new AbortController();
    setItems(null);
    setError(null);
    roadApi
      .history(params, ctrl.signal)
      .then((res) => {
        setItems(res.items);
        setCursor(res.nextCursor);
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Impossibile caricare lo storico.");
      });
    return () => ctrl.abort();
  }, [params]);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const res = await roadApi.history({ ...params, cursor });
      setItems((cur) => [...(cur ?? []), ...res.items]);
      setCursor(res.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossibile caricare lo storico.");
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="rounded-[24px] border border-[#ebebeb] px-4 pb-4 pt-5 leading-[1.25]" data-testid="road-history">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1.5 pb-3">
        <b className="text-lg font-semibold tracking-[-0.3px] text-[#111111]">Storico</b>
        <div className="flex flex-wrap gap-2">
          <FilterSelect value={instructorId} onChange={setInstructorId} allLabel="Tutti gli istruttori" options={instructors} />
          <FilterSelect value={studentId} onChange={setStudentId} allLabel="Tutti gli allievi" options={students} />
          <FilterSelect value={period} onChange={setPeriod} options={[...PERIODS]} />
        </div>
      </div>

      {!items && !error ? (
        <div className="grid gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[76px] animate-pulse rounded-[20px] bg-[#f7f7f7]" />
          ))}
        </div>
      ) : null}
      {error ? <p className="px-1.5 pb-3 text-[13.5px] text-[#6a6a6a]">{error}</p> : null}
      {items && items.length === 0 ? (
        <p className="px-1.5 pb-3 text-[14px] text-[#6a6a6a]">
          Nessuna guida registrata con Road con questi filtri.
        </p>
      ) : null}

      {items && items.length ? (
        <div className="grid">
          {items.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onOpen(s.id)}
              data-testid="road-history-row"
              className="grid cursor-pointer grid-cols-[96px_64px_minmax(0,1fr)_auto] items-center gap-4 rounded-[20px] py-3 pl-2.5 pr-3.5 text-left transition-colors hover:bg-[#fafafa] md:grid-cols-[96px_64px_minmax(0,1fr)_auto_20px]"
            >
              <div className="text-sm font-semibold text-[#111111]">
                {shortDay(s.startedAt)}
                <span className="block text-[12.5px] font-normal tabular-nums text-[#6a6a6a]">
                  {hhmm(s.startedAt)}
                  {s.endedAt ? ` – ${hhmm(s.endedAt)}` : ""}
                </span>
              </div>
              <Car3D color={s.lesson.carColor} tint={instructorTint(s.lesson.instructor)} label={initials(s.lesson.instructor?.name)} />
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold tracking-[-0.2px] text-[#111111]">
                  {s.lesson.student?.name ?? "Allievo"}
                </div>
                <div className="mt-px truncate text-[13.5px] text-[#444444]">
                  {[`con ${s.lesson.instructor?.name ?? "istruttore"}`, s.lesson.vehicle?.name].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div className="flex items-center justify-end gap-3">
                <span className="hidden text-[13px] tabular-nums text-[#6a6a6a] sm:inline">
                  {durationMin(s.durationSec)} min
                </span>
                <span className="text-sm font-semibold tabular-nums text-[#111111]">{km(s.distanceMeters)} km</span>
                <MarkerPill count={s.markerCount} kinds={s.markerKinds} />
              </div>
              <div className="hidden md:block">
                <ChevronRight className="size-4 text-[#b0b0b0]" strokeWidth={2} />
              </div>
            </button>
          ))}
        </div>
      ) : null}

      {cursor ? (
        <div className="flex justify-center pt-3">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="grid h-11 min-w-[150px] cursor-pointer place-items-center rounded-[22px] bg-[#f2f2f2] px-[18px] text-[14.5px] font-semibold text-[#111111] transition-colors hover:bg-[#e8e8e8] disabled:cursor-default"
          >
            {loadingMore ? <LoadingDots /> : "Carica altre"}
          </button>
        </div>
      ) : null}
    </div>
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
      <SelectTrigger className="h-9 w-auto min-w-[150px] max-w-[220px] gap-2 rounded-full border-[#dddddd] bg-white px-3.5 text-[13.5px] font-medium text-[#222222]">
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
