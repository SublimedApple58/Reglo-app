"use client";

/**
 * Agenda in **scope Consorzio** di un'autoscuola consorziata senza Reglo
 * (REG-429, Fase 7).
 *
 * È l'unica sezione operativa della vista ridotta: da qui la scuola chiede una
 * guida al consorzio e segue cosa ne è stato. La griglia è quella dell'agenda
 * vera (stessa gutter oraria, stesse colonne giorno × istruttore, stessi
 * 1,2 px al minuto), ma i blocchi sono solo due cose:
 *
 * - le **proprie richieste**, nei quattro stati (in attesa, confermata,
 *   rifiutata, annullata);
 * - gli **slot già occupati** dal consorzio — grigi, senza nome e senza tipo.
 *   Servono a non chiedere uno slot impossibile; chi ci sia dentro è affare
 *   del consorzio e delle altre consorziate (`getAffiliateAgenda` seleziona
 *   tre campi proprio per questo).
 *
 * Lo scope "Autoscuola" — l'agenda propria — è la funzione non comprata: lì
 * c'è la card del lucchetto.
 */

import * as React from "react";
import { ChevronLeft, ChevronRight, Plus, Search, X } from "lucide-react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { PageWrapper } from "@/components/Layout/PageWrapper";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedPill } from "@/components/ui/segmented-pill";
import { Input } from "@/components/ui/input";
import { LoadingDots } from "@/components/ui/loading-dots";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { DatePickerInput } from "@/components/ui/date-picker";
import { TimePickerInput } from "@/components/ui/time-picker";
import { cn } from "@/lib/utils";
import {
  cancelAffiliateGuideRequest,
  createAffiliateStudent,
  getAffiliateAgenda,
  listAffiliateStudents,
  sendAffiliateGuideRequest,
  type AffiliateAgendaData,
  type AffiliateGuideRequestRow,
  type AffiliateStudent,
} from "@/lib/actions/affiliate.actions";
import { LockedSection, LOCKED_SECTIONS } from "./LockedSection";
import { LOCKED_MENU_ITEMS } from "./locked-features";

/* ── Griglia: stesse costanti dell'agenda vera ───────────────────────── */

const DAY_START_HOUR = 7;
const DAY_END_HOUR = 21;
const PIXELS_PER_MINUTE = 1.2;
const TOTAL_MINUTES = (DAY_END_HOUR - DAY_START_HOUR) * 60;
const GRID_HEIGHT = TOTAL_MINUTES * PIXELS_PER_MINUTE;
const DURATIONS = [30, 45, 60, 90, 120];

const pad = (n: number) => String(n).padStart(2, "0");
const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};
const startOfWeek = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  // Lunedì come primo giorno, come nell'agenda vera.
  next.setDate(next.getDate() - ((next.getDay() + 6) % 7));
  return next;
};
const formatYmd = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const shortDate = (date: Date) =>
  date.toLocaleDateString("it-IT", { day: "numeric", month: "short" });

/** Minuti dall'inizio della griglia; null se lo slot cade fuori dalla fascia. */
const offsetMinutes = (iso: string) => {
  const date = new Date(iso);
  return date.getHours() * 60 + date.getMinutes() - DAY_START_HOUR * 60;
};

/* ── Stati delle richieste, con i colori del prototipo ───────────────── */

const REQUEST_STYLES: Record<
  AffiliateGuideRequestRow["status"],
  { label: string; className: string; nameClassName: string }
> = {
  pending: {
    label: "In attesa",
    className: "border-[1.5px] border-dashed border-[#e0b93a] bg-[#fdf3d4]",
    nameClassName: "text-[#8a6d0b]",
  },
  accepted: {
    label: "Confermata",
    className: "border border-[#bde5cb] bg-[#e7f6ec]",
    nameClassName: "text-[#177e45]",
  },
  rejected: {
    label: "Rifiutata",
    className: "border border-[#f3c6c6] bg-[#fdeaea]",
    nameClassName: "text-[#b3261e]",
  },
  cancelled: {
    label: "Annullata",
    className: "border border-[#e2e2e2] bg-[#f1f1f1]",
    nameClassName: "text-[#8a8a8a] line-through",
  },
};

