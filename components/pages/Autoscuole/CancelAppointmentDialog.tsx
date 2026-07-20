"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InlineToggle } from "@/components/ui/inline-toggle";
import { LoadingDots } from "@/components/ui/loading-dots";
import { cn } from "@/lib/utils";

/**
 * Dialogo unico "Annulla / Rimuovi guida", context-aware.
 * - Guida FUTURA → "Annulla guida": nei tempi (credito reso / nessun addebito)
 *   oppure tardivo con scelta esito (Trattieni/Restituisci credito · Addebita/
 *   Non addebitare · Decidi dopo → Cancellazioni tardive).
 * - Guida PASSATA → "Rimuovi dallo storico": scelta ore istruttore (Togli/Mantieni)
 *   + eventuale restituzione del credito.
 * Riusato da agenda e dettaglio allievo passando `target` normalizzato.
 */
export type CancelDialogTarget = {
  appointmentId: string;
  studentName: string | null;
  startsAt: Date;
  endsAt: Date | null;
  /** Guida già svolta/passata → flusso "Rimuovi"; altrimenti "Annulla". */
  isPast: boolean;
  creditApplied: boolean;
  paymentRequired: boolean;
  penaltyCutoffAt: Date | null;
  penaltyAmount: number | null;
  /** True se la guida attualmente conta nelle ore (completed/checked_in/no_show). */
  countsInHours: boolean;
};

export type LateOutcome = "penalize" | "waive" | "defer";

const formatEuro = (v: number) => `€ ${v.toFixed(2)}`;

const formatCountdown = (from: Date, to: Date) => {
  const mins = Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000));
  if (mins >= 60 * 36) return `${Math.round(mins / 60 / 24)} giorni`;
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  }
  return `${mins} min`;
};

const timeLabel = (d: Date) =>
  d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
const dayLabel = (d: Date) =>
  d.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "short" });

function OptionRow({
  selected,
  onClick,
  title,
  sub,
  tag,
  disabled,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  sub: string;
  tag?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-start gap-3 rounded-[12px] border p-3 text-left transition-colors",
        selected ? "border-foreground bg-[#fafafb]" : "border-[#ececf1] hover:border-[#d6d6de]",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-[17px] shrink-0 items-center justify-center rounded-full border-2",
          selected ? "border-foreground" : "border-[#cfcfd8]",
        )}
      >
        {selected && <span className="size-[7px] rounded-full bg-foreground" />}
      </span>
      <span className="flex-1">
        <span className="block text-[13.5px] font-semibold text-foreground">{title}</span>
        <span className="mt-0.5 block text-[12.5px] font-medium text-[#6a6a76]">{sub}</span>
      </span>
      {tag && (
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[#9a9aa4]">{tag}</span>
      )}
    </button>
  );
}

