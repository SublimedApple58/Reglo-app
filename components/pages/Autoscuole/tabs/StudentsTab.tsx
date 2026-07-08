"use client";

import React from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InlineToggle } from "@/components/ui/inline-toggle";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { cn } from "@/lib/utils";
import {
  getQuizSeatsContext,
  setAutoAssignQuizOnSignup,
  triggerEmptySlotNotification,
} from "@/lib/actions/autoscuole-settings.actions";

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
  studentCancellationEnabled: boolean;
  setStudentCancellationEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  autoCheckinEnabled: boolean;
  setAutoCheckinEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  studentNotesEnabled: boolean;
  setStudentNotesEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  groupLessonsEnabled: boolean;
  setGroupLessonsEnabled: React.Dispatch<React.SetStateAction<boolean>>;
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

type GestioneTab = "prenotazioni" | "guide" | "app";

const GESTIONE_TABS: Array<{ key: GestioneTab; label: string }> = [
  { key: "prenotazioni", label: "Prenotazioni" },
  { key: "guide", label: "Guide" },
  { key: "app", label: "App allievi" },
];

const CUTOFF_TIME_OPTIONS = [
  "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30",
  "16:00", "16:30", "17:00", "17:30",
  "18:00", "18:30", "19:00", "19:30",
  "20:00", "20:30", "21:00", "21:30",
  "22:00",
];

const NOTIFICATION_TIME_OPTIONS = [
  "08:00", "08:30", "09:00", "09:30",
  "10:00", "10:30", "11:00", "11:30",
  "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30",
  "16:00", "16:30", "17:00", "17:30",
  "18:00", "18:30", "19:00", "19:30",
  "20:00", "20:30", "21:00", "21:30",
  "22:00",
];

/** Riga setting flat (stile lista Airbnb): titolo 600 + descrizione grigia,
 * toggle navy grande a destra. Solo il toggle è cliccabile. */
function SettingRow({
  title,
  titleExtra,
  description,
  checked,
  onToggle,
  control,
  nested,
}: {
  title: string;
  titleExtra?: React.ReactNode;
  description: string;
  checked?: boolean;
  onToggle?: () => void;
  /** Sostituisce il toggle (es. bottone pausa) */
  control?: React.ReactNode;
  /** Riga annidata sotto un setting padre (spaziatura ridotta) */
  nested?: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-8", nested && "mt-8")}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-base font-semibold text-foreground">
          {title}
          {titleExtra}
        </div>
        <div className="mt-1 max-w-[720px] text-[15px] font-normal leading-relaxed text-[#6a6a6a]">
          {description}
        </div>
      </div>
      {control ?? <InlineToggle checked={Boolean(checked)} onChange={onToggle} size="xl" />}
    </div>
  );
}

/** Campo con etichetta grigia sopra (select / input), come nei mock. */
function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-7">
      <div className="mb-2.5 text-sm font-medium text-[#6a6a6a]">{label}</div>
      {children}
    </div>
  );
}

const SELECT_TRIGGER_CLASS =
  "h-[52px] w-[400px] max-w-full rounded-[12px] border-[1.5px] border-[#dddddd] px-4 text-base font-medium text-foreground shadow-none hover:border-[#929292] focus:border-[#222222] focus:ring-0 [&_svg]:size-[18px]";

/** Tooltip informativo (i) sul titolo, come nel proto guide di gruppo. */
function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={(e) => { e.stopPropagation(); setOpen((prev) => !prev); }}
    >
      <svg width="15" height="15" viewBox="0 0 14 14" fill="none" className="shrink-0 cursor-pointer">
        <circle cx="7" cy="7" r="6" stroke="#b0b0b0" strokeWidth="1.2" />
        <path d="M7 6.2v3.3" stroke="#b0b0b0" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="7" cy="4.2" r="0.85" fill="#b0b0b0" />
      </svg>
      {open && (
        <span className="absolute bottom-[calc(100%+8px)] left-1/2 z-30 w-[240px] -translate-x-1/2 rounded-[8px] bg-[#222222] px-[11px] py-[9px] text-[11.5px] font-normal normal-case leading-[1.45] tracking-normal text-white shadow-[0_4px_14px_rgba(0,0,0,0.18)]">
          {text}
          <span className="absolute left-1/2 top-full -translate-x-1/2 border-[5px] border-transparent border-t-[#222222]" />
        </span>
      )}
    </span>
  );
}