/* ── Menu "+" — solo Richieste, il resto col lucchetto ───────────────── */

function NewMenu({ onRichiesta }: { onRichiesta: () => void }) {
  const [open, setOpen] = React.useState(false);
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          title="Nuovo"
          className="flex size-[38px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#222222] text-white transition-opacity hover:opacity-90"
        >
          <Plus className="size-[18px]" strokeWidth={2.2} />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          sideOffset={10}
          className="z-[60] w-[260px] rounded-[18px] border border-[#ececec] bg-white p-2 shadow-dropdown outline-none"
        >
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onRichiesta();
            }}
            className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-medium text-foreground transition-colors hover:bg-[#f4f4f4]"
          >
            <CalendarPlusIcon />
            Richieste
          </button>
          <div className="my-1.5 h-px bg-[#f0f0f0]" />
          {LOCKED_MENU_ITEMS.map((item, index) => (
            <React.Fragment key={item.label}>
              {index === LOCKED_MENU_ITEMS.length - 1 && (
                <div className="my-1.5 h-px bg-[#f0f0f0]" />
              )}
              <div
                className="flex cursor-default items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium text-[#9a9a9a]"
                title="Funzione extra di Reglo"
              >
                {item.icon}
                {item.label}
                <span className="ml-auto flex shrink-0 items-center">
                  <MiniPadlock />
                </span>
              </div>
            </React.Fragment>
          ))}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function MiniPadlock() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#bdbdbd" strokeWidth={2.1} strokeLinecap="round" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function CalendarPlusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#222222" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M8 3v4M16 3v4M3 10h18M12 14v4M10 16h4" />
    </svg>
  );
}

/* ── Pagina ──────────────────────────────────────────────────────────── */

type Scope = "consorzio" | "autoscuola";
type ViewMode = "week" | "day";

export function AffiliateAgendaPage() {
  const toast = useFeedbackToast();
  const [scope, setScope] = React.useState<Scope>("consorzio");
  const [viewMode, setViewMode] = React.useState<ViewMode>("week");
  const [anchor, setAnchor] = React.useState(() => startOfWeek(new Date()));
  const [dayFocus, setDayFocus] = React.useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });
  const [data, setData] = React.useState<AffiliateAgendaData | null>(null);
  const [loading, setLoading] = React.useState(true);

  const days = React.useMemo(
    () =>
      viewMode === "day"
        ? [dayFocus]
        : Array.from({ length: 7 }, (_, index) => addDays(anchor, index)),
    [viewMode, anchor, dayFocus],
  );

  const range = React.useMemo(() => {
    const from = new Date(days[0]);
    from.setHours(0, 0, 0, 0);
    const to = addDays(new Date(days[days.length - 1]), 1);
    to.setHours(0, 0, 0, 0);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [days]);

  const load = React.useCallback(async () => {
    const res = await getAffiliateAgenda(range);
    if (res.success) setData(res.data);
    else toast.error({ description: res.message });
    setLoading(false);
    // toast è stabile (useMemo su un hook), tenerlo qui rifarebbe il fetch
    // a ogni render del provider
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  React.useEffect(() => {
    void load();
  }, [load]);

  /* ── Dialogo "Richiesta di guida" ── */
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const todayCount = React.useMemo(() => {
    if (!data) return 0;
    const today = formatYmd(new Date());
    return data.requests.filter(
      (request) =>
        request.status === "accepted" && formatYmd(new Date(request.startsAt)) === today,
    ).length;
  }, [data]);
  const pendingCount = data?.requests.filter((r) => r.status === "pending").length ?? 0;

  if (scope === "autoscuola") {
    return (
      <PageWrapper title="Agenda" subTitle="Agenda guide ed esami." hideHero>
        <div className="mx-auto w-full max-w-7xl space-y-5">
          <PageHeader title="Agenda" subtitle={["La tua agenda arriva con Reglo"]} />
          <Toolbar
            scope={scope}
            onScope={setScope}
            viewMode={viewMode}
            onViewMode={setViewMode}
            label=""
            onPrev={() => undefined}
            onNext={() => undefined}
            onNuovo={() => undefined}
            hideNav
          />
          <LockedSection {...LOCKED_SECTIONS.agenda} />
        </div>
      </PageWrapper>
    );
  }

  const rangeLabel =
    viewMode === "day"
      ? dayFocus.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "short" })
      : `${shortDate(days[0])} - ${shortDate(days[6])}`;

  return (
    <PageWrapper title="Agenda" subTitle="Richieste di guida al consorzio." hideHero>
      <div className="mx-auto w-full max-w-7xl space-y-5">
        <PageHeader
          title="Agenda"
          subtitle={[
            `${todayCount} guide col consorzio oggi`,
            `${pendingCount} richieste in attesa`,
          ]}
        />

        <Toolbar
          scope={scope}
          onScope={setScope}
          viewMode={viewMode}
          onViewMode={setViewMode}
          label={rangeLabel}
          onPrev={() =>
            viewMode === "day"
              ? setDayFocus((prev) => addDays(prev, -1))
              : setAnchor((prev) => addDays(prev, -7))
          }
          onNext={() =>
            viewMode === "day"
              ? setDayFocus((prev) => addDays(prev, 1))
              : setAnchor((prev) => addDays(prev, 7))
          }
          onNuovo={() => setDialogOpen(true)}
        />

        {data?.schoolSuspended && (
          <div className="rounded-[14px] border border-[#f3c6c6] bg-[#fdeaea] px-4 py-3 text-[13.5px] font-medium text-[#b3261e]">
            La tua autoscuola è sospesa dal consorzio: non puoi inviare nuove richieste.
          </div>
        )}

        <AgendaGrid days={days} data={data} loading={loading} onCancel={load} />

        <p className="text-[12.5px] leading-relaxed text-[#929292]">
          I blocchi grigi sono slot già occupati dal consorzio: vedi quando è pieno, non chi c&apos;è
          dentro. Il consorzio può accettare la richiesta, rifiutarla o proporti un altro orario.
        </p>
      </div>

      {dialogOpen && data && (
        <GuideRequestDialog
          data={data}
          onClose={() => setDialogOpen(false)}
          onSent={() => {
            setDialogOpen(false);
            void load();
          }}
        />
      )}
    </PageWrapper>
  );
}

