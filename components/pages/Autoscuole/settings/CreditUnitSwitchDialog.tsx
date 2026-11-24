"use client";

import React from "react";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SETTING_SELECT_TRIGGER_CLASS } from "@/components/pages/Autoscuole/settings/SettingRow";
import {
  previewLessonCreditUnitSwitch,
  switchLessonCreditUnit,
  type CreditUnitSwitchPreview,
} from "@/lib/actions/autoscuole-credit-unit.actions";
import {
  CREDIT_MINUTES_PER_LESSON_MAX,
  CREDIT_MINUTES_PER_LESSON_MIN,
  DEFAULT_CREDIT_MINUTES_PER_LESSON,
  type CreditRemainderPolicy,
  type LessonCreditUnit,
} from "@/lib/autoscuole/lesson-credit-unit";
import { formatDrivingMinutes, minutesToHoursInput, parseHoursInput } from "@/lib/autoscuole/weekly-limit";
import { cn } from "@/lib/utils";

/**
 * REG-783 — dialogo di passaggio dei crediti (guide ↔ ore).
 * Il titolare sceglie quanto vale una guida e, verso le guide, cosa fare dei
 * minuti che avanzano; l'anteprima mostra il prima → dopo di ogni allievo.
 * Alla conferma il server ricontrolla i saldi: se sono cambiati rimanda
 * l'anteprima nuova da riconfermare.
 */

const REMAINDER_LABELS: Record<CreditRemainderPolicy, string> = {
  round: "Al più vicino",
  floor: "Per difetto",
  ceil: "Per eccesso",
};

const REMAINDER_HINTS = (minutesPerLesson: number): Record<CreditRemainderPolicy, string> => {
  const half = formatDrivingMinutes(Math.round(minutesPerLesson / 2));
  return {
    round: `Sotto ${minutesPerLesson === 60 ? "la mezz'ora" : half} si perdono, da ${minutesPerLesson === 60 ? "mezz'ora" : half} in su diventano una guida.`,
    floor: "I minuti che non fanno una guida intera si perdono.",
    ceil: "I minuti che avanzano diventano una guida intera.",
  };
};

const VISIBLE_ROWS = 4;

