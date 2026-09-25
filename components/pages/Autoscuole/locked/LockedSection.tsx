"use client";

/**
 * Sezione non acquistata, per una consorziata senza Reglo (REG-429).
 *
 * ⚠️ **Provvisoria.** Il prototipo per Allievi, Segretaria e Rinnovi ha card
 * su misura, una per funzione (quella degli Allievi è un riquadro giallo con
 * un grafico e il CTA "Prova"): sono in approvazione. Finché non arrivano,
 * qui c'è la stessa forma già approvata per i dialoghi del menu — lucchetto,
 * "Funzione extra di Reglo", titolo, descrizione e CTA — **senza illustrazioni
 * inventate**. Serve a non lasciare la vista ridotta su pagine che chiamano
 * action chiuse e falliscono.
 *
 * Il contenuto vero della sezione NON viene montato: le action a valle
 * rifiutano comunque (`requireServiceAccess` → SERVICE_NOT_ACTIVE) e mandarle
 * in errore per poi coprirle con un velo sarebbe solo rumore nei log.
 */

import { ATTIVA_REGLO_URL } from "./locked-features";

function Padlock({ size = 20, stroke = "#6a6a6a" }: { size?: number; stroke?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function LockedSection({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-[420px] rounded-[24px] bg-white p-7 text-center shadow-[0_26px_70px_rgba(10,20,30,0.14)]">
        <div className="mx-auto mb-3.5 flex h-[46px] w-[46px] items-center justify-center rounded-[14px] bg-[#f2f2f2]">
          <Padlock />
        </div>
        <span className="mb-3 inline-flex items-center rounded-full bg-[#f2f2f2] px-2.5 py-1 text-[11.5px] font-bold text-muted-foreground">
          Funzione extra di Reglo
        </span>
        <h2 className="mb-2 text-[17px] font-bold tracking-[-0.2px] text-foreground">{title}</h2>
        <p className="mb-5 text-[13.5px] font-medium leading-[1.5] text-muted-foreground">
          {description}
        </p>
        <div className="flex items-center justify-center gap-2.5">
          <a
            href="https://reglo.it"
            target="_blank"
            rel="noreferrer"
            className="rounded-[32px] border-[1.5px] border-[#dddddd] bg-white px-5 py-2.5 text-[14px] font-semibold text-foreground transition-colors hover:border-[#b5b5b5]"
          >
            Scopri di più
          </a>
          <a
            href={ATTIVA_REGLO_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded-[32px] bg-[#222222] px-[22px] py-[11px] text-[14px] font-bold text-white transition-opacity hover:opacity-90"
          >
            Attiva Reglo
          </a>
        </div>
      </div>
    </div>
  );
}

/** Copy delle sezioni bloccate — dal prototipo. */
export const LOCKED_SECTIONS = {
  agenda: {
    title: "L'agenda che si riempie da sola",
    description:
      "L'agenda si costruisce da sola sulle disponibilità: niente slot sbagliati, niente telefonate.",
  },
  students: {
    title: "Promossi e bocciati in un tap",
    description:
      "Dopo ogni esame segni l'esito direttamente dall'app: registro e percorso dell'allievo si aggiornano da soli.",
  },
  voice: {
    title: "La segretaria che risponde anche quando tu non puoi",
    description:
      "Risponde 24/7 su orari, prezzi e documenti, raccoglie i numeri di chi vuole essere ricontattato e ti lascia qui le chiamate in sospeso.",
  },
  oreGuida: {
    title: "Questo report esiste già. Ti manca solo Reglo.",
    description:
      "Per le autoscuole con Reglo attivo le ore si calcolano da sole. Tu le stai ancora contando a mano.",
  },
} as const;