/* ── Toolbar ─────────────────────────────────────────────────────────── */

function Toolbar({
  scope,
  onScope,
  viewMode,
  onViewMode,
  label,
  onPrev,
  onNext,
  onNuovo,
  hideNav = false,
}: {
  scope: Scope;
  onScope: (value: Scope) => void;
  viewMode: ViewMode;
  onViewMode: (value: ViewMode) => void;
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onNuovo: () => void;
  hideNav?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {!hideNav && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPrev}
            className="flex size-[30px] cursor-pointer items-center justify-center rounded-full text-[#555] transition-colors hover:bg-[#f2f2f2]"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-[130px] select-none text-center text-[15px] font-semibold text-foreground">
            {label}
          </span>
          <button
            type="button"
            onClick={onNext}
            className="flex size-[30px] cursor-pointer items-center justify-center rounded-full text-[#555] transition-colors hover:bg-[#f2f2f2]"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
      <SegmentedPill
        value={scope}
        onChange={onScope}
        options={[
          { value: "consorzio", label: "Consorzio" },
          { value: "autoscuola", label: "Autoscuola" },
        ]}
      />
      <SegmentedPill
        value={viewMode}
        onChange={onViewMode}
        options={[
          { value: "week", label: "Settimana" },
          { value: "day", label: "Giorno" },
        ]}
      />
      <div className="min-w-2 flex-1" />
      {!hideNav && <NewMenu onRichiesta={onNuovo} />}
    </div>
  );
}

/* ── Griglia ─────────────────────────────────────────────────────────── */