export function CancelAppointmentDialog({
  target,
  busy,
  canDecideEconomics = true,
  onClose,
  onAnnul,
  onRemove,
}: {
  target: CancelDialogTarget | null;
  busy: boolean;
  /** Istruttore non titolare: niente scelte economiche → sempre in coda tardive. */
  canDecideEconomics?: boolean;
  onClose: () => void;
  onAnnul: (lateOutcome?: LateOutcome) => void;
  onRemove: (opts: { keepInHours: boolean; refundCredit: boolean }) => void;
}) {
  const [lateOutcome, setLateOutcome] = React.useState<LateOutcome>("penalize");
  const [keepInHours, setKeepInHours] = React.useState(false);
  const [refundCredit, setRefundCredit] = React.useState(false);

  React.useEffect(() => {
    setLateOutcome("penalize");
    setKeepInHours(false);
    setRefundCredit(false);
  }, [target?.appointmentId]);

  if (!target) return null;

  const coverage: "credit" | "money" | "none" = target.creditApplied
    ? "credit"
    : target.paymentRequired
      ? "money"
      : "none";
  const now = new Date();
  const isLate =
    target.penaltyCutoffAt != null && now.getTime() > target.penaltyCutoffAt.getTime();
  const cutoffHours =
    target.penaltyCutoffAt != null
      ? Math.max(
          0,
          Math.round((target.startsAt.getTime() - target.penaltyCutoffAt.getTime()) / 3600000),
        )
      : null;
  const student = target.studentName ?? "l'allievo";

  const lessonLine = (
    <div className="mt-3 flex items-center gap-2 rounded-[12px] bg-[#f7f7f9] px-3 py-2.5 text-[13px] font-medium text-[#6a6a76]">
      <span className="font-semibold text-foreground">{target.studentName ?? "Allievo"}</span>
      <span>·</span>
      <span>
        {dayLabel(target.startsAt)} · {timeLabel(target.startsAt)}
        {target.endsAt ? `–${timeLabel(target.endsAt)}` : ""}
      </span>
    </div>
  );

  const footer = (confirmLabel: string, onConfirm: () => void, danger = true) => (
    <DialogFooter className="mt-5">
      <Button variant="ghost" onClick={onClose} disabled={busy}>
        Indietro
      </Button>
      <Button
        onClick={onConfirm}
        disabled={busy}
        className={danger ? "bg-[#dc2626] text-white hover:bg-[#b91c1c]" : undefined}
      >
        {busy ? <LoadingDots className="scale-[0.6]" /> : confirmLabel}
      </Button>
    </DialogFooter>
  );

  // ─────────────────────────── PASSATA → RIMUOVI ───────────────────────────
  if (target.isPast) {
    return (
      <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
        <DialogContent overlayClassName="z-[250]" className="z-[250]">
          <DialogHeader>
            <DialogTitle>Rimuovere questa guida dallo storico?</DialogTitle>
          </DialogHeader>
          {lessonLine}
          <p className="mt-3.5 text-[14px] text-[#3a3a48]">
            È una guida <span className="font-semibold text-foreground">passata</span>. Sparirà dallo
            storico dell&apos;allievo e dall&apos;agenda. <b>Non è reversibile.</b>
          </p>

          {target.countsInHours && (
            <>
              <p className="mt-4 text-[13px] font-semibold text-foreground">Ore dell&apos;istruttore</p>
              <div className="mt-2 flex flex-col gap-2">
                <OptionRow
                  selected={!keepInHours}
                  onClick={() => setKeepInHours(false)}
                  title="Togli anche dalle ore"
                  sub="L'istruttore non conta più queste ore."
                />
                <OptionRow
                  selected={keepInHours}
                  onClick={() => setKeepInHours(true)}
                  title="Mantieni nelle ore dell'istruttore"
                  sub="La guida sparisce dallo storico allievo ma resta conteggiata (l'ha comunque svolta)."
                />
              </div>
            </>
          )}

          {target.creditApplied && (
            <>
              <div className="mt-3 flex items-start gap-2.5 rounded-[11px] bg-[#F5F3FF] px-3 py-2.5 text-[13px] text-[#6D28D9]">
                <span>💳</span>
                <span>
                  Questa guida era stata <b>coperta da un credito</b>.
                </span>
              </div>
              <div className="mt-3 flex items-start gap-3 rounded-[12px] border border-[#ececf1] p-3">
                <InlineToggle checked={refundCredit} onChange={() => setRefundCredit((v) => !v)} />
                <div>
                  <p className="text-[13.5px] font-semibold text-foreground">
                    Restituisci anche il credito a {student}
                  </p>
                  <p className="mt-0.5 text-[12.5px] font-medium text-[#6a6a76]">
                    Se la guida non doveva contare (es. inserita per sbaglio), le rendi 1 credito.
                  </p>
                </div>
              </div>
            </>
          )}

          {footer("Rimuovi dallo storico", () => onRemove({ keepInHours, refundCredit }))}
        </DialogContent>
      </Dialog>
    );
  }

  // ─────────────────────────── FUTURA → ANNULLA ────────────────────────────
  // Nei tempi: nessuna penale, un solo bottone.
  if (!isLate) {
    return (
      <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
        <DialogContent overlayClassName="z-[250]" className="z-[250]">
          <DialogHeader>
            <DialogTitle>Annullare questa guida?</DialogTitle>
          </DialogHeader>
          {lessonLine}
          <p className="mt-3.5 text-[14px] text-[#3a3a48]">
            Sei <span className="font-semibold text-foreground">nei tempi</span>
            {cutoffHours != null ? ` (oltre il limite di ${cutoffHours}h di preavviso)` : ""}. L&apos;allievo
            non subisce penali.
          </p>
          {coverage === "credit" && (
            <div className="mt-3 flex items-start gap-2.5 rounded-[11px] bg-[#F0FDF4] px-3 py-2.5 text-[13px] text-[#067647]">
              <span>↩︎</span>
              <span>
                Il <b>credito</b> di questa guida verrà <b>restituito</b> a {student}.
              </span>
            </div>
          )}
          {coverage === "money" && (
            <div className="mt-3 flex items-start gap-2.5 rounded-[11px] bg-[#F0FDF4] px-3 py-2.5 text-[13px] text-[#067647]">
              <span>€</span>
              <span>Non verrà addebitato nulla a {student}.</span>
            </div>
          )}
          {footer("Annulla la guida", () => onAnnul(undefined))}
        </DialogContent>
      </Dialog>
    );
  }

  // Tardivo.
  const lateHeaderNote =
    coverage === "credit"
      ? `Mancano ${formatCountdown(now, target.startsAt)} alla guida (sotto il limite di ${cutoffHours ?? "?"}h). Di norma l'allievo perde il credito.`
      : coverage === "money"
        ? `Mancano ${formatCountdown(now, target.startsAt)} (sotto il limite di ${cutoffHours ?? "?"}h). L'allievo dovrebbe pagare comunque la guida${target.penaltyAmount != null ? ` (penale ${formatEuro(target.penaltyAmount)})` : ""}.`
        : `L'annullamento è tardivo, ma per questa guida non ci sono crediti né importi in gioco.`;

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Annullamento tardivo</DialogTitle>
        </DialogHeader>
        {lessonLine}
        <div className="mt-3 flex items-start gap-2.5 rounded-[11px] border border-[#FCE7C7] bg-[#FFF7ED] px-3 py-2.5 text-[13px] text-[#B45309]">
          <span>⚠️</span>
          <span>{lateHeaderNote}</span>
        </div>

        {coverage !== "none" && canDecideEconomics && (
          <>
            <p className="mt-4 text-[13px] font-semibold text-foreground">
              {coverage === "credit" ? `Cosa fare con il credito di ${student}?` : "Cosa vuoi fare?"}
            </p>
            <div className="mt-2 flex flex-col gap-2">
              <OptionRow
                selected={lateOutcome === "penalize"}
                onClick={() => setLateOutcome("penalize")}
                title={
                  coverage === "credit"
                    ? "Trattieni il credito"
                    : `Addebita la penale${target.penaltyAmount != null ? ` · ${formatEuro(target.penaltyAmount)}` : ""}`
                }
                sub={
                  coverage === "credit"
                    ? "Segui la regola: l'allievo perde la guida."
                    : "La guida risulterà “da pagare”."
                }
              />
              <OptionRow
                selected={lateOutcome === "waive"}
                onClick={() => setLateOutcome("waive")}
                title={coverage === "credit" ? "Restituisci il credito" : "Non addebitare"}
                sub={
                  coverage === "credit"
                    ? `Condoni: ${student} riavrà 1 credito guida.`
                    : "Condoni: nessun importo a carico dell'allievo."
                }
              />
              <OptionRow
                selected={lateOutcome === "defer"}
                onClick={() => setLateOutcome("defer")}
                title="Decidi più tardi"
                sub="La mando in Cancellazioni tardive."
                tag="coda"
              />
            </div>
          </>
        )}

        {coverage !== "none" && !canDecideEconomics && (
          <p className="mt-3 text-[13px] font-medium text-[#6a6a76]">
            La cancellazione verrà gestita dal titolare in <b>Cancellazioni tardive</b>.
          </p>
        )}

        {footer("Annulla la guida", () =>
          onAnnul(coverage === "none" ? undefined : canDecideEconomics ? lateOutcome : "defer"),
        )}
      </DialogContent>
    </Dialog>
  );
}
