"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useRouter, usePathname } from "next/navigation";
import { HelpCircle, Loader2, Plus, X } from "lucide-react";

import { sendSupportMessage } from "@/lib/actions/support.actions";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { cn } from "@/lib/utils";

/**
 * Tutorial "Collega il numero della segretaria" (proto): modal 720px con
 * selettore modalità di deviazione, selettore operatore, selettore dispositivo
 * e CTA finale "Attiva segretaria" che si sblocca solo dopo le tre scelte
 * (+ numero handoff compilato). Le scelte servono a far leggere davvero la
 * guida prima di attivare la linea.
 */

type DeviationMode = "sempre" | "mancata";
type Device = "iphone" | "android";

type OperatorVariant = {
  tag: string;
  always: string;
  offAlways: string;
  noAnswer: string;
  offNoAnswer: string;
};

type Operator = {
  name: string;
  variants: OperatorVariant[];
  note: React.ReactNode;
};

// Timer GSM: la stringa completa è **61*numero**secondi# — il doppio asterisco
// prima dei secondi è obbligatorio (con uno solo la rete legge un altro campo).
const RING_OPTIONS = [
  ["**5#", "~1 squillo"],
  ["**10#", "~2 squilli"],
  ["**15#", "~3 squilli"],
  ["**20#", "~4 squilli"],
  ["**25#", "~5 squilli"],
  ["**30#", "~6 squilli"],
] as const;

function buildOperators(num: string): Operator[] {
  return [
    {
      name: "TIM",
      variants: [
        { tag: "Mobile", always: `**21*${num}#`, offAlways: "##21#", noAnswer: `**61*${num}**5#`, offNoAnswer: "##61#" },
        { tag: "Fisso", always: `*21*${num}#`, offAlways: "#21#", noAnswer: `*61*${num}#`, offNoAnswer: "#61#" },
      ],
      note: "Su mobile funziona subito, nessuna attivazione. Su fisso è incluso su fibra/ISDN, mentre sulle linee tradizionali (RTG/ADSL) va attivato chiamando il 187 (privati) o 191 (business), ~3€/mese. Su fisso il tempo di squillo non è configurabile da codice, contatta il 187.",
    },
    {
      name: "Vodafone",
      variants: [
        { tag: "Mobile e fisso", always: `**21*${num}#`, offAlways: "##21#", noAnswer: `**61*${num}**5#`, offNoAnswer: "##61#" },
      ],
      note: "Su fisso puoi gestire la deviazione anche dal pannello Vodafone Station.",
    },
    {
      name: "WindTre",
      variants: [
        { tag: "Mobile", always: `**21*${num}#`, offAlways: "##21#", noAnswer: `**61*${num}**5#`, offNoAnswer: "##61#" },
      ],
      note: "Codici GSM standard, funzionano subito senza attivazione.",
    },
    {
      name: "Fastweb",
      variants: [
        { tag: "Fisso", always: `*21*${num}#`, offAlways: "#21#", noAnswer: `*23*${num}#`, offNoAnswer: "#23#" },
      ],
      note: "Su fisso Fastweb la deviazione su mancata risposta usa il codice *23 (non *61). Gestibile anche dal portale MyFastweb e dal pannello Fritz!Box (regole avanzate per numero chiamante). Costo ~0,05€/chiamata deviata.",
    },
    {
      name: "Iliad",
      variants: [
        { tag: "Mobile", always: `**21*${num}#`, offAlways: "##21#", noAnswer: `**61*${num}**5#`, offNoAnswer: "##61#" },
      ],
      note: "Richiede il prefisso +39. Costo ~0,05€/min per le chiamate deviate.",
    },
  ];
}

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

function CodeRow({ label, code }: { label: string; code: string }) {
  return (
    <div className="mb-1.5 flex items-center gap-2.5">
      <span className="min-w-[70px] shrink-0 text-[13px] font-medium text-[#6a6a6a]">{label}</span>
      <Chip>{code}</Chip>
    </div>
  );
}