function AgendaGrid({
  days,
  data,
  loading,
  onCancel,
}: {
  days: Date[];
  data: AffiliateAgendaData | null;
  loading: boolean;
  onCancel: () => void;
}) {
  const hourMarks = Array.from(
    { length: DAY_END_HOUR - DAY_START_HOUR + 1 },
    (_, index) => DAY_START_HOUR + index,
  );
  const instructors = data?.instructors ?? [];
  // Senza istruttori (consorzio appena nato) resta una colonna per giorno:
  // le richieste devono potersi comunque vedere.
  const columns = instructors.length ? instructors : [{ id: "__none__", name: "Consorzio" }];
  const totalCols = columns.length * days.length;
  const today = formatYmd(new Date());

  if (loading) {
    return <div className="h-[420px] w-full animate-pulse rounded-[18px] bg-[#f6f6f6]" />;
  }

  return (
    <div className="overflow-hidden rounded-[18px] border border-[#ececec] bg-white">
      <div className="overflow-auto">
        <div
          className="min-w-max"
          style={{
            display: "grid",
            gridTemplateColumns: `56px repeat(${totalCols}, minmax(86px, 1fr))`,
          }}
        >
          {/* Intestazione: giorno + colonne istruttore */}
          <div className="sticky left-0 z-20 row-span-2 border-b border-[#ececec] bg-white" />
          {days.map((day) => {
            const isToday = formatYmd(day) === today;
            return (
              <div
                key={`hdr-${day.toISOString()}`}
                className={cn(
                  "flex h-[52px] flex-col items-center justify-center gap-px border-b border-l border-[#eeeeee]",
                  isToday ? "bg-[#fafafa]" : "bg-white",
                )}
                style={{ gridColumn: `span ${columns.length}` }}
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.5px] text-[#aaaaaa]">
                  {day.toLocaleDateString("it-IT", { weekday: "short" })}
                </span>
                <span
                  className={cn(
                    "flex size-[26px] items-center justify-center rounded-full text-[13px] font-bold",
                    isToday ? "bg-[#222222] text-white" : "text-foreground",
                  )}
                >
                  {day.getDate()}
                </span>
              </div>
            );
          })}
          {days.map((day) =>
            columns.map((column, index) => (
              <div
                key={`sub-${day.toISOString()}-${column.id}`}
                className={cn(
                  "flex min-w-0 items-center justify-center border-b border-l py-1.5",
                  index === 0 ? "border-l-[#dddddd]" : "border-l-[#f0f0f0]",
                  "border-b-[#ececec]",
                )}
              >
                <span className="block w-0 min-w-full truncate px-1 text-center text-[9.5px] font-medium text-muted-foreground">
                  {column.name.split(" ")[0]}
                </span>
              </div>
            )),
          )}

          {/* Gutter oraria */}
          <div
            className="sticky left-0 z-20 border-r border-[#eeeeee] bg-[#fafafa]"
            style={{ height: GRID_HEIGHT }}
          >
            {hourMarks.map((hour) => (
              <div
                key={hour}
                className="absolute left-0 right-0 flex items-start"
                style={{ top: (hour - DAY_START_HOUR) * 60 * PIXELS_PER_MINUTE }}
              >
                <span className="w-full pr-2 text-right text-[11px] font-semibold leading-none text-[#525252]">
                  {`${pad(hour)}:00`}
                </span>
              </div>
            ))}
          </div>

          {/* Colonne */}
          {days.map((day) =>
            columns.map((column, index) => {
              const dayKey = formatYmd(day);
              const busy = (data?.busy ?? []).filter(
                (slot) =>
                  formatYmd(new Date(slot.startsAt)) === dayKey &&
                  (columns.length === 1 || (slot.instructorId ?? "__none__") === column.id),
              );
              const requests = (data?.requests ?? []).filter((request) => {
                if (formatYmd(new Date(request.startsAt)) !== dayKey) return false;
                if (columns.length === 1) return true;
                // Una richiesta ancora in attesa non ha istruttore: si appoggia
                // alla prima colonna, che è dove la scuola la va a cercare.
                return request.instructorId
                  ? request.instructorId === column.id
                  : index === 0;
              });

              return (
                <div
                  key={`col-${day.toISOString()}-${column.id}`}
                  className={cn(
                    "relative overflow-hidden border-l",
                    index === 0 ? "border-[#dddddd]" : "border-[#f0f0f0]",
                  )}
                  style={{ height: GRID_HEIGHT }}
                >
                  {hourMarks.map((hour) => (
                    <div
                      key={hour}
                      className="absolute left-0 right-0 h-px bg-[#f1f1f1]"
                      style={{ top: (hour - DAY_START_HOUR) * 60 * PIXELS_PER_MINUTE }}
                    />
                  ))}

                  {busy.map((slot) => {
                    const start = offsetMinutes(slot.startsAt);
                    const minutes = Math.max(
                      20,
                      (new Date(slot.endsAt).getTime() - new Date(slot.startsAt).getTime()) / 60000,
                    );
                    if (start + minutes <= 0 || start >= TOTAL_MINUTES) return null;
                    return (
                      <div
                        key={`${slot.startsAt}-${slot.instructorId ?? "x"}`}
                        className="absolute inset-x-1 rounded-[10px] bg-[#ececec] px-2 py-1.5"
                        style={{
                          top: Math.max(0, start) * PIXELS_PER_MINUTE,
                          height: minutes * PIXELS_PER_MINUTE - 2,
                        }}
                        title="Slot occupato dal consorzio"
                      >
                        <span className="text-[9.5px] font-bold uppercase tracking-[0.4px] text-[#9a9a9a]">
                          Occupato
                        </span>
                      </div>
                    );
                  })}

                  {requests.map((request) => (
                    <RequestBlock key={request.id} request={request} onCancelled={onCancel} />
                  ))}
                </div>
              );
            }),
          )}
        </div>
      </div>
    </div>
  );
}

