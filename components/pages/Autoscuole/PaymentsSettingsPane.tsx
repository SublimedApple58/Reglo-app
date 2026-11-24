"use client";

import React from "react";

import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
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
import {
  SETTING_SELECT_TRIGGER_CLASS,
  SettingRow,
} from "@/components/pages/Autoscuole/settings/SettingRow";

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
 * Stesse righe piatte delle altre sotto-schede (`SettingRow`, REG-780 redesign).
 * Auto-save come le pane Veicoli/Promemoria: ogni modifica persiste subito
 * il solo campo toccato, con rollback se il salvataggio fallisce.
 */

// Stessi valori di AUTOSCUOLA_PAYMENT_CUTOFF_PRESETS (lib/autoscuole/payments.ts).
const CUTOFF_PRESETS = [1, 2, 4, 6, 12, 24, 48, 50, 72] as const;

type SettingsPatch = {
  lessonCreditFlowEnabled?: boolean;
  lessonCreditsRequired?: boolean;
  penaltyCutoffHoursPreset?: (typeof CUTOFF_PRESETS)[number];
};

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
      <div className="space-y-4 pt-6">
        <Skeleton className="h-[60px] w-full rounded-[10px]" />
        <Skeleton className="h-[60px] w-full rounded-[10px]" />
      </div>
    );
  }

  return (
    <div className="divide-y divide-[#ebebeb]">
      <div className="py-6">
        <SettingRow
          title="Crediti guida"
          description="Le guide si pagano con i crediti che carichi all'allievo."
          checked={creditFlowEnabled}
          onToggle={() => save({ lessonCreditFlowEnabled: !creditFlowEnabled })}
        />
        {creditFlowEnabled && (
          <SettingRow
            nested
            title="Servono crediti per prenotare"
            description="Senza crediti l'allievo non può prenotare. Se lo spegni, la guida resta da pagare."
            checked={creditsRequired}
            onToggle={() => save({ lessonCreditsRequired: !creditsRequired })}
          />
        )}
      </div>
      <div className="py-6">
        <SettingRow
          stack
          title="Preavviso per annullare"
          description="Chi annulla più tardi paga comunque la guida. Puoi condonarla da Allievi → Cancellazioni tardive."
          control={
            <Select
              value={cutoffHours}
              onValueChange={(value) =>
                save({ penaltyCutoffHoursPreset: Number(value) as (typeof CUTOFF_PRESETS)[number] })
              }
            >
              <SelectTrigger
                className={cn(SETTING_SELECT_TRIGGER_CLASS, "w-full shrink-0 sm:w-[200px]")}
                data-testid="late-cancel-notice"
              >
                <SelectValue placeholder="Ore" />
              </SelectTrigger>
              <SelectContent>
                {CUTOFF_PRESETS.map((hours) => (
                  <SelectItem key={hours} value={String(hours)}>
                    {hours === 1 ? "1 ora prima" : `${hours} ore prima`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      </div>
    </div>
  );
}

export default PaymentsSettingsPane;
