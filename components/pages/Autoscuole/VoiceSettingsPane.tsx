"use client";

import React from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, X } from "lucide-react";

import {
  getAutoscuolaSettings,
  updateAutoscuolaSettings,
} from "@/lib/actions/autoscuole-settings.actions";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { InlineToggle } from "@/components/ui/inline-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingDots } from "@/components/ui/loading-dots";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VoiceLineTutorialModal } from "./dialogs/VoiceLineTutorialModal";
import { VoiceInactiveState } from "./VoiceInactiveState";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type VoiceProvisioningStatus = "not_started" | "provisioning" | "ready" | "error";
type VoiceAllowedAction = "faq" | "lesson_info" | "booking";
type SegSubTab = "linea" | "comportamento" | "orari" | "istruzioni";

/** Sotto-insieme voice dei settings, comune a get e update. */
type VoiceSettingsData = {
  voiceAssistantEnabled?: boolean | null;
  voiceBookingEnabled?: boolean | null;
  voiceLegalGreetingEnabled?: boolean | null;
  voiceRecordingEnabled?: boolean | null;
  voiceTranscriptionEnabled?: boolean | null;
  voiceHandoffPhone?: string | null;
  voiceHandoffDuringCallEnabled?: boolean | null;
  voiceHandoffDuringCallInstructions?: string | null;
  voiceOfficeHours?: { daysOfWeek: number[]; startMinutes: number; endMinutes: number } | null;
  voiceInstructions?: string | null;
  voiceCustomGreeting?: string | null;
  voiceAllowedActions?: string[] | null;
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

const SUB_TABS: Array<{ key: SegSubTab; label: string }> = [
  { key: "linea", label: "Linea" },
  { key: "comportamento", label: "Comportamento ed azioni" },
  { key: "orari", label: "Orari e registrazioni" },
  { key: "istruzioni", label: "Istruzioni" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");
const formatMinutes = (totalMinutes: number) =>
  `${pad(Math.floor(totalMinutes / 60))}:${pad(totalMinutes % 60)}`;

const normalizeDays = (days: number[]) =>
  Array.from(new Set(days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))).sort(
    (a, b) => a - b,
  );

// ─── Small primitives (stile proto) ──────────────────────────────────────────

const fieldLabelClass = "mb-2 text-xs font-semibold text-[#555555]";

const textareaClass =
  "w-full resize-y rounded-[10px] border-[1.5px] border-[#dddddd] bg-white px-3.5 py-3 text-sm font-medium leading-[1.6] text-foreground outline-none transition focus:border-navy-900";

/** Riga impostazione con toggle a destra (hairline sotto, stile proto config). */
function ToggleRow({
  label,
  description,
  checked,
  onToggle,
  saving,
  isLast,
}: {
  label: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
  saving?: boolean;
  isLast?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 py-3.5",
        !isLast && "border-b border-[#eeeeee]",
      )}
    >
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground">{label}</div>
        <div className="mt-0.5 text-[13px] font-medium leading-normal text-[#929292]">
          {description}
        </div>
      </div>
      <div className="flex shrink-0 items-center">
        {saving ? (
          <LoadingDots className="text-[#929292]" />
        ) : (
          <InlineToggle checked={checked} size="lg" onChange={onToggle} />
        )}
      </div>
    </div>
  );
}

