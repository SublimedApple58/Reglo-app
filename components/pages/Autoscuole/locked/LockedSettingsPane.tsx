"use client";

/**
 * Pane delle **Impostazioni** bloccata per una consorziata senza Reglo
 * (REG-429).
 *
 * Nel prototipo una sezione bloccata **si apre**: il titolo resta nitido, il
 * contenuto della pane sfuma e sopra compare una card su misura con
 * l'anteprima di cosa fa quella funzione e i due CTA. Non è un cartello
 * "vietato": è una vetrina, ed è il motivo per cui la voce nella sidebar resta
 * cliccabile anche se porta il lucchetto.
 *
 * Titoli, copy, chip e toggle qui dentro sono presi **1:1 dal prototipo**
 * (estratti pilotandolo con Playwright, non ricostruiti a memoria). Dove il
 * prototipo non ha una card — Pagellino, Istruttori, Aspetto — si usa la forma
 * generica già approvata per le voci del menu, senza inventare anteprime.
 *
 * Nessuna action server viene chiamata: il contenuto vero della pane non viene
 * montato, al suo posto c'è uno scheletro sfocato.
 */

import Image from "next/image";

import { ATTIVA_REGLO_URL } from "./locked-features";

/* ── Primitivi dell'anteprima (stessi stili del prototipo) ───────────── */

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.6px] text-[#929292]">
    {children}
  </p>
);

const FakeSelect = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-2 rounded-[10px] border border-[#e2e2e2] px-3 py-2.5">
    <span className="truncate text-[13.5px] font-medium text-foreground">{children}</span>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 9l6 6 6-6" stroke="#9a9a9a" strokeWidth="2" strokeLinecap="round" />
    </svg>
  </div>
);

const Chip = ({ checked, children }: { checked?: boolean; children: React.ReactNode }) => (
  <span
    className={
      checked
        ? "flex items-center justify-center gap-1 rounded-full border border-[#c9c9c9] bg-[#f7f7f7] px-3 py-2 text-[12.5px] font-semibold text-foreground"
        : "flex items-center justify-center rounded-full border border-[#ececec] px-3 py-2 text-[12.5px] font-medium text-[#9a9a9a]"
    }
  >
    {checked ? "✓ " : ""}
    {children}
  </span>
);

const Toggle = () => (
  <span className="flex h-[22px] w-[40px] shrink-0 items-center justify-end rounded-full bg-[#222222] px-[3px]">
    <span className="block size-4 rounded-full bg-white" />
  </span>
);

const ToggleRow = ({ title, note }: { title: string; note: string }) => (
  <div className="flex items-center justify-between gap-3 py-2.5">
    <div className="min-w-0">
      <p className="text-[13.5px] font-semibold text-foreground">{title}</p>
      <p className="mt-0.5 text-[12px] font-medium leading-snug text-[#929292]">{note}</p>
    </div>
    <Toggle />
  </div>
);

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

/* ── Contenuto delle card, dal prototipo ─────────────────────────────── */

type LockedPaneCard = {
  title: string;
  /** Anteprima 1:1 dal prototipo. Assente = card generica col lucchetto. */
  preview?: React.ReactNode;
  description: string;
};