export function CreditUnitSwitchDialog({
  open,
  toUnit,
  onOpenChange,
  onSwitched,
}: {
  open: boolean;
  toUnit: LessonCreditUnit;
  onOpenChange: (open: boolean) => void;
  onSwitched: (unit: LessonCreditUnit) => void;
}) {
  const toast = useFeedbackToast();
  const toMinutes = toUnit === "minutes";
  const [minutesPerLesson, setMinutesPerLesson] = React.useState(DEFAULT_CREDIT_MINUTES_PER_LESSON);
  const [draft, setDraft] = React.useState(minutesToHoursInput(DEFAULT_CREDIT_MINUTES_PER_LESSON));
  const [policy, setPolicy] = React.useState<CreditRemainderPolicy>("round");
  const [preview, setPreview] = React.useState<CreditUnitSwitchPreview | null>(null);
  const [showAll, setShowAll] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const requestRef = React.useRef(0);

  React.useEffect(() => {
    if (!open) return;
    setMinutesPerLesson(DEFAULT_CREDIT_MINUTES_PER_LESSON);
    setDraft(minutesToHoursInput(DEFAULT_CREDIT_MINUTES_PER_LESSON));
    setPolicy("round");
    setShowAll(false);
    setPreview(null);
  }, [open, toUnit]);

  React.useEffect(() => {
    if (!open) return;
    const id = ++requestRef.current;
    void previewLessonCreditUnitSwitch({ toUnit, minutesPerLesson, remainderPolicy: policy }).then((res) => {
      if (id !== requestRef.current) return;
      if (res.success) setPreview(res.data);
      else {
        toast.error({ description: res.message ?? "Impossibile calcolare il passaggio." });
        onOpenChange(false);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, toUnit, minutesPerLesson, policy]);

  const commitMinutes = () => {
    const parsed = parseHoursInput(draft);
    if (parsed === null) {
      setDraft(minutesToHoursInput(minutesPerLesson));
      return;
    }
    const clamped = Math.max(CREDIT_MINUTES_PER_LESSON_MIN, Math.min(CREDIT_MINUTES_PER_LESSON_MAX, parsed));
    setDraft(minutesToHoursInput(clamped));
    setMinutesPerLesson(clamped);
  };

  const confirm = async () => {
    if (!preview || saving) return;
    setSaving(true);
    const res = await switchLessonCreditUnit({
      toUnit,
      minutesPerLesson,
      remainderPolicy: policy,
      fingerprint: preview.fingerprint,
    });
    setSaving(false);
    if (res.success) {
      toast.success({ description: res.message });
      onSwitched(toUnit);
      onOpenChange(false);
      return;
    }
    if ("code" in res && res.code === "PREVIEW_CHANGED" && res.data) {
      setPreview(res.data);
      toast.error({ description: res.message });
      return;
    }
    toast.error({ description: res.message ?? "Impossibile cambiare i crediti." });
  };

  const rows = preview?.rows ?? [];
  const visible = showAll ? rows : rows.slice(0, VISIBLE_ROWS);

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-h-[92dvh] gap-0 overflow-y-auto" data-testid="credit-unit-switch-dialog">
        <div className="pr-11">
          <DialogTitle className="text-[19px] font-semibold leading-tight tracking-[-0.3px]">
            {toMinutes ? "Crediti a tempo" : "Crediti a guide"}
          </DialogTitle>
          <DialogDescription className="mt-1.5 text-[14px] font-medium leading-normal text-[#6a6a6a]">
            {toMinutes
              ? "I crediti degli allievi passano da guide a ore. Scegli quanto vale una guida."
              : "I crediti degli allievi passano da ore a guide. Scegli quanto vale una guida e cosa fare dei minuti che avanzano."}
          </DialogDescription>
        </div>

        <div className="mt-5">
          <div className="text-[15px] font-semibold text-foreground">Una guida vale</div>
          <div className="mt-2 flex items-center gap-3">
            <input
              type="text"
              inputMode="decimal"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitMinutes}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              aria-label="Ore di una guida"
              data-testid="credit-unit-minutes-per-lesson"
              className="h-11 w-[120px] rounded-[14px] border-0 bg-white px-[18px] text-[15px] font-medium text-foreground shadow-clay-sink outline-none transition-shadow duration-200 focus:shadow-clay-focus"
            />
            <span className="text-[13.5px] font-medium text-[#929292]">{formatDrivingMinutes(minutesPerLesson)}</span>
          </div>
        </div>

        {!toMinutes && (
          <div className="mt-5">
            <div className="text-[15px] font-semibold text-foreground">Minuti che avanzano</div>
            <Select value={policy} onValueChange={(value) => setPolicy(value as CreditRemainderPolicy)}>
              <SelectTrigger
                className={cn(SETTING_SELECT_TRIGGER_CLASS, "mt-2 w-full")}
                data-testid="credit-unit-remainder"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(REMAINDER_LABELS) as CreditRemainderPolicy[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {REMAINDER_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-2 text-[13px] font-medium text-[#929292]">{REMAINDER_HINTS(minutesPerLesson)[policy]}</p>
          </div>
        )}

        <div className="mt-6 flex items-baseline justify-between gap-3">
          <div className="text-[15px] font-semibold text-foreground">Come cambiano</div>
          <div className="text-[13px] font-medium text-[#929292]">
            {preview
              ? rows.length === 1
                ? "1 allievo con crediti"
                : `${rows.length} allievi con crediti`
              : ""}
          </div>
        </div>
        {!preview ? (
          <div className="mt-2 space-y-2">
            <Skeleton className="h-12 w-full rounded-[10px]" />
            <Skeleton className="h-12 w-full rounded-[10px]" />
          </div>
        ) : rows.length === 0 ? (
          <p className="mt-2 text-[13.5px] font-medium text-[#6a6a6a]">
            Nessun allievo ha crediti: cambia solo l&apos;unità.
          </p>
        ) : (
          <div className="mt-1 divide-y divide-[#efefef]" data-testid="credit-unit-rows">
            {visible.map((row) => (
              <div key={row.studentId} className="flex min-h-14 items-center gap-3.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-medium text-foreground">{row.name}</div>
                  {row.remainderLabel ? (
                    <div className="mt-0.5 text-[13px] font-medium text-[#929292]">{row.remainderLabel}</div>
                  ) : null}
                </div>
                <div className="whitespace-nowrap text-[15px] font-medium tabular-nums text-[#929292]">
                  {row.beforeLabel}
                </div>
                <ArrowRight aria-hidden className="size-3.5 shrink-0 text-[#b8b8b8]" strokeWidth={2} />
                <div className="min-w-16 whitespace-nowrap text-right text-[15px] font-semibold tabular-nums text-foreground sm:min-w-[76px]">
                  {row.afterLabel}
                </div>
              </div>
            ))}
            {rows.length > VISIBLE_ROWS && !showAll ? (
              <div className="pt-3.5">
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="cursor-pointer text-[13.5px] font-semibold text-foreground underline decoration-[1.5px] underline-offset-4"
                >
                  Vedi tutti e {rows.length}
                </button>
              </div>
            ) : null}
          </div>
        )}

        {preview && preview.paidFutureLessons > 0 ? (
          <p className="mt-5 text-[13px] font-medium leading-normal text-[#6a6a6a]">
            {preview.paidFutureLessons === 1
              ? "La guida già pagata in agenda resta pagata."
              : `Le ${preview.paidFutureLessons} guide già pagate in agenda restano pagate.`}
            {toMinutes
              ? " Se una viene annullata in tempo, all'allievo torna la sua durata: 90 minuti per una guida da 90."
              : " Se una viene annullata in tempo, all'allievo torna una guida."}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button
            type="button"
            loading={saving}
            disabled={!preview || saving}
            onClick={() => void confirm()}
            data-testid="credit-unit-confirm"
          >
            {toMinutes ? "Passa alle ore" : "Passa alle guide"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
