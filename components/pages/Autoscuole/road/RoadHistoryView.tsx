"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { roadApi, type RoadHistoryItem } from "@/lib/autoscuole/road/client";
import { getAutoscuolaInstructors, getAutoscuolaStudentsList } from "@/lib/actions/autoscuole.actions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingDots } from "@/components/ui/loading-dots";
import { cn } from "@/lib/utils";
import {
  Car3D,
  durationMin,
  hhmm,
  initials,
  instructorTint,
  km,
  MarkerPill,
  shortDay,
  roadSessionName,
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

const PERIOD_VALUES: string[] = PERIODS.map((p) => p.value);

/**
 * «Storico»: guide registrate con Road (chiuse), dalla più recente. Filtri
 * istruttore / allievo / periodo, «Carica altre» a cursore. REG-716: i filtri
 * stanno nell'URL (`instructor`, `student`, `days`), così ci si arriva già
 * filtrati (dalla scheda allievo, dal dettaglio guida) e il ritorno li ritrova.
 */
export function RoadHistoryView({ onOpen }: { onOpen: (sessionId: string, list: string[]) => void }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const instructorId = searchParams.get("instructor") || ALL;
  const studentId = searchParams.get("student") || ALL;
  const daysParam = searchParams.get("days");
  const period = daysParam && PERIOD_VALUES.includes(daysParam) ? daysParam : "30";
  const setFilter = (key: "instructor" | "student" | "days", value: string) => {
    const q = new URLSearchParams(searchParams.toString());
    const isDefault = key === "days" ? value === "30" : value === ALL;
    if (isDefault) q.delete(key);
    else q.set(key, value);
    router.replace(`${pathname}?${q}`, { scroll: false });
  };
  const setInstructorId = (v: string) => setFilter("instructor", v);
  const setStudentId = (v: string) => setFilter("student", v);
  const setPeriod = (v: string) => setFilter("days", v);
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

  const filtered = studentId !== ALL || instructorId !== ALL;
  const totals = React.useMemo(() => {
    if (!items?.length) return null;
    const meters = items.reduce((a, s) => a + s.distanceMeters, 0);
    const bad = items.reduce((a, s) => a + (s.markerBad ?? 0), 0);
    return { count: items.length, meters, bad };
  }, [items]);
  const ids = React.useMemo(() => (items ?? []).map((s) => s.id), [items]);

  return (
    <div className="leading-[1.25]" data-testid="road-history">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
        <div className="-mx-4 flex w-[calc(100%+2rem)] gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
          <FilterSelect value={instructorId} onChange={setInstructorId} allLabel="Tutti gli istruttori" options={instructors} />
          <FilterSelect value={studentId} onChange={setStudentId} allLabel="Tutti gli allievi" options={students} />
          <FilterSelect value={period} onChange={setPeriod} options={[...PERIODS]} />
        </div>
        {filtered && totals && !cursor ? (
          <span className="text-[13.5px] tabular-nums text-[#6a6a6a]" data-testid="road-history-totals">
            {totals.count === 1 ? "1 guida" : `${totals.count} guide`} · {km(totals.meters)} km
            {totals.bad ? ` · ${totals.bad} da migliorare` : ""}
          </span>
        ) : null}
      </div>

      {!items && !error ? (
        <div className="grid gap-2 border-t border-[#ebebeb] pt-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[76px] animate-pulse rounded-[20px] bg-[#f7f7f7]" />
          ))}
        </div>
      ) : null}
      {error ? <p className="pb-3 text-[13.5px] text-[#6a6a6a]">{error}</p> : null}
      {items && items.length === 0 ? (
        <p className="border-t border-[#ebebeb] pt-5 text-[14px] text-[#6a6a6a]">
          Nessuna guida registrata con Road con questi filtri.
        </p>
      ) : null}

      {items && items.length ? (
        <div className="grid border-t border-[#ebebeb]">
          {items.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onOpen(s.id, ids)}
              data-testid="road-history-row"
              className="grid cursor-pointer grid-cols-[64px_minmax(0,1fr)_16px] items-center gap-x-3 gap-y-1 border-b border-[#f0f0f0] py-3.5 pl-1 pr-1 text-left transition-colors duration-200 hover:bg-[#fafafa] md:grid-cols-[96px_64px_minmax(0,1fr)_auto_20px] md:gap-4 md:rounded-[16px] md:border-b-0 md:py-3 md:pl-2.5 md:pr-3.5"
            >
              <div className="hidden text-sm font-semibold text-[#111111] md:block">
                {shortDay(s.startedAt)}
                <span className="block text-[12.5px] font-normal tabular-nums text-[#6a6a6a]">
                  {hhmm(s.startedAt)}
                  {s.endedAt ? ` – ${hhmm(s.endedAt)}` : ""}
                </span>
              </div>
              <div className="self-start pt-0.5 md:self-auto md:pt-0">
                <Car3D color={s.lesson.carColor} tint={instructorTint(s.lesson.instructor)} label={initials(s.lesson.instructor?.name)} />
              </div>
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold tracking-[-0.2px] text-[#111111]" data-testid="road-history-student">
                  {roadSessionName(s.lesson)}
                </div>
                <div className="mt-px truncate text-[13.5px] text-[#444444]">
                  {[`con ${s.lesson.instructor?.name ?? "istruttore"}`, s.lesson.vehicle?.name].filter(Boolean).join(" · ")}
                </div>
                {/* A 390 px data, km e segnalazioni vanno in una riga sotto il nome. */}
                <div className="mt-1 flex min-w-0 items-center gap-2 text-[13px] tabular-nums text-[#6a6a6a] md:hidden">
                  <span className="shrink-0">
                    {shortDay(s.startedAt)} · {hhmm(s.startedAt)}
                  </span>
                  <b className="shrink-0 font-semibold text-[#111111]">{km(s.distanceMeters)} km</b>
                  <span className="min-w-0 truncate">
                    <MarkerPill count={s.markerCount} kinds={s.markerKinds} good={s.markerGood} bad={s.markerBad} />
                  </span>
                </div>
              </div>
              <div className="hidden items-center justify-end gap-3 md:flex">
                <span className="text-[13px] tabular-nums text-[#6a6a6a]">{durationMin(s.durationSec)} min</span>
                <span className="text-sm font-semibold tabular-nums text-[#111111]">{km(s.distanceMeters)} km</span>
                <MarkerPill count={s.markerCount} kinds={s.markerKinds} good={s.markerGood} bad={s.markerBad} />
              </div>
              <ChevronRight className="size-4 text-[#b0b0b0]" strokeWidth={2} />
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
      <SelectTrigger
        className={cn(
          "h-10 w-auto min-w-[150px] max-w-[220px] shrink-0 gap-2 rounded-full bg-white px-3.5 text-[13.5px] font-medium text-[#222222]",
          allLabel && value !== ALL ? "border-[#111111] font-semibold" : "border-[#dddddd]",
        )}
      >
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
