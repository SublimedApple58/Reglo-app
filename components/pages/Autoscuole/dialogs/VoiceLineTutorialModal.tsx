"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useRouter, usePathname } from "next/navigation";
import { ChevronDown, HelpCircle, Loader2, Smartphone, Phone, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Tutorial "Collega il numero della segretaria", versione minimal: deviazione
 * incondizionata ("sempre"), unica scelta cellulare/fisso (i codici GSM sono
 * identici tra gli operatori italiani: **21 su mobile, *21 su fisso), dettagli
 * secondari dietro righe espandibili. CTA sbloccata da tipo linea + handoff.
 */

type LineType = "mobile" | "fisso";

/** Codice deviazione in stile chip monospace (selezionabile con un click). */
function Chip({ children, inline, big }: { children: React.ReactNode; inline?: boolean; big?: boolean }) {
  return (
    <span
      className={cn(
        "select-all rounded-lg border border-[#e2e2e2] bg-white font-mono font-semibold text-[#222222]",
        big
          ? "inline-flex items-center rounded-[10px] px-4 py-2.5 text-[16px] tracking-[0.3px]"
          : inline
            ? "px-1.5 py-0.5 text-[13px]"
            : "inline-flex items-center px-3 py-1.5 text-[13px]",
      )}
    >
      {children}
    </span>
  );
}

/** Riga espandibile minimal per i dettagli secondari. */
function Disclosure({ title, children }: { title: string; children: React.ReactNode }) {
  const [openState, setOpenState] = React.useState(false);
  return (
    <div className="border-b border-[#f0f0f0]">
      <button
        type="button"
        onClick={() => setOpenState((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between gap-3 py-3.5 text-left"
      >
        <span className="text-sm font-semibold text-[#222222]">{title}</span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-[#929292] transition-transform duration-200",
            openState && "rotate-180",
          )}
          strokeWidth={1.8}
        />
      </button>
      <AnimatePresence initial={false}>
        {openState && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0, overflow: "hidden" }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0, overflow: "hidden" }}
            transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <div className="pb-4 text-[13px] font-medium leading-[1.65] text-[#6a6a6a]">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** SVG mela/robottino (lucide non ha i brand logo). */
function AppleLogo() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}
function AndroidLogo() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
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
  // Dal fisso il "+" non si può digitare: formato nazionale (i numeri geografici
  // italiani mantengono lo 0 anche col prefisso internazionale).
  const numFisso = num.replace(/^\+39/, "");

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
            className="flex max-h-[88vh] w-[620px] max-w-[92vw] flex-col overflow-hidden rounded-[18px] bg-white shadow-[0_12px_48px_rgba(0,0,0,0.3)]"
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
            <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-7 pt-6">
              <div className="text-sm font-medium leading-[1.6] text-[#6a6a6a]">
                Devia le chiamate del tuo numero aziendale verso la segretaria:{" "}
                <b className="font-semibold text-[#222222]">{phoneNumber}</b>. Il codice è lo stesso
                per tutti gli operatori.
              </div>

              {/* ── Tipo di linea ── */}
              <div className="mt-5 flex gap-2.5">
                {(
                  [
                    { key: "mobile" as const, icon: Smartphone, label: "Cellulare" },
                    { key: "fisso" as const, icon: Phone, label: "Telefono fisso" },
                  ]
                ).map(({ key, icon: Icon, label }) => {
                  const active = lineType === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setLineType(key)}
                      className={cn(
                        "flex flex-1 cursor-pointer select-none items-center justify-center gap-2 rounded-xl border-[1.5px] bg-white px-4 py-3 text-sm font-semibold transition-all",
                        active
                          ? "border-navy-900 text-navy-900"
                          : "border-[#e0e0e0] text-[#333333] hover:border-[#bdbdbd]",
                      )}
                    >
                      <Icon className="size-[18px]" strokeWidth={1.8} />
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* ── Codice ── */}
              <AnimatePresence initial={false} mode="wait">
                {lineType !== null && (
                  <motion.div
                    key={lineType}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -2 }}
                    transition={{ duration: 0.15 }}
                  >
                    <div className="mt-5 rounded-[14px] bg-[#f8f8f8] px-5 py-[18px] text-center">
                      <div className="mb-3 text-[13px] font-medium text-[#6a6a6a]">
                        Digita dal telefono {lineType === "mobile" ? "aziendale" : "fisso"} e premi
                        invio: il telefono non squillerà più, risponde la segretaria.
                      </div>
                      <Chip big>{lineType === "mobile" ? `**21*${num}#` : `*21*${numFisso}#`}</Chip>
                      <div className="mt-3 text-xs font-medium text-[#929292]">
                        Disattiva: <Chip inline>{lineType === "mobile" ? "##21#" : "#21#"}</Chip>{" "}
                        &middot; Verifica: <Chip inline>*#21#</Chip>
                      </div>
                    </div>

                    <div className="mt-4">
                      {lineType === "mobile" ? (
                        <>
                          <Disclosure title="Dalle impostazioni del telefono">
                            <div className="mb-2 flex items-start gap-2">
                              <span className="mt-[3px] shrink-0 text-[#333333]"><AppleLogo /></span>
                              <span>
                                <b className="font-semibold text-[#444444]">iPhone:</b> Impostazioni
                                &rarr; Telefono &rarr; Inoltro chiamate &rarr; inserisci{" "}
                                <Chip inline>{num}</Chip>
                              </span>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className="mt-[3px] shrink-0 text-[#333333]"><AndroidLogo /></span>
                              <span>
                                <b className="font-semibold text-[#444444]">Android:</b> App Telefono
                                &rarr; Impostazioni &rarr; Deviazione chiamate &rarr; &ldquo;Devia
                                sempre&rdquo; &rarr; inserisci <Chip inline>{num}</Chip>
                              </span>
                            </div>
                          </Disclosure>
                          <Disclosure title="Costi">
                            Il traffico deviato segue la tua tariffa: con minuti illimitati non costa
                            nulla. Su Iliad ~0,05€/min.
                          </Disclosure>
                        </>
                      ) : (
                        <Disclosure title="Differenze per gestore">
                          <b className="font-semibold text-[#444444]">TIM:</b> incluso su fibra/ISDN;
                          sulle linee tradizionali va attivato al 187 (~3€/mese).{" "}
                          <b className="font-semibold text-[#444444]">Vodafone:</b> gestibile anche
                          dalla Vodafone Station, disattiva con <Chip inline>##21#</Chip>.{" "}
                          <b className="font-semibold text-[#444444]">WindTre:</b> servizio &ldquo;In
                          Trasferta&rdquo;, gratuito su fibra, disattiva con <Chip inline>##21#</Chip>.{" "}
                          <b className="font-semibold text-[#444444]">Fastweb:</b> gestibile anche da
                          MyFastweb o Fritz!Box, ~0,05€/chiamata.
                        </Disclosure>
                      )}
                      <Disclosure title="Consigli utili">
                        <ul className="m-0 list-disc space-y-1.5 pl-4">
                          <li>
                            <b className="font-semibold text-[#444444]">Testa subito:</b> chiama il tuo
                            numero da un altro telefono e verifica che risponda la segretaria.
                          </li>
                          <li>
                            <b className="font-semibold text-[#444444]">Segreteria telefonica:</b>{" "}
                            disattivala prima, o intercetterà le chiamate.
                          </li>
                          <li>
                            <b className="font-semibold text-[#444444]">Centralino (PBX):</b> la
                            deviazione va configurata sul centralino dal tecnico.
                          </li>
                          <li>
                            <b className="font-semibold text-[#444444]">Per annullare tutto:</b> digita{" "}
                            <Chip inline>##002#</Chip> dal cellulare.
                          </li>
                        </ul>
                      </Disclosure>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Handoff + attiva ── */}
              <div className="mt-6">
                <div className="mb-1 text-sm font-semibold text-[#222222]">
                  Numero per il trasferimento
                </div>
                <div className="mb-2.5 text-[13px] font-medium leading-[1.5] text-[#929292]">
                  Dove trasferiamo le chiamate quando serve una persona. Usa un numero diverso da
                  quello deviato, altrimenti si crea un loop.
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="tel"
                    value={handoff}
                    onChange={(e) => setHandoff(e.target.value)}
                    placeholder="+39..."
                    className="min-w-0 flex-1 rounded-[10px] border-[1.5px] border-[#dddddd] bg-white px-3.5 py-2.5 text-sm font-semibold text-[#222222] outline-none transition focus:border-navy-900"
                  />
                  <button
                    type="button"
                    onClick={handleActivate}
                    disabled={!ready || activating}
                    className={cn(
                      "inline-flex shrink-0 items-center justify-center gap-2 rounded-[10px] px-6 py-2.5 text-sm font-bold transition-colors",
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
