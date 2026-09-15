"use client";

import React from "react";
import { getInstructorQrCard } from "@/lib/actions/instructor-qr.actions";
import { instructorLinkUrl } from "@/lib/autoscuole/instructor-initials";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { InstructorQrCardDialog } from "@/components/pages/Autoscuole/instructor-qr/InstructorQrCardDialog";

// REG-451 — scheda "Codice" del dettaglio istruttore (prototipo `QR Istruttore.html`),
// visibile solo con la gestione autonoma attiva: chiave dell'istruttore + Copia,
// riga "Card QR da stampare" + Utilizza (apre l'anteprima) e nota sullo scotch.

const AMAZON_POCKET_URL = "https://www.amazon.it/s?k=porta+tessera+adesivo+trasparente+cruscotto+auto";

type CardData = { code: string; instructorName: string; companyName: string };

export function CodiceTab({ instructorId }: { instructorId: string }) {
  const toast = useFeedbackToast();
  const [open, setOpen] = React.useState(false);
  const [card, setCard] = React.useState<CardData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [copied, setCopied] = React.useState(false);

  // La scheda esiste solo per gli istruttori in gestione autonoma: la chiave serve
  // subito (riga in alto), quindi la card si prepara all'apertura del tab.
  React.useEffect(() => {
    let active = true;
    setCard(null);
    setOpen(false);
    setCopied(false);
    setLoading(true);
    getInstructorQrCard({ instructorId }).then((res) => {
      if (!active) return;
      setLoading(false);
      if (res.success && res.data) setCard(res.data);
      else toast.error({ description: res.message ?? "Impossibile recuperare il codice." });
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instructorId]);

  const copyCode = () => {
    if (!card) return;
    void navigator.clipboard.writeText(card.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div id="istr-tab-codice" data-testid="instructor-codice-tab" className="flex flex-col">
      {/* Come le altre schede del dettaglio: il contenuto parte subito sotto i tab (mb-6), niente padding extra sopra. */}
      <div className="flex items-center justify-between gap-7 border-b border-[#ececf0] pb-[22px]">
        <div className="max-w-[440px]">
          <div className="text-[15px] font-semibold leading-[normal] text-[#222222]">Chiave istruttore</div>
          <div className="mt-[5px] text-[13px] font-medium leading-[1.55] text-[#929292]">
            Chi si registra con questa chiave viene iscritto all’autoscuola e assegnato direttamente a questo
            istruttore.
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {card ? (
            <span
              data-testid="instructor-key-value"
              className="rounded-[10px] border border-[#dddddd] bg-[#f7f7f7] px-3.5 py-[9px] text-[16px] font-bold leading-[normal] tracking-[2px] text-[#222222] [font-variant-numeric:tabular-nums]"
            >
              {card.code}
            </span>
          ) : (
            <span aria-hidden className="block h-[40px] w-[112px] animate-pulse rounded-[10px] bg-[#f0f0f2]" />
          )}
          <button
            type="button"
            onClick={copyCode}
            disabled={!card}
            className="flex min-w-[92px] shrink-0 cursor-pointer select-none items-center justify-center rounded-[12px] border-[1.5px] border-[#dddddd] bg-white px-[18px] py-[11px] text-[14px] font-medium leading-[normal] text-[#222222] transition-[background] duration-150 hover:bg-[#f7f7f7] disabled:cursor-default disabled:opacity-60"
          >
            {copied ? "Copiato ✓" : "Copia"}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-7 border-b border-[#ececf0] py-[22px]">
        <div className="max-w-[560px]">
          <div className="text-[15px] font-semibold leading-[normal] text-[#222222]">Card QR da stampare</div>
          <div className="mt-[5px] text-[13px] font-medium leading-[1.55] text-[#929292]">
            L’allievo la inquadra dall’app e viene associato a questo istruttore.
          </div>
        </div>
        <button
          type="button"
          onClick={() => card && setOpen(true)}
          disabled={!card}
          aria-busy={loading}
          className="flex shrink-0 cursor-pointer select-none items-center gap-2.5 rounded-[12px] border-[1.5px] border-[#dddddd] bg-white px-[18px] py-[11px] text-[14px] font-medium leading-[normal] text-[#222222] transition-[background] duration-150 hover:bg-[#f7f7f7] disabled:cursor-default disabled:opacity-60"
        >
          Utilizza
        </button>
      </div>

      <div className="mt-5 flex flex-col gap-2 rounded-[12px] border border-[#f0e060] bg-[#fffce0] px-[18px] py-4">
        <div className="flex items-center gap-2 text-[12px] font-bold leading-[normal] text-[#7a6a00]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7a6a00" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <ellipse cx="9.5" cy="9" rx="7" ry="4" />
            <ellipse cx="9.5" cy="9" rx="2.2" ry="1.2" />
            <path d="M2.5 9v4.5c0 2.2 3.1 4 7 4 2.6 0 5-.5 7.2-1.4L21.5 15l-.9-1.3.9-1.4-.9-1.3.6-1.2c-1.6.6-2.9 1.2-4.7 1.4" />
          </svg>
          Lo scotch non è incluso
        </div>
        <div className="text-[12px] font-medium leading-[1.55] text-[#7a6a00]">
          Purtroppo Reglo non fornisce il nastro adesivo per fissare la card in macchina. Se preferisci una
          soluzione più elegante, una tasca adesiva trasparente per cruscotto o parabrezza fa il suo dovere.
        </div>
        <a
          href={AMAZON_POCKET_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 self-end text-[12px] font-bold leading-[normal] text-[#7a6a00] underline underline-offset-2 hover:text-[#7a6a00]"
        >
          Cerca una tasca adesiva su Amazon
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7a6a00" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M7 17 17 7M8 7h9v9" />
          </svg>
        </a>
      </div>

      {card && (
        <InstructorQrCardDialog
          open={open}
          onClose={() => setOpen(false)}
          instructorName={card.instructorName}
          companyName={card.companyName}
          code={card.code}
          qrValue={instructorLinkUrl(window.location.origin, card.code)}
        />
      )}
    </div>
  );
}
