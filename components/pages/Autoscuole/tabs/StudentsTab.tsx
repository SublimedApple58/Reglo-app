"use client";

import React from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Bell,
  CalendarCheck,
  ChevronDown,
  Clock,
  FileText,
  Loader2,
  Send,
  UserCheck,
  UserRoundCog,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldGroup } from "@/components/ui/field-group";
import { ToggleChip } from "@/components/ui/toggle-chip";
import { InlineToggle } from "@/components/ui/inline-toggle";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { triggerEmptySlotNotification } from "@/lib/actions/autoscuole-settings.actions";

export type StudentsTabProps = {
  expandedSection: string | null;
  toggleSection: (key: string) => void;
  bookingCutoffEnabled: boolean;
  setBookingCutoffEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  bookingCutoffTime: string;
  setBookingCutoffTime: (v: string) => void;
  weeklyBookingLimitEnabled: boolean;
  setWeeklyBookingLimitEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  weeklyBookingLimit: number;
  setWeeklyBookingLimit: (v: number) => void;
  examPriorityEnabled: boolean;
  setExamPriorityEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  examPriorityDaysBeforeExam: number;
  setExamPriorityDaysBeforeExam: (v: number) => void;
  examPriorityBlockNonExam: boolean;
  setExamPriorityBlockNonExam: React.Dispatch<React.SetStateAction<boolean>>;
  examPriorityPausedUntil: string | null;
  setExamPriorityPausedUntil: (v: string | null) => void;
  restrictedTimeRangeEnabled: boolean;
  setRestrictedTimeRangeEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  restrictedTimeRangeStart: string;
  setRestrictedTimeRangeStart: (v: string) => void;
  restrictedTimeRangeEnd: string;
  setRestrictedTimeRangeEnd: (v: string) => void;
  swapEnabled: boolean;
  setSwapEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  swapNotifyMode: "all" | "available_only";
  setSwapNotifyMode: (v: "all" | "available_only") => void;
  autoCheckinEnabled: boolean;
  setAutoCheckinEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  studentNotesEnabled: boolean;
  setStudentNotesEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  emptySlotNotificationEnabled: boolean;
  setEmptySlotNotificationEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  emptySlotNotificationTarget: "all" | "availability_matching";
  setEmptySlotNotificationTarget: (v: "all" | "availability_matching") => void;
  emptySlotNotificationTimes: string[];
  setEmptySlotNotificationTimes: React.Dispatch<React.SetStateAction<string[]>>;
  triggeringNotification: boolean;
  setTriggeringNotification: React.Dispatch<React.SetStateAction<boolean>>;
  instructorPreferenceEnabled: boolean;
  setInstructorPreferenceEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  handleSaveSettings: () => Promise<void>;
  savingSettings: boolean;
  toast: { success: (opts: { description: string }) => void; error: (opts: { description: string }) => void };
};

