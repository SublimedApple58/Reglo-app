"use client";

import React from "react";

import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/animate-ui/radix/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getVoiceCallbackTasks,
  markVoiceCallbackTaskDone,
} from "@/lib/actions/autoscuole.actions";
import {
  getAutoscuolaSettings,
  updateAutoscuolaSettings,
} from "@/lib/actions/autoscuole-settings.actions";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import {
  PhoneCall,
  Zap,
  FileText,
  RefreshCw,
  Phone,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Settings2,
  CalendarDays,
  Volume2,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type VoiceProvisioningStatus = "not_started" | "provisioning" | "ready" | "error";
type VoiceAllowedAction = "faq" | "lesson_info" | "booking";

type CallbackTask = {
  id: string;
  phoneNumber: string;
  reason: string;
  status: string;
  attemptCount: number;
  nextAttemptAt: string | null;
  createdAt: string;
  student: { id: string; name: string | null; email: string; phone: string | null } | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const WEEKDAY_OPTIONS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mer" },
  { value: 4, label: "Gio" },
  { value: 5, label: "Ven" },
  { value: 6, label: "Sab" },
  { value: 0, label: "Dom" },
] as const;

const VOICE_ALLOWED_ACTION_OPTIONS = [
  { value: "faq" as const, label: "FAQ autoscuola", description: "Risponde a domande frequenti" },
  { value: "lesson_info" as const, label: "Info lezioni", description: "Dettagli su corsi e lezioni" },
  { value: "booking" as const, label: "Prenota guida", description: "Prenotazione diretta sull'agenda" },
];

const START_TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => i * 30);
const END_TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => (i + 1) * 30);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");
const formatMinutes = (totalMinutes: number) => {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${pad(h)}:${pad(m)}`;
};

const normalizeDays = (days: number[]) =>
  Array.from(new Set(days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))).sort(
    (a, b) => a - b,
  );

// ─── Status helpers ───────────────────────────────────────────────────────────

function ProvisioningBadge({ status }: { status: VoiceProvisioningStatus }) {
  const config = {
    not_started: {
      dot: "bg-slate-400",
      text: "text-slate-600",
      bg: "bg-slate-50 border-slate-200",
      label: "Non configurato",
    },
    provisioning: {
      dot: "bg-amber-400 animate-pulse",
      text: "text-amber-700",
      bg: "bg-amber-50 border-amber-200",
      label: "In configurazione",
    },
    ready: {
      dot: "bg-emerald-400",
      text: "text-emerald-700",
      bg: "bg-emerald-50 border-emerald-200",
      label: "Operativa",
    },
    error: {
      dot: "bg-red-400",
      text: "text-red-700",
      bg: "bg-red-50 border-red-200",
      label: "Errore",
    },
  }[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${config.bg} ${config.text}`}
    >
      <span className={`size-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

// ─── Toggle Row ───────────────────────────────────────────────────────────────

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/60 bg-white/70 px-3 py-2.5 transition hover:bg-white/90 ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <div className="min-w-0">
        <div className="text-xs font-medium text-foreground">{label}</div>
        {description ? (
          <div className="mt-0.5 text-[11px] text-muted-foreground">{description}</div>
        ) : null}
      </div>
      <Checkbox
        checked={checked}
        onCheckedChange={(val) => onCheckedChange(Boolean(val))}
        disabled={disabled}
      />
    </label>
  );
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass-panel glass-strong space-y-4 p-5">
      <div className="flex items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-[#324D7A]/10">
          <Icon className="size-4 text-[#324D7A]" />
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">{title}</div>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AutoscuoleVoicePage() {
  const toast = useFeedbackToast();
  const [saving, setSaving] = React.useState(false);

  // Voice state
  const [voiceFeatureEnabled, setVoiceFeatureEnabled] = React.useState(false);
  const [voiceProvisioningStatus, setVoiceProvisioningStatus] =
    React.useState<VoiceProvisioningStatus>("not_started");
  const [voiceLineRef, setVoiceLineRef] = React.useState<string | null>(null);
  const [voiceAssistantEnabled, setVoiceAssistantEnabled] = React.useState(false);
  const [voiceBookingEnabled, setVoiceBookingEnabled] = React.useState(false);
  const [voiceLegalGreetingEnabled, setVoiceLegalGreetingEnabled] = React.useState(true);
  const [voiceRecordingEnabled, setVoiceRecordingEnabled] = React.useState(true);
  const [voiceTranscriptionEnabled, setVoiceTranscriptionEnabled] = React.useState(true);
  const [voiceHandoffPhone, setVoiceHandoffPhone] = React.useState<string | null>(null);
  const [voiceOfficeDays, setVoiceOfficeDays] = React.useState<number[]>([1, 2, 3, 4, 5]);
  const [voiceOfficeStartMinutes, setVoiceOfficeStartMinutes] = React.useState(9 * 60);
  const [voiceOfficeEndMinutes, setVoiceOfficeEndMinutes] = React.useState(19 * 60);
  const [voiceAllowedActions, setVoiceAllowedActions] = React.useState<VoiceAllowedAction[]>([
    "faq",
    "lesson_info",
  ]);
  const [voiceInstructions, setVoiceInstructions] = React.useState("");

  // Callbacks state
  const [callbackTasks, setCallbackTasks] = React.useState<CallbackTask[]>([]);
  const [loadingCallbacks, setLoadingCallbacks] = React.useState(false);
  const [markingDone, setMarkingDone] = React.useState<string | null>(null);

  // Load settings on mount
  React.useEffect(() => {
    let active = true;
    const load = async () => {
      const res = await getAutoscuolaSettings();
      if (!active) return;
      if (!res.success || !res.data) return;
      const d = res.data;
      setVoiceFeatureEnabled(Boolean(d.voiceFeatureEnabled));
      setVoiceProvisioningStatus(
        (d.voiceProvisioningStatus as VoiceProvisioningStatus) ?? "not_started",
      );
      setVoiceLineRef(d.voiceLineRef ?? null);
      setVoiceAssistantEnabled(Boolean(d.voiceAssistantEnabled));
      setVoiceBookingEnabled(Boolean(d.voiceBookingEnabled));
      setVoiceLegalGreetingEnabled(d.voiceLegalGreetingEnabled !== false);
      setVoiceRecordingEnabled(d.voiceRecordingEnabled !== false);
      setVoiceTranscriptionEnabled(d.voiceTranscriptionEnabled !== false);
      setVoiceHandoffPhone(d.voiceHandoffPhone ?? null);
      setVoiceOfficeDays(normalizeDays(Array.from(d.voiceOfficeHours?.daysOfWeek ?? [1, 2, 3, 4, 5])));
      setVoiceOfficeStartMinutes(d.voiceOfficeHours?.startMinutes ?? 9 * 60);
      setVoiceOfficeEndMinutes(d.voiceOfficeHours?.endMinutes ?? 19 * 60);
      setVoiceInstructions(d.voiceInstructions ?? "");
      const VALID_ACTIONS: VoiceAllowedAction[] = ["faq", "lesson_info", "booking"];
      const loaded = (d.voiceAllowedActions ?? []).filter((a): a is VoiceAllowedAction =>
        VALID_ACTIONS.includes(a as VoiceAllowedAction),
      );
      setVoiceAllowedActions(loaded.length ? loaded : ["faq", "lesson_info"]);
    };
    load();
    return () => { active = false; };
  }, []);

  const loadCallbacks = React.useCallback(async () => {
    setLoadingCallbacks(true);
    const res = await getVoiceCallbackTasks("pending");
    if (res.success && res.data) {
      setCallbackTasks(res.data as CallbackTask[]);
    }
    setLoadingCallbacks(false);
  }, []);

  const handleMarkDone = React.useCallback(async (taskId: string) => {
    setMarkingDone(taskId);
    const res = await markVoiceCallbackTaskDone(taskId);
    if (res.success) {
      setCallbackTasks((prev) => prev.filter((t) => t.id !== taskId));
    }
    setMarkingDone(null);
  }, []);

  React.useEffect(() => {
    loadCallbacks();
  }, [loadCallbacks]);

  const toggleAction = (action: VoiceAllowedAction) => {
    setVoiceAllowedActions((current) =>
      current.includes(action)
        ? current.filter((a) => a !== action)
        : [...current, action],
    );
  };

  const handleSave = async () => {
    if (voiceFeatureEnabled && voiceAssistantEnabled) {
      if (voiceProvisioningStatus !== "ready" || !voiceLineRef) {
        toast.error({
          description: "Linea voce non pronta. Contatta il backoffice Reglo per completare il provisioning.",
        });
        return;
      }
      if (!voiceHandoffPhone?.trim()) {
        toast.error({ description: "Inserisci il numero di handoff per il trasferimento chiamata." });
        return;
      }
      if (!voiceOfficeDays.length || voiceOfficeEndMinutes <= voiceOfficeStartMinutes) {
        toast.error({ description: "Orari segreteria voce non validi." });
        return;
      }
      if (!voiceAllowedActions.length) {
        toast.error({ description: "Seleziona almeno un'azione consentita." });
        return;
      }
      if (voiceBookingEnabled && !voiceAllowedActions.includes("booking")) {
        toast.error({ description: "Per le prenotazioni voce devi abilitare l'azione 'Prenota guida'." });
        return;
      }
    }

    setSaving(true);
    const res = await updateAutoscuolaSettings({
      voiceAssistantEnabled,
      voiceBookingEnabled,
      voiceLanguage: "it-IT",
      voiceLegalGreetingEnabled,
      voiceOfficeHours: {
        daysOfWeek: normalizeDays(voiceOfficeDays),
        startMinutes: voiceOfficeStartMinutes,
        endMinutes: voiceOfficeEndMinutes,
      },
      voiceHandoffPhone: voiceHandoffPhone?.trim() || null,
      voiceFallbackMode: "transfer_or_callback",
      voiceRecordingEnabled,
      voiceTranscriptionEnabled,
      voiceRetentionDays: 90,
      voiceInstructions,
      voiceAllowedActions,
    });
    setSaving(false);

    if (!res.success || !res.data) {
      toast.error({ description: res.message ?? "Impossibile salvare le impostazioni." });
      return;
    }

    const d = res.data;
    setVoiceAssistantEnabled(Boolean(d.voiceAssistantEnabled));
    setVoiceBookingEnabled(Boolean(d.voiceBookingEnabled));
    setVoiceLegalGreetingEnabled(d.voiceLegalGreetingEnabled !== false);
    setVoiceRecordingEnabled(d.voiceRecordingEnabled !== false);
    setVoiceTranscriptionEnabled(d.voiceTranscriptionEnabled !== false);
    setVoiceHandoffPhone(d.voiceHandoffPhone ?? null);
    setVoiceOfficeDays(normalizeDays(Array.from(d.voiceOfficeHours?.daysOfWeek ?? [1, 2, 3, 4, 5])));
    setVoiceOfficeStartMinutes(d.voiceOfficeHours?.startMinutes ?? 9 * 60);
    setVoiceOfficeEndMinutes(d.voiceOfficeHours?.endMinutes ?? 19 * 60);
    setVoiceInstructions(d.voiceInstructions ?? "");
    const VALID_ACTIONS: VoiceAllowedAction[] = ["faq", "lesson_info", "booking"];
    const loaded = (d.voiceAllowedActions ?? []).filter((a): a is VoiceAllowedAction =>
      VALID_ACTIONS.includes(a as VoiceAllowedAction),
    );
    setVoiceAllowedActions(loaded.length ? loaded : ["faq", "lesson_info"]);
    toast.success({ description: "Impostazioni segretaria salvate." });
  };

  const isReady = voiceProvisioningStatus === "ready";

  return (
    <ClientPageWrapper
      title="Segretaria Virtuale"
      subTitle="Assistente vocale AI inbound"
      hideHero
      contentWidthClassName="max-w-[1200px]"
    >
      <div className="w-full space-y-5">
        {/* ── Hero status card ─────────────────────────────────────────── */}
        <div className="glass-panel glass-strong overflow-hidden p-0">
          {/* Top strip */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/60 px-6 py-5">
            <div className="flex items-center gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#324D7A]/10">
                <PhoneCall className="size-6 text-[#324D7A]" />
              </div>
              <div>
                <div className="text-lg font-bold text-foreground">Segretaria Virtuale</div>
                <p className="text-xs text-muted-foreground">
                  Risponde alle chiamate, informa gli allievi e gestisce prenotazioni guide
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ProvisioningBadge status={voiceProvisioningStatus} />
              {voiceFeatureEnabled ? (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                  Feature attiva
                </span>
              ) : (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Non abilitata
                </span>
              )}
            </div>
          </div>

          {/* Info row */}
          <div className="grid gap-px bg-white/30 sm:grid-cols-3">
            <div className="bg-white/50 px-6 py-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Linea telefonica
              </div>
              <div className="mt-1 text-sm font-medium text-foreground">
                {voiceLineRef || <span className="text-muted-foreground">—</span>}
              </div>
            </div>
            <div className="bg-white/50 px-6 py-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Numero handoff
              </div>
              <input
                value={voiceHandoffPhone ?? ""}
                onChange={(e) => setVoiceHandoffPhone(e.target.value || null)}
                className="mt-1 h-8 w-full rounded-lg border border-white/70 bg-white/80 px-2.5 text-sm outline-none transition focus:border-[#324D7A] focus:bg-white"
                placeholder="+39..."
                disabled={!voiceFeatureEnabled}
              />
            </div>
            <div className="bg-white/50 px-6 py-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Assistente vocale
              </div>
              <label className="mt-1 flex cursor-pointer items-center gap-2">
                <Checkbox
                  checked={voiceAssistantEnabled}
                  onCheckedChange={(checked) => setVoiceAssistantEnabled(Boolean(checked))}
                  disabled={!voiceFeatureEnabled}
                />
                <span className="text-sm font-medium text-foreground">
                  {voiceAssistantEnabled ? "Attivo" : "Disattivato"}
                </span>
              </label>
            </div>
          </div>

          {/* Warning if not provisioned */}
          {voiceFeatureEnabled && !isReady ? (
            <div className="flex items-center gap-3 border-t border-amber-100 bg-amber-50/80 px-6 py-3">
              <AlertTriangle className="size-4 shrink-0 text-amber-600" />
              <p className="text-xs text-amber-800">
                Linea non ancora pronta. Contatta il backoffice Reglo per completare il provisioning della linea telefonica.
              </p>
            </div>
          ) : null}

          {!voiceFeatureEnabled ? (
            <div className="flex items-center gap-3 border-t border-slate-100 bg-slate-50/80 px-6 py-3">
              <AlertTriangle className="size-4 shrink-0 text-slate-500" />
              <p className="text-xs text-slate-600">
                La funzione Segretaria Virtuale non è abilitata per questa autoscuola. Contatta il supporto Reglo per attivarla.
              </p>
            </div>
          ) : null}
        </div>

        {/* ── Settings grid ─────────────────────────────────────────────── */}
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Comportamento */}
          <SectionCard
            icon={Settings2}
            title="Comportamento"
            description="Configura cosa può fare l'assistente durante le chiamate"
          >
            <div className="space-y-2">
              <ToggleRow
                label="Prenotazioni voce"
                description="L'assistente può prenotare guide direttamente sull'agenda"
                checked={voiceBookingEnabled}
                onCheckedChange={setVoiceBookingEnabled}
                disabled={!voiceFeatureEnabled}
              />
              <ToggleRow
                label="Greeting legale"
                description="Avvisa il chiamante che la chiamata è gestita da un AI"
                checked={voiceLegalGreetingEnabled}
                onCheckedChange={setVoiceLegalGreetingEnabled}
                disabled={!voiceFeatureEnabled}
              />
            </div>
          </SectionCard>

          {/* Registrazione */}
          <SectionCard
            icon={Volume2}
            title="Registrazione e trascrizione"
            description="Archivia e analizza le telefonate per audit e miglioramento continuo"
          >
            <div className="space-y-2">
              <ToggleRow
                label="Registra audio"
                description="Salva una registrazione audio della chiamata"
                checked={voiceRecordingEnabled}
                onCheckedChange={setVoiceRecordingEnabled}
                disabled={!voiceFeatureEnabled}
              />
              <ToggleRow
                label="Trascrivi chiamate"
                description="Genera trascrizione testuale della conversazione"
                checked={voiceTranscriptionEnabled}
                onCheckedChange={setVoiceTranscriptionEnabled}
                disabled={!voiceFeatureEnabled}
              />
            </div>
          </SectionCard>
        </div>

        {/* ── Office hours ───────────────────────────────────────────────── */}
        <SectionCard
          icon={CalendarDays}
          title="Orari segreteria vocale"
          description="Fuori da questi orari la chiamata viene trasferita o viene creata una richiesta di richiamata"
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_OPTIONS.map((day) => {
                const active = voiceOfficeDays.includes(day.value);
                return (
                  <button
                    key={`voice-day-${day.value}`}
                    type="button"
                    disabled={!voiceFeatureEnabled}
                    onClick={() =>
                      setVoiceOfficeDays((current) =>
                        current.includes(day.value)
                          ? current.filter((d) => d !== day.value)
                          : normalizeDays([...current, day.value]),
                      )
                    }
                    className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                      active
                        ? "border-[#324D7A] bg-[#324D7A]/12 text-[#324D7A]"
                        : "border-white/70 bg-white/80 text-muted-foreground hover:border-[#324D7A]/40"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">Orario inizio</div>
                <Select
                  value={String(voiceOfficeStartMinutes)}
                  onValueChange={(v) => setVoiceOfficeStartMinutes(Number(v))}
                  disabled={!voiceFeatureEnabled}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Inizio" />
                  </SelectTrigger>
                  <SelectContent>
                    {START_TIME_OPTIONS.map((m) => (
                      <SelectItem key={`voice-start-${m}`} value={String(m)}>
                        {formatMinutes(m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">Orario fine</div>
                <Select
                  value={String(voiceOfficeEndMinutes)}
                  onValueChange={(v) => setVoiceOfficeEndMinutes(Number(v))}
                  disabled={!voiceFeatureEnabled}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Fine" />
                  </SelectTrigger>
                  <SelectContent>
                    {END_TIME_OPTIONS.map((m) => (
                      <SelectItem key={`voice-end-${m}`} value={String(m)}>
                        {formatMinutes(m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* ── Allowed actions ────────────────────────────────────────────── */}
        <SectionCard
          icon={Zap}
          title="Azioni consentite"
          description="Scegli cosa può fare l'assistente durante la conversazione"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {VOICE_ALLOWED_ACTION_OPTIONS.map((option) => {
              const active = voiceAllowedActions.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={!voiceFeatureEnabled}
                  onClick={() => toggleAction(option.value)}
                  className={`rounded-xl border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    active
                      ? "border-[#324D7A] bg-[#324D7A]/10 shadow-sm"
                      : "border-white/70 bg-white/70 hover:border-[#324D7A]/30 hover:bg-white/90"
                  }`}
                >
                  <div
                    className={`text-xs font-semibold ${
                      active ? "text-[#324D7A]" : "text-foreground"
                    }`}
                  >
                    {option.label}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {option.description}
                  </div>
                </button>
              );
            })}
          </div>
        </SectionCard>

        {/* ── Custom instructions ────────────────────────────────────────── */}
        <SectionCard
          icon={FileText}
          title="Istruzioni personalizzate"
          description="Definisci policy, tono comunicativo e regole operative specifiche per la tua autoscuola"
        >
          <textarea
            value={voiceInstructions}
            onChange={(e) => setVoiceInstructions(e.target.value)}
            disabled={!voiceFeatureEnabled}
            rows={5}
            className="w-full resize-none rounded-xl border border-white/70 bg-white/80 p-3.5 text-xs leading-relaxed outline-none transition focus:border-[#324D7A] focus:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Esempio: Questa autoscuola offre guide a Milano. Il numero per urgenze è +39 02 123456. Il costo di una guida da 1h è €50. Non promettere sconti. Usa sempre un tono cordiale ma professionale."
          />
        </SectionCard>

        {/* ── Save button ────────────────────────────────────────────────── */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving || !voiceFeatureEnabled} className="min-w-[140px]">
            {saving ? (
              <span className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Salvataggio...
              </span>
            ) : (
              "Salva impostazioni"
            )}
          </Button>
        </div>

        {/* ── Callbacks ─────────────────────────────────────────────────── */}
        <div className="glass-panel glass-strong space-y-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-[#324D7A]/10">
                <Phone className="size-4 text-[#324D7A]" />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">Richiamata in sospeso</div>
                <p className="text-xs text-muted-foreground">
                  Chiamanti che hanno richiesto di essere ricontattati
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadCallbacks}
              disabled={loadingCallbacks}
              className="gap-2 text-xs"
            >
              <RefreshCw className={`size-3.5 ${loadingCallbacks ? "animate-spin" : ""}`} />
              Aggiorna
            </Button>
          </div>

          {callbackTasks.length === 0 ? (
            <div className="rounded-xl border border-white/60 bg-white/50 px-4 py-8 text-center">
              <Phone className="mx-auto mb-2 size-6 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {loadingCallbacks ? "Caricamento..." : "Nessuna richiesta di richiamata in sospeso"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {callbackTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/60 bg-white/60 px-4 py-3 transition hover:bg-white/80"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {task.student?.name ?? task.phoneNumber}
                      </span>
                      {task.student?.name ? (
                        <span className="text-xs text-muted-foreground">{task.phoneNumber}</span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{task.reason}</span>
                      <span className="text-muted-foreground/40">·</span>
                      <span>
                        {new Date(task.createdAt).toLocaleDateString("it-IT", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleMarkDone(task.id)}
                    disabled={markingDone === task.id}
                    className="shrink-0 gap-1.5 text-xs"
                  >
                    {markingDone === task.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-3 text-emerald-600" />
                    )}
                    {markingDone === task.id ? "..." : "Fatto"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ClientPageWrapper>
  );
}
