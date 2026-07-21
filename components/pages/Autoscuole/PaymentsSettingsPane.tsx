"use client";

import React from "react";

import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { InlineToggle } from "@/components/ui/inline-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getAutoscuolaSettings,
  updateAutoscuolaSettings,
} from "@/lib/actions/autoscuole-settings.actions";
import { PROTO_SELECT_TRIGGER } from "@/components/ui/proto-styles";

/**
 * Pane "Fatturazione e pagamenti" dell'overlay Impostazioni (redesign proto).
 * Contiene SOLO le impostazioni sui pagamenti allievi lato agenda guide
 * (crediti guida, prezzi, cutoff/penale annullamenti): niente Stripe né
 * pagamenti digitali, destinati alla dismissione. Il tracking pagamenti
 * (insoluti, storico) resta nella pagina Pagamenti della navigazione.
 * Auto-save come le pane Veicoli/Promemoria: ogni modifica persiste subito
 * il solo campo toccato, con rollback se il salvataggio fallisce.
 */

const CUTOFF_PRESETS = [1, 2, 4, 6, 12, 24, 48] as const;
const PENALTY_PRESETS = [25, 50, 75, 100] as const;

type SettingsPatch = {
  lessonCreditFlowEnabled?: boolean;
  lessonCreditsRequired?: boolean;
  lessonPrice30?: number;
  lessonPrice60?: number;
  penaltyCutoffHoursPreset?: (typeof CUTOFF_PRESETS)[number];
  penaltyPercentPreset?: (typeof PENALTY_PRESETS)[number];
};

/** "25" | "25,5" | "25.50" → euro (null se non parsabile o fuori range). */
function parseEuro(value: string): number | null {
  const parsed = Number(value.trim().replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 999) return null;
  return Math.round(parsed * 100) / 100;
}

function euroToInput(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(".", ",");
}

/** Banner grigio proto con toggle (come la pane Promemoria). */
function ToggleBanner({
  title,
  description,
  checked,
  onToggle,
}: {
  title: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[10px] bg-[#f8f8f8] p-4">
      <div>
        <div className="text-sm font-semibold text-[#222222]">{title}</div>
        <div className="mt-0.5 text-[13px] font-medium text-[#929292]">{description}</div>
      </div>
      <InlineToggle checked={checked} onChange={onToggle} size="lg" />
    </div>
  );
}

/** Input prezzo in euro stile proto: salva al blur (o Invio) se il valore è cambiato. */
function PriceInput({
  value,
  onCommit,
}: {
  value: string;
  /** Ritorna false se il valore è invalido: l'input torna all'ultimo salvato. */
  onCommit: (raw: string) => boolean;
}) {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);
  return (
    <div className="relative">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value && !onCommit(draft)) setDraft(value);
        }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        inputMode="decimal"
        className="w-full rounded-[10px] border-[1.5px] border-[#dddddd] bg-white px-3.5 py-[11px] pr-9 text-sm font-medium text-[#222222] outline-none transition-colors hover:border-[#929292] focus:border-[#222222]"
      />
      <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-[#929292]">
        €
      </span>
    </div>
  );
}

