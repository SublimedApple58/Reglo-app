"use client";

import React from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronLeft, Loader2, Plus, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InlineToggle } from "@/components/ui/inline-toggle";
import { DatePickerInput } from "@/components/ui/date-picker";
import { TimePickerInput } from "@/components/ui/time-picker";
import { PROTO_INPUT, PROTO_SELECT_TRIGGER } from "@/components/ui/proto-styles";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { LoadingDots } from "@/components/ui/loading-dots";
import { SuccessOverlay } from "@/components/ui/success-overlay";
import { INSTRUCTOR_COLOR_CHOICES } from "@/lib/autoscuole/instructor-colors";
import {
  updateAutoscuolaInstructor,
  getAutoscuolaInstructors,
  setAutoscuolaInstructorWeeklyAvailability,
  deleteAutoscuolaInstructorWeeklyAvailability,
  getAutoscuolaStudentsWithProgress,
  listInstructorSickLeaves,
  deleteInstructorSickLeave,
  listInstructorFerie,
  deleteInstructorFerie,
} from "@/lib/actions/autoscuole.actions";
import {
  getDailyAvailabilityOverrides,
  setDailyAvailabilityOverride,
  deleteDailyAvailabilityOverride,
  setRecurringAvailabilityOverride,
} from "@/lib/actions/autoscuole-availability.actions";
import { InstructorPublicationEditor } from "@/components/pages/Autoscuole/InstructorPublicationEditor";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

export type InstructorDetail = {
  id: string;
  name: string;
  status: string;
  autonomousMode?: boolean;
  settings?: unknown;
  color?: string | null;
  inviteCode?: string | null;
  _count?: { assignedStudents: number };
};

type Range = { startMinutes: number; endMinutes: number };

export type WeeklyAvailability = {
  daysOfWeek: number[];
  startMinutes: number;
  endMinutes: number;
  ranges?: Range[];
};

type StudentEntry = {
  id: string;
  firstName: string;
  lastName: string;
  assignedInstructorId: string | null;
  licenseCategory?: string | null;
  transmission?: string | null;
};

// ── Costanti ───────────────────────────────────────────────────────────────────

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const DAY_LABELS: Record<number, string> = { 1: "Lun", 2: "Mar", 3: "Mer", 4: "Gio", 5: "Ven", 6: "Sab", 0: "Dom" };
const DAY_FULL: Record<number, string> = { 1: "lunedì", 2: "martedì", 3: "mercoledì", 4: "giovedì", 5: "venerdì", 6: "sabato", 0: "domenica" };
const MONTHS = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const MONTHS_AB = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

const LBL = "mb-2 text-[11px] font-bold uppercase tracking-[0.4px] text-[#929292]";

// ── Helpers ────────────────────────────────────────────────────────────────────

const pad2 = (n: number) => String(n).padStart(2, "0");
const mmToLabel = (m: number) => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
const labelToMm = (l: string) => {
  const [h, m] = l.split(":").map(Number);
  return h * 60 + m;
};
const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fmtIso = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_AB[m - 1]} ${y}`;
};

/** "Lun–Ven" / "Lun, Mar, Gio" — comprime i giorni contigui nell'ordine Lun→Dom. */
function compressDays(days: number[]): string {
  const idx = days
    .map((d) => DAY_ORDER.indexOf(d as (typeof DAY_ORDER)[number]))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);
  if (!idx.length) return "";
  const runs: Array<[number, number]> = [];
  for (const i of idx) {
    const last = runs[runs.length - 1];
    if (last && i === last[1] + 1) last[1] = i;
    else runs.push([i, i]);
  }
  return runs
    .map(([a, b]) =>
      b - a >= 2
        ? `${DAY_LABELS[DAY_ORDER[a]]}–${DAY_LABELS[DAY_ORDER[b]]}`
        : Array.from({ length: b - a + 1 }, (_, k) => DAY_LABELS[DAY_ORDER[a + k]]).join(", "),
    )
    .join(", ");
}

function weeklySummary(w: WeeklyAvailability | null | undefined): string | null {
  if (!w || !w.daysOfWeek.length) return null;
  const ranges = w.ranges?.length ? w.ranges : [{ startMinutes: w.startMinutes, endMinutes: w.endMinutes }];
  const label = ranges.map((r) => `${mmToLabel(r.startMinutes)}–${mmToLabel(r.endMinutes)}`).join(", ");
  return `${label} · ${compressDays(w.daysOfWeek)}`;
}

const rangesOf = (w: WeeklyAvailability | null | undefined): Range[] =>
  w ? (w.ranges?.length ? w.ranges.map((r) => ({ ...r })) : [{ startMinutes: w.startMinutes, endMinutes: w.endMinutes }]) : [];

/** Colore effettivo dell'istruttore (custom o palette posizionale legacy). */
const effectiveColor = (instructor: InstructorDetail, index: number) =>
  instructor.color ?? INSTRUCTOR_COLOR_CHOICES[index % 8].hex;

// ── Atomi UI ───────────────────────────────────────────────────────────────────

function BlueChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-full border-[1.5px] px-3.5 py-2 text-[13px] font-semibold transition-colors",
        active ? "border-[#b9ccf5] bg-[#dbe4fb] text-[#26324d]" : "border-[#e0e0e0] bg-white text-[#666666] hover:border-[#c9c9c9]",
      )}
    >
      {children}
    </button>
  );
}

function Seg<T extends string>({
  options,
  value,
  onChange,
  small,
}: {
  options: Array<{ v: T; l: string }>;
  value: T;
  onChange: (v: T) => void;
  small?: boolean;
}) {
  return (
    <div className={cn("flex shrink-0 gap-1 rounded-[10px] bg-[#f4f4f6]", small ? "rounded-[9px] p-[3px]" : "p-1")}>
      {options.map((o) => {
        const on = o.v === value;
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={cn(
              "cursor-pointer font-semibold transition-all",
              small ? "rounded-[7px] px-[11px] py-1.5 text-[12.5px]" : "flex-1 rounded-[8px] px-2 py-[9px] text-center text-[13.5px]",
              on ? "bg-white text-[#222222] shadow-[0_1px_3px_rgba(0,0,0,0.1)]" : "bg-transparent text-[#999999] hover:text-[#666666]",
            )}
          >
            {o.l}
          </button>
        );
      })}
    </div>
  );
}

function OptField<T extends string>({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: T | "";
  onChange: (v: T) => void;
  options: Array<{ v: T; l: string }>;
  placeholder?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger className={PROTO_SELECT_TRIGGER}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Riga flat: titolo + descrizione a sinistra, controllo a destra. */
function Row({
  title,
  description,
  control,
  border,
}: {
  title: string;
  description?: string;
  control: React.ReactNode;
  border?: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-6 py-5", border && "border-t border-[#f0f0f0]")}>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-[#222222]">{title}</div>
        {description ? (
          <div className="mt-0.5 max-w-[460px] text-[12.5px] font-medium leading-snug text-[#929292]">{description}</div>
        ) : null}
      </div>
      {control}
    </div>
  );
}

/** Palette colore istruttore (portal ancorato allo swatch, 16 tinte, prese disabilitate). */
function ColorPop({
  anchor,
  current,
  taken,
  onPick,
  onClose,
}: {
  anchor: DOMRect;
  current: string;
  taken: string[];
  onPick: (hex: string) => void;
  onClose: () => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handler);
    };
  }, [onClose]);
  const width = 236;
  let left = anchor.right - width;
  left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
  let top = anchor.bottom + 8;
  if (top + 190 > window.innerHeight) top = Math.max(12, anchor.top - 198);
  return createPortal(
    <div
      ref={ref}
      className="fixed z-[70] rounded-2xl border border-[#ececec] bg-white p-3.5 shadow-[0_12px_40px_rgba(0,0,0,0.18)]"
      style={{ left, top, width }}
    >
      <div className="grid grid-cols-6 gap-[9px]">
        {INSTRUCTOR_COLOR_CHOICES.map(({ hex, name }) => {
          const isTaken = taken.includes(hex) && hex !== current;
          const isSel = current === hex;
          return (
            <button
              key={hex}
              type="button"
              title={name}
              disabled={isTaken}
              onClick={() => onPick(hex)}
              className={cn(
                "aspect-square w-full rounded-lg transition-transform",
                isTaken ? "cursor-not-allowed opacity-25" : "cursor-pointer hover:scale-110",
              )}
              style={{ background: hex, boxShadow: isSel ? `0 0 0 2px #fff, 0 0 0 4px ${hex}` : undefined }}
            >
              {isSel && <Check className="mx-auto size-3.5 text-white" strokeWidth={2.6} />}
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface InstructorsTabProps {
  instructors: InstructorDetail[];
  setInstructors: React.Dispatch<React.SetStateAction<InstructorDetail[]>>;
  instructorWeeklyAvailability: Record<string, WeeklyAvailability>;
  setInstructorWeeklyAvailability: React.Dispatch<React.SetStateAction<Record<string, WeeklyAvailability>>>;
  setInviteInstructorOpen: (open: boolean) => void;
  changeInstructorColor: (instructor: InstructorDetail, color: string | null) => Promise<void>;
  /** Ricarica gli slot agenda (dopo modifiche a disponibilità/malattia). */
  refreshAgenda: () => void;
  /** Notifica il parent quando si entra/esce dal dettaglio (nasconde il titolo pane). */
  onDetailOpenChange?: (open: boolean) => void;
}

// ── Componente principale ──────────────────────────────────────────────────────