/** Modalità registrazione allievi — non presente nei mock ma parte della web
 * app: assegnazione automatica della licenza quiz alla registrazione.
 * Salva subito alla pressione del toggle. Nascosta senza fase TEORIA. */
function RegistrationSection() {
  const toast = useFeedbackToast();
  type Ctx = {
    quizSeats: number;
    used: number;
    available: number;
    phasesEnabled: ("TEORIA" | "PRATICA")[];
    autoAssignQuizOnSignup: boolean;
  };
  const [ctx, setCtx] = React.useState<Ctx | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await getQuizSeatsContext();
      if (res.success) setCtx(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!loading && (!ctx || !ctx.phasesEnabled.includes("TEORIA"))) {
    return null;
  }

  const enabled = ctx?.autoAssignQuizOnSignup ?? false;
  const available = ctx?.available ?? 0;
  const used = ctx?.used ?? 0;
  const quizSeats = ctx?.quizSeats ?? 0;

  const handleToggle = async () => {
    if (saving || loading) return;
    setSaving(true);
    try {
      const res = await setAutoAssignQuizOnSignup({ enabled: !enabled });
      if (!res.success) {
        toast.error({ description: res.message ?? "Impossibile aggiornare." });
        return;
      }
      toast.success({ description: res.message ?? "Modalità aggiornata." });
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="py-8">
      <SettingRow
        title="Assegnazione automatica della licenza quiz"
        description={
          enabled
            ? "I nuovi allievi ricevono subito una licenza quiz (se disponibile) e partono direttamente in fase Teoria."
            : "I nuovi allievi entrano in stato 'In attesa di attivazione'. Devi assegnare la licenza manualmente per farli partire dalla teoria."
        }
        checked={enabled}
        onToggle={() => void handleToggle()}
        control={
          saving || loading ? (
            <Loader2 className="size-6 shrink-0 animate-spin text-[#929292]" />
          ) : undefined
        }
      />
      {!enabled && available > 0 && (
        <p className="mt-3 max-w-[720px] text-[13px] font-medium leading-relaxed text-amber-700">
          Attivando l&apos;auto-assegnazione, gli allievi attualmente in attesa riceveranno
          automaticamente una licenza (fino a {available} posti liberi, ordine cronologico
          di registrazione).
        </p>
      )}
      <div className="mt-6 flex max-w-[400px] items-center justify-between rounded-[12px] border border-[#e8e8e8] px-5 py-4">
        <span className="text-sm font-medium text-[#6a6a6a]">Licenze quiz</span>
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {loading ? (
            <Loader2 className="size-4 animate-spin text-[#929292]" />
          ) : (
            <>
              {used} <span className="font-medium text-[#929292]">/ {quizSeats}</span> usate
            </>
          )}
        </span>
      </div>
    </div>
  );
}

export default function StudentsTab({
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
  studentCancellationEnabled,
  setStudentCancellationEnabled,
  autoCheckinEnabled,
  setAutoCheckinEnabled,
  studentNotesEnabled,
  setStudentNotesEnabled,
  groupLessonsEnabled,
  setGroupLessonsEnabled,
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
  const [gestioneTab, setGestioneTab] = React.useState<GestioneTab>("prenotazioni");

  const isPaused = Boolean(
    examPriorityPausedUntil && new Date(examPriorityPausedUntil) > new Date(),
  );

  return (
    <div data-testid="gestione-allievi-pane">
      {/* ── Sub-tab Prenotazioni / Guide / App allievi ── */}
      <div className="flex flex-wrap items-center gap-8 border-b border-[#e8e8e8]">
        {GESTIONE_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setGestioneTab(tab.key)}
            className={cn(
              "-mb-px cursor-pointer select-none whitespace-nowrap border-b-[2.5px] px-px pb-3.5 text-base transition-colors",
              gestioneTab === tab.key
                ? "border-[#222222] font-semibold text-foreground"
                : "border-transparent font-medium text-[#6a6a6a] hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ══ PRENOTAZIONI ══ */}
      <div className={cn("divide-y divide-[#ebebeb]", gestioneTab !== "prenotazioni" && "hidden")}>
        <div className="py-8">
          <SettingRow
            title="Stop alle prenotazioni last-minute"
            description="Dopo un certo orario, gli allievi non possono più prenotare la guida del giorno dopo. Es: oltre le 19:30 si può prenotare solo da due giorni in avanti."
            checked={bookingCutoffEnabled}
            onToggle={() => setBookingCutoffEnabled((prev) => !prev)}
          />
          {bookingCutoffEnabled && (
            <FieldBlock label="Orario di chiusura">
              <Select value={bookingCutoffTime} onValueChange={setBookingCutoffTime}>
                <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                  <SelectValue placeholder="Orario" />
                </SelectTrigger>
                <SelectContent>
                  {CUTOFF_TIME_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldBlock>
          )}
        </div>

        <div className="py-8">
          <SettingRow
            title="Massimo di guide a settimana"
            description="Quante guide può prenotare un allievo in una settimana (lun–dom). Tu e gli istruttori potete sempre superarlo confermando."
            checked={weeklyBookingLimitEnabled}
            onToggle={() => setWeeklyBookingLimitEnabled((prev) => !prev)}
          />
          {weeklyBookingLimitEnabled && (
            <>
              <FieldBlock label="Guide a settimana per allievo">
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={weeklyBookingLimit}
                  onChange={(e) => setWeeklyBookingLimit(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                  className="h-[52px] w-60 rounded-[12px] border-[1.5px] border-[#dddddd] bg-white px-4 text-base font-medium text-foreground outline-none transition-colors focus:border-[#222222]"
                />
              </FieldBlock>
              <SettingRow
                nested
                title="Precedenza a chi ha l'esame vicino"
                description="Gli allievi con l'esame in arrivo possono prenotare più guide degli altri."
                checked={examPriorityEnabled}
                onToggle={() => setExamPriorityEnabled((prev) => !prev)}
              />
              {examPriorityEnabled && (
                <>
                  <FieldBlock label="Giorni prima dell'esame in cui scatta la precedenza">
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={examPriorityDaysBeforeExam}
                      onChange={(e) => setExamPriorityDaysBeforeExam(Math.max(1, Math.min(60, Number(e.target.value) || 14)))}
                      className="h-[52px] w-60 rounded-[12px] border-[1.5px] border-[#dddddd] bg-white px-4 text-base font-medium text-foreground outline-none transition-colors focus:border-[#222222]"
                    />
                  </FieldBlock>
                  <SettingRow
                    nested
                    title="Riserva i posti a chi ha l'esame"
                    description="Nei giorni di precedenza, chi non ha l'esame può prenotare solo dopo che tutti gli allievi con esame hanno scelto il loro posto."
                    checked={examPriorityBlockNonExam}
                    onToggle={() => setExamPriorityBlockNonExam((prev) => !prev)}
                  />
                  {examPriorityBlockNonExam && (
                    <SettingRow
                      nested
                      title="Sospendi la riserva per oggi"
                      description={
                        isPaused
                          ? `Riserva in pausa fino al ${new Date(examPriorityPausedUntil!).toLocaleString("it-IT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.`
                          : "Disattiva temporaneamente la riserva dei posti, per gestire un'eccezione."
                      }
                      control={
                        <button
                          type="button"
                          onClick={() => {
                            if (isPaused) {
                              setExamPriorityPausedUntil(null);
                            } else {
                              const until = new Date();
                              until.setHours(23, 59, 59, 999);
                              setExamPriorityPausedUntil(until.toISOString());
                            }
                          }}
                          className={cn(
                            "shrink-0 cursor-pointer select-none whitespace-nowrap rounded-[24px] px-5 py-[11px] text-sm font-semibold transition-colors",
                            isPaused
                              ? "border-[1.5px] border-[#222222] bg-[#222222] text-white hover:border-black hover:bg-black"
                              : "border-[1.5px] border-[#dddddd] bg-white text-foreground hover:border-[#929292] hover:bg-[#f5f5f5]",
                          )}
                        >
                          {isPaused ? "Riattiva ora" : "Pausa fino a stasera"}
                        </button>
                      }
                    />
                  )}
                </>
              )}
            </>
          )}
        </div>

        <div className="py-8">
          <SettingRow
            title="Riempi le fasce più vuote"
            description="Scegli una fascia poco richiesta: chi è disponibile in quell'orario potrà prenotare solo lì, così si riempie."
            checked={restrictedTimeRangeEnabled}
            onToggle={() => setRestrictedTimeRangeEnabled((prev) => !prev)}
          />
          {restrictedTimeRangeEnabled && (
            <div className="flex flex-wrap gap-5">
              <FieldBlock label="Inizio fascia">
                <Select value={restrictedTimeRangeStart} onValueChange={setRestrictedTimeRangeStart}>
                  <SelectTrigger className={cn(SELECT_TRIGGER_CLASS, "w-[190px]")}>
                    <SelectValue placeholder="Inizio" />
                  </SelectTrigger>
                  <SelectContent>
                    {["06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00"].map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldBlock>
              <FieldBlock label="Fine fascia">
                <Select value={restrictedTimeRangeEnd} onValueChange={setRestrictedTimeRangeEnd}>
                  <SelectTrigger className={cn(SELECT_TRIGGER_CLASS, "w-[190px]")}>
                    <SelectValue placeholder="Fine" />
                  </SelectTrigger>
                  <SelectContent>
                    {["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"].map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldBlock>
            </div>
          )}
        </div>
      </div>

      {/* ══ GUIDE ══ */}
      <div className={cn("divide-y divide-[#ebebeb]", gestioneTab !== "guide" && "hidden")}>
        <div className="py-8">
          <SettingRow
            title="Consenti scambi tra allievi"
            description="Gli allievi potranno proporre ad altri di prendere il loro posto in una guida futura."
            checked={swapEnabled}
            onToggle={() => setSwapEnabled((prev) => !prev)}
          />
          {swapEnabled && (
            <FieldBlock label="Modalità notifica">
              <Select value={swapNotifyMode} onValueChange={(value) => setSwapNotifyMode(value as "all" | "available_only")}>
                <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                  <SelectValue placeholder="Modalità" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available_only">Solo allievi disponibili nello slot</SelectItem>
                  <SelectItem value="all">Tutti gli allievi</SelectItem>
                </SelectContent>
              </Select>
            </FieldBlock>
          )}
        </div>

        <div className="py-8">
          <SettingRow
            title="Consenti annullamento guide da app"
            description={
              studentCancellationEnabled
                ? "Gli allievi possono annullare le proprie guide direttamente dall'app."
                : "Gli allievi non possono annullare le guide. Devono contattare l'autoscuola."
            }
            checked={studentCancellationEnabled}
            onToggle={() => setStudentCancellationEnabled((prev) => !prev)}
          />
        </div>

        <div className="py-8">
          <SettingRow
            title="Presenza automatica"
            description={
              autoCheckinEnabled
                ? "Attivo — le guide si segnano come presenti in automatico all'orario di inizio."
                : "Disattivo — l'istruttore deve cliccare \"Presente\"."
            }
            checked={autoCheckinEnabled}
            onToggle={() => setAutoCheckinEnabled((prev) => !prev)}
          />
        </div>

        <div className="py-8">
          <SettingRow
            title="Attiva guide di gruppo"
            titleExtra={
              <InfoTooltip text={`Non scala crediti: ogni partecipante avrà una guida "da pagare" al prezzo di una guida normale.`} />
            }
            description="Potrai programmare guide di gruppo dall'agenda e invitare gli allievi abilitati a iscriversi."
            checked={groupLessonsEnabled}
            onToggle={() => setGroupLessonsEnabled((prev) => !prev)}
          />
        </div>
      </div>

      {/* ══ APP ALLIEVI ══ */}
      <div className={cn("divide-y divide-[#ebebeb]", gestioneTab !== "app" && "hidden")}>
        <div className="py-8">
          <SettingRow
            title="Mostra note nell'app allievi"
            description="Gli allievi potranno consultare le note rilasciate dagli istruttori dopo ogni guida, direttamente dalla loro app."
            checked={studentNotesEnabled}
            onToggle={() => setStudentNotesEnabled((prev) => !prev)}
          />
        </div>

        <div className="py-8">
          <SettingRow
            title="Notifica slot disponibili domani"
            description="Ogni sera gli allievi riceveranno una notifica push se ci sono guide libere per il giorno dopo."
            checked={emptySlotNotificationEnabled}
            onToggle={() => setEmptySlotNotificationEnabled((prev) => !prev)}
          />
          {emptySlotNotificationEnabled && (
            <>
              <FieldBlock label="Destinatari">
                <Select
                  value={emptySlotNotificationTarget}
                  onValueChange={(value) => setEmptySlotNotificationTarget(value as "all" | "availability_matching")}
                >
                  <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                    <SelectValue placeholder="Destinatari" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="availability_matching">Solo allievi con disponibilità corrispondente</SelectItem>
                    <SelectItem value="all">Tutti gli allievi</SelectItem>
                  </SelectContent>
                </Select>
              </FieldBlock>

              <FieldBlock label="Orari di invio">
                <div className="flex flex-wrap gap-2.5">
                  {NOTIFICATION_TIME_OPTIONS.map((time) => {
                    const active = emptySlotNotificationTimes.includes(time);
                    return (
                      <button
                        key={time}
                        type="button"
                        onClick={() => {
                          setEmptySlotNotificationTimes((prev) => {
                            if (prev.includes(time)) {
                              if (prev.length <= 1) return prev;
                              return prev.filter((t) => t !== time);
                            }
                            return [...prev, time].sort();
                          });
                        }}
                        className={cn(
                          "cursor-pointer select-none rounded-full px-[18px] py-2 text-[15px] font-medium transition-colors",
                          active
                            ? "border-[1.5px] border-[#9fc3f0] bg-[#cfe0fb] font-semibold text-[#1a2b45]"
                            : "border-[1.5px] border-[#dddddd] bg-white text-[#555555] hover:border-[#929292]",
                        )}
                      >
                        {time}
                      </button>
                    );
                  })}
                </div>
              </FieldBlock>

              <div className="mt-7 rounded-[12px] border border-[#e8e8e8] px-6 py-5">
                <div className="text-base font-semibold text-foreground">Invia ora per domani</div>
                <div className="mt-1 text-[15px] font-normal text-[#6a6a6a]">
                  Invia subito la notifica di guide disponibili per domani a tutti gli allievi idonei.
                </div>
                <button
                  type="button"
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
                  className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-[10px] border-[1.5px] border-[#dddddd] px-5 py-3 text-[15px] font-medium text-foreground transition-colors hover:border-[#222222] disabled:pointer-events-none disabled:opacity-60"
                >
                  {triggeringNotification ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" strokeWidth={1.7} />
                  )}
                  {triggeringNotification ? "Invio in corso..." : "Invia notifica"}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="py-8">
          <SettingRow
            title="Consenti scelta istruttore"
            description="Gli allievi potranno selezionare un istruttore specifico durante la prenotazione. Se non ne selezionano uno, vedranno le proposte di tutti gli istruttori."
            checked={instructorPreferenceEnabled}
            onToggle={() => setInstructorPreferenceEnabled((prev) => !prev)}
          />
        </div>

        <RegistrationSection />
      </div>

      {/* Save */}
      <div className="mt-4 flex justify-end border-t border-[#ebebeb] pt-6">
        <Button
          onClick={handleSaveSettings}
          disabled={savingSettings}
          className="min-w-[180px]"
        >
          {savingSettings ? "Salvataggio..." : "Salva configurazione"}
        </Button>
      </div>
    </div>
  );
}
