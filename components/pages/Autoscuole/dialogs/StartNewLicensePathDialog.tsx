"use client";

import * as React from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { LoadingDots } from "@/components/ui/loading-dots";
import { cn } from "@/lib/utils";
import { LicenseCategorySelectItems } from "../LicenseCategorySelectItems";
import { startNewLicensePath } from "@/lib/actions/autoscuole-license-paths.actions";
import {
  TRANSMISSIONS,
  TRANSMISSION_LABELS,
  type LicenseCategory,
  type Transmission,
} from "@/lib/autoscuole/license";
import { isQualification, pathLabel } from "@/lib/autoscuole/license-paths";

/**
 * «Avvia nuovo percorso» (REG-458).
 *
 * Separato da `EditStudentLicenseDialog` di proposito: quello **corregge** il
 * percorso in corso (categoria sbagliata, cambio sbagliato), questo ne **chiude
 * uno e ne apre un altro**. Prima esisteva solo il primo, e usarlo per il
 * secondo scopo e' esattamente cio' che faceva sparire la patente precedente dal
 * dato.
 *
 * Due passi, e il primo non e' una formalita': senza sapere **come** e' finito
 * quello di prima si scriverebbe nello storico una patente che forse non e' mai
 * stata presa.
 */

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  studentName: string;
  /** Il percorso aperto che sta per essere chiuso. Null = non ce n'e' uno. */
  currentPath: {
    licenseCategory: string | null;
    transmission: string | null;
    startedAt: string;
    licenseNumber: string | null;
  } | null;
  /** La fase teoria e' proponibile solo se l'autoscuola ce l'ha attiva. */
  theoryPhaseEnabled?: boolean;
  onSuccess: () => void;
};

type Outcome = "obtained" | "abandoned";
type StartPhase = "PRATICA" | "TEORIA";

const dateLabel = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
};

/** Scelta singola a riquadro: stessa forma nei due passi. */
function Choice({
  checked,
  onSelect,
  title,
  caption,
  disabled,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  caption: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex w-full cursor-pointer items-start gap-3 rounded-[12px] border p-3.5 text-left transition-colors",
        checked ? "border-foreground shadow-[inset_0_0_0_1px_var(--foreground)]" : "border-[#dddddd] hover:bg-[#fafafa]",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "relative mt-[1px] size-[18px] shrink-0 rounded-full border-[1.5px]",
          checked ? "border-foreground" : "border-[#c9c9c9]",
        )}
      >
        {checked && <span className="absolute inset-[4px] rounded-full bg-foreground" />}
      </span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-[12px] leading-[1.55] text-[#6a6a6a]">{caption}</span>
      </span>
    </button>
  );
}

