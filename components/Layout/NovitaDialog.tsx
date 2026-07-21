"use client";

import React from "react";
import { Check, X } from "lucide-react";
import { createPortal } from "react-dom";

export type NovitaEntryKey = "agenda-pausa" | "veicoli" | "istruttori";

// "agenda-pausa" non è gestita da NovitaDialog: la voce apre il dialog dedicato
// AgendaPauseNewsDialog (splash + video). Lo shell la intercetta prima.
export const NOVITA_ENTRIES: Array<{ key: NovitaEntryKey; title: string; latest?: boolean }> = [
  { key: "agenda-pausa", title: "Richieste agenda in pausa", latest: true },
  { key: "veicoli", title: "Modulo veicoli" },
  { key: "istruttori", title: "Gestione autonoma degli istruttori" },
];

function StepRow({ num, children }: { num: number; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#eeeef4] text-[13px] font-bold text-navy-900">
        {num}
      </div>
      <div className="pt-0.5 text-[14.5px] font-medium leading-normal text-[#444444]">{children}</div>
    </div>
  );
}

function CheckRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <Check className="mt-0.5 size-[18px] shrink-0 text-[#1a7f50]" strokeWidth={1.9} />
      <div className="text-[14.5px] font-medium leading-normal text-[#444444]">{children}</div>
    </div>
  );
}

/**
 * Modal changelog "Novità" (dal menu hamburger). Contenuto statico come il
 * proto: una scheda per feature rilasciata.
 */
export function NovitaDialog({
  entry,
  onClose,
}: {
  entry: NovitaEntryKey | null;
  onClose: () => void;
}) {
  React.useEffect(() => {
    if (!entry) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [entry, onClose]);

  if (!entry || typeof document === "undefined") return null;

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[600] flex items-center justify-center bg-black/[0.42] px-6 py-8"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[calc(100vh-64px)] w-[640px] max-w-full flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.25)]"
        role="dialog"
        aria-modal="true"
        data-testid="novita-dialog"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#f0f0f0] bg-white px-6 py-4">
          <span className="text-[13px] font-semibold tracking-[0.2px] text-[#929292]">Novità</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-full bg-[#f5f5f5] transition-colors hover:bg-[#ececec]"
          >
            <X className="size-3.5 text-[#6a6a6a]" strokeWidth={1.7} />
          </button>
        </div>

        <div className="overflow-y-auto px-8 pb-9 pt-7">
          {entry === "veicoli" && (
            <>
              <div className="mb-1.5 text-[13px] font-semibold text-[#929292]">12 giugno 2026</div>
              <div className="mb-5 text-[26px] font-bold tracking-[-0.4px] text-foreground">
                Modulo veicoli
              </div>
              <div className="mb-6 overflow-hidden rounded-2xl bg-black leading-none">
                <video
                  src="/videos/novita/veicoli.mp4"
                  autoPlay
                  muted
                  playsInline
                  loop
                  className="block aspect-video w-full object-cover"
                />
              </div>
              <p className="mb-6 text-[15px] font-medium leading-relaxed text-[#444444]">
                Tieni traccia dei veicoli della tua autoscuola e assegnali alle guide, così sai
                sempre quale mezzo è impegnato e quando.
              </p>
              <div className="flex flex-col gap-3.5">
                <CheckRow>
                  Aggiungi un veicolo con <b className="font-bold text-foreground">nome, targa e
                  idoneità patente</b>, in pool condiviso o esclusiva per istruttore.
                </CheckRow>
                <CheckRow>Ogni guida può essere associata al veicolo usato.</CheckRow>
                <CheckRow>Attivi o disattivi il modulo quando vuoi, dalle Impostazioni.</CheckRow>
              </div>
            </>
          )}

          {entry === "istruttori" && (
            <>
              <div className="mb-1.5 text-[13px] font-semibold text-[#929292]">18 giugno 2026</div>
              <div className="mb-5 text-[26px] font-bold tracking-[-0.4px] text-foreground">
                Gestione autonoma degli istruttori
              </div>
              <div className="mb-6 overflow-hidden rounded-2xl bg-black leading-none">
                <video
                  src="/videos/novita/istruttori.mp4"
                  autoPlay
                  muted
                  playsInline
                  loop
                  className="block aspect-video w-full object-cover"
                />
              </div>
              <p className="mb-6 text-[15px] font-medium leading-relaxed text-[#444444]">
                Aggiungi e gestisci gli istruttori in autonomia,{" "}
                <b className="font-bold text-foreground">senza passare dal nostro team</b>.
              </p>
              <div className="flex flex-col gap-3.5">
                <CheckRow>
                  Inviti un istruttore via email;{" "}
                  <b className="font-bold text-foreground">imposta da solo la password</b>.
                </CheckRow>
                <CheckRow>
                  Il posto si aggiunge all&apos;abbonamento ed è{" "}
                  <b className="font-bold text-foreground">riassegnabile senza costi</b> in caso di
                  sostituzione.
                </CheckRow>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
