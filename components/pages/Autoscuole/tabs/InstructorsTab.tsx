"use client";

import React from "react";
import { Plus, Clock, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/animate-ui/radix/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { FieldGroup } from "@/components/ui/field-group";
import { ToggleChip } from "@/components/ui/toggle-chip";
import { InlineToggle } from "@/components/ui/inline-toggle";
import {
  ResourceCard,
  SlotPill,
  ResourceCardAction,
} from "@/components/ui/resource-card";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type InstructorDetail = {
  id: string;
  name: string;
  status: string;
  autonomousMode?: boolean;
  settings?: unknown;
  _count?: { assignedStudents: number };
};

type VehicleWeeklyAvailability = {
  daysOfWeek: number[];
  startMinutes: number;
  endMinutes: number;
  ranges?: Array<{ startMinutes: number; endMinutes: number }>;
};

type AvailabilityRange = { start: Date; end: Date };

type StudentEntry = {
  id: string;
  firstName: string;
  lastName: string;
  assignedInstructorId: string | null;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const BOOKING_DURATION_OPTIONS = [30, 45, 60, 90, 120] as const;

const WEEKDAY_OPTIONS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mer" },
  { value: 4, label: "Gio" },
  { value: 5, label: "Ven" },
  { value: 6, label: "Sab" },
  { value: 0, label: "Dom" },
] as const;

// ── Helpers ────────────────────────────────────────────────────────────────────

function pad(v: number) {
  return v.toString().padStart(2, "0");
}

function formatMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${pad(hours)}:${pad(minutes)}`;
}

function formatTime(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function diffMinutes(a: Date, b: Date) {
  return (a.getTime() - b.getTime()) / 60000;
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface InstructorsTabProps {
  instructors: InstructorDetail[];
  instructorWeeklyAvailability: Record<string, VehicleWeeklyAvailability | null>;
  instructorAvailability: Record<string, AvailabilityRange[]>;

  openClusterPanel: (instructor: InstructorDetail) => void;
  openInstructorAvailabilityDialog: (instructor: InstructorDetail) => void;
  setInviteInstructorOpen: (open: boolean) => void;

  // Sick leave
  setSickLeaveInstructor: (instructor: InstructorDetail) => void;
  setSickLeaveStartDate: (date: string) => void;
  setSickLeaveEndDate: (date: string) => void;
  setSickLeaveHalfDay: (halfDay: boolean) => void;
  setSickLeaveStartTime: (time: string) => void;

  // Cluster panel state
  clusterInstructor: InstructorDetail | null;
  setClusterInstructor: (instructor: InstructorDetail | null) => void;

  clusterAutonomous: boolean;
  setClusterAutonomous: React.Dispatch<React.SetStateAction<boolean>>;

  clusterDurations: number[];
  setClusterDurations: React.Dispatch<React.SetStateAction<number[]>>;

  clusterRoundedHours: boolean;
  setClusterRoundedHours: React.Dispatch<React.SetStateAction<boolean>>;

  clusterAppBookingActors: "students" | "instructors" | "both" | undefined;
  setClusterAppBookingActors: React.Dispatch<React.SetStateAction<"students" | "instructors" | "both" | undefined>>;

  clusterInstructorBookingMode: "manual_full" | "manual_engine" | undefined;
  setClusterInstructorBookingMode: React.Dispatch<React.SetStateAction<"manual_full" | "manual_engine" | undefined>>;

  clusterSwapEnabled: boolean | undefined;
  setClusterSwapEnabled: React.Dispatch<React.SetStateAction<boolean | undefined>>;

  clusterSwapNotifyMode: "all" | "available_only" | undefined;
  setClusterSwapNotifyMode: React.Dispatch<React.SetStateAction<"all" | "available_only" | undefined>>;

  clusterBookingCutoffEnabled: boolean | undefined;
  setClusterBookingCutoffEnabled: React.Dispatch<React.SetStateAction<boolean | undefined>>;

  clusterBookingCutoffTime: string | undefined;
  setClusterBookingCutoffTime: (time: string | undefined) => void;

  clusterWeeklyLimitEnabled: boolean | undefined;
  setClusterWeeklyLimitEnabled: React.Dispatch<React.SetStateAction<boolean | undefined>>;

  clusterWeeklyLimit: number | undefined;
  setClusterWeeklyLimit: (limit: number | undefined) => void;

  clusterEmptySlotEnabled: boolean | undefined;
  setClusterEmptySlotEnabled: React.Dispatch<React.SetStateAction<boolean | undefined>>;

  clusterEmptySlotTarget: "all" | "availability_matching" | undefined;
  setClusterEmptySlotTarget: React.Dispatch<React.SetStateAction<"all" | "availability_matching" | undefined>>;

  clusterEmptySlotTimes: string[] | undefined;
  setClusterEmptySlotTimes: React.Dispatch<React.SetStateAction<string[] | undefined>>;

  clusterRestrictedTimeEnabled: boolean | undefined;
  setClusterRestrictedTimeEnabled: React.Dispatch<React.SetStateAction<boolean | undefined>>;

  clusterRestrictedTimeStart: string | undefined;
  setClusterRestrictedTimeStart: (time: string | undefined) => void;

  clusterRestrictedTimeEnd: string | undefined;
  setClusterRestrictedTimeEnd: (time: string | undefined) => void;

  clusterWeeklyAbsenceEnabled: boolean | undefined;
  setClusterWeeklyAbsenceEnabled: React.Dispatch<React.SetStateAction<boolean | undefined>>;

  clusterWorkingHoursStart: string | undefined;
  setClusterWorkingHoursStart: (time: string | undefined) => void;

  clusterWorkingHoursEnd: string | undefined;
  setClusterWorkingHoursEnd: (time: string | undefined) => void;

  clusterAvailabilityMode: "default" | "publication";
  setClusterAvailabilityMode: (mode: "default" | "publication") => void;

  saveClusterSettings: () => void;
  clusterSaving: boolean;

  allStudents: StudentEntry[];
  clusterStudentIds: string[];
  setClusterStudentIds: React.Dispatch<React.SetStateAction<string[]>>;
  clusterStudentSearch: string;
  setClusterStudentSearch: (search: string) => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function InstructorsTab({
  instructors,
  instructorWeeklyAvailability,
  instructorAvailability,
  openClusterPanel,
  openInstructorAvailabilityDialog,
  setInviteInstructorOpen,
  setSickLeaveInstructor,
  setSickLeaveStartDate,
  setSickLeaveEndDate,
  setSickLeaveHalfDay,
  setSickLeaveStartTime,
  clusterInstructor,
  setClusterInstructor,
  clusterAutonomous,
  setClusterAutonomous,
  clusterDurations,
  setClusterDurations,
  clusterRoundedHours,
  setClusterRoundedHours,
  clusterAppBookingActors,
  setClusterAppBookingActors,
  clusterInstructorBookingMode,
  setClusterInstructorBookingMode,
  clusterSwapEnabled,
  setClusterSwapEnabled,
  clusterSwapNotifyMode,
  setClusterSwapNotifyMode,
  clusterBookingCutoffEnabled,
  setClusterBookingCutoffEnabled,
  clusterBookingCutoffTime,
  setClusterBookingCutoffTime,
  clusterWeeklyLimitEnabled,
  setClusterWeeklyLimitEnabled,
  clusterWeeklyLimit,
  setClusterWeeklyLimit,
  clusterEmptySlotEnabled,
  setClusterEmptySlotEnabled,
  clusterEmptySlotTarget,
  setClusterEmptySlotTarget,
  clusterEmptySlotTimes,
  setClusterEmptySlotTimes,
  clusterRestrictedTimeEnabled,
  setClusterRestrictedTimeEnabled,
  clusterRestrictedTimeStart,
  setClusterRestrictedTimeStart,
  clusterRestrictedTimeEnd,
  setClusterRestrictedTimeEnd,
  clusterWeeklyAbsenceEnabled,
  setClusterWeeklyAbsenceEnabled,
  clusterWorkingHoursStart,
  setClusterWorkingHoursStart,
  clusterWorkingHoursEnd,
  setClusterWorkingHoursEnd,
  clusterAvailabilityMode,
  setClusterAvailabilityMode,
  saveClusterSettings,
  clusterSaving,
  allStudents,
  clusterStudentIds,
  setClusterStudentIds,
  clusterStudentSearch,
  setClusterStudentSearch,
}: InstructorsTabProps) {
  return (
    <>
      <div className="flex items-center justify-between">
        <div />
        <Button
          size="sm"
          onClick={() => setInviteInstructorOpen(true)}
        >
          <Plus className="size-3.5 mr-1.5" />
          Invita istruttore
        </Button>
      </div>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
        {instructors.map((instructor) => {
          const wa = instructorWeeklyAvailability[instructor.id] ?? null;
          const ranges = instructorAvailability[instructor.id] ?? [];
          const totalMinutes = ranges.reduce((sum, r) => sum + diffMinutes(r.end, r.start), 0);
          return (
            <ResourceCard
              key={instructor.id}
              name={instructor.name}
              inactive={instructor.status === "inactive"}
              subtitle={(() => {
                const parts: string[] = [];
                if (instructor.autonomousMode) parts.push(`Autonomo · ${instructor._count?.assignedStudents ?? 0} allievi`);
                const s = (instructor.settings ?? {}) as Record<string, unknown>;
                if (typeof s.workingHoursStart === "string" && typeof s.workingHoursEnd === "string") {
                  parts.push(`Orario lavoro: ${s.workingHoursStart}–${s.workingHoursEnd}`);
                }
                return parts.length ? parts.join(" · ") : undefined;
              })()}
              actions={
                <>
                  <ResourceCardAction
                    onClick={() => openClusterPanel(instructor)}
                    title="Gestione autonoma"
                  >
                    <Settings2 className="size-3.5" />
                  </ResourceCardAction>
                  <ResourceCardAction
                    onClick={() => openInstructorAvailabilityDialog(instructor)}
                    title="Modifica disponibilità"
                  >
                    <Clock className="size-3.5" />
                  </ResourceCardAction>
                  <ResourceCardAction
                    onClick={() => {
                      setSickLeaveInstructor(instructor);
                      const today = new Date();
                      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
                      setSickLeaveStartDate(todayStr);
                      setSickLeaveEndDate(todayStr);
                      setSickLeaveHalfDay(false);
                      setSickLeaveStartTime("14:00");
                    }}
                    title="Segna malattia"
                  >
                    {"🤒"}
                  </ResourceCardAction>
                </>
              }
              availabilitySummary={
                wa ? (
                  <span>
                    {formatMinutes(wa.startMinutes)}–{formatMinutes(wa.endMinutes)} ·{" "}
                    {wa.daysOfWeek
                      .map((d) => WEEKDAY_OPTIONS.find((w) => w.value === d)?.label ?? "")
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                ) : (
                  <span className="italic opacity-60">Nessuna disponibilità settimanale</span>
                )
              }
              slots={
                ranges.length > 0
                  ? ranges.map((range) => (
                      <SlotPill key={`${range.start.toISOString()}-${range.end.toISOString()}`}>
                        {formatTime(range.start)}–{formatTime(range.end)}
                      </SlotPill>
                    ))
                  : undefined
              }
              totalLabel={totalMinutes > 0 ? `${Math.round(totalMinutes)} min` : undefined}
            />
          );
        })}
        {!instructors.length ? (
          <div className="flex items-center justify-center rounded-xl border border-dashed border-border bg-gray-50/50 p-6 text-sm text-muted-foreground">
            Nessun istruttore disponibile.
          </div>
        ) : null}
      </div>

      {/* ── Cluster panel dialog ── */}
      <Dialog open={Boolean(clusterInstructor)} onOpenChange={(open) => !open && setClusterInstructor(null)}>
        <DialogContent className="sm:max-w-[520px] gap-0 p-0 overflow-hidden max-h-[80vh] overflow-y-auto">
          <div className="px-6 pt-5 pb-4 border-b border-border">
            <DialogHeader>
              <DialogTitle>Gestione autonoma — {clusterInstructor?.name}</DialogTitle>
            </DialogHeader>
          </div>
          <div className="px-6 py-5 space-y-5">
            {/* ── Orario di lavoro ── */}
            <div className="space-y-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Orario di lavoro</span>
              <p className="text-xs text-muted-foreground -mt-1">Definisci la fascia lavorativa per identificare ore extra.</p>
              <div className="grid grid-cols-2 gap-3">
                <FieldGroup label="Inizio">
                  <Select value={clusterWorkingHoursStart ?? ""} onValueChange={(v) => setClusterWorkingHoursStart(v || undefined)}>
                    <SelectTrigger><SelectValue placeholder="Non impostato" /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 35 }, (_, i) => {
                        const h = Math.floor(i / 2) + 6;
                        const m = (i % 2) * 30;
                        const val = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
                        return <SelectItem key={val} value={val}>{val}</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                </FieldGroup>
                <FieldGroup label="Fine">
                  <Select value={clusterWorkingHoursEnd ?? ""} onValueChange={(v) => setClusterWorkingHoursEnd(v || undefined)}>
                    <SelectTrigger><SelectValue placeholder="Non impostato" /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 35 }, (_, i) => {
                        const h = Math.floor(i / 2) + 6;
                        const m = (i % 2) * 30;
                        const val = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
                        return <SelectItem key={val} value={val}>{val}</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                </FieldGroup>
              </div>
            </div>

            <FieldGroup label="Modalità disponibilità">
              <Select value={clusterAvailabilityMode} onValueChange={(v) => setClusterAvailabilityMode(v as "default" | "publication")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Predefinita</SelectItem>
                  <SelectItem value="publication">A pubblicazione</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">
                In modalità pubblicazione, l&apos;istruttore imposta la disponibilità settimana per settimana.
              </span>
            </FieldGroup>

            <div
              className="flex items-center justify-between rounded-xl border border-border/60 bg-white/70 px-4 py-3 cursor-pointer"
              onClick={() => setClusterAutonomous((prev) => !prev)}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Modalità autonoma</span>
                <span className="text-xs text-muted-foreground">
                  L&apos;istruttore gestisce i propri allievi e impostazioni.
                </span>
              </div>
              <InlineToggle checked={clusterAutonomous} size="sm" />
            </div>

            {clusterAutonomous ? (
              <>
                <FieldGroup label="Durata guide">
                  <div className="flex flex-wrap gap-1.5">
                    {BOOKING_DURATION_OPTIONS.map((dur) => (
                      <ToggleChip
                        key={dur}
                        active={clusterDurations.includes(dur)}
                        onClick={() =>
                          setClusterDurations((prev) =>
                            prev.includes(dur) ? prev.filter((d) => d !== dur) : [...prev, dur].sort((a, b) => a - b),
                          )
                        }
                        size="sm"
                      >
                        {dur} min
                      </ToggleChip>
                    ))}
                  </div>
                </FieldGroup>

                <div
                  className="flex items-center justify-between rounded-xl border border-border/60 bg-white/70 px-4 py-3 cursor-pointer"
                  onClick={() => setClusterRoundedHours((prev) => !prev)}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">Solo orari tondi</span>
                    <span className="text-xs text-muted-foreground">
                      Proponi solo slot che iniziano a ore piene.
                    </span>
                  </div>
                  <InlineToggle checked={clusterRoundedHours} size="sm" />
                </div>

                {/* ── Governance prenotazione (override cluster) ── */}
                <div className="space-y-3 border-t border-border/40 pt-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Governance prenotazione</span>
                  <FieldGroup label="Chi prenota">
                    <Select value={clusterAppBookingActors ?? ""} onValueChange={(v) => setClusterAppBookingActors((v || undefined) as "students" | "instructors" | "both" | undefined)}>
                      <SelectTrigger><SelectValue placeholder="Default azienda" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="students">Solo allievi</SelectItem>
                        <SelectItem value="instructors">Solo istruttori</SelectItem>
                        <SelectItem value="both">Entrambi</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldGroup>
                  <FieldGroup label="Modalità prenotazione istruttore">
                    <Select value={clusterInstructorBookingMode ?? ""} onValueChange={(v) => setClusterInstructorBookingMode((v || undefined) as "manual_full" | "manual_engine" | undefined)}>
                      <SelectTrigger><SelectValue placeholder="Default azienda" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual_full">Manuale totale</SelectItem>
                        <SelectItem value="manual_engine">Manuale + motore annullamenti</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldGroup>
                </div>

                {/* ── Scambio guide ── */}
                <div className="space-y-3 border-t border-border/40 pt-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Scambio guide</span>
                  <div
                    className="flex items-center justify-between rounded-xl border border-border/60 bg-white/70 px-4 py-3 cursor-pointer"
                    onClick={() => setClusterSwapEnabled((prev) => prev === undefined ? true : prev ? false : undefined)}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">Scambio guide</span>
                      <span className="text-xs text-muted-foreground">{clusterSwapEnabled === undefined ? "Default azienda" : clusterSwapEnabled ? "Attivo" : "Disattivo"}</span>
                    </div>
                    <InlineToggle checked={clusterSwapEnabled ?? false} size="sm" />
                  </div>
                  {clusterSwapEnabled && (
                    <FieldGroup label="Notifica scambio">
                      <Select value={clusterSwapNotifyMode ?? ""} onValueChange={(v) => setClusterSwapNotifyMode((v || undefined) as "all" | "available_only" | undefined)}>
                        <SelectTrigger><SelectValue placeholder="Default azienda" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tutti gli allievi</SelectItem>
                          <SelectItem value="available_only">Solo disponibili</SelectItem>
                        </SelectContent>
                      </Select>
                    </FieldGroup>
                  )}
                </div>

                {/* ── Cutoff prenotazione ── */}
                <div className="space-y-3 border-t border-border/40 pt-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cutoff prenotazione</span>
                  <div
                    className="flex items-center justify-between rounded-xl border border-border/60 bg-white/70 px-4 py-3 cursor-pointer"
                    onClick={() => setClusterBookingCutoffEnabled((prev) => prev === undefined ? true : prev ? false : undefined)}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">Cutoff prenotazione</span>
                      <span className="text-xs text-muted-foreground">{clusterBookingCutoffEnabled === undefined ? "Default azienda" : clusterBookingCutoffEnabled ? "Attivo" : "Disattivo"}</span>
                    </div>
                    <InlineToggle checked={clusterBookingCutoffEnabled ?? false} size="sm" />
                  </div>
                  {clusterBookingCutoffEnabled && (
                    <FieldGroup label="Orario limite">
                      <Select value={clusterBookingCutoffTime ?? ""} onValueChange={(v) => setClusterBookingCutoffTime(v || undefined)}>
                        <SelectTrigger><SelectValue placeholder="Default azienda" /></SelectTrigger>
                        <SelectContent>
                          {["12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00","21:00","22:00"].map((t) => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FieldGroup>
                  )}
                </div>

                {/* ── Limite settimanale ── */}
                <div className="space-y-3 border-t border-border/40 pt-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Limite guide settimanali</span>
                  <div
                    className="flex items-center justify-between rounded-xl border border-border/60 bg-white/70 px-4 py-3 cursor-pointer"
                    onClick={() => setClusterWeeklyLimitEnabled((prev) => prev === undefined ? true : prev ? false : undefined)}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">Limite settimanale</span>
                      <span className="text-xs text-muted-foreground">{clusterWeeklyLimitEnabled === undefined ? "Default azienda" : clusterWeeklyLimitEnabled ? "Attivo" : "Disattivo"}</span>
                    </div>
                    <InlineToggle checked={clusterWeeklyLimitEnabled ?? false} size="sm" />
                  </div>
                  {clusterWeeklyLimitEnabled && (
                    <FieldGroup label="Max guide a settimana">
                      <input
                        type="number"
                        min={1}
                        max={50}
                        className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-foreground outline-none focus:border-primary/40"
                        value={clusterWeeklyLimit ?? ""}
                        onChange={(e) => setClusterWeeklyLimit(e.target.value ? Number(e.target.value) : undefined)}
                      />
                    </FieldGroup>
                  )}
                </div>

                {/* ── Notifiche slot vuoti ── */}
                <div className="space-y-3 border-t border-border/40 pt-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notifiche slot vuoti</span>
                  <div
                    className="flex items-center justify-between rounded-xl border border-border/60 bg-white/70 px-4 py-3 cursor-pointer"
                    onClick={() => setClusterEmptySlotEnabled((prev) => prev === undefined ? true : prev ? false : undefined)}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">Notifiche slot vuoti</span>
                      <span className="text-xs text-muted-foreground">{clusterEmptySlotEnabled === undefined ? "Default azienda" : clusterEmptySlotEnabled ? "Attivo" : "Disattivo"}</span>
                    </div>
                    <InlineToggle checked={clusterEmptySlotEnabled ?? false} size="sm" />
                  </div>
                  {clusterEmptySlotEnabled && (
                    <>
                      <FieldGroup label="Destinatari">
                        <Select value={clusterEmptySlotTarget ?? ""} onValueChange={(v) => setClusterEmptySlotTarget((v || undefined) as "all" | "availability_matching" | undefined)}>
                          <SelectTrigger><SelectValue placeholder="Default azienda" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Tutti gli allievi</SelectItem>
                            <SelectItem value="availability_matching">Solo con disponibilità</SelectItem>
                          </SelectContent>
                        </Select>
                      </FieldGroup>
                      <FieldGroup label="Orari notifica">
                        <div className="flex flex-wrap gap-1.5">
                          {["08:00","10:00","12:00","14:00","16:00","18:00","20:00"].map((t) => (
                            <ToggleChip
                              key={t}
                              active={(clusterEmptySlotTimes ?? []).includes(t)}
                              onClick={() => setClusterEmptySlotTimes((prev) => {
                                const current = prev ?? [];
                                return current.includes(t) ? current.filter((x) => x !== t) : [...current, t].sort();
                              })}
                              size="sm"
                            >
                              {t}
                            </ToggleChip>
                          ))}
                        </div>
                      </FieldGroup>
                    </>
                  )}
                </div>

                {/* ── Fascia oraria ristretta ── */}
                <div className="space-y-3 border-t border-border/40 pt-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fascia oraria ristretta</span>
                  <div
                    className="flex items-center justify-between rounded-xl border border-border/60 bg-white/70 px-4 py-3 cursor-pointer"
                    onClick={() => setClusterRestrictedTimeEnabled((prev) => prev === undefined ? true : prev ? false : undefined)}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">Fascia oraria ristretta</span>
                      <span className="text-xs text-muted-foreground">{clusterRestrictedTimeEnabled === undefined ? "Default azienda" : clusterRestrictedTimeEnabled ? "Attivo" : "Disattivo"}</span>
                    </div>
                    <InlineToggle checked={clusterRestrictedTimeEnabled ?? false} size="sm" />
                  </div>
                  {clusterRestrictedTimeEnabled && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <FieldGroup label="Inizio fascia">
                        <Select value={clusterRestrictedTimeStart ?? ""} onValueChange={(v) => setClusterRestrictedTimeStart(v || undefined)}>
                          <SelectTrigger><SelectValue placeholder="Default azienda" /></SelectTrigger>
                          <SelectContent>
                            {["06:00","07:00","08:00","09:00","10:00","11:00","12:00","13:00","14:00"].map((t) => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FieldGroup>
                      <FieldGroup label="Fine fascia">
                        <Select value={clusterRestrictedTimeEnd ?? ""} onValueChange={(v) => setClusterRestrictedTimeEnd(v || undefined)}>
                          <SelectTrigger><SelectValue placeholder="Default azienda" /></SelectTrigger>
                          <SelectContent>
                            {["09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00"].map((t) => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FieldGroup>
                    </div>
                  )}
                </div>

                {/* ── Assenza settimanale (Task 8) ── */}
                <div className="space-y-3 border-t border-border/40 pt-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assenza settimanale</span>
                  <div
                    className="flex items-center justify-between rounded-xl border border-border/60 bg-white/70 px-4 py-3 cursor-pointer"
                    onClick={() => setClusterWeeklyAbsenceEnabled((prev) => prev === undefined ? true : prev ? false : undefined)}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">Assenza settimanale allievi</span>
                      <span className="text-xs text-muted-foreground">{clusterWeeklyAbsenceEnabled === undefined ? "Default azienda" : clusterWeeklyAbsenceEnabled ? "Attivo" : "Disattivo"}</span>
                    </div>
                    <InlineToggle checked={clusterWeeklyAbsenceEnabled ?? false} size="sm" />
                  </div>
                </div>

                <FieldGroup label={`Allievi assegnati (${clusterStudentIds.length})`}>
                  <Input
                    placeholder="Cerca allievo..."
                    value={clusterStudentSearch}
                    onChange={(e) => setClusterStudentSearch(e.target.value)}
                    className="mb-2"
                  />
                  <div className="space-y-0.5 max-h-[280px] overflow-y-auto rounded-xl border border-border/60 bg-gray-50/30">
                    {(() => {
                      const q = clusterStudentSearch.toLowerCase().trim();
                      const filtered = q
                        ? allStudents.filter((s) =>
                            `${s.firstName} ${s.lastName}`.toLowerCase().includes(q),
                          )
                        : allStudents;
                      const sorted = [...filtered].sort((a, b) => {
                        const aAssigned = clusterStudentIds.includes(a.id) ? 0 : 1;
                        const bAssigned = clusterStudentIds.includes(b.id) ? 0 : 1;
                        if (aAssigned !== bAssigned) return aAssigned - bAssigned;
                        return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
                      });
                      if (!sorted.length) {
                        return (
                          <div className="px-3 py-4 text-center text-xs text-muted-foreground italic">
                            {q ? "Nessun risultato." : "Nessun allievo trovato."}
                          </div>
                        );
                      }
                      return sorted.map((student) => {
                        const isAssignedHere = clusterStudentIds.includes(student.id);
                        const assignedToOther =
                          !isAssignedHere &&
                          student.assignedInstructorId &&
                          student.assignedInstructorId !== clusterInstructor?.id;
                        const otherInstructorName = assignedToOther
                          ? instructors.find((i) => i.id === student.assignedInstructorId)?.name
                          : null;
                        return (
                          <div
                            key={student.id}
                            className={cn(
                              "flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors",
                              isAssignedHere ? "bg-yellow-50/80" : "hover:bg-white",
                            )}
                            onClick={() => {
                              setClusterStudentIds((prev) =>
                                prev.includes(student.id)
                                  ? prev.filter((id) => id !== student.id)
                                  : [...prev, student.id],
                              );
                            }}
                          >
                            <Checkbox checked={isAssignedHere} className="pointer-events-none" />
                            <span className="text-sm flex-1 truncate">
                              {student.firstName} {student.lastName}
                            </span>
                            {assignedToOther ? (
                              <span className="text-[10px] shrink-0 bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                                {otherInstructorName ?? "altro"}
                              </span>
                            ) : null}
                          </div>
                        );
                      });
                    })()}
                  </div>
                </FieldGroup>
              </>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
            <Button variant="outline" onClick={() => setClusterInstructor(null)}>
              Annulla
            </Button>
            <Button onClick={saveClusterSettings} disabled={clusterSaving}>
              {clusterSaving ? "Salvataggio..." : "Salva"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