export const LOCKED_PANE_CARDS: Record<string, LockedPaneCard> = {
  bookings: {
    title: "Prenotazioni in autonomia",
    preview: (
      <>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Chi può prenotare</FieldLabel>
            <FakeSelect>Allievi e istruttori</FakeSelect>
          </div>
          <div>
            <FieldLabel>Settimane visibili</FieldLabel>
            <FakeSelect>4 settimane</FakeSelect>
          </div>
        </div>
        <FieldLabel>Durata prenotazione allievo</FieldLabel>
        <div className="mb-1 grid grid-cols-4 gap-2">
          <Chip>30 min</Chip>
          <Chip>45 min</Chip>
          <Chip checked>60 min</Chip>
          <Chip>90 min</Chip>
        </div>
        <ToggleRow
          title="Solo orari tondi"
          note="Proponi agli allievi solo orari pieni (16:00, 17:00, ecc.)"
        />
        <ToggleRow
          title="Festività non prenotabili"
          note="I giorni festivi restano chiusi alle prenotazioni"
        />
      </>
    ),
    description:
      "Gli allievi prenotano da soli dall'app, dentro le regole che imposti tu: l'agenda si riempie senza telefonate.",
  },
  policy: {
    title: "Policy tipi guida",
    preview: (
      <>
        <ToggleRow
          title="Richiedi almeno 1 guida per tipo"
          note="Ogni allievo completa una guida per ogni tipo selezionato"
        />
        <div className="mt-3">
          <FieldLabel>Configura per tipo di guida</FieldLabel>
          <div className="grid grid-cols-3 gap-2">
            <Chip checked>Manovre</Chip>
            <Chip checked>Urbano</Chip>
            <Chip>Extraurbano</Chip>
            <Chip checked>Notturna</Chip>
            <Chip>Autostrada</Chip>
            <Chip>Parcheggio</Chip>
          </div>
        </div>
      </>
    ),
    description:
      "Scegli i tipi di guida obbligatori: Reglo controlla la copertura di ogni allievo e mostra cosa manca prima dell'esame.",
  },
  reminders: {
    title: "Promemoria e notifiche",
    preview: (
      <>
        <div className="mb-1 grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Promemoria allievo</FieldLabel>
            <FakeSelect>60 minuti prima</FakeSelect>
          </div>
          <div>
            <FieldLabel>Promemoria istruttore</FieldLabel>
            <FakeSelect>30 minuti prima</FakeSelect>
          </div>
        </div>
        <ToggleRow
          title="Promemoria mattutino"
          note="La mattina del giorno della guida, alle 07:30"
        />
        <div className="my-2.5 h-px bg-[#f0f0f0]" />
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-[13.5px] font-semibold text-foreground">Modalità di invio</span>
          <span className="flex gap-1.5">
            <Chip checked>Notifica</Chip>
            <Chip checked>WhatsApp</Chip>
            <Chip>Email</Chip>
          </span>
        </div>
        {/* Stessa foto + notifica finta del dialogo "Invia comunicato". */}
        <div className="relative h-[146px] overflow-hidden rounded-[14px]">
          <Image
            src="/images/locked/invia-comunicato-0.png"
            alt=""
            width={520}
            height={240}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-x-3 top-[52px] flex gap-2.5 rounded-[14px] bg-black/70 px-3 py-2.5 text-white backdrop-blur-sm">
            <Image
              src="/images/locked/invia-comunicato-1.png"
              alt=""
              width={30}
              height={30}
              className="h-[30px] w-[30px] shrink-0 rounded-lg bg-white object-contain"
            />
            <div className="min-w-0">
              <div className="mb-0.5 flex items-center justify-between gap-2 text-[12.5px]">
                <b className="truncate">Autoscuola Montreal</b>
                <span className="shrink-0 text-[11.5px] opacity-75">adesso</span>
              </div>
              <div className="text-[12.5px] leading-[1.35]">
                Guida tra 60 minuti: oggi alle 16:00 con Angelo · Fiat 500.
              </div>
            </div>
          </div>
        </div>
      </>
    ),
    description:
      "Promemoria automatici via notifica, WhatsApp o email: gli allievi non dimenticano le guide e gli slot non restano vuoti.",
  },
  vehicles: {
    title: "I tuoi veicoli",
    preview: (
      <>
        <p className="mb-3.5 text-[13.5px] leading-[1.5] text-muted-foreground">
          Aggiungi i veicoli alle guide per avere più dettagli: ogni guida ha il suo mezzo,
          sempre.
        </p>
        {[
          ["Veicolo 1", "HA996EF · B · Manuale", "Disponibile", true],
          ["Veicolo 2", "GY355GJ · B · Automatico", "In guida · 16:00", false],
        ].map(([name, meta, status, free]) => (
          <div
            key={name as string}
            className="mb-2 flex items-center justify-between gap-3 rounded-[14px] bg-[#f5f5f5] px-3.5 py-3"
          >
            <div className="min-w-0">
              <p className="text-[13.5px] font-bold text-foreground">{name}</p>
              <p className="mt-0.5 text-[12.5px] font-medium text-[#929292]">{meta}</p>
            </div>
            <span
              className={
                free
                  ? "shrink-0 rounded-full bg-[#e6f6ec] px-3 py-1.5 text-[12px] font-semibold text-[#177e45]"
                  : "shrink-0 rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-foreground"
              }
            >
              {status}
            </span>
          </div>
        ))}
      </>
    ),
    description:
      "Disponibilità, categoria, cambio e chi può usarli: più dettagli, zero sovrapposizioni.",
  },
  // Senza card nel prototipo: forma generica, nessuna anteprima inventata.
  locations: {
    title: "Sede e luoghi",
    description:
      "I luoghi di partenza delle guide: l'allievo sceglie dove salire in auto e l'agenda tiene conto degli spostamenti.",
  },
  evaluation: {
    title: "Pagellino di valutazione",
    description:
      "Alla fine di ogni guida l'istruttore dà un voto sulle voci che decidi tu: l'allievo vede i suoi progressi e tu sai chi è pronto per l'esame.",
  },
  instructors: {
    title: "Istruttori",
    description:
      "Istruttori, disponibilità settimanali e colori in agenda: con Reglo attivo l'agenda si costruisce sulle loro ore.",
  },
  aspetto: {
    title: "Aspetto",
    description:
      "Ordine delle colonne in agenda, colori e preferenze di visualizzazione della tua autoscuola.",
  },
  voice: {
    title: "La segretaria che risponde anche quando tu non puoi",
    description:
      "Risponde 24/7 su orari, prezzi e documenti, raccoglie i numeri di chi vuole essere ricontattato e ti lascia qui le chiamate in sospeso.",
  },
};