function DeviationBlock({ title, activate, deactivate }: { title: string; activate: string; deactivate: string }) {
  return (
    <div className="mb-3.5">
      <div className="mb-2 text-[13.5px] font-semibold text-[#222222]">{title}</div>
      <CodeRow label="Attiva:" code={activate} />
      <CodeRow label="Disattiva:" code={deactivate} />
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3.5 mt-8 text-[17px] font-bold tracking-[-0.2px] text-[#222222]">{children}</div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[14px] border-[1.5px] border-dashed border-[#e2e2e2] p-[22px] text-center text-[13px] font-medium text-[#b0b0b0]">
      {children}
    </div>
  );
}

/** SVG mela/robottino (lucide non ha i brand logo). */
function AppleLogo() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}
function AndroidLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
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
  const toast = useFeedbackToast();
  const router = useRouter();
  const pathname = usePathname() ?? "";

  const num = phoneNumber.replace(/\s/g, "");
  const operators = React.useMemo(() => buildOperators(num), [num]);

  const [mode, setMode] = React.useState<DeviationMode | null>(null);
  const [opIndex, setOpIndex] = React.useState<number | null>(null);
  const [device, setDevice] = React.useState<Device | null>(null);
  const [handoff, setHandoff] = React.useState(initialHandoff);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [altroOpen, setAltroOpen] = React.useState(false);
  const [altroText, setAltroText] = React.useState("");
  const [altroSending, setAltroSending] = React.useState(false);
  const [altroSent, setAltroSent] = React.useState(false);

  // Riparti pulito a ogni apertura (e riallinea l'handoff ai settings).
  React.useEffect(() => {
    if (open) {
      setMode(null);
      setOpIndex(null);
      setDevice(null);
      setHandoff(initialHandoff);
      setHelpOpen(false);
      setAltroOpen(false);
      setAltroText("");
      setAltroSent(false);
    }
  }, [open, initialHandoff]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (altroOpen) setAltroOpen(false);
      else if (helpOpen) setHelpOpen(false);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, helpOpen, altroOpen, onClose]);

  const ready = mode !== null && opIndex !== null && device !== null && handoff.trim().length > 0;

  const handleActivate = async () => {
    if (!ready || activating) return;
    const ok = await onActivate(handoff.trim());
    if (ok) onClose();
  };

  const handleAltroSend = async () => {
    const text = altroText.trim();
    if (!text || altroSending) return;
    setAltroSending(true);
    const res = await sendSupportMessage({
      body: `Segnalazione dalla guida di attivazione della segretaria AI: il mio operatore telefonico non è tra quelli elencati. Operatore: ${text}`,
    });
    setAltroSending(false);
    if (!res.success) {
      toast.error({ description: res.message ?? "Impossibile inviare la segnalazione." });
      return;
    }
    setAltroSent(true);
    setTimeout(() => setAltroOpen(false), 1600);
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

              {/* ── Metodo rapido ── */}
              <SectionHeading>Metodo rapido</SectionHeading>
              <div className="mb-3.5 text-sm font-medium text-[#6a6a6a]">
                Scegli la modalità di deviazione in base alle tue esigenze:
              </div>
              <div className="mb-4 rounded-xl border border-[#e6e8f0] bg-[#f6f7fb] px-4 py-3.5">
                <div className="mb-1 text-[13px] font-bold text-[#222222]">Quale modalità scegliere?</div>
                <div className="text-[13px] font-medium leading-[1.6] text-[#5a5a5a] [text-wrap:pretty]">
                  Con la deviazione &ldquo;sempre&rdquo; il telefono non squilla mai e tutte le chiamate
                  vanno all&rsquo;AI. Se hai attivato il trasferimento a segreteria durante la chiamata,
                  il numero di trasferimento deve essere diverso dal numero deviato (es. il tuo cellulare
                  personale), altrimenti si crea un loop. Con la deviazione &ldquo;su mancata
                  risposta&rdquo; il telefono squilla brevemente per ogni chiamata (~5 sec), ma la
                  segretaria AI può ritrasferire allo stesso numero senza problemi.
                </div>
              </div>
              <div className="mb-3.5 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => setMode("sempre")}
                  className={cn(pillBase, pillState(mode === "sempre"), "min-w-[200px] flex-1 px-4 py-3.5 text-left")}
                >
                  <div className="text-[14.5px] font-bold text-[#222222]">Deviazione sempre</div>
                  <div className="mt-0.5 text-[12.5px] font-medium text-[#8a8a8a]">
                    Consigliata · il telefono non squilla mai
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setMode("mancata")}
                  className={cn(pillBase, pillState(mode === "mancata"), "min-w-[200px] flex-1 px-4 py-3.5 text-left")}
                >
                  <div className="text-[14.5px] font-bold text-[#222222]">Su mancata risposta</div>
                  <div className="mt-0.5 text-[12.5px] font-medium text-[#8a8a8a]">
                    Squilla prima, poi passa all&rsquo;AI
                  </div>
                </button>
              </div>
              {mode === null ? (
                <EmptyHint>Scegli una modalità qui sopra</EmptyHint>
              ) : mode === "sempre" ? (
                <div className="rounded-[14px] border border-[#ededed] bg-[#f9f9fb] px-[22px] py-5">
                  <div className="mb-3.5 text-sm font-medium leading-[1.55] text-[#444444]">
                    Tutte le chiamate vanno alla segretaria AI. Il telefono non squilla mai.
                  </div>
                  <Chip>{`**21*${num}#`}</Chip>
                  <div className="mt-3 text-[12.5px] font-medium text-[#8a8a8a]">
                    Per disattivare: <Chip inline>##21#</Chip>
                  </div>
                </div>
              ) : (
                <div className="rounded-[14px] border border-[#ededed] bg-[#f9f9fb] px-[22px] py-5">
                  <div className="mb-3.5 text-sm font-medium leading-[1.55] text-[#444444]">
                    Il telefono squilla per il tempo scelto. Se non rispondi, parte la segretaria AI.
                  </div>
                  <Chip>{`**61*${num}**5#`}</Chip>
                  <div className="mt-3 text-[12.5px] font-medium text-[#8a8a8a]">
                    Per disattivare: <Chip inline>##61#</Chip>
                  </div>
                  <div className="mt-5 text-[13.5px] font-semibold text-[#222222]">
                    Quanto tempo impostare?
                  </div>
                  <div className="mt-1.5 text-[13px] font-medium leading-[1.55] text-[#6a6a6a]">
                    La parte finale del codice (dopo il doppio asterisco) indica i secondi di squillo
                    prima che parta l&rsquo;AI. Valori possibili: 5, 10, 15, 20, 25, 30.
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {RING_OPTIONS.map(([code, rings]) => (
                      <div key={code} className="rounded-[10px] border border-[#e6e6e6] bg-white p-3 text-center">
                        <div className="font-mono text-sm font-bold text-[#222222]">{code}</div>
                        <div className="mt-0.5 text-xs font-medium text-[#929292]">{rings}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3.5 text-[12.5px] font-medium leading-[1.55] text-[#8a8a8a]">
                    <b className="font-bold text-[#555555]">Consiglio:</b> usa{" "}
                    <b className="font-bold text-[#222222]">5 secondi</b> se vuoi che l&rsquo;AI risponda
                    quasi subito con il minimo disturbo. Usa{" "}
                    <b className="font-bold text-[#222222]">15-20 secondi</b> se vuoi avere il tempo di
                    rispondere di persona quando sei in ufficio e far intervenire l&rsquo;AI solo quando
                    non ci sei.
                  </div>
                  <div className="mt-2.5 text-[12.5px] font-medium leading-[1.55] text-[#8a8a8a]">
                    <b className="font-bold text-[#555555]">Linea fissa:</b> su alcune linee fisse
                    tradizionali il servizio va prima attivato dall&rsquo;operatore e i codici possono
                    differire — controlla le istruzioni per operatore qui sotto.
                  </div>
                </div>
              )}

              {/* ── Operatore ── */}
              <SectionHeading>Istruzioni per operatore</SectionHeading>
              <div className="mb-3.5 text-sm font-medium text-[#6a6a6a]">
                Seleziona il tuo operatore telefonico per vedere i codici giusti:
              </div>
              <div className="mb-3.5 flex flex-wrap gap-2">
                {operators.map((op, i) => (
                  <button
                    key={op.name}
                    type="button"
                    onClick={() => setOpIndex(i)}
                    className={cn(
                      "flex h-[42px] min-w-[74px] cursor-pointer select-none items-center justify-center rounded-[10px] border-[1.5px] bg-white px-[18px] text-[14.5px] font-bold transition-all",
                      opIndex === i
                        ? "border-navy-900 text-navy-900"
                        : "border-[#e0e0e0] text-[#333333] hover:border-[#bdbdbd]",
                    )}
                  >
                    {op.name}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => { setAltroSent(false); setAltroText(""); setAltroOpen(true); }}
                  className="flex h-[42px] cursor-pointer select-none items-center gap-1.5 rounded-[10px] border-[1.5px] border-dashed border-[#d5d5d5] bg-white px-4 text-sm font-semibold text-[#8a8a8a] transition-all hover:border-[#bdbdbd] hover:bg-[#fafafa]"
                >
                  <Plus className="size-3.5" strokeWidth={2} />
                  Altro
                </button>
              </div>
              {opIndex === null ? (
                <EmptyHint>Scegli un operatore qui sopra</EmptyHint>
              ) : (
                <div className="rounded-[14px] border border-[#ededed] bg-[#f9f9fb] px-5 py-[18px]">
                  {operators[opIndex].variants.map((variant, vi) => (
                    <React.Fragment key={variant.tag}>
                      {vi > 0 && <div className="mb-4 mt-1.5 h-px bg-[#ececec]" />}
                      {operators[opIndex].variants.length > 1 && (
                        <div className="mb-2.5 text-xs font-semibold uppercase tracking-[0.6px] text-[#8a8a8a]">
                          {variant.tag}
                        </div>
                      )}
                      <DeviationBlock
                        title="Deviazione sempre (tutte le chiamate)"
                        activate={variant.always}
                        deactivate={variant.offAlways}
                      />
                      <DeviationBlock
                        title="Deviazione su mancata risposta (dopo ~5 sec)"
                        activate={variant.noAnswer}
                        deactivate={variant.offNoAnswer}
                      />
                    </React.Fragment>
                  ))}
                  <div className="mt-2 text-[12.5px] font-medium leading-[1.55] text-[#8a8a8a]">
                    {operators[opIndex].note}
                  </div>
                </div>
              )}

              {/* ── Dispositivo ── */}
              <SectionHeading>In alternativa: dalle impostazioni del telefono</SectionHeading>
              <div className="mb-3.5 text-sm font-medium text-[#6a6a6a]">Seleziona il tuo dispositivo:</div>
              <div className="mb-3.5 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setDevice("iphone")}
                  className={cn(
                    pillBase,
                    pillState(device === "iphone"),
                    "flex flex-1 items-center justify-center gap-2 p-3.5 text-[15px] font-semibold",
                    device === "iphone" ? "text-navy-900" : "text-[#333333]",
                  )}
                >
                  <AppleLogo />
                  iPhone
                </button>
                <button
                  type="button"
                  onClick={() => setDevice("android")}
                  className={cn(
                    pillBase,
                    pillState(device === "android"),
                    "flex flex-1 items-center justify-center gap-2 p-3.5 text-[15px] font-semibold",
                    device === "android" ? "text-navy-900" : "text-[#333333]",
                  )}
                >
                  <AndroidLogo />
                  Android
                </button>
              </div>
              {device === null ? (
                <EmptyHint>Scegli un dispositivo qui sopra</EmptyHint>
              ) : device === "iphone" ? (
                <div className="rounded-[14px] border border-[#ededed] bg-[#f9f9fb] px-5 py-[18px]">
                  <div className="mb-2 text-[13.5px] font-medium leading-[1.7] text-[#555555]">
                    <b className="font-bold text-[#222222]">Devia sempre:</b> Impostazioni &rarr; Telefono
                    &rarr; Inoltro chiamate &rarr; attiva e inserisci <Chip inline>{num}</Chip>
                  </div>
                  <div className="text-[13.5px] font-medium leading-[1.7] text-[#555555]">
                    <b className="font-bold text-[#222222]">Su mancata risposta:</b> non configurabile
                    dall&rsquo;interfaccia, usa il codice <Chip inline>{`**61*${num}**5#`}</Chip>
                  </div>
                </div>
              ) : (
                <div className="rounded-[14px] border border-[#ededed] bg-[#f9f9fb] px-5 py-[18px]">
                  <div className="text-[13.5px] font-medium leading-[1.7] text-[#555555]">
                    App Telefono &rarr; Menu (&#8942;) &rarr; Impostazioni &rarr; Deviazione chiamate
                    &rarr; scegli &ldquo;Devia sempre&rdquo; oppure &ldquo;Devia se non rispondo&rdquo;
                    &rarr; inserisci <Chip inline>{num}</Chip>
                  </div>
                </div>
              )}

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
                  persona. Con deviazione &ldquo;sempre&rdquo; usa un numero diverso da quello deviato.
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

            {/* ── Sub-modal: operatore non in lista ── */}
            <AnimatePresence>
              {altroOpen && (
                <motion.div
                  key="voice-tutorial-altro"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 p-8"
                  onClick={() => setAltroOpen(false)}
                >
                  <div
                    className="relative w-[440px] max-w-[92%] rounded-[20px] bg-white px-[30px] pb-[26px] pt-[30px] shadow-[0_16px_56px_rgba(0,0,0,0.28)]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => setAltroOpen(false)}
                      aria-label="Chiudi"
                      className="absolute right-[18px] top-[18px] flex size-8 cursor-pointer items-center justify-center rounded-full bg-[#f7f7f7] transition-colors hover:bg-[#f0f0f0]"
                    >
                      <X className="size-3.5 text-[#6a6a6a]" strokeWidth={1.8} />
                    </button>
                    {altroSent ? (
                      <div className="px-1 py-3.5 text-center">
                        <div className="mx-auto mb-3.5 flex size-16 items-center justify-center rounded-full bg-[#e7f6ec]">
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
                            <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#1a7f50" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                        <div className="mb-1.5 text-lg font-bold text-[#222222]">Grazie!</div>
                        <div className="text-sm font-medium leading-[1.5] text-[#6a6a6a]">
                          Abbiamo ricevuto la tua segnalazione, il team la valuterà a breve.
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="mb-1.5 text-[19px] font-bold tracking-[-0.2px] text-[#222222]">
                          Non trovi il tuo gestore?
                        </div>
                        <div className="mb-[18px] text-sm font-medium leading-[1.5] text-[#6a6a6a] [text-wrap:pretty]">
                          Comunicalo al nostro team di supporto: lo aggiungeremo il prima possibile.
                        </div>
                        <textarea
                          value={altroText}
                          onChange={(e) => setAltroText(e.target.value)}
                          placeholder="Scrivi qui il nome del tuo operatore telefonico…"
                          className="min-h-[80px] w-full resize-y rounded-[10px] border-[1.5px] border-[#e0e0e0] bg-white px-3.5 py-3 text-sm font-medium leading-[1.6] text-[#222222] outline-none transition focus:border-navy-900"
                        />
                        <div className="mt-[18px] flex justify-end">
                          <button
                            type="button"
                            onClick={handleAltroSend}
                            disabled={!altroText.trim() || altroSending}
                            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-navy-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {altroSending && <Loader2 className="size-4 animate-spin" />}
                            Invia
                          </button>
                        </div>
                      </>
                    )}
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
