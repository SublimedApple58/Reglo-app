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
 * Sotto-scheda «Crediti e annullamenti» di Prenotazioni e allievi.
 *
 * REG-780: niente euro. I prezzi guida e la penale in percentuale non si
 * impostano più da qui: la cancellazione tardiva trattiene la guida intera
 * (credito usato o guida da pagare) oppure la condona, e lo decide il titolare.
 * I valori salvati (`lessonPrice30/60`, `penaltyPercentPreset`) restano nel DB:
 * la percentuale tornerà con i crediti a tempo (REG-779, punto 5).
 * Stripe è dismesso.
 *
 * Auto-save come le pane Veicoli/Promemoria: ogni modifica persiste subito
 * il solo campo toccato, con rollback se il salvataggio fallisce.
 */

const CUTOFF_PRESETS = [1, 2, 4, 6, 12, 24, 48] as const;

type SettingsPatch = {
  lessonCreditFlowEnabled?: boolean;
  lessonCreditsRequired?: boolean;
  penaltyCutoffHoursPreset?: (typeof CUTOFF_PRESETS)[number];
};

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

function PaymentsSettingsPane() {
  const toast = useFeedbackToast();
  const [loaded, setLoaded] = React.useState(false);
  const [creditFlowEnabled, setCreditFlowEnabled] = React.useState(false);
  const [creditsRequired, setCreditsRequired] = React.useState(true);
  const [cutoffHours, setCutoffHours] = React.useState("24");

  React.useEffect(() => {
    let active = true;
    const load = async () => {
      const res = await getAutoscuolaSettings();
      if (!active) return;
      if (res.success && res.data) {
        setCreditFlowEnabled(Boolean(res.data.lessonCreditFlowEnabled));
        setCreditsRequired(res.data.lessonCreditsRequired !== false);
        setCutoffHours(String(res.data.penaltyCutoffHoursPreset));
      } else {
        toast.error({
          description: res.message ?? "Impossibile caricare crediti e annullamenti.",
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
    const prev = { creditFlowEnabled, creditsRequired, cutoffHours };
    if (patch.lessonCreditFlowEnabled !== undefined) setCreditFlowEnabled(patch.lessonCreditFlowEnabled);
    if (patch.lessonCreditsRequired !== undefined) setCreditsRequired(patch.lessonCreditsRequired);
    if (patch.penaltyCutoffHoursPreset !== undefined) setCutoffHours(String(patch.penaltyCutoffHoursPreset));

    const res = await updateAutoscuolaSettings(patch);
    if (!res.success) {
      setCreditFlowEnabled(prev.creditFlowEnabled);
      setCreditsRequired(prev.creditsRequired);
      setCutoffHours(prev.cutoffHours);
      toast.error({
        description: res.message ?? "Impossibile salvare crediti e annullamenti.",
      });
    }
  };

  if (!loaded) {
    return (
      <div className="space-y-4">
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
          description="Le guide si pagano con i crediti che carichi all'allievo. Una guida senza credito resta da pagare."
          checked={creditFlowEnabled}
          onToggle={() => save({ lessonCreditFlowEnabled: !creditFlowEnabled })}
        />
        {creditFlowEnabled && (
          <ToggleBanner
            title="Crediti obbligatori per prenotare"
            description="Se disattivato, gli allievi possono prenotare anche senza crediti: le guide senza credito restano da pagare."
            checked={creditsRequired}
            onToggle={() => save({ lessonCreditsRequired: !creditsRequired })}
          />
        )}
      </div>

      {/* Annullamenti all'ultimo momento */}
      <div className="mb-2.5 mt-5">
        <div className="text-[13px] font-semibold text-[#222222]">Annullamenti all&apos;ultimo momento</div>
        <div className="mt-0.5 text-xs font-medium text-[#929292]">
          Chi annulla con meno preavviso paga comunque la guida: il credito resta usato, oppure la
          guida resta da pagare.
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-2 text-xs font-semibold text-[#555555]">Preavviso minimo</div>
          <Select
            value={cutoffHours}
            onValueChange={(value) =>
              save({ penaltyCutoffHoursPreset: Number(value) as (typeof CUTOFF_PRESETS)[number] })
            }
          >
            <SelectTrigger className={PROTO_SELECT_TRIGGER} data-testid="late-cancel-notice">
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
      </div>
      <p className="mt-3 text-xs font-medium leading-relaxed text-[#929292]">
        Decidi tu, caso per caso, se trattenerla o condonarla: quando annulli dall&apos;agenda, oppure
        dopo, da <span className="font-semibold text-[#222222]">Allievi → Cancellazioni tardive</span>.
      </p>
    </div>
  );
}

export default PaymentsSettingsPane;