export function StartNewLicensePathDialog({
  open,
  onOpenChange,
  studentId,
  studentName,
  currentPath,
  theoryPhaseEnabled = false,
  onSuccess,
}: Props) {
  const toast = useFeedbackToast();
  const [step, setStep] = React.useState<1 | 2>(1);
  const [outcome, setOutcome] = React.useState<Outcome>("obtained");
  const [licenseNumber, setLicenseNumber] = React.useState("");
  const [licenseCategory, setLicenseCategory] = React.useState<string>("B");
  const [transmission, setTransmission] = React.useState<string>("manual");
  const [startPhase, setStartPhase] = React.useState<StartPhase>("PRATICA");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setStep(1);
    setOutcome("obtained");
    setLicenseNumber(currentPath?.licenseNumber ?? "");
    setLicenseCategory("B");
    setTransmission("manual");
    setStartPhase("PRATICA");
  }, [open, currentPath?.licenseNumber]);

  const currentLabel = currentPath ? pathLabel(currentPath) : null;
  const nuovaQualifica = isQualification(licenseCategory);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const res = await startNewLicensePath({
        studentId,
        closing: {
          outcome,
          // Mandato solo se l'utente ha scritto qualcosa o ha svuotato un campo
          // che era pieno: assente = non toccare il numero gia' registrato.
          licenseNumber:
            outcome === "obtained" ? licenseNumber.trim() : undefined,
        },
        next: {
          licenseCategory: licenseCategory as LicenseCategory,
          transmission: transmission as Transmission,
          startPhase,
        },
      });
      if (!res.success) {
        toast.error({ description: res.message ?? "Impossibile avviare il nuovo percorso." });
        return;
      }
      toast.success({ description: res.message });
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error({ description: (error as Error)?.message ?? "Errore inatteso." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName="z-[250]" className="z-[250] sm:max-w-md">
        {/* Indicatore di avanzamento: un processo a piu' passi deve dire a che
            punto si e', altrimenti il primo passo sembra l'unico. */}
        <div
          className="h-[3px] w-full overflow-hidden rounded-full bg-[#ececec]"
          role="progressbar"
          aria-valuenow={step}
          aria-valuemin={1}
          aria-valuemax={2}
          aria-label={`Passo ${step} di 2`}
        >
          <div
            className="h-full rounded-full bg-foreground transition-[width] duration-200"
            style={{ width: step === 1 ? "50%" : "100%" }}
          />
        </div>

        {step === 1 ? (
          <>
            <DialogHeader>
              <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#929292]">
                Passo 1 di 2 · chiudi quello in corso
              </p>
              <DialogTitle>
                {currentLabel
                  ? `Com'è finito il percorso ${currentPath?.licenseCategory}?`
                  : "Nessun percorso in corso"}
              </DialogTitle>
              <DialogDescription>
                {currentPath ? (
                  <>
                    <strong>{studentName}</strong> · percorso {currentLabel}, aperto il{" "}
                    {dateLabel(currentPath.startedAt)}.
                  </>
                ) : (
                  <>
                    <strong>{studentName}</strong> non ha un percorso aperto: si passa
                    direttamente ad aprire quello nuovo.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            {currentPath && (
              <div className="space-y-4">
                <div className="space-y-2.5" role="radiogroup" aria-label="Esito del percorso">
                  <Choice
                    checked={outcome === "obtained"}
                    onSelect={() => setOutcome("obtained")}
                    title="Ha preso la patente"
                    caption="Finisce nello storico come patente conseguita."
                  />
                  <Choice
                    checked={outcome === "abandoned"}
                    onSelect={() => setOutcome("abandoned")}
                    title="L'ha lasciato a metà"
                    caption="Resta nello storico come percorso abbandonato."
                  />
                </div>

                {outcome === "obtained" && (
                  <div className="space-y-2">
                    <Label htmlFor="new-path-license-number">
                      Numero di patente{" "}
                      <span className="font-normal text-[#929292]">(facoltativo)</span>
                    </Label>
                    <Input
                      id="new-path-license-number"
                      value={licenseNumber}
                      onChange={(e) => setLicenseNumber(e.target.value)}
                      placeholder="es. GE5512345A"
                      maxLength={40}
                    />
                    <p className="text-[12px] leading-[1.55] text-[#6a6a6a]">
                      È il momento giusto per registrarlo, ma si può aggiungere anche dopo.
                    </p>
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="cursor-pointer"
              >
                Annulla
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => setStep(2)}
                className="cursor-pointer"
              >
                Avanti
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#929292]">
                Passo 2 di 2 · apri il nuovo
              </p>
              <DialogTitle>Quale percorso comincia adesso?</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Patente</Label>
                  <Select value={licenseCategory} onValueChange={setLicenseCategory}>
                    <SelectTrigger className="cursor-pointer">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[300]">
                      <LicenseCategorySelectItems className="cursor-pointer" />
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Cambio</Label>
                  <Select
                    value={transmission}
                    onValueChange={setTransmission}
                    disabled={nuovaQualifica}
                  >
                    <SelectTrigger className="cursor-pointer">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[300]">
                      {TRANSMISSIONS.map((t) => (
                        <SelectItem key={t} value={t} className="cursor-pointer">
                          {TRANSMISSION_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {nuovaQualifica && (
                    <p className="text-[12px] text-[#929292]">
                      Su una qualificazione il cambio non si applica.
                    </p>
                  )}
                </div>
              </div>

              {theoryPhaseEnabled && (
                <div className="space-y-2">
                  <Label>Riparte da</Label>
                  <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Fase di partenza">
                    <Choice
                      checked={startPhase === "PRATICA"}
                      onSelect={() => setStartPhase("PRATICA")}
                      title="Pratica"
                      caption="Può prenotare guide."
                    />
                    <Choice
                      checked={startPhase === "TEORIA"}
                      onSelect={() => setStartPhase("TEORIA")}
                      title="Teoria"
                      caption="Serve un altro esame teorico."
                    />
                  </div>
                </div>
              )}

              {/* La prima domanda che fa chi sta in segreteria. Scritta qui
                  invece che lasciata scoprire dopo. */}
              <div className="rounded-[12px] bg-[#f7f7f7] p-4">
                <p className="mb-1.5 text-[12.5px] font-semibold">Cosa si porta dietro</p>
                <p className="text-[12px] leading-[1.55] text-[#6a6a6a]">
                  Le <strong>guide e le valutazioni</strong>
                  {currentPath?.licenseCategory ? ` della ${currentPath.licenseCategory}` : ""}{" "}
                  restano nello storico e non contano per il nuovo percorso — l&apos;obbligo
                  riparte da 0/6. <strong>Crediti e pagamenti</strong> restano
                  dell&apos;allievo, il portafoglio è uno solo. «Pronto per l&apos;esame» si
                  azzera.
                </p>
              </div>
            </div>

            <DialogFooter className="justify-between gap-2 sm:justify-between">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStep(1)}
                disabled={saving}
                className="cursor-pointer"
              >
                Indietro
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void handleSubmit()}
                disabled={saving}
                className="cursor-pointer"
              >
                {saving ? <LoadingDots /> : `Avvia percorso ${licenseCategory}`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