function RequestBlock({
  request,
  onCancelled,
}: {
  request: AffiliateGuideRequestRow;
  onCancelled: () => void;
}) {
  const toast = useFeedbackToast();
  const [busy, setBusy] = React.useState(false);
  const style = REQUEST_STYLES[request.status];
  const start = offsetMinutes(request.startsAt);
  if (start + request.durationMinutes <= 0 || start >= TOTAL_MINUTES) return null;

  const cancel = async () => {
    setBusy(true);
    const res = await cancelAffiliateGuideRequest(request.id);
    setBusy(false);
    if (!res.success) {
      toast.error({ description: res.message });
      return;
    }
    toast.success({ description: "Richiesta annullata." });
    onCancelled();
  };

  return (
    <div
      className={cn("group absolute inset-x-1 rounded-[10px] px-2 py-1.5", style.className)}
      style={{
        top: Math.max(0, start) * PIXELS_PER_MINUTE,
        height: request.durationMinutes * PIXELS_PER_MINUTE - 2,
      }}
      title={`${style.label} · ${new Date(request.startsAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} · ${request.durationMinutes} min${request.vehicleName ? ` · ${request.vehicleName}` : ""}`}
    >
      <p className={cn("truncate text-[9.5px] font-bold uppercase tracking-[0.4px]", style.nameClassName)}>
        {style.label}
      </p>
      <p className={cn("truncate text-[12.5px] font-semibold", style.nameClassName)}>
        {request.studentName}
      </p>
      {request.moved && request.status === "accepted" && (
        <p className="mt-0.5 truncate text-[10px] font-medium text-[#177e45]">Spostata</p>
      )}
      {request.proposedStartsAt && request.status === "pending" && (
        <p className="mt-0.5 truncate text-[10px] font-medium text-[#8a6d0b]">
          Proposto:{" "}
          {new Date(request.proposedStartsAt).toLocaleString("it-IT", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      )}
      {request.status === "pending" && (
        <button
          type="button"
          onClick={cancel}
          disabled={busy}
          title="Annulla la richiesta"
          className="absolute right-1 top-1 hidden size-5 cursor-pointer items-center justify-center rounded-full bg-white/80 text-[#8a6d0b] group-hover:flex"
        >
          <X className="size-3" strokeWidth={2.4} />
        </button>
      )}
    </div>
  );
}

/* ── Dialogo di invio ────────────────────────────────────────────────── */

function GuideRequestDialog({
  data,
  onClose,
  onSent,
}: {
  data: AffiliateAgendaData;
  onClose: () => void;
  onSent: () => void;
}) {
  const toast = useFeedbackToast();
  const [day, setDay] = React.useState(() => formatYmd(new Date()));
  const [time, setTime] = React.useState("15:00");
  const [duration, setDuration] = React.useState(60);
  const [vehicleId, setVehicleId] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);

  const [students, setStudents] = React.useState<AffiliateStudent[]>([]);
  const [studentId, setStudentId] = React.useState<string | null>(null);
  const [studentQuery, setStudentQuery] = React.useState("");
  const [creatingStudent, setCreatingStudent] = React.useState(false);
  const [newStudent, setNewStudent] = React.useState({ firstName: "", lastName: "", phone: "" });
  const [savingStudent, setSavingStudent] = React.useState(false);

  const loadStudents = React.useCallback(async () => {
    const res = await listAffiliateStudents();
    if (res.success) setStudents(res.data.students);
  }, []);
  React.useEffect(() => {
    void loadStudents();
  }, [loadStudents]);

  const filtered = React.useMemo(() => {
    const term = studentQuery.trim().toLowerCase();
    if (!term) return students.slice(0, 6);
    return students
      .filter((student) =>
        `${student.firstName} ${student.lastName}`.toLowerCase().includes(term),
      )
      .slice(0, 6);
  }, [students, studentQuery]);

  const selected = students.find((student) => student.id === studentId) ?? null;

  const startsAt = React.useMemo(() => {
    const [hours, minutes] = time.split(":").map((value) => Number(value));
    const date = new Date(`${day}T00:00:00`);
    date.setHours(hours || 0, minutes || 0, 0, 0);
    return date;
  }, [day, time]);

  /** Stesso calcolo del server: il bottone non promette ciò che verrà rifiutato. */
  const leadError = React.useMemo(() => {
    const hours = data.minLeadHours;
    if (!hours || hours <= 0) return null;
    if (startsAt.getTime() >= Date.now() + hours * 3600_000) return null;
    return `Il consorzio chiede almeno ${hours} ${hours === 1 ? "ora" : "ore"} di preavviso.`;
  }, [data.minLeadHours, startsAt]);

  const canSend = Boolean(studentId) && !leadError && !data.schoolSuspended && !sending;

  const submitStudent = async () => {
    setSavingStudent(true);
    const res = await createAffiliateStudent(newStudent);
    setSavingStudent(false);
    if (!res.success) {
      toast.error({ description: res.message });
      return;
    }
    toast.success({ description: "Allievo aggiunto." });
    setCreatingStudent(false);
    setNewStudent({ firstName: "", lastName: "", phone: "" });
    await loadStudents();
    setStudentId(res.data.userId);
    setStudentQuery(`${newStudent.firstName} ${newStudent.lastName}`.trim());
  };

  const send = async () => {
    if (!studentId) return;
    setSending(true);
    const res = await sendAffiliateGuideRequest({
      studentUserId: studentId,
      startsAt: startsAt.toISOString(),
      durationMinutes: duration,
      vehicleId,
    });
    setSending(false);
    if (!res.success) {
      toast.error({ description: res.message });
      return;
    }
    toast.success({ description: "Richiesta inviata al consorzio." });
    onSent();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/20 p-6">
      <div className="w-full max-w-[420px] rounded-[24px] bg-white p-6 shadow-[0_26px_70px_rgba(10,20,30,0.24)]">
        <div className="mb-1 flex items-start justify-between gap-3">
          <h2 className="text-[20px] font-bold tracking-[-0.3px] text-foreground">
            Richiesta di guida
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#f7f7f7] transition-colors hover:bg-[#f0f0f0]"
          >
            <X className="size-4 text-[#6a6a6a]" />
          </button>
        </div>
        <p className="mb-5 text-[13px] leading-[1.45] text-muted-foreground">
          Gli slot grigi in agenda sono occupati dal consorzio. La richiesta resta in attesa finché
          il consorzio non risponde.
        </p>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-[#555555]">Giorno</p>
            <DatePickerInput value={day} onChange={(value) => setDay(value || day)} />
          </div>
          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-[#555555]">Orario</p>
            <TimePickerInput value={time} onChange={(value) => setTime(value || time)} />
          </div>
        </div>

        <p className="mb-1.5 text-[12px] font-semibold text-[#555555]">Durata</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {DURATIONS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setDuration(value)}
              className={cn(
                "cursor-pointer rounded-full px-4 py-2 text-[13px] transition-colors",
                value === duration
                  ? "bg-[#222222] font-semibold text-white"
                  : "border border-[#dddddd] font-medium text-foreground hover:bg-[#f7f7f7]",
              )}
            >
              {value} min
            </button>
          ))}
        </div>

        <p className="mb-1.5 text-[12px] font-semibold text-[#555555]">Allievo</p>
        {selected ? (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-[12px] border border-[#e2e2e2] px-3.5 py-2.5">
            <span className="truncate text-[14px] font-semibold text-foreground">
              {selected.firstName} {selected.lastName}
            </span>
            <button
              type="button"
              onClick={() => {
                setStudentId(null);
                setStudentQuery("");
              }}
              className="shrink-0 cursor-pointer text-[13px] font-semibold text-[#6a6a6a] underline"
            >
              Cambia
            </button>
          </div>
        ) : (
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={studentQuery}
                onChange={(event) => setStudentQuery(event.target.value)}
                placeholder="Cerca allievo…"
                className="pl-9"
              />
            </div>
            <div className="mt-1.5 overflow-hidden rounded-[12px] border border-[#ececec]">
              {filtered.map((student) => (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => setStudentId(student.id)}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 border-b border-[#f4f4f4] px-3.5 py-2.5 text-left text-[13.5px] font-medium text-foreground transition-colors last:border-b-0 hover:bg-[#f7f7f7]"
                >
                  <span className="truncate">
                    {student.firstName} {student.lastName}
                  </span>
                  <span className="shrink-0 text-[12px] text-[#929292]">{student.phone ?? ""}</span>
                </button>
              ))}
              {!creatingStudent ? (
                <button
                  type="button"
                  onClick={() => setCreatingStudent(true)}
                  className="flex w-full cursor-pointer items-center gap-2 px-3.5 py-2.5 text-left text-[13.5px] font-semibold text-foreground transition-colors hover:bg-[#f7f7f7]"
                >
                  <Plus className="size-4" />
                  Nuovo allievo
                </button>
              ) : (
                <div className="space-y-2 bg-[#fafafa] p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      autoFocus
                      placeholder="Nome"
                      value={newStudent.firstName}
                      onChange={(event) =>
                        setNewStudent((prev) => ({ ...prev, firstName: event.target.value }))
                      }
                    />
                    <Input
                      placeholder="Cognome"
                      value={newStudent.lastName}
                      onChange={(event) =>
                        setNewStudent((prev) => ({ ...prev, lastName: event.target.value }))
                      }
                    />
                  </div>
                  <Input
                    placeholder="Telefono"
                    value={newStudent.phone}
                    onChange={(event) =>
                      setNewStudent((prev) => ({ ...prev, phone: event.target.value }))
                    }
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setCreatingStudent(false)}
                      className="cursor-pointer text-[13px] font-semibold text-[#6a6a6a] underline"
                    >
                      Annulla
                    </button>
                    <button
                      type="button"
                      disabled={
                        savingStudent ||
                        !newStudent.firstName.trim() ||
                        !newStudent.lastName.trim() ||
                        newStudent.phone.trim().length < 5
                      }
                      onClick={() => void submitStudent()}
                      className="cursor-pointer rounded-full bg-[#222222] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-40"
                    >
                      {savingStudent ? <LoadingDots /> : "Aggiungi"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <p className="mb-1.5 text-[12px] font-semibold text-[#555555]">Veicolo del consorzio</p>
        <select
          value={vehicleId ?? ""}
          onChange={(event) => setVehicleId(event.target.value || null)}
          className="mb-4 w-full cursor-pointer rounded-[12px] border border-[#e2e2e2] bg-white px-3.5 py-2.5 text-[14px] font-medium text-foreground"
        >
          <option value="">Scegli un veicolo (facoltativo)</option>
          {data.vehicles.map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>
              {vehicle.name}
            </option>
          ))}
        </select>

        {leadError && (
          <p className="mb-3 text-[12.5px] font-medium text-[#b3261e]">{leadError}</p>
        )}

        <div className="mt-2 flex items-center justify-between gap-3 border-t border-[#f0f0f0] pt-4">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer text-[14px] font-semibold text-foreground underline"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={!canSend}
            onClick={() => void send()}
            className="cursor-pointer rounded-[32px] bg-[#222222] px-[22px] py-[11px] text-[14px] font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:bg-[#ededed] disabled:text-[#a5a5a5]"
          >
            {sending ? <LoadingDots /> : "Invia richiesta"}
          </button>
        </div>
      </div>
    </div>
  );
}