export default function InstructorsTab({
  instructors,
  setInstructors,
  instructorWeeklyAvailability,
  setInstructorWeeklyAvailability,
  setInviteInstructorOpen,
  changeInstructorColor,
  refreshAgenda,
  onDetailOpenChange,
}: InstructorsTabProps) {
  const toast = useFeedbackToast();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<"disp" | "malattia" | "ferie" | "autonoma">("disp");
  const [colorPopAnchor, setColorPopAnchor] = React.useState<DOMRect | null>(null);

  const selectedIndex = instructors.findIndex((i) => i.id === selectedId);
  const selected = selectedIndex >= 0 ? instructors[selectedIndex] : null;

  const reloadInstructors = React.useCallback(async () => {
    const res = await getAutoscuolaInstructors();
    if (res.success && res.data) setInstructors(res.data);
  }, [setInstructors]);

  // ── Vista LISTA ──
  if (!selected) {
    return (
      <div data-testid="instructors-pane">
        <div>
          {instructors.map((instructor, i) => {
            const summary = weeklySummary(instructorWeeklyAvailability[instructor.id]);
            return (
              <div
                key={instructor.id}
                className={cn(
                  "flex items-start justify-between gap-4 py-[18px]",
                  i < instructors.length - 1 && "border-b border-[#eeeeee]",
                )}
              >
                <div className="min-w-0">
                  <div className="text-base font-semibold text-[#222222]">{instructor.name}</div>
                  <div className={cn("mt-1 text-[13px] font-medium leading-normal", summary ? "text-[#929292]" : "italic text-[#a8a8a8]")}>
                    {summary ?? "Nessuna disponibilità settimanale"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(instructor.id);
                    setTab("disp");
                    onDetailOpenChange?.(true);
                  }}
                  className="shrink-0 cursor-pointer whitespace-nowrap text-sm font-semibold text-[#222222] underline decoration-1 underline-offset-2 transition-all hover:text-black hover:decoration-2"
                >
                  Gestisci
                </button>
              </div>
            );
          })}
          {/* Invita istruttore */}
          <button
            type="button"
            onClick={() => setInviteInstructorOpen(true)}
            className="flex cursor-pointer items-center gap-3 py-[18px] text-navy-900 transition-opacity hover:opacity-75"
          >
            <span className="relative size-[46px] shrink-0">
              <Image
                src="/images/settings/istruttore-nuovo.png"
                alt=""
                width={46}
                height={46}
                className="size-[46px] object-contain"
              />
              <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full border-2 border-white bg-navy-900">
                <Plus className="size-2.5 text-white" strokeWidth={2.6} />
              </span>
            </span>
            <span className="text-sm font-semibold">Aggiungi istruttore</span>
          </button>
        </div>
      </div>
    );
  }

  // ── Vista DETTAGLIO ──
  const color = effectiveColor(selected, selectedIndex);
  const takenColors = instructors.filter((i) => i.id !== selected.id && i.color).map((i) => i.color as string);
  const TABS = [
    { key: "disp" as const, label: "Disponibilità" },
    { key: "malattia" as const, label: "Malattia" },
    { key: "ferie" as const, label: "Ferie" },
    { key: "autonoma" as const, label: "Gestione autonoma" },
  ];

  return (
    <div data-testid="instructors-pane">
      <button
        type="button"
        onClick={() => {
          setSelectedId(null);
          onDetailOpenChange?.(false);
        }}
        className="mb-3.5 inline-flex cursor-pointer select-none items-center gap-1.5 text-[13px] font-semibold text-[#6a6a6a] transition-colors hover:text-[#222222]"
      >
        <ChevronLeft className="size-4" strokeWidth={1.8} />
        Istruttori
      </button>

      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-2xl font-bold tracking-[-0.3px] text-[#222222]">{selected.name}</div>
          <div className="mt-0.5 text-[13.5px] font-medium text-[#929292]">
            Gestisci le impostazioni dell&apos;istruttore
          </div>
        </div>
        <button
          type="button"
          title="Cambia colore"
          onClick={(e) => setColorPopAnchor(e.currentTarget.getBoundingClientRect())}
          className="size-8 shrink-0 cursor-pointer rounded-lg shadow-[0_0_0_1px_rgba(0,0,0,0.1)] transition-transform hover:scale-110"
          style={{ background: color }}
        />
      </div>
      {colorPopAnchor && (
        <ColorPop
          anchor={colorPopAnchor}
          current={color}
          taken={takenColors}
          onPick={(hex) => {
            setColorPopAnchor(null);
            void changeInstructorColor(selected, hex);
          }}
          onClose={() => setColorPopAnchor(null)}
        />
      )}

      <div className="mb-6 mt-5 flex flex-wrap items-center gap-[26px] border-b border-[#e8e8e8]">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px cursor-pointer select-none whitespace-nowrap border-b-[2.5px] px-px pb-3 text-[15px] transition-colors",
              tab === t.key ? "border-[#222222] font-semibold text-[#222222]" : "border-transparent font-medium text-[#6a6a6a] hover:text-[#222222]",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="max-w-[680px]">
        {tab === "disp" && (
          <DisponibilitaTab
            instructor={selected}
            weekly={instructorWeeklyAvailability[selected.id] ?? null}
            setInstructorWeeklyAvailability={setInstructorWeeklyAvailability}
            setInstructors={setInstructors}
            refreshAgenda={refreshAgenda}
            toast={toast}
          />
        )}
        {tab === "malattia" && (
          <MalattiaTab instructor={selected} refreshAgenda={refreshAgenda} toast={toast} />
        )}
        {tab === "ferie" && (
          <FerieTab instructor={selected} refreshAgenda={refreshAgenda} toast={toast} />
        )}
        {tab === "autonoma" && (
          <AutonomaTab
            instructor={selected}
            instructors={instructors}
            setInstructors={setInstructors}
            reloadInstructors={reloadInstructors}
            toast={toast}
          />
        )}
      </div>
    </div>
  );
}

type ToastApi = ReturnType<typeof useFeedbackToast>;

// ═══ TAB DISPONIBILITÀ ═════════════════════════════════════════════════════════

function DisponibilitaTab({
  instructor,
  weekly,
  setInstructorWeeklyAvailability,
  setInstructors,
  refreshAgenda,
  toast,
}: {
  instructor: InstructorDetail;
  weekly: WeeklyAvailability | null;
  setInstructorWeeklyAvailability: React.Dispatch<React.SetStateAction<Record<string, WeeklyAvailability>>>;
  setInstructors: React.Dispatch<React.SetStateAction<InstructorDetail[]>>;
  refreshAgenda: () => void;
  toast: ToastApi;
}) {
  const settings = (instructor.settings ?? {}) as Record<string, unknown>;
  const [mode, setMode] = React.useState<"default" | "publication">(
    settings.availabilityMode === "publication" ? "publication" : "default",
  );
  const [plan, setPlan] = React.useState<"pre" | "cal">("pre");

  // Stato locale della settimana tipo (draft = server, auto-save a ogni modifica)
  const [days, setDays] = React.useState<number[]>(weekly?.daysOfWeek ?? [1, 2, 3, 4, 5]);
  const [ranges, setRanges] = React.useState<Range[]>(
    weekly ? rangesOf(weekly) : [{ startMinutes: 9 * 60, endMinutes: 18 * 60 }],
  );
  const hasWeekly = Boolean(weekly);

  // ── persistenza settimana tipo ──
  const persistWeekly = async (nextDays: number[], nextRanges: Range[], rollback: () => void) => {
    const res = await setAutoscuolaInstructorWeeklyAvailability({
      instructorId: instructor.id,
      daysOfWeek: nextDays,
      startMinutes: nextRanges[0]?.startMinutes ?? 9 * 60,
      endMinutes: nextRanges[0]?.endMinutes ?? 18 * 60,
      ranges: nextRanges,
    });
    if (!res.success || !res.data) {
      rollback();
      toast.error({ description: res.message ?? "Impossibile salvare la disponibilità." });
      return;
    }
    setInstructorWeeklyAvailability((prev) => ({ ...prev, [instructor.id]: res.data! }));
    refreshAgenda();
  };

  const toggleDay = (day: number) => {
    const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b);
    if (!next.length) {
      toast.error({ description: "Seleziona almeno un giorno attivo." });
      return;
    }
    const prev = days;
    setDays(next);
    void persistWeekly(next, ranges, () => setDays(prev));
  };

  const setRangeSide = (i: number, side: "a" | "b", label: string) => {
    const next = ranges.map((r) => ({ ...r }));
    const v = labelToMm(label);
    if (side === "a") next[i].startMinutes = v;
    else next[i].endMinutes = v;
    if (next[i].endMinutes <= next[i].startMinutes) {
      toast.error({ description: "L'orario di fine deve essere successivo all'inizio." });
      return;
    }
    const prev = ranges;
    setRanges(next);
    void persistWeekly(days, next, () => setRanges(prev));
  };

  const addRange = () => {
    const last = ranges[ranges.length - 1];
    const start = Math.min((last?.endMinutes ?? 9 * 60) + 60, 21 * 60);
    const next = [...ranges.map((r) => ({ ...r })), { startMinutes: start, endMinutes: Math.min(start + 120, 23 * 60) }];
    const prev = ranges;
    setRanges(next);
    void persistWeekly(days, next, () => setRanges(prev));
  };

  const removeAvailability = async () => {
    if (ranges.length > 1) {
      const next = ranges.slice(0, -1);
      const prev = ranges;
      setRanges(next);
      void persistWeekly(days, next, () => setRanges(prev));
      return;
    }
    if (!hasWeekly) return;
    if (!window.confirm("Rimuovere tutta la disponibilità settimanale di questo istruttore?")) return;
    const res = await deleteAutoscuolaInstructorWeeklyAvailability(instructor.id);
    if (!res.success) {
      toast.error({ description: res.message ?? "Impossibile rimuovere la disponibilità." });
      return;
    }
    setInstructorWeeklyAvailability((prev) => {
      const next = { ...prev };
      delete next[instructor.id];
      return next;
    });
    refreshAgenda();
    toast.success({ description: "Disponibilità rimossa." });
  };

  // ── modalità disponibilità (predefinita / a pubblicazione) ──
  const saveMode = async (next: "default" | "publication") => {
    const prev = mode;
    setMode(next);
    const merged = { ...settings, availabilityMode: next };
    const res = await updateAutoscuolaInstructor({
      instructorId: instructor.id,
      settings: merged as Parameters<typeof updateAutoscuolaInstructor>[0]["settings"],
    });
    if (!res.success) {
      setMode(prev);
      toast.error({ description: res.message ?? "Impossibile cambiare modalità." });
      return;
    }
    setInstructors((list) => list.map((i) => (i.id === instructor.id ? { ...i, settings: merged } : i)));
  };

  return (
    <div>
      {/* Modalità disponibilità */}
      <div className="mb-[22px] flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold text-[#222222]">Modalità disponibilità</div>
          <div className="mt-1 max-w-[460px] text-[13px] font-medium leading-normal text-[#929292]">
            In «A pubblicazione» è l&apos;istruttore a pubblicare la disponibilità settimana per settimana.
          </div>
        </div>
        <div className="w-[220px] shrink-0">
          <OptField
            value={mode}
            onChange={(v) => void saveMode(v)}
            options={[
              { v: "default", l: "Predefinita" },
              { v: "publication", l: "A pubblicazione" },
            ]}
          />
        </div>
      </div>

      {mode === "publication" ? (
        // In modalità pubblicazione è l'istruttore a compilare le settimane:
        // il titolare vede/gestisce il rail di pubblicazione (editor esistente).
        <InstructorPublicationEditor
          instructorId={instructor.id}
          base={weekly ?? null}
          onChanged={refreshAgenda}
        />
      ) : (
        <>
      <div className={LBL}>Tipo di pianificazione</div>
      <div className="mb-[22px]">
        <Seg
          options={[
            { v: "pre", l: "Predefinito" },
            { v: "cal", l: "Calendario" },
          ]}
          value={plan}
          onChange={setPlan}
        />
      </div>

      {plan === "pre" ? (
        <div>
          <div className={LBL}>Giorni attivi</div>
          <div className="mb-[22px] flex flex-wrap gap-2">
            {DAY_ORDER.map((d) => (
              <BlueChip key={d} active={days.includes(d)} onClick={() => toggleDay(d)}>
                {DAY_LABELS[d]}
              </BlueChip>
            ))}
          </div>
          <div className={LBL}>Fasce orarie</div>
          <div className="mb-3 flex flex-col gap-2.5">
            {ranges.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <TimePickerInput value={mmToLabel(r.startMinutes)} onChange={(v) => setRangeSide(i, "a", v)} minTime="06:00" maxTime="23:00" className="min-w-0 flex-1 justify-between py-[11px]" />
                <span className="text-[13px] text-[#999999]">–</span>
                <TimePickerInput value={mmToLabel(r.endMinutes)} onChange={(v) => setRangeSide(i, "b", v)} minTime="06:00" maxTime="24:00" className="min-w-0 flex-1 justify-between py-[11px]" />
              </div>
            ))}
          </div>
          <div className="mb-[22px] flex items-center justify-between">
            <button
              type="button"
              onClick={addRange}
              className="inline-flex cursor-pointer items-center gap-1.5 text-[13.5px] font-semibold text-navy-900"
            >
              <Plus className="size-3.5" strokeWidth={2.2} />
              Aggiungi fascia
            </button>
            <button
              type="button"
              onClick={() => void removeAvailability()}
              className="cursor-pointer text-[13px] font-semibold text-[#c13515]"
            >
              Rimuovi disponibilità
            </button>
          </div>
        </div>
      ) : (
        <CalendarOverrides
          instructor={instructor}
          weekly={weekly}
          refreshAgenda={refreshAgenda}
          toast={toast}
        />
      )}
        </>
      )}
    </div>
  );
}

