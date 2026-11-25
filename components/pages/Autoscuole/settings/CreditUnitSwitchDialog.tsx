"use client";

import React from "react";
import { AnimatePresence, motion } from "motion/react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  previewLessonCreditUnitSwitch,
  switchLessonCreditUnit,
  type CreditUnitSwitchPreview,
} from "@/lib/actions/autoscuole-credit-unit.actions";
import {
  CREDIT_MINUTES_PER_LESSON_MAX,
  CREDIT_MINUTES_PER_LESSON_MIN,
  DEFAULT_CREDIT_MINUTES_PER_LESSON,
  remainderPolicyExamples,
  type CreditRemainderPolicy,
  type LessonCreditUnit,
} from "@/lib/autoscuole/lesson-credit-unit";
import { formatDrivingMinutes } from "@/lib/autoscuole/weekly-limit";
import { cn } from "@/lib/utils";

/**
 * REG-783 — dialogo di passaggio dei crediti (guide ↔ ore).
 * REG-788 — riscritto perché si capisca al primo colpo: una frase su cosa
 * cambia da ora; le domande (quanto vale una guida, cosa fare dei minuti che
 * avanzano) compaiono solo se qualche allievo ha crediti da convertire, con
 * scelte pronte e un esempio vero preso dall'anteprima dei saldi.
 * Alla conferma il server ricontrolla i saldi: se sono cambiati rimanda
 * l'anteprima nuova da riconfermare (logica di REG-783 invariata).
 */

const PRESET_MINUTES = [45, 60, 90] as const;
const EXAMPLE_ROWS = 3;

// Veloce e morbida, senza rimbalzo.
const EASE = [0.32, 0.72, 0, 1] as const;
const REVEAL = {
  initial: { height: 0, opacity: 0 },
  animate: { height: "auto", opacity: 1 },
  exit: { height: 0, opacity: 0 },
  transition: { duration: 0.26, ease: EASE },
};

const durationWords = (minutes: number) => (minutes === 90 ? "1 ora e mezza" : formatDrivingMinutes(minutes));

const REMAINDER_LABELS: Record<CreditRemainderPolicy, string> = {
  round: "Alla guida più vicina",
  floor: "Si perdono",
  ceil: "Diventano una guida",
};

function ChoiceRow({
  selected,
  label,
  hint,
  onSelect,
  testId,
}: {
  selected: boolean;
  label: string;
  hint?: string;
  onSelect: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      data-testid={testId}
      className="reglo-focus-ring flex w-full cursor-pointer items-center gap-4 py-3.5 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-foreground">{label}</span>
        {hint ? <span className="mt-0.5 block text-[13px] font-medium text-[#8a8a8a]">{hint}</span> : null}
      </span>
      <span
        aria-hidden
        className={cn(
          "size-[22px] shrink-0 rounded-full transition-[box-shadow] duration-200 ease-out",
          selected ? "shadow-[inset_0_0_0_7px_#111111]" : "shadow-[inset_0_0_0_1.5px_#c4c4c4]",
        )}
      />
    </button>
  );
}