function AccordionSection({
  icon: Icon,
  title,
  description,
  expanded,
  onToggle,
  isFirst,
  isLast,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  expanded: boolean;
  onToggle: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(!isFirst && "border-t border-border")}>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        className={cn(
          "flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-gray-50/50",
          isFirst && "rounded-t-2xl",
          isLast && !expanded && "rounded-b-2xl",
        )}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-yellow-50">
            <Icon className="h-4 w-4 text-yellow-600" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            expanded && "rotate-180",
          )}
        />
      </div>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0, overflow: "hidden" }}
            animate={{ height: "auto", opacity: 1, overflow: "visible", transitionEnd: { overflow: "visible" } }}
            exit={{ height: 0, opacity: 0, overflow: "hidden" }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <div className={cn("px-5 pb-5", isLast && "rounded-b-2xl")}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function StudentsTab({
  expandedSection,
  toggleSection,
  bookingCutoffEnabled,
  setBookingCutoffEnabled,
  bookingCutoffTime,
  setBookingCutoffTime,
  weeklyBookingLimitEnabled,
  setWeeklyBookingLimitEnabled,
  weeklyBookingLimit,
  setWeeklyBookingLimit,
  examPriorityEnabled,
  setExamPriorityEnabled,
  examPriorityDaysBeforeExam,
  setExamPriorityDaysBeforeExam,
  examPriorityBlockNonExam,
  setExamPriorityBlockNonExam,
  examPriorityPausedUntil,
  setExamPriorityPausedUntil,
  restrictedTimeRangeEnabled,
  setRestrictedTimeRangeEnabled,
  restrictedTimeRangeStart,
  setRestrictedTimeRangeStart,
  restrictedTimeRangeEnd,
  setRestrictedTimeRangeEnd,
  swapEnabled,
  setSwapEnabled,
  swapNotifyMode,
  setSwapNotifyMode,
  autoCheckinEnabled,
  setAutoCheckinEnabled,
  studentNotesEnabled,
  setStudentNotesEnabled,
  emptySlotNotificationEnabled,
  setEmptySlotNotificationEnabled,
  emptySlotNotificationTarget,
  setEmptySlotNotificationTarget,
  emptySlotNotificationTimes,
  setEmptySlotNotificationTimes,
  triggeringNotification,
  setTriggeringNotification,
  instructorPreferenceEnabled,
  setInstructorPreferenceEnabled,
  handleSaveSettings,
  savingSettings,
  toast,
}: StudentsTabProps) {
  return (
    <>
      {/* ── Gestione allievi tab ── */}
      <div className="rounded-2xl border border-border bg-white shadow-card">
        <AccordionSection
          icon={Clock}
          title="Limite prenotazione"
          description="Imposta un orario limite il giorno prima entro cui gli allievi possono prenotare."
          expanded={expandedSection === "bookingCutoff"}
          onToggle={() => toggleSection("bookingCutoff")}
          isFirst
        >
          <div className="space-y-5 max-w-2xl">
            <div
              className="flex items-center justify-between rounded-xl border border-border/60 bg-white/70 px-4 py-3 cursor-pointer"
              onClick={() => setBookingCutoffEnabled((prev) => !prev)}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Attiva limite prenotazione giorno prima</span>
                <span className="text-xs text-muted-foreground">
                  Gli allievi non potranno prenotare guide dopo l&apos;orario limite del giorno precedente. Le prenotazioni per il giorno stesso saranno bloccate.
                </span>
              </div>
              <InlineToggle checked={bookingCutoffEnabled} size="sm" />
            </div>

            {bookingCutoffEnabled ? (
              <FieldGroup label="Orario limite">
                <Select value={bookingCutoffTime} onValueChange={setBookingCutoffTime}>
                  <SelectTrigger>
                    <SelectValue placeholder="Orario" />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      "12:00", "12:30", "13:00", "13:30",
                      "14:00", "14:30", "15:00", "15:30",
                      "16:00", "16:30", "17:00", "17:30",
                      "18:00", "18:30", "19:00", "19:30",
                      "20:00", "20:30", "21:00", "21:30",
                      "22:00",
                    ].map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldGroup>
            ) : null}
          </div>
        </AccordionSection>
        <AccordionSection
          icon={CalendarCheck}
          title="Limite guide settimanali"
          description="Limita il numero massimo di guide prenotabili da un allievo per settimana."
          expanded={expandedSection === "weeklyLimit"}
          onToggle={() => toggleSection("weeklyLimit")}
        >
          <div className="space-y-5 max-w-2xl">
            <div
              className="flex items-center justify-between rounded-xl border border-border/60 bg-white/70 px-4 py-3 cursor-pointer"
              onClick={() => setWeeklyBookingLimitEnabled((prev) => !prev)}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Attiva limite settimanale</span>
                <span className="text-xs text-muted-foreground">
                  Gli allievi non potranno prenotare pi&ugrave; di un certo numero di guide a settimana (lun-dom). Titolare e istruttori possono scavalcare il limite con conferma.
                </span>
              </div>
              <InlineToggle checked={weeklyBookingLimitEnabled} size="sm" />
            </div>

            {weeklyBookingLimitEnabled ? (
              <>
                <FieldGroup label="Guide massime per settimana">
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={weeklyBookingLimit}
                    onChange={(e) => setWeeklyBookingLimit(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                    className="w-24"
                  />
                </FieldGroup>

                <div
                  className="flex items-center justify-between rounded-xl border border-border/60 bg-white/70 px-4 py-3 cursor-pointer"
                  onClick={() => setExamPriorityEnabled((prev) => !prev)}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">Priorit&agrave; esame</span>
                    <span className="text-xs text-muted-foreground">
                      Gli allievi con un esame di guida entro 2 settimane possono prenotare pi&ugrave; guide.
                    </span>
                  </div>
                  <InlineToggle checked={examPriorityEnabled} size="sm" />
                </div>

                {examPriorityEnabled ? (
                  <>
                    <FieldGroup label="Giorni prima dell&apos;esame">
                      <Input
                        type="number"
                        min={1}
                        max={60}
                        value={examPriorityDaysBeforeExam}
                        onChange={(e) => setExamPriorityDaysBeforeExam(Math.max(1, Math.min(60, Number(e.target.value) || 14)))}
                        className="w-24"
                      />
                    </FieldGroup>
                    <div
                      className="flex items-center justify-between rounded-xl border border-border/60 bg-white/70 px-4 py-3 cursor-pointer"
                      onClick={() => setExamPriorityBlockNonExam((prev) => !prev)}
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium">Blocca non-esame durante priorit&agrave;</span>
                        <span className="text-xs text-muted-foreground">
                          Gli allievi senza esame non possono prenotare in un giorno della finestra di priorit&agrave; finch&eacute; tutti gli allievi con esame non hanno prenotato per quel giorno.
                        </span>
                      </div>
                      <InlineToggle checked={examPriorityBlockNonExam} size="sm" />
                    </div>

                    {/* Manual pause control */}
                    {examPriorityBlockNonExam ? (
                      (() => {
                        const isPaused = Boolean(examPriorityPausedUntil && new Date(examPriorityPausedUntil) > new Date());
                        return (
                          <div className="rounded-xl border border-border/60 bg-white/70 px-4 py-3 space-y-2">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-sm font-medium">Pausa blocco priorit&agrave;</span>
                                <span className="text-xs text-muted-foreground">
                                  {isPaused
                                    ? `Blocco in pausa fino al ${new Date(examPriorityPausedUntil!).toLocaleString("it-IT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
                                    : "Disattiva temporaneamente il blocco dei non-esame."}
                                </span>
                              </div>
                              {isPaused ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setExamPriorityPausedUntil(null)}
                                >
                                  Riattiva blocco
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    const until = new Date();
                                    until.setHours(23, 59, 59, 999);
                                    setExamPriorityPausedUntil(until.toISOString());
                                  }}
                                >
                                  Pausa fino a stasera
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })()
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}
          </div>
        </AccordionSection>
        <AccordionSection
          icon={Clock}
          title="Fascia oraria ristretta"
          description="Definisci una fascia oraria difficile da riempire. Gli allievi disponibili in quella fascia potranno prenotare solo l&igrave;."
          expanded={expandedSection === "restrictedTimeRange"}
          onToggle={() => toggleSection("restrictedTimeRange")}
        >
          <div className="space-y-5 max-w-2xl">
            <div
              className="flex items-center justify-between rounded-xl border border-border/60 bg-white/70 px-4 py-3 cursor-pointer"
              onClick={() => setRestrictedTimeRangeEnabled((prev) => !prev)}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Attiva restrizione fascia oraria</span>
                <span className="text-xs text-muted-foreground">
                  Gli allievi disponibili in questa fascia potranno prenotare SOLO slot in questa fascia.
                </span>
              </div>
              <InlineToggle checked={restrictedTimeRangeEnabled} size="sm" />
            </div>
            {restrictedTimeRangeEnabled && (
              <div className="grid gap-3 sm:grid-cols-2 max-w-md">
                <FieldGroup label="Inizio fascia">
                  <Select value={restrictedTimeRangeStart} onValueChange={setRestrictedTimeRangeStart}>
                    <SelectTrigger><SelectValue placeholder="Inizio" /></SelectTrigger>
                    <SelectContent>
                      {["06:00","07:00","08:00","09:00","10:00","11:00","12:00","13:00","14:00"].map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldGroup>
                <FieldGroup label="Fine fascia">
                  <Select value={restrictedTimeRangeEnd} onValueChange={setRestrictedTimeRangeEnd}>
                    <SelectTrigger><SelectValue placeholder="Fine" /></SelectTrigger>
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
        </AccordionSection>
        <AccordionSection
          icon={UserRoundCog}
          title="Sostituiscimi"
          description="Consenti agli allievi di proporre scambi guide tra loro."
          expanded={expandedSection === "swap"}
          onToggle={() => toggleSection("swap")}
        >
          <div className="space-y-5 max-w-2xl">
            <div
              className="flex items-center justify-between rounded-xl border border-border/60 bg-white/70 px-4 py-3 cursor-pointer"
              onClick={() => setSwapEnabled((prev) => !prev)}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Consenti scambi tra allievi</span>
                <span className="text-xs text-muted-foreground">
                  Gli allievi potranno proporre ad altri di prendere il loro posto in una guida futura.
                </span>
              </div>
              <InlineToggle checked={swapEnabled} size="sm" />
            </div>

            {swapEnabled ? (
              <FieldGroup label="Modalit&agrave; notifica">
                <Select value={swapNotifyMode} onValueChange={(value) => setSwapNotifyMode(value as "all" | "available_only")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Modalit&agrave;" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available_only">Solo allievi disponibili nello slot</SelectItem>
                    <SelectItem value="all">Tutti gli allievi</SelectItem>
                  </SelectContent>
                </Select>
              </FieldGroup>
            ) : null}
          </div>
        </AccordionSection>
        <AccordionSection
          icon={UserCheck}
          title="Presenza automatica"
          description="Check-in automatico delle guide all'orario di inizio. L'istruttore pu&ograve; segnare solo l'assenza."
          expanded={expandedSection === "autoCheckin"}
          onToggle={() => toggleSection("autoCheckin")}
        >
          <div className="space-y-3">
            <div
              className="flex items-center justify-between rounded-xl border border-border/60 bg-white/70 px-4 py-3 cursor-pointer"
              onClick={() => setAutoCheckinEnabled((prev) => !prev)}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Presenza automatica</span>
                <span className="text-xs text-muted-foreground">
                  {autoCheckinEnabled
                    ? "Attivo — le guide si segnano come presenti in automatico"
                    : "Disattivo — l'istruttore deve cliccare \"Presente\""}
                </span>
              </div>
              <InlineToggle checked={autoCheckinEnabled} size="sm" />
            </div>
          </div>
        </AccordionSection>
        <AccordionSection
          icon={FileText}
          title="Note allievi"
          description="Consenti agli allievi di vedere le note delle guide dall'app."
          expanded={expandedSection === "studentNotes"}
          onToggle={() => toggleSection("studentNotes")}
        >
          <div className="space-y-5 max-w-2xl">
            <div
              className="flex items-center justify-between rounded-xl border border-border/60 bg-white/70 px-4 py-3 cursor-pointer"
              onClick={() => setStudentNotesEnabled((prev) => !prev)}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Mostra note nell&apos;app allievi</span>
                <span className="text-xs text-muted-foreground">
                  Gli allievi potranno consultare le note rilasciate dagli istruttori dopo ogni guida, direttamente dalla loro app.
                </span>
              </div>
              <InlineToggle checked={studentNotesEnabled} size="sm" />
            </div>
          </div>
        </AccordionSection>
        <AccordionSection
          icon={Bell}
          title="Notifica slot vuoti"
          description="Notifica automaticamente gli allievi quando ci sono guide disponibili per il giorno dopo."
          expanded={expandedSection === "emptySlotNotification"}
          onToggle={() => toggleSection("emptySlotNotification")}
        >
          <div className="space-y-5 max-w-2xl">
            <div
              className="flex items-center justify-between rounded-xl border border-border/60 bg-white/70 px-4 py-3 cursor-pointer"
              onClick={() => setEmptySlotNotificationEnabled((prev) => !prev)}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Notifica slot disponibili domani</span>
                <span className="text-xs text-muted-foreground">
                  Ogni sera gli allievi riceveranno una notifica push se ci sono guide libere per il giorno dopo.
                </span>
              </div>
              <InlineToggle checked={emptySlotNotificationEnabled} size="sm" />
            </div>

            {emptySlotNotificationEnabled ? (
              <>
                <FieldGroup label="Destinatari">
                  <Select value={emptySlotNotificationTarget} onValueChange={(value) => setEmptySlotNotificationTarget(value as "all" | "availability_matching")}>
                    <SelectTrigger>
                      <SelectValue placeholder="Destinatari" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="availability_matching">Solo allievi con disponibilit&agrave; corrispondente</SelectItem>
                      <SelectItem value="all">Tutti gli allievi</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldGroup>

                <FieldGroup label="Orari di invio">
                  <div className="flex flex-wrap gap-1.5">
                    {([
                      "08:00", "08:30", "09:00", "09:30",
                      "10:00", "10:30", "11:00", "11:30",
                      "12:00", "12:30", "13:00", "13:30",
                      "14:00", "14:30", "15:00", "15:30",
                      "16:00", "16:30", "17:00", "17:30",
                      "18:00", "18:30", "19:00", "19:30",
                      "20:00", "20:30", "21:00", "21:30",
                      "22:00",
                    ] as const).map((time) => (
                      <ToggleChip
                        key={time}
                        active={emptySlotNotificationTimes.includes(time)}
                        onClick={() => {
                          setEmptySlotNotificationTimes((prev) => {
                            if (prev.includes(time)) {
                              if (prev.length <= 1) return prev;
                              return prev.filter((t) => t !== time);
                            }
                            return [...prev, time].sort();
                          });
                        }}
                      >
                        {time}
                      </ToggleChip>
                    ))}
                  </div>
                </FieldGroup>

                <div className="rounded-xl border border-border/60 bg-white/70 px-4 py-3">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium">Invia ora per domani</span>
                    <span className="text-xs text-muted-foreground">
                      Invia subito la notifica di guide disponibili per domani a tutti gli allievi idonei.
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-1 w-fit"
                      disabled={triggeringNotification}
                      onClick={async () => {
                        setTriggeringNotification(true);
                        try {
                          const res = await triggerEmptySlotNotification();
                          if (res.success && res.data) {
                            toast.success({
                              description: `Notifica inviata a ${res.data.notified} alliev${res.data.notified === 1 ? "o" : "i"}.`,
                            });
                          } else {
                            toast.error({
                              description: res.message ?? "Impossibile inviare la notifica.",
                            });
                          }
                        } catch {
                          toast.error({ description: "Impossibile inviare la notifica." });
                        } finally {
                          setTriggeringNotification(false);
                        }
                      }}
                    >
                      {triggeringNotification ? (
                        <Loader2 className="size-4 animate-spin mr-1.5" />
                      ) : (
                        <Send className="size-4 mr-1.5" />
                      )}
                      {triggeringNotification ? "Invio in corso..." : "Invia notifica"}
                    </Button>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </AccordionSection>
        <AccordionSection
          icon={Users}
          title="Preferenza istruttore"
          description="Consenti agli allievi di scegliere l'istruttore quando prenotano una guida."
          expanded={expandedSection === "instructorPreference"}
          onToggle={() => toggleSection("instructorPreference")}
          isLast
        >
          <div className="space-y-5 max-w-2xl">
            <div
              className="flex items-center justify-between rounded-xl border border-border/60 bg-white/70 px-4 py-3 cursor-pointer"
              onClick={() => setInstructorPreferenceEnabled((prev) => !prev)}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Consenti scelta istruttore</span>
                <span className="text-xs text-muted-foreground">
                  Gli allievi potranno selezionare un istruttore specifico durante la prenotazione. Se non ne selezionano uno, vedranno le proposte di tutti gli istruttori.
                </span>
              </div>
              <InlineToggle checked={instructorPreferenceEnabled} size="sm" />
            </div>
          </div>
        </AccordionSection>
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSaveSettings}
          disabled={savingSettings}
          className="min-w-[180px]"
        >
          {savingSettings ? "Salvataggio..." : "Salva configurazione"}
        </Button>
      </div>
    </>
  );
}
