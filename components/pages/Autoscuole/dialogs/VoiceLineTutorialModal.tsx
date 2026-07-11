"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useRouter, usePathname } from "next/navigation";
import { HelpCircle, Loader2, Smartphone, Phone, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Tutorial "Collega il numero della segretaria": deviazione di chiamata
 * incondizionata ("sempre"), che su mobile usa lo stesso codice GSM standard
 * per tutti gli operatori italiani e su fisso lo stesso codice *21 con piccole
 * differenze per gestore. Per questo la scelta è cellulare/fisso, non per
 * operatore. La CTA "Attiva segretaria" si sblocca dopo la scelta della linea
 * + numero handoff compilato, così la guida viene letta davvero.
 */

type LineType = "mobile" | "fisso";

/** Codice deviazione in stile chip monospace (selezionabile con un click). */
function Chip({ children, inline }: { children: React.ReactNode; inline?: boolean }) {
  return (
    <span
      className={cn(
        "select-all rounded-lg border border-[#e2e2e2] bg-white font-mono text-[13px] font-semibold text-[#222222]",
        inline ? "px-1.5 py-0.5" : "inline-flex items-center px-3 py-1.5",
      )}
    >
      {children}
    </span>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3.5 mt-8 text-[17px] font-bold tracking-[-0.2px] text-[#222222]">{children}</div>
  );
}

/** SVG mela/robottino (lucide non ha i brand logo). */
function AppleLogo() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}
function AndroidLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24a11.46 11.46 0 0 0-8.94 0L5.65 5.67c-.19-.29-.58-.38-.87-.2-.28.18-.37.54-.22.83L6.4 9.48A10.81 10.81 0 0 0 1 18h22a10.81 10.81 0 0 0-5.4-8.52zM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z" />
    </svg>
  );
}