function Question({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="pt-6">
      <div className="text-[15px] font-semibold text-foreground">{title}</div>
      {hint ? <p className="mt-0.5 text-[13px] font-medium text-[#8a8a8a]">{hint}</p> : null}
      <div role="radiogroup" aria-label={title} className="mt-1 divide-y divide-[#efefef]">
        {children}
      </div>
    </div>
  );
}

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
  const [custom, setCustom] = React.useState(false);
  const [customDraft, setCustomDraft] = React.useState("");
  const [policy, setPolicy] = React.useState<CreditRemainderPolicy>("round");
  const [preview, setPreview] = React.useState<CreditUnitSwitchPreview | null>(null);
  const [saving, setSaving] = React.useState(false);
  const requestRef = React.useRef(0);
  const customInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setMinutesPerLesson(DEFAULT_CREDIT_MINUTES_PER_LESSON);
    setCustom(false);
    setCustomDraft("");
    setPolicy("round");
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

  // «Altro»: i minuti scritti valgono appena sono un numero nei limiti.
  const customMinutes = React.useMemo(() => {
    const value = Number(customDraft.trim());
    if (!Number.isInteger(value)) return null;
    if (value < CREDIT_MINUTES_PER_LESSON_MIN || value > CREDIT_MINUTES_PER_LESSON_MAX) return null;
    return value;
  }, [customDraft]);

  React.useEffect(() => {
    if (!custom || customMinutes === null) return;
    const timer = window.setTimeout(() => setMinutesPerLesson(customMinutes), 300);
    return () => window.clearTimeout(timer);
  }, [custom, customMinutes]);

  const pickPreset = (minutes: number) => {
    setCustom(false);
    setMinutesPerLesson(minutes);
  };

  const pickCustom = () => {
    setCustom(true);
    if (!customDraft) setCustomDraft(String(minutesPerLesson));
    window.setTimeout(() => customInputRef.current?.select(), 60);
  };

  const rows = preview?.rows ?? [];
  const hasCredits = rows.length > 0;
  // L'anteprima arriva un attimo dopo la scelta: finché non torna, niente conferma.
  const stale =
    !preview ||
    (hasCredits &&
      (preview.minutesPerLesson !== minutesPerLesson || (!toMinutes && preview.remainderPolicy !== policy)));
  const customInvalid = custom && customDraft.trim() !== "" && customMinutes === null;

  const confirm = async () => {
    if (!preview || stale || saving) return;
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

  const examples = rows.slice(0, EXAMPLE_ROWS);
  const others = rows.length - examples.length;
  const studentsWord = rows.length === 1 ? "1 allievo ha" : `${rows.length} allievi hanno`;

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-h-[92dvh] gap-0 overflow-y-auto" data-testid="credit-unit-switch-dialog">
        <div className="pr-11">
          <DialogTitle className="text-[21px] font-semibold leading-tight tracking-[-0.4px]">
            {toMinutes ? "Conta i crediti in ore" : "Conta i crediti in guide"}
          </DialogTitle>
          <DialogDescription className="mt-2 text-[15px] font-medium leading-[1.45] text-[#5f5f5f]">
            {toMinutes
              ? "Da ora ogni guida scala la sua durata: 30 minuti, 1 ora, 1 ora e mezza."
              : "Da ora ogni guida scala una guida dal saldo, che duri mezz'ora o due ore."}
          </DialogDescription>
        </div>

        {!preview ? (
          <div className="space-y-2.5 pt-6" aria-hidden>
            <Skeleton className="h-4 w-56 rounded-[6px]" />
            <Skeleton className="h-12 w-full rounded-[10px]" />
            <Skeleton className="h-12 w-full rounded-[10px]" />
          </div>
        ) : null}

        <AnimatePresence initial={false}>
          {preview && hasCredits ? (
            <motion.div key="conversion" {...REVEAL} className="overflow-hidden" data-testid="credit-unit-conversion">
              <Question
                title={toMinutes ? "Le guide già caricate quanto valgono?" : "Quanto tempo vale una guida?"}
                hint={
                  toMinutes
                    ? `${studentsWord} ancora guide da usare.`
                    : `Serve a trasformare in guide le ore che ${rows.length === 1 ? "1 allievo ha" : `${rows.length} allievi hanno`} ancora.`
                }
              >
                {PRESET_MINUTES.map((minutes) => (
                  <ChoiceRow
                    key={minutes}
                    selected={!custom && minutesPerLesson === minutes}
                    label={durationWords(minutes)}
                    onSelect={() => pickPreset(minutes)}
                    testId={`credit-unit-preset-${minutes}`}
                  />
                ))}
                <div>
                  <ChoiceRow
                    selected={custom}
                    label="Altro"
                    onSelect={pickCustom}
                    testId="credit-unit-preset-custom"
                  />
                  <AnimatePresence initial={false}>
                    {custom ? (
                      <motion.div key="custom" {...REVEAL} className="overflow-hidden">
                        <div className="pb-3.5">
                          <label className="flex h-12 w-[200px] items-center rounded-[14px] bg-white px-[18px] shadow-clay-sink transition-shadow duration-200 focus-within:shadow-clay-focus">
                            <input
                              ref={customInputRef}
                              type="text"
                              inputMode="numeric"
                              value={customDraft}
                              onChange={(e) => setCustomDraft(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                              aria-label="Minuti di una guida"
                              data-testid="credit-unit-minutes-per-lesson"
                              className="w-full min-w-0 border-0 bg-transparent text-[15px] font-medium tabular-nums text-foreground outline-none"
                            />
                            <span className="shrink-0 pl-2 text-[15px] font-medium text-[#8a8a8a]">minuti</span>
                          </label>
                          <p
                            className={cn(
                              "mt-2 text-[13px] font-medium",
                              customInvalid ? "text-foreground" : "text-[#8a8a8a]",
                            )}
                          >
                            {customInvalid
                              ? "Scrivi un numero di minuti tra 15 e 240."
                              : `Una guida vale ${formatDrivingMinutes(minutesPerLesson)}.`}
                          </p>
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              </Question>

              {!toMinutes ? (
                <Question title="E i minuti che non fanno una guida intera?">
                  {remainderPolicyExamples(minutesPerLesson).map((option) => (
                    <ChoiceRow
                      key={option.policy}
                      selected={policy === option.policy}
                      label={REMAINDER_LABELS[option.policy]}
                      hint={option.examples.join(" · ")}
                      onSelect={() => setPolicy(option.policy)}
                      testId={`credit-unit-remainder-${option.policy}`}
                    />
                  ))}
                </Question>
              ) : null}

              <div className="mt-6 rounded-[18px] bg-[#f7f7f7] px-5 py-4" data-testid="credit-unit-rows">
                <div className="text-[13px] font-semibold text-[#5f5f5f]">Così cambiano i saldi</div>
                <div className={cn("mt-1.5 transition-opacity duration-200", stale && "opacity-50")}>
                  {examples.map((row) => (
                    <div key={row.studentId} className="flex items-baseline gap-3 py-1.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-medium text-foreground">{row.name}</div>
                        {row.remainderLabel ? (
                          <div className="text-[13px] font-medium text-[#8a8a8a]">{row.remainderLabel}</div>
                        ) : null}
                      </div>
                      <div className="whitespace-nowrap text-[15px] font-medium tabular-nums text-[#8a8a8a]">
                        {row.beforeLabel}
                        <span className="px-1.5 text-[#b8b8b8]">→</span>
                        <AnimatePresence mode="popLayout" initial={false}>
                          <motion.span
                            key={row.afterLabel}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.2, ease: EASE }}
                            className="inline-block font-semibold text-foreground"
                          >
                            {row.afterLabel}
                          </motion.span>
                        </AnimatePresence>
                      </div>
                    </div>
                  ))}
                </div>
                {others > 0 ? (
                  <div className="mt-1 text-[13px] font-medium text-[#8a8a8a]">
                    {others === 1 ? "e un altro allievo" : `e altri ${others} allievi`}
                  </div>
                ) : null}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {preview && preview.paidFutureLessons > 0 ? (
          <p className="mt-5 text-[13px] font-medium leading-normal text-[#8a8a8a]">
            {preview.paidFutureLessons === 1
              ? "La guida già pagata in agenda resta pagata."
              : `Le ${preview.paidFutureLessons} guide già pagate in agenda restano pagate.`}
            {preview.paidFutureLessons === 1 ? " Se viene annullata in tempo" : " Se una viene annullata in tempo"}
            {toMinutes ? ", all'allievo torna la sua durata." : ", all'allievo torna una guida."}
          </p>
        ) : null}

        <div className="mt-7 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button
            type="button"
            loading={saving}
            disabled={stale || saving}
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