/* ── Card + scheletro sfocato ────────────────────────────────────────── */

/** Righe grigie al posto del contenuto vero: sfocate, come nel prototipo. */
function BlurredPanePlaceholder() {
  return (
    <div className="pointer-events-none select-none blur-[3px]" aria-hidden>
      <div className="space-y-6">
        {[0, 1, 2].map((block) => (
          <div key={block} className="space-y-3">
            <div className="h-3.5 w-[150px] rounded-full bg-[#ededed]" />
            <div className="h-11 w-full rounded-[10px] bg-[#f4f4f4]" />
            <div className="h-11 w-[72%] rounded-[10px] bg-[#f4f4f4]" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function LockedSettingsPane({ pane }: { pane: string }) {
  const card = LOCKED_PANE_CARDS[pane];
  if (!card) return null;

  return (
    <div className="relative min-h-[520px]">
      <BlurredPanePlaceholder />
      <div className="absolute inset-0 flex items-start justify-center pt-4">
        <div className="w-full max-w-[420px] rounded-[24px] bg-white p-6 shadow-[0_26px_70px_rgba(10,20,30,0.16)]">
          {card.preview ? (
            <>
              <h3 className="mb-3.5 text-[19px] font-bold tracking-[-0.3px] text-foreground">
                {card.title}
              </h3>
              {card.preview}
            </>
          ) : (
            <div className="text-center">
              <div className="mx-auto mb-3.5 flex h-[46px] w-[46px] items-center justify-center rounded-[14px] bg-[#f2f2f2]">
                <Padlock />
              </div>
              <span className="mb-3 inline-flex items-center rounded-full bg-[#f2f2f2] px-2.5 py-1 text-[11.5px] font-bold text-muted-foreground">
                Funzione extra di Reglo
              </span>
              <h3 className="mb-2 text-[17px] font-bold tracking-[-0.2px] text-foreground">
                {card.title}
              </h3>
            </div>
          )}
          <div className="my-4 h-px bg-[#f0f0f0]" />
          <p className="mb-4 text-center text-[13.5px] font-medium leading-[1.5] text-muted-foreground">
            {card.description}
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
    </div>
  );
}
