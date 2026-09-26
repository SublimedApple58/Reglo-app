"use client";

/**
 * Sezione non acquistata, per una consorziata senza Reglo (REG-429).
 *
 * La card non sta su una pagina bianca: sta **sopra la funzione**, piena e
 * sfocata, come nel prototipo e come già succede per gli Allievi. Una pagina
 * vuota con un cartello sopra non fa venire voglia di niente; un'agenda piena
 * che si intravede sì.
 *
 * L'anteprima è **finta e locale** (`demo-agenda.ts`): nessuna chiamata al
 * server, nessun dato di altre autoscuole. Per l'agenda è la griglia **vera**
 * (`AutoscuoleAgendaPage` con una sorgente statica), così quello che si
 * intravede è esattamente ciò che si compra.
 */

import * as React from "react";

import { ATTIVA_REGLO_URL } from "./locked-features";
import { AutoscuoleAgendaPage } from "@/components/pages/Autoscuole/AutoscuoleAgendaPage";
import { demoAgendaBootstrap, DEMO_PENDING_CALLS } from "./demo-agenda";

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

/** Sorgente statica dell'anteprima: nessuna chiamata, dati inventati. */
export const useDemoAgendaSource = () =>
  React.useMemo(
    () => ({
      fetchBootstrap: async (from: Date, to: Date) => demoAgendaBootstrap(from, to),
      readOnly: true,
    }),
    [],
  );

/**
 * Anteprima agenda: la griglia vera, alimentata da dati finti. Sfocata è
 * **solo la griglia** — la toolbar resta nitida, altrimenti l'utente si
 * ritrova chiuso in una pagina senza comandi.
 */
function AgendaPreview({ card }: { card?: React.ReactNode }) {
  const demo = useDemoAgendaSource();
  const source = React.useMemo(
    () => (card ? { ...demo, overlay: { node: card, blur: true } } : demo),
    [demo, card],
  );
  return <AutoscuoleAgendaPage tabs={null} source={source} />;
}

/** Anteprima segretaria: chiamate in sospeso, come nel prototipo. */
function SegretariaPreview() {
  return (
    <div className="mx-auto w-full max-w-[1100px] px-6 py-7 lg:px-8">
      <h1 className="text-[28px] font-bold tracking-[-0.4px] text-foreground">Segretaria</h1>
      <p className="mt-1 text-[14px] text-[#929292]">
        Le chiamate a cui non hai risposto, con quello che voleva chi ha chiamato.
      </p>
      <div className="mt-6 space-y-3">
        {DEMO_PENDING_CALLS.map((call) => (
          <div
            key={call.name}
            className="flex items-center gap-4 rounded-[16px] border border-[#ececec] bg-white px-5 py-4"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#f2f2f2] text-[13px] font-bold text-[#6a6a6a]">
              {call.initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-foreground">
                {call.name} <span className="text-[13px] font-medium text-[#929292]">· {call.when}</span>
              </p>
              <p className="mt-0.5 truncate text-[13.5px] text-[#6a6a6a]">{call.topic}</p>
            </div>
            <span className="shrink-0 rounded-full bg-[#f2f2f2] px-3.5 py-1.5 text-[12.5px] font-semibold text-foreground">
              Richiama
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export type LockedPreview = "agenda" | "segretaria";

/**
 * Anteprima sfocata + contenuto sopra. Serve anche alle card su misura
 * (Allievi, Segretaria), che non passano da `LockedSection`.
 */
export function LockedBackdrop({
  preview,
  backdrop,
  header,
  children,
}: {
  /** Anteprima predefinita. Ignorata se si passa `backdrop`. */
  preview?: LockedPreview;
  /** Anteprima su misura (serve a chi deve tenerci dentro dei controlli). */
  backdrop?: React.ReactNode;
  /**
   * Controlli che restano **usabili** sopra la sfocatura. Senza questo, chi
   * entra nello scope "Autoscuola" resterebbe chiuso lì: la toolbar sotto è
   * sfocata e inerte, e il segmented per tornare a "Consorzio" sparirebbe.
   */
  header?: React.ReactNode;
  children: React.ReactNode;
}) {
  const node =
    backdrop ?? (preview === "segretaria" ? <SegretariaPreview /> : <AgendaPreview />);
  return (
    <div className="relative">
      <div className="pointer-events-none select-none blur-[3px]" aria-hidden>
        {node}
      </div>
      <div className="fixed inset-x-0 bottom-0 top-[84px] z-30 flex flex-col items-center overflow-y-auto px-4 py-8">
        {header ? <div className="mb-6 shrink-0">{header}</div> : null}
        {children}
      </div>
    </div>
  );
}

/** La card del lucchetto, da sola: serve anche a chi compone il proprio sfondo. */
export function LockedCard({ title, description }: { title: string; description: string }) {
  return (
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
  );
}

export function LockedSection({
  title,
  description,
  preview,
}: {
  title: string;
  description: string;
  /** Cosa si intravede dietro la card. Assente = solo la card. */
  preview?: LockedPreview;
}) {
  const card = <LockedCard title={title} description={description} />;
  if (!preview) {
    return <div className="flex min-h-[60vh] items-center justify-center p-6">{card}</div>;
  }
  // Agenda: il cartello sta sopra la sola griglia, la toolbar resta viva.
  if (preview === "agenda") return <AgendaPreview card={card} />;
  // Segretaria: non ha una toolbar da salvare, si sfoca tutto.
  return <LockedBackdrop preview={preview}>{card}</LockedBackdrop>;
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