export function VoiceLineTutorialModal({
  open,
  onClose,
  phoneNumber,
  initialHandoff,
  activating,
  onActivate,
}: {
  open: boolean;
  onClose: () => void;
  /** Numero della segretaria formattato (es. "+39 0542 371032"). */
  phoneNumber: string;
  initialHandoff: string;
  activating: boolean;
  /** Attiva davvero la linea; risolve true se è andata a buon fine. */
  onActivate: (handoffPhone: string) => Promise<boolean>;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "";

  const num = phoneNumber.replace(/\s/g, "");

  const [lineType, setLineType] = React.useState<LineType | null>(null);
  const [handoff, setHandoff] = React.useState(initialHandoff);
  const [helpOpen, setHelpOpen] = React.useState(false);

  // Riparti pulito a ogni apertura (e riallinea l'handoff ai settings).
  React.useEffect(() => {
    if (open) {
      setLineType(null);
      setHandoff(initialHandoff);
      setHelpOpen(false);
    }
  }, [open, initialHandoff]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (helpOpen) setHelpOpen(false);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, helpOpen, onClose]);

  const ready = lineType !== null && handoff.trim().length > 0;

  const handleActivate = async () => {
    if (!ready || activating) return;
    const ok = await onActivate(handoff.trim());
    if (ok) onClose();
  };

  const pillBase =
    "cursor-pointer select-none rounded-[12px] border-[1.5px] bg-white transition-all";
  const pillState = (active: boolean) =>
    active ? "border-navy-900" : "border-[#e0e0e0] hover:border-[#bdbdbd]";

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="voice-tutorial-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4 sm:p-10"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 4 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="flex h-[88vh] w-[720px] max-w-[92vw] flex-col overflow-hidden rounded-[14px] bg-white shadow-[0_12px_48px_rgba(0,0,0,0.3)]"
            onClick={(e) => e.stopPropagation()}
            data-testid="voice-tutorial-modal"
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-[#ebebeb] px-[22px] py-4">
              <div className="text-base font-bold tracking-[-0.2px] text-[#222222]">
                Collega il numero della segretaria
              </div>
              <div className="flex shrink-0 items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setHelpOpen(true)}
                  className="flex h-8 cursor-pointer items-center gap-1.5 rounded-2xl border-[1.5px] border-[#e0e0e0] bg-white px-3.5 text-[13px] font-semibold text-[#333333] transition-colors hover:border-[#bdbdbd] hover:bg-[#fafafa]"
                >
                  <HelpCircle className="size-3.5" strokeWidth={1.8} />
                  Aiuto
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Chiudi"
                  className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-[#f7f7f7] transition-colors hover:bg-[#f0f0f0]"
                >
                  <X className="size-3.5 text-[#6a6a6a]" strokeWidth={1.8} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-y-auto px-[30px] pb-9 pt-[26px]">
              <div className="text-[14.5px] font-medium leading-[1.65] text-[#444444]">
                Per far arrivare le chiamate alla segretaria AI, devi impostare la{" "}
                <b className="font-bold text-[#222222]">deviazione di chiamata</b> dal tuo numero
                aziendale verso il numero della segretaria:{" "}
                <b className="font-bold text-[#222222]">{phoneNumber}</b>
              </div>

              {/* ── Imposta la deviazione ── */}
              <SectionHeading>Imposta la deviazione</SectionHeading>
              <div className="mb-3.5 text-sm font-medium text-[#6a6a6a]">
                Su che tipo di linea ricevi oggi le chiamate? Il codice è lo stesso per tutti gli
                operatori, cambia solo tra cellulare e fisso.
              </div>
              <div className="mb-3.5 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => setLineType("mobile")}
                  className={cn(pillBase, pillState(lineType === "mobile"), "flex min-w-[200px] flex-1 items-center gap-3 px-4 py-3.5 text-left")}
                >
                  <Smartphone
                    className={cn("size-5 shrink-0", lineType === "mobile" ? "text-navy-900" : "text-[#555555]")}
                    strokeWidth={1.8}
                  />
                  <div>
                    <div className="text-[14.5px] font-bold text-[#222222]">Cellulare</div>
                    <div className="mt-0.5 text-[12.5px] font-medium text-[#8a8a8a]">
                      TIM, Vodafone, WindTre, Iliad…
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setLineType("fisso")}
                  className={cn(pillBase, pillState(lineType === "fisso"), "flex min-w-[200px] flex-1 items-center gap-3 px-4 py-3.5 text-left")}
                >
                  <Phone
                    className={cn("size-5 shrink-0", lineType === "fisso" ? "text-navy-900" : "text-[#555555]")}
                    strokeWidth={1.8}
                  />
                  <div>
                    <div className="text-[14.5px] font-bold text-[#222222]">Telefono fisso</div>
                    <div className="mt-0.5 text-[12.5px] font-medium text-[#8a8a8a]">
                      Numero di ufficio o centralino
                    </div>
                  </div>
                </button>
              </div>

              {lineType === null ? (
                <div className="rounded-[14px] border-[1.5px] border-dashed border-[#e2e2e2] p-[22px] text-center text-[13px] font-medium text-[#b0b0b0]">
                  Scegli il tipo di linea qui sopra
                </div>
              ) : lineType === "mobile" ? (
                <div className="rounded-[14px] border border-[#ededed] bg-[#f9f9fb] px-[22px] py-5">
                  <div className="mb-3.5 text-sm font-medium leading-[1.55] text-[#444444]">
                    Digita questo codice dal cellulare aziendale e premi invio: tutte le chiamate
                    andranno alla segretaria AI e il telefono non squillerà più.
                  </div>
                  <Chip>{`**21*${num}#`}</Chip>
                  <div className="mt-3 text-[12.5px] font-medium text-[#8a8a8a]">
                    Per disattivare: <Chip inline>##21#</Chip> &middot; Per verificare:{" "}
                    <Chip inline>*#21#</Chip>
                  </div>
                  <div className="mt-3.5 text-[12.5px] font-medium leading-[1.55] text-[#8a8a8a]">
                    È un codice GSM standard: vale per <b className="font-bold text-[#555555]">tutti gli
                    operatori</b> (TIM, Vodafone, WindTre, Iliad e virtuali), senza attivazioni. Il
                    traffico deviato segue la tua tariffa: con minuti illimitati non costa nulla (su
                    Iliad ~0,05€/min).
                  </div>
                  <div className="mb-3 mt-4 h-px bg-[#ececec]" />
                  <div className="mb-2.5 text-[13.5px] font-semibold text-[#222222]">
                    In alternativa, dalle impostazioni del telefono
                  </div>
                  <div className="mb-2 flex items-start gap-2.5 text-[13.5px] font-medium leading-[1.7] text-[#555555]">
                    <span className="mt-1 shrink-0 text-[#333333]"><AppleLogo /></span>
                    <span>
                      <b className="font-bold text-[#222222]">iPhone:</b> Impostazioni &rarr; Telefono
                      &rarr; Inoltro chiamate &rarr; attiva e inserisci <Chip inline>{num}</Chip>
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5 text-[13.5px] font-medium leading-[1.7] text-[#555555]">
                    <span className="mt-1 shrink-0 text-[#333333]"><AndroidLogo /></span>
                    <span>
                      <b className="font-bold text-[#222222]">Android:</b> App Telefono &rarr; Menu
                      (&#8942;) &rarr; Impostazioni &rarr; Deviazione chiamate &rarr; scegli
                      &ldquo;Devia sempre&rdquo; &rarr; inserisci <Chip inline>{num}</Chip>
                    </span>
                  </div>
                </div>
              ) : (
                <div className="rounded-[14px] border border-[#ededed] bg-[#f9f9fb] px-[22px] py-5">
                  <div className="mb-3.5 text-sm font-medium leading-[1.55] text-[#444444]">
                    Digita questo codice dal telefono fisso: tutte le chiamate andranno alla
                    segretaria AI e il telefono non squillerà più.
                  </div>
                  <Chip>{`*21*${num}#`}</Chip>
                  <div className="mt-3 text-[12.5px] font-medium text-[#8a8a8a]">
                    Per disattivare: <Chip inline>#21#</Chip> (su Vodafone e WindTre{" "}
                    <Chip inline>##21#</Chip>) &middot; Per verificare: <Chip inline>*#21#</Chip>
                  </div>
                  <div className="mb-3 mt-4 h-px bg-[#ececec]" />
                  <div className="mb-2.5 text-[13.5px] font-semibold text-[#222222]">
                    Differenze per gestore
                  </div>
                  <ul className="m-0 list-disc space-y-1.5 pl-5 text-[12.5px] font-medium leading-[1.55] text-[#8a8a8a]">
                    <li>
                      <b className="font-bold text-[#555555]">TIM:</b> incluso su fibra/ISDN; sulle
                      linee tradizionali (RTG/ADSL) va attivato chiamando il 187 (privati) o 191
                      (business), ~3€/mese.
                    </li>
                    <li>
                      <b className="font-bold text-[#555555]">Vodafone:</b> gestibile anche dal
                      pannello o dall&rsquo;app della Vodafone Station.
                    </li>
                    <li>
                      <b className="font-bold text-[#555555]">WindTre:</b> servizio &ldquo;In
                      Trasferta&rdquo;, gratuito sulle offerte fibra.
                    </li>
                    <li>
                      <b className="font-bold text-[#555555]">Fastweb:</b> gestibile anche da
                      MyFastweb o dal pannello Fritz!Box; ~0,05€/chiamata deviata.
                    </li>
                  </ul>
                </div>
              )}

              <div className="mt-3.5 rounded-xl border border-[#e6e8f0] bg-[#f6f7fb] px-4 py-3.5">
                <div className="mb-1 text-[13px] font-bold text-[#222222]">Attenzione al loop</div>
                <div className="text-[13px] font-medium leading-[1.6] text-[#5a5a5a] [text-wrap:pretty]">
                  Con la deviazione attiva il telefono deviato non squilla mai. Se attivi il
                  trasferimento a segreteria durante la chiamata, il numero di trasferimento deve
                  essere diverso dal numero deviato (es. il tuo cellulare personale), altrimenti si
                  crea un loop.
                </div>
              </div>

              {/* ── Consigli ── */}
              <SectionHeading>Consigli utili</SectionHeading>
              <ul className="m-0 list-disc pl-5">
                {[
                  ["Testa subito:", "dopo aver attivato la deviazione, chiama il tuo numero da un altro telefono per verificare che risponda la segretaria AI."],
                  ["Disattiva la segreteria telefonica", "del tuo operatore prima di impostare la deviazione, altrimenti potrebbe intercettare le chiamate prima del trasferimento."],
                  ["Centralino (PBX):", "se la tua autoscuola usa un centralino, la deviazione va configurata direttamente sul centralino dal tecnico."],
                ].map(([bold, rest]) => (
                  <li key={bold} className="mb-3 pl-0.5 text-sm font-medium leading-[1.6] text-[#555555]">
                    <b className="font-bold text-[#222222]">{bold}</b> {rest}
                  </li>
                ))}
                <li className="mb-3 pl-0.5 text-sm font-medium leading-[1.6] text-[#555555]">
                  <b className="font-bold text-[#222222]">Per annullare tutto:</b> digita{" "}
                  <Chip inline>##002#</Chip> dal cellulare per rimuovere tutte le deviazioni attive.
                </li>
              </ul>

              {/* ── Footer: handoff + attiva ── */}
              <div className="mt-7 border-t border-[#ededed] pt-6">
                <div className="mb-1.5 text-sm font-semibold text-[#222222]">
                  Numero per il trasferimento (handoff)
                </div>
                <div className="mb-2.5 text-[13px] font-medium leading-[1.5] text-[#929292]">
                  Il numero a cui la segretaria trasferisce le chiamate fuori orario o quando serve una
                  persona. Usa un numero diverso da quello deviato.
                </div>
                <input
                  type="tel"
                  value={handoff}
                  onChange={(e) => setHandoff(e.target.value)}
                  placeholder="+39..."
                  className="w-full max-w-[340px] rounded-[10px] border-[1.5px] border-[#dddddd] bg-white px-3.5 py-2.5 text-sm font-semibold text-[#222222] outline-none transition focus:border-navy-900"
                />
                <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
                  <div className="max-w-[360px] text-[13.5px] font-medium leading-[1.5] text-[#6a6a6a]">
                    Hai impostato la deviazione sul tuo telefono? Attiva la segretaria per iniziare a
                    ricevere le chiamate.
                  </div>
                  <button
                    type="button"
                    onClick={handleActivate}
                    disabled={!ready || activating}
                    className={cn(
                      "inline-flex items-center justify-center gap-2 rounded-[10px] px-7 py-3 text-[15px] font-bold transition-colors",
                      ready
                        ? "cursor-pointer bg-navy-900 text-white hover:bg-navy-800"
                        : "cursor-not-allowed bg-[#e6e6e6] text-[#a8a8a8]",
                    )}
                  >
                    {activating && <Loader2 className="size-4 animate-spin" />}
                    Attiva segretaria
                  </button>
                </div>
              </div>
            </div>

            {/* ── Sub-modal: Aiuto ── */}
            <AnimatePresence>
              {helpOpen && (
                <motion.div
                  key="voice-tutorial-help"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 p-8"
                  onClick={() => setHelpOpen(false)}
                >
                  <div
                    className="relative w-[420px] max-w-[92%] rounded-[20px] bg-white px-8 pb-[30px] pt-9 text-center shadow-[0_16px_56px_rgba(0,0,0,0.28)]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => setHelpOpen(false)}
                      aria-label="Chiudi"
                      className="absolute right-[18px] top-[18px] flex size-8 cursor-pointer items-center justify-center rounded-full bg-[#f7f7f7] transition-colors hover:bg-[#f0f0f0]"
                    >
                      <X className="size-3.5 text-[#6a6a6a]" strokeWidth={1.8} />
                    </button>
                    <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-[#eef0f6]">
                      <HelpCircle className="size-7 text-navy-900" strokeWidth={1.6} />
                    </div>
                    <div className="mb-1.5 text-xl font-bold text-[#222222]">Hai problemi a collegarla?</div>
                    <div className="mx-auto mb-[22px] max-w-[340px] text-sm font-medium leading-[1.5] text-[#6a6a6a] [text-wrap:pretty]">
                      Scrivici dal centro assistenza: un membro del supporto operativo ti aiuterà passo
                      passo a impostare la deviazione.
                    </div>
                    <button
                      type="button"
                      onClick={() => router.push(`${pathname}/assistenza`)}
                      className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-navy-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-navy-800"
                    >
                      Contatta il supporto
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