function PaymentsSettingsPane() {
  const toast = useFeedbackToast();
  const [loaded, setLoaded] = React.useState(false);
  const [creditFlowEnabled, setCreditFlowEnabled] = React.useState(false);
  const [creditsRequired, setCreditsRequired] = React.useState(true);
  const [price30, setPrice30] = React.useState("25");
  const [price60, setPrice60] = React.useState("50");
  const [cutoffHours, setCutoffHours] = React.useState("24");
  const [penaltyPercent, setPenaltyPercent] = React.useState("50");

  React.useEffect(() => {
    let active = true;
    const load = async () => {
      const res = await getAutoscuolaSettings();
      if (!active) return;
      if (res.success && res.data) {
        setCreditFlowEnabled(Boolean(res.data.lessonCreditFlowEnabled));
        setCreditsRequired(res.data.lessonCreditsRequired !== false);
        setPrice30(euroToInput(res.data.lessonPrice30));
        setPrice60(euroToInput(res.data.lessonPrice60));
        setCutoffHours(String(res.data.penaltyCutoffHoursPreset));
        setPenaltyPercent(String(res.data.penaltyPercentPreset));
      } else {
        toast.error({
          description: res.message ?? "Impossibile caricare le impostazioni pagamenti.",
        });
      }
      setLoaded(true);
    };
    load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Applica subito in UI, persiste il campo toccato, rollback se fallisce.
  const save = async (patch: SettingsPatch) => {
    const prev = { creditFlowEnabled, creditsRequired, price30, price60, cutoffHours, penaltyPercent };
    if (patch.lessonCreditFlowEnabled !== undefined) setCreditFlowEnabled(patch.lessonCreditFlowEnabled);
    if (patch.lessonCreditsRequired !== undefined) setCreditsRequired(patch.lessonCreditsRequired);
    if (patch.lessonPrice30 !== undefined) setPrice30(euroToInput(patch.lessonPrice30));
    if (patch.lessonPrice60 !== undefined) setPrice60(euroToInput(patch.lessonPrice60));
    if (patch.penaltyCutoffHoursPreset !== undefined) setCutoffHours(String(patch.penaltyCutoffHoursPreset));
    if (patch.penaltyPercentPreset !== undefined) setPenaltyPercent(String(patch.penaltyPercentPreset));

    const res = await updateAutoscuolaSettings(patch);
    if (!res.success) {
      setCreditFlowEnabled(prev.creditFlowEnabled);
      setCreditsRequired(prev.creditsRequired);
      setPrice30(prev.price30);
      setPrice60(prev.price60);
      setCutoffHours(prev.cutoffHours);
      setPenaltyPercent(prev.penaltyPercent);
      toast.error({
        description: res.message ?? "Impossibile salvare le impostazioni pagamenti.",
      });
    }
  };

  const commitPrice = (field: "lessonPrice30" | "lessonPrice60", raw: string) => {
    const parsed = parseEuro(raw);
    if (parsed === null) {
      toast.error({ description: "Prezzo non valido: inserisci un importo tra 0 e 999 €." });
      return false;
    }
    save({ [field]: parsed });
    return true;
  };

  if (!loaded) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[74px] w-full rounded-[10px]" />
        <Skeleton className="h-[74px] w-full rounded-[10px]" />
        <Skeleton className="h-[120px] w-full rounded-[10px]" />
      </div>
    );
  }

  return (
    <div>
      {/* Crediti guida */}
      <div className="space-y-3">
        <ToggleBanner
          title="Crediti guida"
          description="Le guide si pagano con crediti caricati dall'autoscuola: annullamenti tardivi e guide senza credito risultano da pagare."
          checked={creditFlowEnabled}
          onToggle={() => save({ lessonCreditFlowEnabled: !creditFlowEnabled })}
        />
        {creditFlowEnabled && (
          <ToggleBanner
            title="Crediti obbligatori per prenotare"
            description="Se disattivato, gli allievi possono prenotare anche senza crediti: le guide senza credito risultano da pagare."
            checked={creditsRequired}
            onToggle={() => save({ lessonCreditsRequired: !creditsRequired })}
          />
        )}
      </div>

      {/* Prezzi guida */}
      <div className="mb-2.5 mt-5">
        <div className="text-[13px] font-semibold text-[#222222]">Prezzi guida</div>
        <div className="mt-0.5 text-xs font-medium text-[#929292]">
          Valore di una guida: usato per i crediti e per il calcolo della penale.
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-2 text-xs font-semibold text-[#555555]">Guida da 30 minuti</div>
          <PriceInput value={price30} onCommit={(raw) => commitPrice("lessonPrice30", raw)} />
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold text-[#555555]">Guida da 60 minuti</div>
          <PriceInput value={price60} onCommit={(raw) => commitPrice("lessonPrice60", raw)} />
        </div>
      </div>

      {/* Cancellazioni tardive */}
      <div className="mb-2.5 mt-5">
        <div className="text-[13px] font-semibold text-[#222222]">Cancellazioni tardive</div>
        <div className="mt-0.5 text-xs font-medium text-[#929292]">
          Se l&apos;allievo annulla oltre il cutoff, sulla guida viene applicata la penale.
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-2 text-xs font-semibold text-[#555555]">Cutoff annullamento</div>
          <Select
            value={cutoffHours}
            onValueChange={(value) =>
              save({ penaltyCutoffHoursPreset: Number(value) as (typeof CUTOFF_PRESETS)[number] })
            }
          >
            <SelectTrigger className={PROTO_SELECT_TRIGGER}>
              <SelectValue placeholder="Ore" />
            </SelectTrigger>
            <SelectContent>
              {CUTOFF_PRESETS.map((hours) => (
                <SelectItem key={hours} value={String(hours)}>
                  {hours === 1 ? "1 ora prima della guida" : `${hours} ore prima della guida`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold text-[#555555]">Penale</div>
          <Select
            value={penaltyPercent}
            onValueChange={(value) =>
              save({ penaltyPercentPreset: Number(value) as (typeof PENALTY_PRESETS)[number] })
            }
          >
            <SelectTrigger className={PROTO_SELECT_TRIGGER}>
              <SelectValue placeholder="%" />
            </SelectTrigger>
            <SelectContent>
              {PENALTY_PRESETS.map((percent) => (
                <SelectItem key={percent} value={String(percent)}>
                  {percent}% del prezzo della guida
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

export default PaymentsSettingsPane;