/** Pianificazione a calendario: override giornalieri con multi-selezione. */
function CalendarOverrides({
  instructor,
  weekly,
  refreshAgenda,
  toast,
}: {
  instructor: InstructorDetail;
  weekly: WeeklyAvailability | null;
  refreshAgenda: () => void;
  toast: ToastApi;
}) {
  const todayIso = ymd(new Date());
  const [monthOffset, setMonthOffset] = React.useState(0);
  const [selectedDays, setSelectedDays] = React.useState<string[]>([]);
  // date ISO → ranges [] (vuoto = assente)
  const [overrides, setOverrides] = React.useState<Record<string, Range[]>>({});
  const [applyingRec, setApplyingRec] = React.useState(false);

  const loadOverrides = React.useCallback(async () => {
    const to = new Date();
    to.setFullYear(to.getFullYear() + 1);
    const res = await getDailyAvailabilityOverrides({
      ownerType: "instructor",
      ownerId: instructor.id,
      to: ymd(to),
    });
    if (res.success && res.data) {
      const map: Record<string, Range[]> = {};
      for (const o of res.data as Array<{ date: string | Date; ranges: unknown }>) {
        const iso = ymd(new Date(o.date));
        map[iso] = Array.isArray(o.ranges) ? (o.ranges as Range[]) : [];
      }
      setOverrides(map);
    }
  }, [instructor.id]);

  React.useEffect(() => {
    void loadOverrides();
  }, [loadOverrides]);

  // ── griglia del mese ──
  const base = new Date();
  const view = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
  const firstDow = (view.getDay() + 6) % 7; // Lun=0
  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const cells: Array<string | null> = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, d) => ymd(new Date(view.getFullYear(), view.getMonth(), d + 1))),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  // ── stato del giorno selezionato (default dalla settimana tipo) ──
  const defaultFor = (iso: string): { available: boolean; ranges: Range[] } => {
    const dow = new Date(iso + "T00:00:00").getDay();
    if (!weekly) return { available: false, ranges: [] };
    const inWeek = weekly.daysOfWeek.includes(dow);
    return { available: inWeek, ranges: inWeek ? rangesOf(weekly) : [] };
  };
  const stateFor = (iso: string): { available: boolean; ranges: Range[] } =>
    iso in overrides ? { available: overrides[iso].length > 0, ranges: overrides[iso] } : defaultFor(iso);

  const firstSel = selectedDays[0] ?? null;
  const sel = firstSel ? stateFor(firstSel) : null;

  const persistDays = async (isoList: string[], ranges: Range[]) => {
    const results = await Promise.all(
      isoList.map((date) =>
        setDailyAvailabilityOverride({ ownerType: "instructor", ownerId: instructor.id, date, ranges }),
      ),
    );
    const failed = results.find((r) => !r.success);
    if (failed) {
      toast.error({ description: ("message" in failed && failed.message) || "Impossibile salvare l'eccezione." });
    }
    await loadOverrides();
    refreshAgenda();
  };

  const setAvailable = (on: boolean) => {
    const current = sel;
    const ranges = on
      ? current && current.ranges.length
        ? current.ranges
        : rangesOf(weekly).length
          ? rangesOf(weekly)
          : [{ startMinutes: 9 * 60, endMinutes: 18 * 60 }]
      : [];
    // ottimista: aggiorna subito i pallini
    setOverrides((prev) => {
      const next = { ...prev };
      for (const iso of selectedDays) next[iso] = ranges;
      return next;
    });
    void persistDays(selectedDays, ranges);
  };

  const setSelRange = (i: number, side: "a" | "b", label: string) => {
    if (!sel) return;
    const next = sel.ranges.map((r) => ({ ...r }));
    const v = labelToMm(label);
    if (side === "a") next[i].startMinutes = v;
    else next[i].endMinutes = v;
    if (next[i].endMinutes <= next[i].startMinutes) {
      toast.error({ description: "L'orario di fine deve essere successivo all'inizio." });
      return;
    }
    setOverrides((prev) => {
      const nx = { ...prev };
      for (const iso of selectedDays) nx[iso] = next;
      return nx;
    });
    void persistDays(selectedDays, next);
  };

  const addSelRange = () => {
    if (!sel) return;
    const last = sel.ranges[sel.ranges.length - 1];
    const start = Math.min((last?.endMinutes ?? 9 * 60) + 60, 21 * 60);
    const next = [...sel.ranges.map((r) => ({ ...r })), { startMinutes: start, endMinutes: Math.min(start + 120, 23 * 60) }];
    setOverrides((prev) => {
      const nx = { ...prev };
      for (const iso of selectedDays) nx[iso] = next;
      return nx;
    });
    void persistDays(selectedDays, next);
  };

  const removeSelRange = () => {
    if (!sel || !sel.ranges.length) return;
    const next = sel.ranges.slice(0, -1);
    setOverrides((prev) => {
      const nx = { ...prev };
      for (const iso of selectedDays) nx[iso] = next;
      return nx;
    });
    void persistDays(selectedDays, next);
  };

  const applyRecurring = async () => {
    if (!sel || !selectedDays.length) return;
    setApplyingRec(true);
    const results = await Promise.all(
      selectedDays.map((iso) =>
        setRecurringAvailabilityOverride({
          ownerType: "instructor",
          ownerId: instructor.id,
          dayOfWeek: new Date(iso + "T00:00:00").getDay(),
          ranges: sel.available ? sel.ranges : [],
          fromDate: iso,
        }),
      ),
    );
    setApplyingRec(false);
    const failed = results.find((r) => !r.success);
    if (failed) {
      toast.error({ description: ("message" in failed && failed.message) || "Impossibile applicare la ricorrenza." });
      return;
    }
    toast.success({ description: "Ricorrenza applicata alle prossime settimane." });
    await loadOverrides();
    refreshAgenda();
  };

  const restoreDefault = async () => {
    const targets = selectedDays.filter((iso) => iso in overrides);
    if (!targets.length) return;
    await Promise.all(
      targets.map((date) => deleteDailyAvailabilityOverride({ ownerType: "instructor", ownerId: instructor.id, date })),
    );
    toast.success({ description: "Giorni ripristinati al predefinito." });
    await loadOverrides();
    refreshAgenda();
  };

  const selTitle =
    selectedDays.length === 0
      ? null
      : selectedDays.length === 1
        ? (() => {
            const iso = selectedDays[0];
            const d = new Date(iso + "T00:00:00");
            return `${DAY_LABELS[d.getDay()]} ${pad2(d.getDate())} ${MONTHS_AB[d.getMonth()].charAt(0).toUpperCase()}${MONTHS_AB[d.getMonth()].slice(1)}`;
          })()
        : `${selectedDays.length} giorni selezionati`;

  return (
    <div>
      {/* Mese */}
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          disabled={monthOffset <= 0}
          onClick={() => setMonthOffset((m) => m - 1)}
          className={cn("flex cursor-pointer p-1", monthOffset <= 0 && "cursor-default opacity-25")}
        >
          <ChevronLeft className="size-4 text-[#222222]" strokeWidth={1.8} />
        </button>
        <div className="text-base font-bold text-[#222222]">
          {MONTHS[view.getMonth()]} {view.getFullYear()}
        </div>
        <button type="button" onClick={() => setMonthOffset((m) => m + 1)} className="flex cursor-pointer p-1">
          <ChevronLeft className="size-4 rotate-180 text-[#222222]" strokeWidth={1.8} />
        </button>
      </div>
      <div className="mb-1 grid grid-cols-7">
        {["L", "M", "M", "G", "V", "S", "D"].map((w, i) => (
          <div key={i} className="py-0.5 text-center text-[11px] font-semibold text-[#bbbbbb]">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((iso, i) => {
          if (!iso) return <div key={i} className="h-[46px]" />;
          const past = iso < todayIso;
          const isToday = iso === todayIso;
          const selDay = selectedDays.includes(iso);
          const ov = overrides[iso];
          const dot = ov !== undefined ? (ov.length > 0 ? "#3f7fe0" : "#d64530") : null;
          const dayNum = Number(iso.slice(-2));
          return (
            <div key={iso} className="flex h-[46px] flex-col items-center justify-center gap-px">
              <button
                type="button"
                disabled={past}
                onClick={() =>
                  setSelectedDays((prev) => (prev.includes(iso) ? prev.filter((x) => x !== iso) : [...prev, iso]))
                }
                className={cn(
                  "flex size-[38px] items-center justify-center rounded-full text-[15px] box-border",
                  past ? "cursor-default text-[#cccccc]" : "cursor-pointer",
                  selDay ? "bg-navy-900 font-bold text-white" : !past && "font-medium text-[#222222] hover:bg-[#f2f2f2]",
                  isToday && !selDay && "border-2 border-[#93b4f0]",
                )}
              >
                {dayNum}
              </button>
              <span className="size-[5px] rounded-full" style={{ background: dot && !selDay ? dot : "transparent" }} />
            </div>
          );
        })}
      </div>

      {/* Pannello giorni selezionati */}
      {!selectedDays.length ? (
        <div className="mt-[18px] border-t border-[#f0f0f0] pb-1 pt-5 text-[13.5px] text-[#aaaaaa]">
          Seleziona uno o più giorni.
        </div>
      ) : (
        <>
          <div className="mt-[18px] border-t border-[#f0f0f0] pb-[22px] pt-[18px]">
            <div className="mb-1.5 text-[15px] font-bold text-[#222222]">{selTitle}</div>
            <div className="flex items-center justify-between gap-3.5 py-2.5">
              <span className="text-sm font-semibold text-[#222222]">Disponibile</span>
              <InlineToggle checked={Boolean(sel?.available)} onChange={() => setAvailable(!sel?.available)} size="lg" />
            </div>
            {sel?.available && (
              <>
                <div className="mt-2.5 flex flex-col gap-2.5">
                  {!sel.ranges.length && (
                    <div className="text-[13px] italic text-[#aaaaaa]">Nessuna fascia impostata</div>
                  )}
                  {sel.ranges.map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <TimePickerInput value={mmToLabel(r.startMinutes)} onChange={(v) => setSelRange(i, "a", v)} minTime="06:00" maxTime="23:00" className="min-w-0 flex-1 justify-between py-[11px]" />
                      <span className="text-[13px] text-[#999999]">–</span>
                      <TimePickerInput value={mmToLabel(r.endMinutes)} onChange={(v) => setSelRange(i, "b", v)} minTime="06:00" maxTime="24:00" className="min-w-0 flex-1 justify-between py-[11px]" />
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={addSelRange}
                    className="inline-flex cursor-pointer items-center gap-1.5 text-[13.5px] font-semibold text-navy-900"
                  >
                    <Plus className="size-3.5" strokeWidth={2.2} />
                    Aggiungi fascia
                  </button>
                  <button
                    type="button"
                    onClick={removeSelRange}
                    className="cursor-pointer text-[13px] font-semibold text-[#c13515]"
                  >
                    Rimuovi disponibilità
                  </button>
                </div>
              </>
            )}
          </div>
          <div className="flex items-center justify-between gap-3.5 border-t border-[#f0f0f0] py-4">
            <div className="min-w-0">
              <div className="text-[14.5px] font-semibold text-[#222222]">
                {sel?.available ? "Disponibilità ricorrente" : "Assenza ricorrente"}
              </div>
              <div className="mt-0.5 text-[12.5px] font-medium text-[#929292]">
                {selectedDays.length === 1 && firstSel
                  ? `Applica a tutti i ${DAY_FULL[new Date(firstSel + "T00:00:00").getDay()]} dal ${fmtIso(firstSel)} in poi`
                  : "Applica ai giorni della settimana selezionati, da ogni data in poi"}
              </div>
            </div>
            <button
              type="button"
              disabled={applyingRec}
              onClick={() => void applyRecurring()}
              className="flex shrink-0 cursor-pointer items-center gap-2 rounded-[10px] bg-navy-900 px-5 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-navy-800 disabled:opacity-60"
            >
              {applyingRec ? <LoadingDots className="min-h-[1.5em]" /> : "Applica"}
            </button>
          </div>
          <div className="mt-2">
            <button
              type="button"
              onClick={() => void restoreDefault()}
              className="cursor-pointer text-[13px] font-semibold text-[#222222] underline decoration-1 underline-offset-2 transition-all hover:text-black hover:decoration-2"
            >
              Ripristina predefinito
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ═══ TAB MALATTIA ══════════════════════════════════════════════════════════════

type SickPeriod = { ids: string[]; start: string; end: string; half: boolean; time: string | null };

function MalattiaTab({
  instructor,
  refreshAgenda,
  toast,
}: {
  instructor: InstructorDetail;
  refreshAgenda: () => void;
  toast: ToastApi;
}) {
  const todayIso = ymd(new Date());
  const [startIso, setStartIso] = React.useState(todayIso);
  const [endIso, setEndIso] = React.useState(todayIso);
  const [half, setHalf] = React.useState(false);
  const [time, setTime] = React.useState("14:00");
  const [saving, setSaving] = React.useState(false);
  // Overlay di esito del proto (_istrInfoBanner): "Assenza aggiunta/rimossa"
  const [overlay, setOverlay] = React.useState<{ title: string; subtitle: string } | null>(null);
  const [periods, setPeriods] = React.useState<SickPeriod[]>([]);
  const [loaded, setLoaded] = React.useState(false);

  const loadPeriods = React.useCallback(async () => {
    const res = await listInstructorSickLeaves(instructor.id);
    if (!res.success || !res.data) {
      setLoaded(true);
      return;
    }
    // Raggruppa i blocchi giornalieri contigui in periodi.
    const blocks = res.data
      .map((b) => {
        const starts = new Date(b.startsAt);
        return { id: b.id, iso: ymd(starts), startMinutes: starts.getHours() * 60 + starts.getMinutes() };
      })
      .sort((a, b) => a.iso.localeCompare(b.iso));
    const grouped: SickPeriod[] = [];
    for (const b of blocks) {
      const last = grouped[grouped.length - 1];
      const prevDate = last ? new Date(last.end + "T00:00:00") : null;
      if (prevDate) prevDate.setDate(prevDate.getDate() + 1);
      if (last && prevDate && ymd(prevDate) === b.iso) {
        last.end = b.iso;
        last.ids.push(b.id);
      } else {
        grouped.push({
          ids: [b.id],
          start: b.iso,
          end: b.iso,
          half: b.startMinutes > 0,
          time: b.startMinutes > 0 ? mmToLabel(b.startMinutes) : null,
        });
      }
    }
    setPeriods(grouped);
    setLoaded(true);
  }, [instructor.id]);

  React.useEffect(() => {
    void loadPeriods();
  }, [loadPeriods]);

  const save = async () => {
    if (!startIso || !endIso) return;
    setSaving(true);
    try {
      const res = await fetch("/api/autoscuole/instructor-sick-leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instructorId: instructor.id,
          startDate: startIso,
          endDate: endIso,
          startTime: half ? time : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const cancelled = data.data.appointmentsCancelled as number;
        setOverlay({
          title: "Assenza aggiunta",
          subtitle: `Il periodo di malattia è stato registrato.${cancelled > 0 ? ` ${cancelled} guide cancellate.` : ""}`,
        });
        setStartIso(todayIso);
        setEndIso(todayIso);
        setHalf(false);
        setTime("14:00");
        await loadPeriods();
        refreshAgenda();
      } else {
        toast.error({ description: data.message ?? "Errore nel salvataggio." });
      }
    } catch {
      toast.error({ description: "Errore nel salvataggio." });
    } finally {
      setSaving(false);
    }
  };

  const removePeriod = async (p: SickPeriod) => {
    const res = await deleteInstructorSickLeave(p.ids);
    if (!res.success) {
      toast.error({ description: res.message ?? "Impossibile rimuovere l'assenza." });
      return;
    }
    setOverlay({
      title: "Assenza rimossa",
      subtitle: "L'assenza è stata eliminata. Le guide già cancellate non vengono ripristinate.",
    });
    await loadPeriods();
    refreshAgenda();
  };

  return (
    <div>
      <SuccessOverlay
        open={overlay != null}
        onClose={() => setOverlay(null)}
        image="/images/settings/malattia-icon.png"
        title={overlay?.title ?? ""}
        subtitle={overlay?.subtitle}
      />
      <div className="mb-[18px] flex gap-3">
        <div className="flex-1">
          <div className={LBL}>Data inizio</div>
          <DatePickerInput
            value={startIso}
            onChange={(v) => {
              setStartIso(v);
              if (endIso < v) setEndIso(v);
            }}
            className="h-auto rounded-[10px] border-[1.5px] px-3.5 py-[11px]"
          />
        </div>
        <div className="flex-1">
          <div className={LBL}>Data fine</div>
          <DatePickerInput
            value={endIso}
            onChange={(v) => {
              setEndIso(v);
              if (v < startIso) setStartIso(v);
            }}
            className="h-auto rounded-[10px] border-[1.5px] px-3.5 py-[11px]"
          />
        </div>
      </div>

      <div className="flex items-center gap-3.5 border-t border-[#f0f0f0] py-4">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-[#222222]">Mezza giornata</div>
          <div className="mt-0.5 text-[12.5px] font-medium leading-snug text-[#929292]">
            La malattia inizia a un orario specifico del primo giorno.
          </div>
        </div>
        <InlineToggle checked={half} onChange={() => setHalf((v) => !v)} size="lg" />
      </div>
      {half && (
        <div className="mt-1">
          <div className={LBL}>Orario inizio malattia</div>
          <TimePickerInput value={time} onChange={setTime} minTime="06:00" maxTime="20:00" className="w-full justify-between py-[11px]" />
        </div>
      )}

      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="mt-[18px] flex w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-navy-900 p-[13px] text-sm font-semibold text-white transition-colors hover:bg-navy-800 disabled:opacity-60"
      >
        {saving ? <LoadingDots className="min-h-5" /> : "Aggiungi assenza"}
      </button>

      {loaded && (
        <AnimatePresence initial={false}>
          {periods.length > 0 && (
            <motion.div
              key="sick-list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <div className={cn(LBL, "mt-7")}>Assenze registrate</div>
              <div className="flex flex-col">
                {/* Righe animate: entrano/escono con fade + height (dolce) */}
                <AnimatePresence initial={false}>
                  {periods.map((p) => (
                    <motion.div
                      key={p.ids[0]}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.28, ease: "easeOut" }}
                      className="overflow-hidden"
                    >
                      <div className="flex items-center gap-3 border-b border-[#f2f2f2] px-0.5 py-[13px]">
                        <span className="size-2 shrink-0 rounded-full bg-[#d64530]" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-[#222222]">
                            {p.start === p.end ? fmtIso(p.start) : `${fmtIso(p.start)} → ${fmtIso(p.end)}`}
                          </div>
                          <div className="mt-px text-[12.5px] font-medium text-[#929292]">
                            {p.half ? `Mezza giornata${p.time ? ` · dalle ${p.time}` : ""}` : "Giornata intera"}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void removePeriod(p)}
                          className="shrink-0 cursor-pointer text-sm font-semibold text-[#c1360f]"
                        >
                          Rimuovi
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}

// ═══ TAB FERIE ═════════════════════════════════════════════════════════════════
// Stesso identico meccanismo della Malattia (blocchi a giornata piena + cancella
// le guide + avvisa gli allievi), ma scheda separata e notifica dedicata "in
// ferie" (route instructor-vacation, reason blocco "ferie").
function FerieTab({
  instructor,
  refreshAgenda,
  toast,
}: {
  instructor: InstructorDetail;
  refreshAgenda: () => void;
  toast: ToastApi;
}) {
  const todayIso = ymd(new Date());
  const [startIso, setStartIso] = React.useState(todayIso);
  const [endIso, setEndIso] = React.useState(todayIso);
  const [half, setHalf] = React.useState(false);
  const [time, setTime] = React.useState("14:00");
  const [saving, setSaving] = React.useState(false);
  const [periods, setPeriods] = React.useState<SickPeriod[]>([]);
  const [loaded, setLoaded] = React.useState(false);

  const loadPeriods = React.useCallback(async () => {
    const res = await listInstructorFerie(instructor.id);
    if (!res.success || !res.data) {
      setLoaded(true);
      return;
    }
    // Raggruppa i blocchi giornalieri contigui in periodi.
    const blocks = res.data
      .map((b) => {
        const starts = new Date(b.startsAt);
        return { id: b.id, iso: ymd(starts), startMinutes: starts.getHours() * 60 + starts.getMinutes() };
      })
      .sort((a, b) => a.iso.localeCompare(b.iso));
    const grouped: SickPeriod[] = [];
    for (const b of blocks) {
      const last = grouped[grouped.length - 1];
      const prevDate = last ? new Date(last.end + "T00:00:00") : null;
      if (prevDate) prevDate.setDate(prevDate.getDate() + 1);
      if (last && prevDate && ymd(prevDate) === b.iso) {
        last.end = b.iso;
        last.ids.push(b.id);
      } else {
        grouped.push({
          ids: [b.id],
          start: b.iso,
          end: b.iso,
          half: b.startMinutes > 0,
          time: b.startMinutes > 0 ? mmToLabel(b.startMinutes) : null,
        });
      }
    }
    setPeriods(grouped);
    setLoaded(true);
  }, [instructor.id]);

  React.useEffect(() => {
    void loadPeriods();
  }, [loadPeriods]);

  const save = async () => {
    if (!startIso || !endIso) return;
    setSaving(true);
    try {
      const res = await fetch("/api/autoscuole/instructor-vacation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instructorId: instructor.id,
          startDate: startIso,
          endDate: endIso,
          startTime: half ? time : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const cancelled = data.data.appointmentsCancelled as number;
        toast.success({
          description: `Ferie aggiunte.${cancelled > 0 ? ` ${cancelled} ${cancelled === 1 ? "guida cancellata" : "guide cancellate"}.` : ""}`,
        });
        setStartIso(todayIso);
        setEndIso(todayIso);
        setHalf(false);
        setTime("14:00");
        await loadPeriods();
        refreshAgenda();
      } else {
        toast.error({ description: data.message ?? "Errore nel salvataggio." });
      }
    } catch {
      toast.error({ description: "Errore nel salvataggio." });
    } finally {
      setSaving(false);
    }
  };

  const removePeriod = async (p: SickPeriod) => {
    const res = await deleteInstructorFerie(p.ids);
    if (!res.success) {
      toast.error({ description: res.message ?? "Impossibile rimuovere le ferie." });
      return;
    }
    toast.success({ description: "Ferie rimosse. Le guide già cancellate non vengono ripristinate." });
    await loadPeriods();
    refreshAgenda();
  };

  return (
    <div>
      <div className="mb-[18px] flex gap-3">
        <div className="flex-1">
          <div className={LBL}>Data inizio</div>
          <DatePickerInput
            value={startIso}
            onChange={(v) => {
              setStartIso(v);
              if (endIso < v) setEndIso(v);
            }}
            className="h-auto rounded-[10px] border-[1.5px] px-3.5 py-[11px]"
          />
        </div>
        <div className="flex-1">
          <div className={LBL}>Data fine</div>
          <DatePickerInput
            value={endIso}
            onChange={(v) => {
              setEndIso(v);
              if (v < startIso) setStartIso(v);
            }}
            className="h-auto rounded-[10px] border-[1.5px] px-3.5 py-[11px]"
          />
        </div>
      </div>

      <div className="flex items-center gap-3.5 border-t border-[#f0f0f0] py-4">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-[#222222]">Mezza giornata</div>
          <div className="mt-0.5 text-[12.5px] font-medium leading-snug text-[#929292]">
            Le ferie iniziano a un orario specifico del primo giorno.
          </div>
        </div>
        <InlineToggle checked={half} onChange={() => setHalf((v) => !v)} size="lg" />
      </div>
      {half && (
        <div className="mt-1">
          <div className={LBL}>Orario inizio ferie</div>
          <TimePickerInput value={time} onChange={setTime} minTime="06:00" maxTime="20:00" className="w-full justify-between py-[11px]" />
        </div>
      )}

      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="mt-[18px] flex w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-navy-900 p-[13px] text-sm font-semibold text-white transition-colors hover:bg-navy-800 disabled:opacity-60"
      >
        {saving ? <LoadingDots className="min-h-5" /> : "Aggiungi ferie"}
      </button>

      {loaded && (
        <AnimatePresence initial={false}>
          {periods.length > 0 && (
            <motion.div
              key="ferie-list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <div className={cn(LBL, "mt-7")}>Ferie registrate</div>
              <div className="flex flex-col">
                <AnimatePresence initial={false}>
                  {periods.map((p) => (
                    <motion.div
                      key={p.ids[0]}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.28, ease: "easeOut" }}
                      className="overflow-hidden"
                    >
                      <div className="flex items-center gap-3 border-b border-[#f2f2f2] px-0.5 py-[13px]">
                        <span className="size-2 shrink-0 rounded-full bg-[#e8a020]" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-[#222222]">
                            {p.start === p.end ? fmtIso(p.start) : `${fmtIso(p.start)} → ${fmtIso(p.end)}`}
                          </div>
                          <div className="mt-px text-[12.5px] font-medium text-[#929292]">
                            {p.half ? `Mezza giornata${p.time ? ` · dalle ${p.time}` : ""}` : "Giornata intera"}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void removePeriod(p)}
                          className="shrink-0 cursor-pointer text-sm font-semibold text-[#c1360f]"
                        >
                          Rimuovi
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}

// ═══ TAB GESTIONE AUTONOMA ═════════════════════════════════════════════════════

type TriState = "default" | "on" | "off";
const triOf = (v: unknown): TriState => (typeof v === "boolean" ? (v ? "on" : "off") : "default");
const triToBool = (v: TriState): boolean | undefined => (v === "default" ? undefined : v === "on");

const GOV_ROWS: Array<{ key: string; settingKey: string; title: string; sub: string }> = [
  { key: "scambio", settingKey: "swapEnabled", title: "Scambio guide", sub: "Scambio o spostamento di guide tra slot" },
  { key: "annullamento", settingKey: "studentCancellationEnabled", title: "Annullamento guide allievi", sub: "Gli allievi possono annullare le guide" },
  { key: "cutoff", settingKey: "bookingCutoffEnabled", title: "Cutoff prenotazione", sub: "Termine minimo per prenotare o annullare" },
  { key: "limite", settingKey: "weeklyBookingLimitEnabled", title: "Limite settimanale", sub: "Tetto massimo di guide a settimana" },
  { key: "notifiche", settingKey: "emptySlotNotificationEnabled", title: "Notifiche slot vuoti", sub: "Avvisa quando restano slot liberi" },
  { key: "fascia", settingKey: "restrictedTimeRangeEnabled", title: "Fascia oraria ristretta", sub: "Restringe la fascia oraria prenotabile" },
  { key: "assenza", settingKey: "weeklyAbsenceEnabled", title: "Assenza settimanale allievi", sub: "Gestione assenza settimanale lato allievi" },
];

const NOTIF_TIMES = ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00"];

function AutonomaTab({
  instructor,
  instructors,
  setInstructors,
  reloadInstructors,
  toast,
}: {
  instructor: InstructorDetail;
  instructors: InstructorDetail[];
  setInstructors: React.Dispatch<React.SetStateAction<InstructorDetail[]>>;
  reloadInstructors: () => Promise<void>;
  toast: ToastApi;
}) {
  // Draft locale dei settings (il backend RIMPIAZZA il JSON: si salva sempre l'oggetto intero)
  const [settings, setSettings] = React.useState<Record<string, unknown>>(
    () => ({ ...((instructor.settings ?? {}) as Record<string, unknown>) }),
  );
  const [autonomous, setAutonomous] = React.useState(instructor.autonomousMode ?? false);
  const [students, setStudents] = React.useState<StudentEntry[]>([]);
  const [assignedIds, setAssignedIds] = React.useState<string[]>([]);
  const [studentsLoaded, setStudentsLoaded] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [parcoOpen, setParcoOpen] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    getAutoscuolaStudentsWithProgress().then((res) => {
      if (!active || !res.success || !res.data) return;
      const list = res.data.map((s) => ({
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        assignedInstructorId: (s as Record<string, unknown>).assignedInstructorId as string | null,
        licenseCategory: s.licenseCategory ?? null,
        transmission: s.transmission ?? null,
      }));
      setStudents(list);
      setAssignedIds(list.filter((s) => s.assignedInstructorId === instructor.id).map((s) => s.id));
      setStudentsLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [instructor.id]);

  /** Persiste l'istruttore (settings SEMPRE completi). Rollback su errore. */
  const persist = async (
    patch: { settings?: Record<string, unknown>; autonomousMode?: boolean; assignStudentIds?: string[] },
    rollback: () => void,
  ) => {
    const res = await updateAutoscuolaInstructor({
      instructorId: instructor.id,
      ...(patch.autonomousMode !== undefined ? { autonomousMode: patch.autonomousMode } : {}),
      ...(patch.settings !== undefined
        ? { settings: patch.settings as Parameters<typeof updateAutoscuolaInstructor>[0]["settings"] }
        : {}),
      ...(patch.assignStudentIds !== undefined ? { assignStudentIds: patch.assignStudentIds } : {}),
    });
    if (!res.success) {
      rollback();
      toast.error({ description: res.message ?? "Impossibile salvare l'impostazione." });
      return;
    }
    if (patch.settings !== undefined || patch.autonomousMode !== undefined) {
      setInstructors((list) =>
        list.map((i) =>
          i.id === instructor.id
            ? {
                ...i,
                ...(patch.autonomousMode !== undefined ? { autonomousMode: patch.autonomousMode } : {}),
                ...(patch.settings !== undefined ? { settings: patch.settings } : {}),
              }
            : i,
        ),
      );
    }
    if (patch.assignStudentIds !== undefined) void reloadInstructors();
  };

  const saveSetting = (key: string, value: unknown) => {
    const prev = settings;
    const next = { ...settings };
    if (value === undefined) delete next[key];
    else next[key] = value;
    setSettings(next);
    void persist({ settings: next }, () => setSettings(prev));
  };

  const saveTri = (settingKey: string, v: TriState) => saveSetting(settingKey, triToBool(v));

  const toggleAutonomous = () => {
    const prev = autonomous;
    const next = !prev;
    setAutonomous(next);
    void persist({ autonomousMode: next, settings }, () => setAutonomous(prev));
  };

  const toggleStudent = (id: string) => {
    const prev = assignedIds;
    const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
    setAssignedIds(next);
    void persist({ assignStudentIds: next }, () => setAssignedIds(prev));
  };

  const durations = Array.isArray(settings.bookingSlotDurations)
    ? (settings.bookingSlotDurations as number[])
    : [30, 60];
  const toggleDuration = (d: number) => {
    const next = durations.includes(d) ? durations.filter((x) => x !== d) : [...durations, d].sort((a, b) => a - b);
    if (!next.length) {
      toast.error({ description: "Seleziona almeno una durata." });
      return;
    }
    saveSetting("bookingSlotDurations", next);
  };

  const notifTimes = Array.isArray(settings.emptySlotNotificationTimes)
    ? (settings.emptySlotNotificationTimes as string[])
    : [];

  const filteredStudents = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? students.filter((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(q)) : students;
    return [...base].sort((a, b) => {
      const aa = assignedIds.includes(a.id) ? 0 : 1;
      const bb = assignedIds.includes(b.id) ? 0 : 1;
      if (aa !== bb) return aa - bb;
      return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
    });
  }, [students, query, assignedIds]);

  return (
    <div>
      {/* Orario di lavoro */}
      <div className={LBL}>Orario di lavoro</div>
      <div className="mb-2 flex items-center gap-2.5">
        <TimePickerInput
          value={(settings.workingHoursStart as string) ?? null}
          onChange={(v) => saveSetting("workingHoursStart", v)}
          minTime="06:00"
          maxTime="23:00"
          placeholder="Non impostato"
          onClear={() => saveSetting("workingHoursStart", undefined)}
          clearLabel="Non impostato"
          className="min-w-0 flex-1 justify-between py-[11px]"
        />
        <span className="text-[13px] text-[#999999]">–</span>
        <TimePickerInput
          value={(settings.workingHoursEnd as string) ?? null}
          onChange={(v) => saveSetting("workingHoursEnd", v)}
          minTime="06:00"
          maxTime="24:00"
          placeholder="Non impostato"
          onClear={() => saveSetting("workingHoursEnd", undefined)}
          clearLabel="Non impostato"
          className="min-w-0 flex-1 justify-between py-[11px]"
        />
      </div>
      <div className="mb-[22px] text-xs font-medium leading-normal text-[#929292]">
        Definisci la fascia lavorativa per identificare le ore extra.
      </div>

      {/* Modalità autonoma */}
      <Row
        border
        title="Modalità autonoma"
        description="L'istruttore gestisce i propri allievi e impostazioni."
        control={<InlineToggle checked={autonomous} onChange={toggleAutonomous} size="lg" />}
      />

      {autonomous && (
        <div>
          {/* Codice invito (funzionalità reale, non nel proto: resta discreta qui) */}
          {instructor.inviteCode ? (
            <div className="mb-4 flex items-center gap-3 rounded-[12px] border border-[#e8e8e8] bg-[#fafafa] px-4 py-3">
              <span className="text-[13px] font-medium text-[#6a6a6a]">Codice istruttore</span>
              <span className="text-sm font-bold tracking-wider text-[#222222]">{instructor.inviteCode}</span>
              <button
                type="button"
                className="ml-auto cursor-pointer text-xs font-semibold text-[#222222] transition-opacity hover:opacity-70"
                onClick={() => {
                  void navigator.clipboard.writeText(instructor.inviteCode ?? "");
                  toast.success({ description: "Codice copiato." });
                }}
              >
                Copia
              </button>
            </div>
          ) : null}

          {/* Durata guide */}
          <div className="border-t border-[#f0f0f0] py-5">
            <div className="text-[15px] font-semibold text-[#222222]">Durata guide</div>
            <div className="mt-0.5 text-[13px] font-medium text-[#929292]">Durate proponibili per le guide</div>
            <div className="mt-4 flex flex-wrap gap-2">
              {[30, 45, 60, 90, 120].map((d) => (
                <BlueChip key={d} active={durations.includes(d)} onClick={() => toggleDuration(d)}>
                  {d} min
                </BlueChip>
              ))}
            </div>
          </div>

          <Row
            border
            title="Solo orari tondi"
            description="Gli slot partono solo a ore intere (es. 16:00, 17:00)."
            control={
              <InlineToggle
                checked={settings.roundedHoursOnly === true}
                onChange={() => saveSetting("roundedHoursOnly", settings.roundedHoursOnly !== true)}
                size="lg"
              />
            }
          />

          {/* Governance */}
          <div className={cn(LBL, "mt-[22px]")}>Governance prenotazione</div>
          <div className="mb-4 flex gap-2.5 rounded-[12px] bg-[#f6f7f9] px-[15px] py-[13px]">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-px shrink-0">
              <circle cx="8" cy="8" r="6.5" stroke="#8a8a8a" strokeWidth="1.4" />
              <path d="M8 7.2v3.6" stroke="#8a8a8a" strokeWidth="1.4" strokeLinecap="round" />
              <circle cx="8" cy="5" r="0.9" fill="#8a8a8a" />
            </svg>
            <div className="text-[12.5px] font-medium leading-normal text-[#6a6a6a]">
              Le opzioni impostate su <b className="font-semibold text-[#444444]">Autoscuola</b> (o{" "}
              <b className="font-semibold text-[#444444]">Default autoscuola</b>) ereditano l&apos;impostazione definita
              dall&apos;autoscuola.
            </div>
          </div>

          {/* Chi prenota */}
          <div className="border-t border-[#f0f0f0] py-5">
            <div className="text-[15px] font-semibold text-[#222222]">Chi prenota</div>
            <div className="mt-4">
              <OptField
                value={(settings.appBookingActors as string) ?? "default"}
                onChange={(v) => saveSetting("appBookingActors", v === "default" ? undefined : v)}
                options={[
                  { v: "default", l: "Default autoscuola" },
                  { v: "students", l: "Solo allievi" },
                  { v: "instructors", l: "Solo istruttori" },
                  { v: "both", l: "Entrambi" },
                ]}
              />
            </div>
          </div>

          {/* Modalità prenotazione */}
          <div className="border-t border-[#f0f0f0] py-5">
            <div className="text-[15px] font-semibold text-[#222222]">Modalità prenotazione</div>
            <div className="mt-4">
              <OptField
                value={(settings.instructorBookingMode as string) ?? "default"}
                onChange={(v) => saveSetting("instructorBookingMode", v === "default" ? undefined : v)}
                options={[
                  { v: "default", l: "Default autoscuola" },
                  { v: "manual_full", l: "Manuale totale" },
                  { v: "manual_engine", l: "Manuale + motore annullamenti" },
                ]}
              />
            </div>
          </div>

          {/* Righe governance con segmented Autoscuola/Sì/No */}
          {GOV_ROWS.map((g) => {
            const tri = triOf(settings[g.settingKey]);
            return (
              <div key={g.key} className="border-t border-[#f0f0f0]">
                <div className="flex items-center gap-3.5 py-[18px]">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-[#222222]">{g.title}</div>
                    <div className="mt-0.5 text-[12.5px] font-medium leading-snug text-[#929292]">{g.sub}</div>
                  </div>
                  <Seg
                    small
                    options={[
                      { v: "default", l: "Autoscuola" },
                      { v: "on", l: "Sì" },
                      { v: "off", l: "No" },
                    ]}
                    value={tri}
                    onChange={(v) => saveTri(g.settingKey, v)}
                  />
                </div>
                {tri === "on" && (
                  <div className="-mt-0.5 pb-[18px] pt-1">
                    {g.key === "scambio" && (
                      <div>
                        <div className={LBL}>Notifica scambio</div>
                        <OptField
                          value={(settings.swapNotifyMode as string) ?? "default"}
                          onChange={(v) => saveSetting("swapNotifyMode", v === "default" ? undefined : v)}
                          options={[
                            { v: "default", l: "Default autoscuola" },
                            { v: "all", l: "Tutti gli allievi" },
                            { v: "available_only", l: "Solo disponibili" },
                          ]}
                        />
                      </div>
                    )}
                    {g.key === "cutoff" && (
                      <div>
                        <div className={LBL}>Orario limite</div>
                        <TimePickerInput
                          value={(settings.bookingCutoffTime as string) ?? null}
                          onChange={(v) => saveSetting("bookingCutoffTime", v)}
                          minTime="12:00"
                          maxTime="22:00"
                          minuteStep={30}
                          placeholder="Default autoscuola"
                          onClear={() => saveSetting("bookingCutoffTime", undefined)}
                          clearLabel="Default autoscuola"
                          className="w-full justify-between py-[11px]"
                        />
                      </div>
                    )}
                    {g.key === "limite" && (
                      <div>
                        <div className={LBL}>Max guide a settimana</div>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          placeholder="es. 10"
                          className={PROTO_INPUT}
                          defaultValue={typeof settings.weeklyBookingLimit === "number" ? settings.weeklyBookingLimit : ""}
                          onBlur={(e) =>
                            saveSetting(
                              "weeklyBookingLimit",
                              e.target.value ? Math.max(1, Math.min(50, Number(e.target.value))) : undefined,
                            )
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                        />
                      </div>
                    )}
                    {g.key === "notifiche" && (
                      <>
                        <div>
                          <div className={LBL}>Destinatari</div>
                          <OptField
                            value={(settings.emptySlotNotificationTarget as string) ?? "default"}
                            onChange={(v) => saveSetting("emptySlotNotificationTarget", v === "default" ? undefined : v)}
                            options={[
                              { v: "default", l: "Default autoscuola" },
                              { v: "all", l: "Tutti gli allievi" },
                              { v: "availability_matching", l: "Solo con disponibilità" },
                            ]}
                          />
                        </div>
                        <div className="mt-4">
                          <div className={LBL}>Orari notifica</div>
                          <div className="flex flex-wrap gap-2">
                            {NOTIF_TIMES.map((t) => (
                              <BlueChip
                                key={t}
                                active={notifTimes.includes(t)}
                                onClick={() =>
                                  saveSetting(
                                    "emptySlotNotificationTimes",
                                    notifTimes.includes(t)
                                      ? notifTimes.filter((x) => x !== t)
                                      : [...notifTimes, t].sort(),
                                  )
                                }
                              >
                                {t}
                              </BlueChip>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                    {g.key === "fascia" && (
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <div className={LBL}>Inizio fascia</div>
                          <TimePickerInput
                            value={(settings.restrictedTimeRangeStart as string) ?? null}
                            onChange={(v) => saveSetting("restrictedTimeRangeStart", v)}
                            minTime="06:00"
                            maxTime="14:00"
                            minuteStep={30}
                            placeholder="Default autoscuola"
                            onClear={() => saveSetting("restrictedTimeRangeStart", undefined)}
                            clearLabel="Default autoscuola"
                            className="w-full justify-between py-[11px]"
                          />
                        </div>
                        <div className="flex-1">
                          <div className={LBL}>Fine fascia</div>
                          <TimePickerInput
                            value={(settings.restrictedTimeRangeEnd as string) ?? null}
                            onChange={(v) => saveSetting("restrictedTimeRangeEnd", v)}
                            minTime="09:00"
                            maxTime="16:00"
                            minuteStep={30}
                            placeholder="Default autoscuola"
                            onClear={() => saveSetting("restrictedTimeRangeEnd", undefined)}
                            clearLabel="Default autoscuola"
                            className="w-full justify-between py-[11px]"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Allievi assegnati */}
          <div className="border-t border-[#f0f0f0] py-5">
            <div className="text-[15px] font-semibold text-[#222222]">
              Allievi assegnati ({assignedIds.length})
            </div>
            <div className="mt-0.5 text-[13px] font-medium text-[#929292]">
              Assegna gli allievi gestiti da questo istruttore.
            </div>
            <div className="mt-3.5">
              <div className="relative mb-2.5">
                <input
                  placeholder="Cerca allievo…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className={cn(PROTO_INPUT, "pl-[38px]")}
                />
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="absolute left-[13px] top-1/2 -translate-y-1/2">
                  <circle cx="7" cy="7" r="5" stroke="#aaaaaa" strokeWidth="1.5" />
                  <path d="M11 11l3 3" stroke="#aaaaaa" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <div className="flex max-h-[230px] flex-col overflow-y-auto rounded-[12px] border border-[#eeeeee]">
                {!studentsLoaded ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="size-4 animate-spin text-[#929292]" />
                  </div>
                ) : !filteredStudents.length ? (
                  <div className="p-4 text-center text-[13px] text-[#aaaaaa]">Nessun allievo trovato</div>
                ) : (
                  filteredStudents.map((s, i) => {
                    const on = assignedIds.includes(s.id);
                    const other =
                      !on && s.assignedInstructorId && s.assignedInstructorId !== instructor.id
                        ? instructors.find((x) => x.id === s.assignedInstructorId)?.name
                        : null;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleStudent(s.id)}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 px-3.5 py-[11px] text-left",
                          i < filteredStudents.length - 1 && "border-b border-[#f4f4f4]",
                          on ? "bg-[#f7f8ff]" : "bg-white hover:bg-[#fafafa]",
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-5 shrink-0 items-center justify-center rounded-md border-[1.5px]",
                            on ? "border-navy-900 bg-navy-900" : "border-[#d5d5d5] bg-white",
                          )}
                        >
                          {on && <Check className="size-3 text-white" strokeWidth={2.4} />}
                        </span>
                        <span className="flex-1 truncate text-[13.5px] font-semibold text-[#222222]">
                          {s.firstName} {s.lastName}
                        </span>
                        {other ? (
                          <span className="shrink-0 rounded-md bg-[#f0f0f0] px-[7px] py-0.5 text-[11px] font-bold text-[#888888]">
                            {other}
                          </span>
                        ) : s.licenseCategory ? (
                          <span className="shrink-0 rounded-md bg-[#f0f0f0] px-[7px] py-0.5 text-[11px] font-bold text-[#888888]">
                            {s.licenseCategory}
                          </span>
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
              <button
                type="button"
                onClick={() => setParcoOpen(true)}
                className="mt-2.5 flex w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] border-[1.5px] border-navy-900 bg-white px-3 py-[11px] text-[13.5px] font-semibold text-navy-900 transition-colors hover:bg-navy-50"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="4.5" cy="4.5" r="2.2" stroke="currentColor" strokeWidth="1.3" />
                  <circle cx="11.5" cy="4.5" r="2.2" stroke="currentColor" strokeWidth="1.3" />
                  <circle cx="8" cy="10.5" r="2.2" stroke="currentColor" strokeWidth="1.3" />
                </svg>
                Apri Parco Allievi
              </button>
            </div>
          </div>
        </div>
      )}
      {parcoOpen && (
        <ParcoAllievi
          students={students}
          assignedIds={assignedIds}
          onToggle={toggleStudent}
          onClose={() => setParcoOpen(false)}
        />
      )}
    </div>
  );
}

// ═══ PARCO ALLIEVI — overlay fisheye a bolle esagonali ═════════════════════════

const PARCO_PAL: Array<{ bg: string; fg: string }> = [
  { bg: "#dbeafe", fg: "#1e3a5f" },
  { bg: "#fce7f0", fg: "#be1250" },
  { bg: "#dcfce7", fg: "#15803d" },
  { bg: "#ede9fe", fg: "#5b21b6" },
  { bg: "#fff0dd", fg: "#b45309" },
  { bg: "#d9f2f4", fg: "#0e7490" },
  { bg: "#ffe4e6", fg: "#be123c" },
  { bg: "#e7eaf6", fg: "#3730a3" },
];

const initialsOf = (name: string) =>
  name
    .split(/[\s.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

/** Coordinate assiali di una spirale esagonale (centro incluso). */
function hexSpiral(count: number): Array<[number, number]> {
  const dirs: Array<[number, number]> = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
  const cells: Array<[number, number]> = [[0, 0]];
  for (let rad = 1; cells.length < count; rad++) {
    let q = dirs[4][0] * rad;
    let r = dirs[4][1] * rad;
    for (let s = 0; s < 6; s++) {
      for (let st = 0; st < rad; st++) {
        if (cells.length < count) cells.push([q, r]);
        q += dirs[s][0];
        r += dirs[s][1];
      }
    }
  }
  return cells;
}

function ParcoAllievi({
  students,
  assignedIds,
  onToggle,
  onClose,
}: {
  students: StudentEntry[];
  assignedIds: string[];
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  const gridRef = React.useRef<HTMLDivElement>(null);
  const bubbleRefs = React.useRef(new Map<string, HTMLDivElement>());
  const mouse = React.useRef({ x: 0.5, y: 0.5 });
  const pan = React.useRef({ x: 0, y: 0 });
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [addQuery, setAddQuery] = React.useState("");

  const colorOf = React.useCallback(
    (id: string) => {
      const i = students.findIndex((s) => s.id === id);
      return PARCO_PAL[(i < 0 ? 0 : i) % PARCO_PAL.length];
    },
    [students],
  );

  const assigned = assignedIds
    .map((id) => students.find((s) => s.id === id))
    .filter((s): s is StudentEntry => Boolean(s));
  // prima bolla = "aggiungi", poi gli assegnati in spirale
  const items: Array<{ add: true } | StudentEntry> = [{ add: true as const }, ...assigned];
  const coords = hexSpiral(items.length);
  const SZ = 52;
  const BUB = 74;

  // blocco scroll body + Escape
  React.useEffect(() => {
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // parallax + fisheye (rAF, niente re-render React)
  React.useEffect(() => {
    let alive = true;
    const onMove = (e: MouseEvent) => {
      if (addOpen) return; // fermo mentre si cerca
      mouse.current = { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight };
    };
    window.addEventListener("mousemove", onMove);
    const frame = () => {
      if (!alive) return;
      const bubbles = Array.from(bubbleRefs.current.values());
      let extX = 0;
      let extY = 0;
      for (const b of bubbles) {
        extX = Math.max(extX, Math.abs(Number(b.dataset.bx)));
        extY = Math.max(extY, Math.abs(Number(b.dataset.by)));
      }
      const tx = -(mouse.current.x - 0.5) * (extX * 1.1 + 80) * 2;
      const ty = -(mouse.current.y - 0.5) * (extY * 1.1 + 80) * 2;
      pan.current.x += (tx - pan.current.x) * 0.12;
      pan.current.y += (ty - pan.current.y) * 0.12;
      if (gridRef.current) gridRef.current.style.transform = `translate(${pan.current.x}px, ${pan.current.y}px)`;
      const cw = window.innerWidth / 2;
      const ch = window.innerHeight / 2;
      for (const b of bubbles) {
        const sx = Number(b.dataset.bx) + pan.current.x + cw;
        const sy = Number(b.dataset.by) + pan.current.y + ch;
        const d = Math.hypot(sx - cw, sy - ch);
        const sc = Math.max(0.4, Math.min(1.25, 1.25 - d / 460));
        b.style.transform = `scale(${sc})`;
        b.style.zIndex = String(Math.round(sc * 100));
        b.style.opacity = String(Math.max(0.35, Math.min(1, sc)));
      }
      requestAnimationFrame(frame);
    };
    const raf = requestAnimationFrame(frame);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
    };
  }, [addOpen]);

  const detail = detailId ? students.find((s) => s.id === detailId) ?? null : null;
  const addable = students.filter(
    (s) =>
      !assignedIds.includes(s.id) &&
      (addQuery.trim() ? `${s.firstName} ${s.lastName}`.toLowerCase().includes(addQuery.trim().toLowerCase()) : true),
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[80] overflow-hidden"
      style={{ background: "radial-gradient(circle at 50% 40%, #ffffff 0%, #eceef2 78%)", fontFamily: "inherit" }}
    >
      {/* Header */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[5] flex items-center justify-between px-7 py-[22px]">
        <div className="pointer-events-auto">
          <div className="text-xl font-bold tracking-[-0.3px] text-[#222222]">Parco Allievi</div>
          <div className="mt-0.5 text-[13px] font-medium text-[#929292]">
            Muovi il mouse per esplorare · clicca per i dettagli
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="pointer-events-auto flex size-8 cursor-pointer items-center justify-center rounded-full bg-[#f7f7f7] transition-colors hover:bg-[#f0f0f0]"
        >
          <X className="size-3.5 text-[#6a6a6a]" strokeWidth={1.8} />
        </button>
      </div>

      {/* Stage */}
      <div className="absolute inset-0">
        <div ref={gridRef} className="absolute left-1/2 top-1/2 will-change-transform">
          {items.map((it, i) => {
            const [q, r] = coords[i];
            const x = SZ * Math.sqrt(3) * (q + r / 2);
            const y = SZ * 1.5 * r;
            const key = "add" in it ? "__add__" : it.id;
            return (
              <div
                key={key}
                ref={(el) => {
                  if (el) bubbleRefs.current.set(key, el);
                  else bubbleRefs.current.delete(key);
                }}
                data-bx={x}
                data-by={y}
                className="absolute flex cursor-pointer items-center justify-center will-change-transform"
                style={{ width: BUB, height: BUB, left: x - BUB / 2, top: y - BUB / 2, borderRadius: "50%" }}
                onClick={() => {
                  if ("add" in it) {
                    setDetailId(null);
                    setAddOpen(true);
                    setAddQuery("");
                  } else {
                    setAddOpen(false);
                    setDetailId(it.id);
                  }
                }}
              >
                {"add" in it ? (
                  <div className="flex size-full items-center justify-center rounded-full border-2 border-dashed border-[#c4c4cc] bg-black/[0.03]">
                    <Plus className="size-6 text-[#7a7a7a]" strokeWidth={2.2} />
                  </div>
                ) : (
                  (() => {
                    const col = colorOf(it.id);
                    return (
                      <div
                        className="flex size-full items-center justify-center rounded-full text-[22px] font-bold"
                        style={{ background: col.bg, color: col.fg }}
                      >
                        {initialsOf(`${it.firstName} ${it.lastName}`)}
                      </div>
                    );
                  })()
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Card dettaglio allievo */}
      {detail && (
        <div className="absolute bottom-9 left-1/2 z-20 w-[340px] max-w-[90vw] -translate-x-1/2 rounded-[22px] border border-[#ececec] bg-white p-[22px] shadow-[0_16px_50px_rgba(0,0,0,0.18)]">
          <button
            type="button"
            onClick={() => setDetailId(null)}
            className="absolute right-3.5 top-3.5 flex size-8 cursor-pointer items-center justify-center rounded-full bg-[#f7f7f7] transition-colors hover:bg-[#f0f0f0]"
          >
            <X className="size-3.5 text-[#6a6a6a]" strokeWidth={1.8} />
          </button>
          <div className="mb-[18px] flex items-center gap-3.5 pr-[38px]">
            <div
              className="flex size-[52px] shrink-0 items-center justify-center rounded-full text-[19px] font-bold"
              style={{ background: colorOf(detail.id).bg, color: colorOf(detail.id).fg }}
            >
              {initialsOf(`${detail.firstName} ${detail.lastName}`)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[17px] font-bold text-[#222222]">
                {detail.firstName} {detail.lastName}
              </div>
              <div className="mt-0.5 text-[13px] font-medium text-[#929292]">
                {detail.licenseCategory ? `Patente ${detail.licenseCategory} · ` : ""}
                {assignedIds.includes(detail.id) ? "Assegnato" : "Non assegnato"}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onToggle(detail.id)}
            className={cn(
              "flex w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] p-[13px] text-sm font-semibold transition-colors",
              assignedIds.includes(detail.id)
                ? "bg-[#f4f4f4] text-[#c13515] hover:bg-[#eeeeee]"
                : "bg-navy-900 text-white hover:bg-navy-800",
            )}
          >
            {assignedIds.includes(detail.id) ? "Rimuovi dall'istruttore" : "Assegna all'istruttore"}
          </button>
        </div>
      )}

      {/* Card aggiungi allievo */}
      {addOpen && (
        <div className="absolute bottom-9 left-1/2 z-20 w-[360px] max-w-[90vw] -translate-x-1/2 rounded-[22px] border border-[#ececec] bg-white p-[22px] shadow-[0_16px_50px_rgba(0,0,0,0.18)]">
          <button
            type="button"
            onClick={() => setAddOpen(false)}
            className="absolute right-3.5 top-3.5 flex size-8 cursor-pointer items-center justify-center rounded-full bg-[#f7f7f7] transition-colors hover:bg-[#f0f0f0]"
          >
            <X className="size-3.5 text-[#6a6a6a]" strokeWidth={1.8} />
          </button>
          <div className="mb-3.5 pr-[38px] text-base font-bold text-[#222222]">Aggiungi allievo</div>
          <div className="relative mb-2.5">
            <input
              autoFocus
              placeholder="Cerca allievo…"
              value={addQuery}
              onChange={(e) => setAddQuery(e.target.value)}
              className={cn(PROTO_INPUT, "pl-[38px]")}
            />
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="absolute left-[13px] top-1/2 -translate-y-1/2">
              <circle cx="7" cy="7" r="5" stroke="#aaaaaa" strokeWidth="1.5" />
              <path d="M11 11l3 3" stroke="#aaaaaa" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <div className="flex max-h-[220px] flex-col overflow-y-auto rounded-[12px] border border-[#eeeeee]">
            {!addable.length ? (
              <div className="p-4 text-center text-[13px] text-[#aaaaaa]">Nessun allievo trovato</div>
            ) : (
              addable.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onToggle(s.id)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 px-3.5 py-[11px] text-left hover:bg-[#fafafa]",
                    i < addable.length - 1 && "border-b border-[#f4f4f4]",
                  )}
                >
                  <span className="flex-1 truncate text-[13.5px] font-semibold text-[#222222]">
                    {s.firstName} {s.lastName}
                  </span>
                  {s.licenseCategory ? (
                    <span className="shrink-0 rounded-md bg-[#f0f0f0] px-[7px] py-0.5 text-[11px] font-bold text-[#888888]">
                      {s.licenseCategory}
                    </span>
                  ) : null}
                  <Plus className="size-3.5 shrink-0 text-navy-900" strokeWidth={2} />
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