function PaneSkeleton() {
  return (
    <div>
      <div className="mb-7 flex gap-8 border-b border-[#e8e8e8] pb-3.5">
        <Skeleton className="h-5 w-14" />
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-5 w-20" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-start justify-between gap-4 border-b border-[#ebebeb] py-5">
          <div className="min-w-0 flex-1">
            <Skeleton className="mb-2 h-4 w-48" />
            <Skeleton className="h-3.5 w-72 max-w-full" />
          </div>
          <Skeleton className="h-6 w-11 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * Pane "Segretaria" delle Impostazioni (proto config-tab-segretaria):
 * sub-tabs Linea / Comportamento ed azioni / Orari e registrazioni / Istruzioni.
 * A linea spenta resta solo l'onboarding Linea con il tutorial di attivazione.
 * Salvataggi: i controlli discreti (toggle, chips, giorni, orari) salvano
 * subito; le textarea salvano su blur se cambiate (come l'onchange del proto).
 */
export function VoiceSettingsPane() {
  const toast = useFeedbackToast();

  const [loading, setLoading] = React.useState(true);
  const [subTab, setSubTab] = React.useState<SegSubTab>("linea");
  const [savingKey, setSavingKey] = React.useState<string | null>(null);

  // Stato linea / feature
  const [voiceFeatureEnabled, setVoiceFeatureEnabled] = React.useState(false);
  const [voiceProvisioningStatus, setVoiceProvisioningStatus] =
    React.useState<VoiceProvisioningStatus>("not_started");
  const [voiceLineRef, setVoiceLineRef] = React.useState<string | null>(null);
  const [voiceDisplayNumber, setVoiceDisplayNumber] = React.useState<string | null>(null);

  // Impostazioni voce
  const [voiceAssistantEnabled, setVoiceAssistantEnabled] = React.useState(false);
  const [voiceBookingEnabled, setVoiceBookingEnabled] = React.useState(false);
  const [voiceLegalGreetingEnabled, setVoiceLegalGreetingEnabled] = React.useState(true);
  const [voiceRecordingEnabled, setVoiceRecordingEnabled] = React.useState(true);
  const [voiceTranscriptionEnabled, setVoiceTranscriptionEnabled] = React.useState(true);
  const [voiceHandoffPhone, setVoiceHandoffPhone] = React.useState<string | null>(null);
  const [voiceHandoffDuringCallEnabled, setVoiceHandoffDuringCallEnabled] = React.useState(false);
  const [voiceHandoffDuringCallInstructions, setVoiceHandoffDuringCallInstructions] =
    React.useState("");
  const [voiceOfficeDays, setVoiceOfficeDays] = React.useState<number[]>([1, 2, 3, 4, 5]);
  const [voiceOfficeStartMinutes, setVoiceOfficeStartMinutes] = React.useState(9 * 60);
  const [voiceOfficeEndMinutes, setVoiceOfficeEndMinutes] = React.useState(19 * 60);
  const [voiceAllowedActions, setVoiceAllowedActions] = React.useState<VoiceAllowedAction[]>([
    "faq",
    "lesson_info",
  ]);
  const [voiceInstructions, setVoiceInstructions] = React.useState("");
  const [voiceCustomGreeting, setVoiceCustomGreeting] = React.useState("");
  const [voiceCustomGreetingEnabled, setVoiceCustomGreetingEnabled] = React.useState(false);

  // UI
  const [tutorialOpen, setTutorialOpen] = React.useState(false);
  const [activating, setActivating] = React.useState(false);
  const [deactivateOpen, setDeactivateOpen] = React.useState(false);
  const [handoffEditing, setHandoffEditing] = React.useState(false);
  const [handoffDraft, setHandoffDraft] = React.useState("");

  // Ultimi valori salvati delle textarea, per salvare su blur solo se cambiate
  const savedTextsRef = React.useRef({ greeting: "", rules: "", instructions: "" });

  const applySettings = React.useCallback((d: VoiceSettingsData | null | undefined) => {
    if (!d) return;
    setVoiceAssistantEnabled(Boolean(d.voiceAssistantEnabled));
    setVoiceBookingEnabled(Boolean(d.voiceBookingEnabled));
    setVoiceLegalGreetingEnabled(d.voiceLegalGreetingEnabled !== false);
    setVoiceRecordingEnabled(d.voiceRecordingEnabled !== false);
    setVoiceTranscriptionEnabled(d.voiceTranscriptionEnabled !== false);
    setVoiceHandoffPhone(d.voiceHandoffPhone ?? null);
    setVoiceHandoffDuringCallEnabled(d.voiceHandoffDuringCallEnabled ?? false);
    setVoiceOfficeDays(normalizeDays(Array.from(d.voiceOfficeHours?.daysOfWeek ?? [1, 2, 3, 4, 5])));
    setVoiceOfficeStartMinutes(d.voiceOfficeHours?.startMinutes ?? 9 * 60);
    setVoiceOfficeEndMinutes(d.voiceOfficeHours?.endMinutes ?? 19 * 60);
    // Le textarea si riallineano al server solo se il valore salvato è davvero
    // cambiato: il save di un campo qualsiasi non deve buttare via bozze locali
    // né spegnere il toggle del saluto appena acceso ma non ancora salvato.
    const serverGreeting = d.voiceCustomGreeting ?? "";
    const serverRules = d.voiceHandoffDuringCallInstructions ?? "";
    const serverInstructions = d.voiceInstructions ?? "";
    if (serverRules !== savedTextsRef.current.rules) {
      setVoiceHandoffDuringCallInstructions(serverRules);
    }
    if (serverInstructions !== savedTextsRef.current.instructions) {
      setVoiceInstructions(serverInstructions);
    }
    if (serverGreeting !== savedTextsRef.current.greeting) {
      setVoiceCustomGreeting(serverGreeting);
      setVoiceCustomGreetingEnabled(Boolean(serverGreeting));
    }
    const VALID_ACTIONS: VoiceAllowedAction[] = ["faq", "lesson_info", "booking"];
    const loaded = (d.voiceAllowedActions ?? []).filter((a): a is VoiceAllowedAction =>
      VALID_ACTIONS.includes(a as VoiceAllowedAction),
    );
    setVoiceAllowedActions(loaded.length ? loaded : ["faq", "lesson_info"]);
    savedTextsRef.current = {
      greeting: d.voiceCustomGreeting ?? "",
      rules: d.voiceHandoffDuringCallInstructions ?? "",
      instructions: d.voiceInstructions ?? "",
    };
  }, []);

  React.useEffect(() => {
    let active = true;
    const load = async () => {
      const res = await getAutoscuolaSettings();
      if (!active) return;
      if (res.success && res.data) {
        const d = res.data;
        setVoiceFeatureEnabled(Boolean(d.voiceFeatureEnabled));
        setVoiceProvisioningStatus(
          (d.voiceProvisioningStatus as VoiceProvisioningStatus) ?? "not_started",
        );
        setVoiceLineRef(d.voiceLineRef ?? null);
        setVoiceDisplayNumber(d.voiceDisplayNumber ?? null);
        applySettings(d);
      }
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, [applySettings]);

  /** Salva una patch e riallinea lo stato alla risposta del server. */
  const save = React.useCallback(
    async (patch: Parameters<typeof updateAutoscuolaSettings>[0], key: string) => {
      setSavingKey(key);
      const res = await updateAutoscuolaSettings(patch);
      setSavingKey(null);
      if (!res.success || !res.data) {
        toast.error({ description: res.message ?? "Impossibile salvare le impostazioni." });
        return false;
      }
      applySettings(res.data);
      return true;
    },
    [applySettings, toast],
  );

  const isReady = voiceProvisioningStatus === "ready" && Boolean(voiceLineRef);

  // ── Attivazione / disattivazione linea ──
  const handleActivate = React.useCallback(
    async (handoffPhone: string) => {
      if (!isReady) {
        toast.error({
          description:
            "Linea voce non pronta. Contatta il team Reglo per completare la configurazione.",
        });
        return false;
      }
      if (!voiceOfficeDays.length || voiceOfficeEndMinutes <= voiceOfficeStartMinutes) {
        toast.error({ description: "Orari segreteria voce non validi." });
        return false;
      }
      setActivating(true);
      const ok = await save(
        { voiceAssistantEnabled: true, voiceHandoffPhone: handoffPhone },
        "linea",
      );
      setActivating(false);
      if (ok) toast.success({ description: "Linea attivata: la segretaria risponde alle chiamate." });
      return ok;
    },
    [isReady, voiceOfficeDays, voiceOfficeEndMinutes, voiceOfficeStartMinutes, save, toast],
  );

  const handleDeactivate = async () => {
    const ok = await save({ voiceAssistantEnabled: false }, "linea");
    if (ok) {
      setDeactivateOpen(false);
      setSubTab("linea");
      toast.success({ description: "Linea disattivata." });
    }
  };

  // ── Handler campi ──
  const toggleAction = (action: VoiceAllowedAction) => {
    const next = voiceAllowedActions.includes(action)
      ? voiceAllowedActions.filter((a) => a !== action)
      : [...voiceAllowedActions, action];
    if (!next.length) {
      toast.error({ description: "Deve restare attiva almeno un'azione." });
      return;
    }
    if (!next.includes("booking") && voiceBookingEnabled) {
      // Coerenza: prenotazioni voce richiedono l'azione "Prenota guida".
      save({ voiceAllowedActions: next, voiceBookingEnabled: false }, `action-${action}`);
      return;
    }
    save({ voiceAllowedActions: next }, `action-${action}`);
  };

  const toggleBooking = () => {
    const next = !voiceBookingEnabled;
    if (next && !voiceAllowedActions.includes("booking")) {
      // Attivare le prenotazioni accende anche l'azione corrispondente.
      save(
        { voiceBookingEnabled: true, voiceAllowedActions: [...voiceAllowedActions, "booking"] },
        "booking",
      );
      return;
    }
    save({ voiceBookingEnabled: next }, "booking");
  };

  const toggleDay = (day: number) => {
    const next = voiceOfficeDays.includes(day)
      ? voiceOfficeDays.filter((d) => d !== day)
      : normalizeDays([...voiceOfficeDays, day]);
    if (!next.length) {
      toast.error({ description: "Deve restare attivo almeno un giorno." });
      return;
    }
    save(
      {
        voiceOfficeHours: {
          daysOfWeek: next,
          startMinutes: voiceOfficeStartMinutes,
          endMinutes: voiceOfficeEndMinutes,
        },
      },
      `day-${day}`,
    );
  };

  const saveHours = (startMinutes: number, endMinutes: number) => {
    if (endMinutes <= startMinutes) {
      toast.error({ description: "L'orario di fine deve essere dopo quello di inizio." });
      return;
    }
    save(
      { voiceOfficeHours: { daysOfWeek: voiceOfficeDays, startMinutes, endMinutes } },
      "hours",
    );
  };

  const saveHandoff = async () => {
    const value = handoffDraft.trim();
    if (!value && voiceAssistantEnabled) {
      toast.error({ description: "Con la linea attiva serve un numero di trasferimento." });
      return;
    }
    const ok = await save({ voiceHandoffPhone: value || null }, "handoff");
    if (ok) setHandoffEditing(false);
  };

  const toggleCustomGreeting = () => {
    if (voiceCustomGreetingEnabled) {
      // Spegnere il saluto personalizzato lo cancella (comportamento attuale).
      if (savedTextsRef.current.greeting) {
        save({ voiceCustomGreeting: null }, "greeting-toggle");
      } else {
        // Niente di salvato sul server: basta chiudere localmente.
        setVoiceCustomGreetingEnabled(false);
        setVoiceCustomGreeting("");
      }
    } else {
      setVoiceCustomGreetingEnabled(true);
    }
  };

  const saveTextOnBlur = (
    kind: "greeting" | "rules" | "instructions",
    value: string,
  ) => {
    if (savedTextsRef.current[kind] === value) return;
    if (kind === "greeting") save({ voiceCustomGreeting: value.trim() || null }, "greeting");
    if (kind === "rules") save({ voiceHandoffDuringCallInstructions: value }, "rules");
    if (kind === "instructions") save({ voiceInstructions: value }, "instructions");
  };

  // ── Render ──

  if (loading) return <PaneSkeleton />;

  if (!voiceFeatureEnabled) {
    return <VoiceInactiveState />;
  }

  const lineaAttiva = voiceAssistantEnabled;
  const visibleTabs = lineaAttiva ? SUB_TABS : SUB_TABS.slice(0, 1);
  const activeSubTab: SegSubTab = lineaAttiva ? subTab : "linea";

  return (
    <div data-testid="voice-settings-pane">
      {/* ── Sub-tabs (visibili solo a linea attiva, come il proto) ── */}
      {lineaAttiva && (
        <div className="mb-7 flex flex-wrap items-center gap-8 border-b border-[#e8e8e8]">
          {visibleTabs.map((tab) => {
            const active = activeSubTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setSubTab(tab.key)}
                className={cn(
                  "-mb-px cursor-pointer select-none whitespace-nowrap border-b-[2.5px] px-px pb-3.5 text-base transition-colors",
                  active
                    ? "border-[#222222] font-semibold text-foreground"
                    : "border-transparent font-medium text-[#6a6a6a] hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      )}

      {/* ══ LINEA ══ */}
      {activeSubTab === "linea" && !lineaAttiva && (
        <div className="flex min-h-[55vh] flex-col items-center justify-center px-6 py-10 text-center">
          <Image
            src="/images/nav/segretaria-3d.png"
            alt=""
            width={128}
            height={128}
            className="mb-5 select-none object-contain"
          />
          <div className="text-xl font-bold tracking-[-0.2px] text-foreground">Linea Telefonica</div>
          <div className="mt-3 max-w-[440px] text-[15px] font-medium leading-[1.55] text-[#6a6a6a] [text-wrap:pretty]">
            La segretaria AI risponde alle chiamate 24/7 al posto tuo, dando risposte immediate agli
            allievi. Attiva la linea ora per alleggerire la segreteria e non perdere nessun contatto.
          </div>
          {isReady ? (
            <button
              type="button"
              onClick={() => setTutorialOpen(true)}
              className="mt-6 inline-flex cursor-pointer items-center justify-center rounded-[10px] bg-navy-900 px-[26px] py-3 text-[15px] font-semibold text-white transition-colors hover:bg-navy-800"
            >
              Attiva linea
            </button>
          ) : (
            <div className="mt-6 rounded-[10px] border border-[#f0e060] bg-[#fffce0] px-4 py-3">
              <p className="text-xs font-medium text-[#7a6a00]">
                Il tuo numero è in configurazione: appena pronto potrai attivare la linea. Per
                qualsiasi dubbio contatta il team Reglo.
              </p>
            </div>
          )}
        </div>
      )}

      {activeSubTab === "linea" && lineaAttiva && (
        <div>
          <div className="flex items-start justify-between gap-4 border-b border-[#ebebeb] py-5">
            <div>
              <div className="text-base font-semibold text-foreground">Numero della segretaria</div>
              <div className="mt-1.5 max-w-[520px] text-[13px] font-medium leading-normal text-[#929292]">
                Il numero a cui rispondono le chiamate.
              </div>
            </div>
            <span className="shrink-0 text-[15px] font-semibold tracking-[0.2px] text-foreground">
              {voiceDisplayNumber ?? "—"}
            </span>
          </div>

          <div className="border-b border-[#ebebeb] py-5">
            {!handoffEditing ? (
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-base font-semibold text-foreground">Numero di telefono</div>
                  <div className="mt-1 text-sm font-medium text-[#6a6a6a]">
                    {voiceHandoffPhone?.trim() || "—"}
                  </div>
                  <div className="mt-1.5 max-w-[520px] text-[13px] font-medium leading-normal text-[#929292]">
                    Numero a cui trasferire la chiamata fuori orario.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setHandoffDraft(voiceHandoffPhone ?? "");
                    setHandoffEditing(true);
                  }}
                  className="shrink-0 cursor-pointer whitespace-nowrap text-sm font-semibold text-foreground underline underline-offset-2 hover:decoration-2"
                >
                  Modifica
                </button>
              </div>
            ) : (
              <div>
                <div className="text-base font-semibold text-foreground">Numero di telefono</div>
                <input
                  type="tel"
                  value={handoffDraft}
                  onChange={(e) => setHandoffDraft(e.target.value)}
                  placeholder="+39..."
                  autoFocus
                  className="mt-3 w-full max-w-[420px] rounded-xl border-[1.5px] border-[#222222] bg-white px-3.5 py-3 text-[15px] font-medium text-foreground outline-none"
                />
                <div className="mt-3.5 flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={saveHandoff}
                    disabled={savingKey === "handoff"}
                    className="inline-flex min-h-10 min-w-[78px] cursor-pointer items-center justify-center gap-2 rounded-lg bg-navy-900 px-[18px] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy-800 disabled:opacity-60"
                  >
                    {savingKey === "handoff" ? <LoadingDots /> : "Salva"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setHandoffEditing(false)}
                    className="cursor-pointer rounded-lg px-[18px] py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-[#f2f2f2]"
                  >
                    Annulla
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 py-5">
            <div>
              <div className="text-base font-semibold text-foreground">Linea attiva</div>
              <div className="mt-1 text-[13px] font-medium leading-normal text-[#929292]">
                La segretaria risponde alle chiamate. Disattivala per fermarla.
              </div>
            </div>
            {savingKey === "linea" ? (
              <LoadingDots className="text-[#929292]" />
            ) : (
              <InlineToggle checked size="lg" onChange={() => setDeactivateOpen(true)} />
            )}
          </div>
        </div>
      )}

      {/* ══ COMPORTAMENTO ED AZIONI ══ */}
      {activeSubTab === "comportamento" && (
        <div>
          <div className="mb-3">
            <div className="text-sm font-semibold text-foreground">Azioni consentite</div>
            <div className="mt-0.5 text-[13px] font-medium text-[#929292]">
              Clicca per scegliere cosa può fare l&apos;assistente
            </div>
          </div>
          <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {VOICE_ALLOWED_ACTION_OPTIONS.map((option) => {
              const active = voiceAllowedActions.includes(option.value);
              const saving = savingKey === `action-${option.value}`;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleAction(option.value)}
                  disabled={saving}
                  className={cn(
                    "cursor-pointer rounded-xl border-[1.5px] px-3.5 py-3 text-left transition-all",
                    active
                      ? "border-navy-900 bg-white"
                      : "border-[#dddddd] bg-white hover:border-[#c1c1c1]",
                    saving && "opacity-60",
                  )}
                >
                  <div
                    className={cn(
                      "mb-0.5 text-[13px] font-semibold",
                      active ? "text-navy-900" : "text-foreground",
                    )}
                  >
                    {option.label}
                  </div>
                  <div className="text-[11px] font-medium text-[#929292]">{option.description}</div>
                </button>
              );
            })}
          </div>

          <ToggleRow
            label="Prenotazioni voce"
            description="L'assistente può prenotare guide sull'agenda"
            checked={voiceBookingEnabled}
            onToggle={toggleBooking}
            saving={savingKey === "booking"}
          />
          <ToggleRow
            label="Avviso legale"
            description="Avvisa il chiamante che la chiamata è gestita da un AI"
            checked={voiceLegalGreetingEnabled}
            onToggle={() => save({ voiceLegalGreetingEnabled: !voiceLegalGreetingEnabled }, "legal")}
            saving={savingKey === "legal"}
          />
          <ToggleRow
            label="Saluto personalizzato"
            description="Messaggio iniziale personalizzato prima della conversazione"
            checked={voiceCustomGreetingEnabled}
            onToggle={toggleCustomGreeting}
            saving={savingKey === "greeting-toggle"}
            isLast={!voiceCustomGreetingEnabled}
          />
          <AnimatePresence initial={false}>
            {voiceCustomGreetingEnabled && (
              <motion.div
                key="greeting-textarea"
                initial={{ height: 0, opacity: 0, overflow: "hidden" }}
                animate={{ height: "auto", opacity: 1, transitionEnd: { overflow: "visible" } }}
                exit={{ height: 0, opacity: 0, overflow: "hidden" }}
                transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
              >
                <div className="pb-1 pt-4">
                  <div className={fieldLabelClass}>Testo del saluto</div>
                  <textarea
                    value={voiceCustomGreeting}
                    onChange={(e) => setVoiceCustomGreeting(e.target.value)}
                    onBlur={(e) => saveTextOnBlur("greeting", e.target.value)}
                    maxLength={500}
                    className={cn(textareaClass, "min-h-[110px]")}
                    placeholder="Scrivi qui il messaggio che la segretaria dirà all'inizio della chiamata…"
                  />
                  <div className="mt-1.5 flex items-start justify-between gap-2">
                    <div className="shrink-0 text-xs font-medium text-[#929292]">
                      {voiceCustomGreeting.length}/500 caratteri
                    </div>
                    <div className="text-right text-[11px] font-medium leading-normal text-[#b2b2b2]">
                      Letto all&apos;inizio di ogni chiamata, dopo l&apos;avviso legale (se attivo).
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ══ ORARI E REGISTRAZIONI ══ */}
      {activeSubTab === "orari" && (
        <div>
          <div className={fieldLabelClass}>Giorni attivi</div>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {WEEKDAY_OPTIONS.map((day) => {
              const active = voiceOfficeDays.includes(day.value);
              return (
                <button
                  key={`voice-day-${day.value}`}
                  type="button"
                  onClick={() => toggleDay(day.value)}
                  disabled={savingKey === `day-${day.value}`}
                  className={cn(
                    "cursor-pointer select-none rounded-[50px] border-[1.5px] px-[18px] py-2 text-sm font-medium transition-all",
                    active
                      ? "border-[#222222] bg-[#222222] text-white"
                      : "border-[#dddddd] bg-white text-[#555555] hover:border-[#c1c1c1]",
                    savingKey === `day-${day.value}` && "opacity-60",
                  )}
                >
                  {day.label}
                </button>
              );
            })}
          </div>

          <div className="mb-4 grid grid-cols-2 gap-4">
            <div>
              <div className={fieldLabelClass}>Inizio</div>
              <Select
                value={String(voiceOfficeStartMinutes)}
                onValueChange={(v) => saveHours(Number(v), voiceOfficeEndMinutes)}
                disabled={savingKey === "hours"}
              >
                <SelectTrigger className="h-11 w-full rounded-[10px] border-[1.5px] border-[#dddddd] text-sm font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {START_TIME_OPTIONS.map((m) => (
                    <SelectItem key={`vs-${m}`} value={String(m)}>
                      {formatMinutes(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className={fieldLabelClass}>Fine</div>
              <Select
                value={String(voiceOfficeEndMinutes)}
                onValueChange={(v) => saveHours(voiceOfficeStartMinutes, Number(v))}
                disabled={savingKey === "hours"}
              >
                <SelectTrigger className="h-11 w-full rounded-[10px] border-[1.5px] border-[#dddddd] text-sm font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {END_TIME_OPTIONS.map((m) => (
                    <SelectItem key={`ve-${m}`} value={String(m)}>
                      {formatMinutes(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <ToggleRow
            label="Trasferimento durante chiamata"
            description="Consenti alla segretaria AI di trasferire la chiamata al numero handoff in base a regole personalizzate"
            checked={voiceHandoffDuringCallEnabled}
            onToggle={() =>
              save({ voiceHandoffDuringCallEnabled: !voiceHandoffDuringCallEnabled }, "transfer")
            }
            saving={savingKey === "transfer"}
            isLast={!voiceHandoffDuringCallEnabled}
          />
          <AnimatePresence initial={false}>
            {voiceHandoffDuringCallEnabled && (
              <motion.div
                key="rules-textarea"
                initial={{ height: 0, opacity: 0, overflow: "hidden" }}
                animate={{ height: "auto", opacity: 1, transitionEnd: { overflow: "visible" } }}
                exit={{ height: 0, opacity: 0, overflow: "hidden" }}
                transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
              >
                <div className="border-b border-[#eeeeee] pb-4 pt-4">
                  <div className={fieldLabelClass}>Regole di trasferimento</div>
                  <textarea
                    value={voiceHandoffDuringCallInstructions}
                    onChange={(e) => setVoiceHandoffDuringCallInstructions(e.target.value)}
                    onBlur={(e) => saveTextOnBlur("rules", e.target.value)}
                    maxLength={1000}
                    className={cn(textareaClass, "min-h-[70px]")}
                    placeholder="Scrivi qui in quali casi la segretaria deve trasferire la chiamata…"
                  />
                  <div className="mt-1.5 text-[11px] font-medium leading-normal text-[#b2b2b2]">
                    Es: &laquo;Se chiedono insistentemente i prezzi&raquo; oppure &laquo;Se vogliono
                    parlare con una persona fisica&raquo;.
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <ToggleRow
            label="Registra audio"
            description="Salva una registrazione audio della chiamata"
            checked={voiceRecordingEnabled}
            onToggle={() => save({ voiceRecordingEnabled: !voiceRecordingEnabled }, "recording")}
            saving={savingKey === "recording"}
          />
          <ToggleRow
            label="Trascrivi chiamate"
            description="Genera trascrizione testuale della conversazione"
            checked={voiceTranscriptionEnabled}
            onToggle={() =>
              save({ voiceTranscriptionEnabled: !voiceTranscriptionEnabled }, "transcription")
            }
            saving={savingKey === "transcription"}
            isLast
          />
        </div>
      )}

      {/* ══ ISTRUZIONI ══ */}
      {activeSubTab === "istruzioni" && (
        <div>
          <div className={fieldLabelClass}>Istruzioni personalizzate</div>
          <textarea
            value={voiceInstructions}
            onChange={(e) => setVoiceInstructions(e.target.value)}
            onBlur={(e) => saveTextOnBlur("instructions", e.target.value)}
            maxLength={1500}
            className={cn(textareaClass, "min-h-[180px] leading-[1.7]")}
            placeholder="Scrivi qui policy, tono comunicativo e regole operative che la segretaria deve seguire…"
          />
          <div className="mt-1.5 flex items-start justify-between gap-2">
            <div className="shrink-0 text-xs font-medium text-[#929292]">
              {voiceInstructions.length}/1500 caratteri
            </div>
            <div className="text-right text-[11px] font-medium leading-normal text-[#b2b2b2]">
              Policy, tono comunicativo e regole operative dell&apos;assistente.
            </div>
          </div>
        </div>
      )}

      {/* ── Tutorial attivazione linea ── */}
      <VoiceLineTutorialModal
        open={tutorialOpen}
        onClose={() => setTutorialOpen(false)}
        phoneNumber={voiceDisplayNumber ?? ""}
        initialHandoff={voiceHandoffPhone ?? ""}
        activating={activating}
        onActivate={handleActivate}
      />

      {/* ── Conferma disattivazione linea ── */}
      <AnimatePresence>
        {deactivateOpen && (
          <motion.div
            key="voice-deactivate-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-8"
            onClick={() => setDeactivateOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 4 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              className="relative w-[420px] max-w-[92vw] rounded-[20px] bg-white px-8 pb-7 pt-9 text-center shadow-[0_16px_56px_rgba(0,0,0,0.28)]"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setDeactivateOpen(false)}
                aria-label="Chiudi"
                className="absolute right-[18px] top-[18px] flex size-8 cursor-pointer items-center justify-center rounded-full bg-[#f7f7f7] transition-colors hover:bg-[#f0f0f0]"
              >
                <X className="size-3.5 text-[#6a6a6a]" strokeWidth={1.8} />
              </button>
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-[#fdf0ed]">
                <AlertTriangle className="size-6 text-[#c13515]" strokeWidth={1.8} />
              </div>
              <div className="mb-2 text-[19px] font-bold tracking-[-0.2px] text-foreground">
                Disattivare la linea?
              </div>
              <div className="mb-[22px] text-sm font-medium leading-[1.5] text-[#6a6a6a] [text-wrap:pretty]">
                La segretaria AI smetterà di rispondere alle chiamate. Gli allievi che chiamano non
                riceveranno risposta finché non riattivi la linea.
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setDeactivateOpen(false)}
                  className="flex-1 cursor-pointer rounded-[10px] border-[1.5px] border-[#dddddd] bg-white px-5 py-3 text-sm font-semibold text-[#333333] transition-colors hover:border-[#c1c1c1]"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={handleDeactivate}
                  disabled={savingKey === "linea"}
                  className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-[#c13515] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#a92d10] disabled:opacity-60"
                >
                  {savingKey === "linea" ? <LoadingDots className="min-h-[1.5em]" /> : "Disattiva"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
