"use client";

/**
 * Pane delle **Impostazioni** bloccata per una consorziata senza Reglo
 * (REG-429).
 *
 * Forma presa dal prototipo standalone, letto nel sorgente (`config-tab-*`,
 * `pa-group-*`, `seg-group-*`) e non ricostruito a memoria — il primo giro l'ho
 * pilotato a clic e mi sono perso metà delle schede:
 *
 * - il **titolo della sezione** e la **barra delle sotto-tab** stanno fuori
 *   dalla sfocatura e restano nitidi (il titolo lo stampa già la pagina);
 * - il contenuto vero della sezione sta in un wrapper
 *   `blur(3px) / opacity .55 / max-height 620px / overflow hidden`;
 * - sopra, `position:absolute inset-0`, un cartello da **420px** che contiene
 *   una **mini-anteprima della funzione**, il paragrafo di beneficio e i due
 *   CTA.
 *
 * ⚠️ I cartelli del prototipo **non hanno lucchetto né badge "Funzione extra di
 * Reglo"**: quella stringa compare solo nei popup dell'hamburger. Vale per
 * tutti, anche per le sezioni che il prototipo non copre (Pagellino, Aspetto,
 * Istruttori): lì manca l'anteprima, non la forma — titolo, paragrafo e CTA
 * sono gli stessi.
 *
 * Nessuna action server viene chiamata: la pane vera non si monta, al suo posto
 * c'è il fondale finto di `demo-settings.tsx`.
 */

import * as React from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";
import { ATTIVA_REGLO_URL } from "./locked-features";
import { DEMO_SETTINGS_PREVIEWS } from "./demo-settings";
import { LockedInstructors } from "./LockedInstructors";

/* ── Primitivi, coi valori esatti del prototipo ──────────────────────
 *
 * Numeri e hex letti nel sorgente del bundle, non a occhio — con
 * un'eccezione voluta: il **colore**. Il prototipo di Ruzzu è di prima del
 * passaggio della web app a bianco/nero e disegna i CTA in navy #1a1a2e;
 * noi usiamo il nero `#222222` della palette (`--foreground`), lo stesso
 * dei bottoni del dialogo Richiesta di guida qui accanto, così nella
 * stessa schermata non convivono due neri diversi. Deciso da Tiziano il
 * 28/09, dopo un primo giro in navy: il navy era un residuo del prototipo,
 * non una scelta. Geometrie e testi restano 1:1 col prototipo.
 *
 * Se un giorno la palette cambia, si cambia solo `NERO`.
 */

/** Primario della palette (`--foreground`). Hover: #3a3a3a. */
const NERO = "#222222";

/** Etichetta di campo: 11px/700, maiuscoletto spaziato. */
export const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.4px] text-[#929292]">
    {children}
  </p>
);

/** Etichetta di gruppo dentro il cartello: 10.5px/700, più spaziata. */
const MiniLabel = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <p className={cn("text-[10.5px] font-bold uppercase tracking-[0.5px] text-[#929292]", className)}>
    {children}
  </p>
);

const Chevron = () => (
  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
    <path d="M3 5l4 4 4-4" stroke="#929292" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Campo a tendina finto: bordo 1.5px #e4e4ea, valore 13px. */
export const FakeSelect = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-2 rounded-[10px] border-[1.5px] border-[#e4e4ea] px-3 py-[9px]">
    <span className="truncate text-[13px] font-medium text-[#222222]">{children}</span>
    <Chevron />
  </div>
);

/** Come FakeSelect ma con l'unità a destra invece della freccia (prezzi). */
const PriceField = ({ value, unit = "€" }: { value: string; unit?: string }) => (
  <div className="flex items-center justify-between gap-2 rounded-[10px] border-[1.5px] border-[#e4e4ea] px-3 py-[9px]">
    <span className="text-[13px] font-medium text-[#222222]">{value}</span>
    <span className="text-[13px] font-medium text-[#929292]">{unit}</span>
  </div>
);

/** Campo etichettato, la coppia che il prototipo ripete ovunque. */
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <FieldLabel>{label}</FieldLabel>
    {children}
  </div>
);

/** Pillola selezionabile: 7px 13px, 12.5px, spunta quando scelta. */
export const PreviewChip = ({
  checked,
  compact,
  children,
}: {
  checked?: boolean;
  /** Misure ridotte del prototipo per le righe strette ("Modalità di invio"). */
  compact?: boolean;
  children: React.ReactNode;
}) => (
  <span
    className={cn(
      // `whitespace-nowrap`: senza, a 420px la spunta finisce sopra la parola
      // e il chip diventa alto il doppio. Nel prototipo sta su una riga.
      "flex items-center justify-center whitespace-nowrap rounded-[20px] border-[1.5px]",
      compact ? "px-[11px] py-1.5 text-[12px]" : "px-[13px] py-[7px] text-[12.5px]",
      checked
        ? "border-[#222222] bg-[#f6f6f8] font-semibold text-[#222222]"
        : "border-[#e4e4ea] font-medium text-[#6a6a6a]",
    )}
  >
    {checked ? "✓ " : ""}
    {children}
  </span>
);

/** Pillola **non** selezionabile: elenca funzioni, senza spunta ("E c'è tanto altro"). */
const Tag = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded-[20px] border-[1.5px] border-[#e4e4ea] px-[11px] py-1.5 text-[12px] font-medium text-[#444444]">
    {children}
  </span>
);

/** Riquadro selezionabile (Policy): squadrato, non a pillola. */
const BoxChoice = ({
  checked,
  cursor,
  children,
}: {
  checked?: boolean;
  /** Il puntatore del mouse disegnato in basso a destra, come nel prototipo. */
  cursor?: boolean;
  children: React.ReactNode;
}) => (
  <span
    className={cn(
      "relative flex items-center justify-center gap-[5px] rounded-[10px] border-[1.5px] px-1.5 py-2.5 text-[13px]",
      checked
        ? "border-[#222222] font-semibold text-[#222222]"
        : "border-[#e4e4ea] font-medium text-[#6a6a6a]",
      checked && (cursor ? "bg-white shadow-[0_4px_12px_rgba(0,0,0,0.12)]" : "bg-[#f6f6f8]"),
    )}
  >
    {checked ? "✓ " : ""}
    {children}
    {cursor ? (
      <svg width="17" height="20" viewBox="0 0 17 20" fill="none" className="absolute -bottom-3 -right-1.5" aria-hidden>
        <path
          d="M1.5 1.2v14.4l3.9-3.9 2.5 5.7 2.6-1.2-2.5-5.6h5.4L1.5 1.2z"
          fill="#111118"
          stroke="#ffffff"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
    ) : null}
  </span>
);

/** Interruttore 44×24 col pomello da 20. Spento: #e0e0e0. */
const Toggle = ({ on = true }: { on?: boolean }) => (
  <span
    className={cn(
      "relative inline-block h-6 w-11 shrink-0 rounded-[12px]",
      on ? "bg-[#222222]" : "bg-[#e0e0e0]",
    )}
  >
    <span
      className={cn(
        "absolute top-0.5 size-5 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.2)]",
        on ? "left-[22px]" : "left-0.5",
      )}
    />
  </span>
);

/**
 * Riga con interruttore: il mattone più usato dei cartelli.
 * 14px/600 sopra, 12.5px/500 #8a8a94 sotto, 13px di respiro.
 */
export const PreviewToggleRow = ({
  title,
  note,
  on = true,
}: {
  title: string;
  note: string;
  on?: boolean;
}) => (
  <div className="flex items-center justify-between gap-3 py-[13px]">
    <span className="min-w-0 flex-1">
      <span className="block text-[14px] font-semibold text-[#222222]">{title}</span>
      <span className="mt-0.5 block text-[12.5px] font-medium leading-snug text-[#8a8a94]">
        {note}
      </span>
    </span>
    <Toggle on={on} />
  </div>
);

/** Più righe-interruttore: il filo separatore sta fra, non sotto l'ultima. */
const ToggleList = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-col divide-y divide-[#efeff2]">{children}</div>
);

/** Avatar tondo dalle foto del prototipo. */
const Avatar = ({ src, size }: { src: string; size: number }) => (
  <span className="shrink-0 overflow-hidden rounded-full" style={{ width: size, height: size }}>
    <Image src={src} alt="" width={size * 2} height={size * 2} className="h-full w-full object-cover" />
  </span>
);


/** Etichetta dei blocchi in Segretaria: 10.5px/700, molto spaziata. */
const SectionLabel = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <p className={cn("mb-2 text-[10.5px] font-bold uppercase tracking-[0.9px] text-[#8a8a94]", className)}>
    {children}
  </p>
);

/**
 * L'onda sonora del player: le 40 barre del prototipo, coi loro valori.
 * `preserveAspectRatio="none"` le fa stirare sulla larghezza disponibile,
 * esattamente come là.
 */
const WAVEFORM_BARS: Array<[number, number]> = [
  [10, 4], [8, 8], [5, 14], [7, 10], [3, 18], [6, 12], [9, 6], [4, 16], [2, 20], [7.5, 9],
  [5.5, 13], [9.5, 5], [3.5, 17], [6.5, 11], [8.5, 7], [4.5, 15], [2.5, 19], [8, 8], [6, 12], [4, 16],
  [9, 6], [5, 14], [7, 10], [3, 18], [8.5, 7], [5.5, 13], [7.5, 9], [4.5, 15], [9.5, 5], [6.5, 11],
  [3.5, 17], [8, 8], [5, 14], [9, 6], [6, 12], [4, 16], [7, 10], [9, 6], [8, 8], [10, 4],
];

const Waveform = () => (
  <svg
    viewBox="0 0 160 24"
    preserveAspectRatio="none"
    fill="#c1c1cc"
    className="block h-[22px] flex-1"
    aria-hidden
  >
    {WAVEFORM_BARS.map(([y, h], index) => (
      <rect key={index} x={index * 4} y={y} width="2.2" height={h} rx="1.1" />
    ))}
  </svg>
);

/** Riga allievo dello scambio: avatar, nome, orario, stato. */
const SwapRow = ({
  avatar,
  name,
  when,
  badge,
  accepted,
}: {
  avatar: string;
  name: string;
  when: string;
  badge: string;
  accepted?: boolean;
}) => (
  <div className="flex items-center gap-3 rounded-[14px] bg-[#f5f5f7] px-3.5 py-[13px]">
    <Avatar src={avatar} size={40} />
    <span className="min-w-0 flex-1">
      <span className="block text-[15px] font-bold tracking-[-0.3px] text-[#222222]">{name}</span>
      <span className="mt-px block text-[12.5px] font-medium text-[#8a8a94]">{when}</span>
    </span>
    <span
      className={cn(
        "shrink-0 whitespace-nowrap rounded-[20px] px-[11px] py-1.5 text-[11.5px] font-bold",
        accepted ? "bg-[#e9f7ef] text-[#1a8a5a]" : "border border-[#e4e4ea] bg-white text-[#222222]",
      )}
    >
      {badge}
    </span>
  </div>
);

/** Il tondo con le frecce che si incrociano, a cavallo fra le due righe. */
const SwapBadge = () => (
  <div className="relative z-[2] -my-2 flex items-center justify-center">
    <span className="inline-flex size-[34px] items-center justify-center rounded-full border-[3px] border-white bg-[#222222] shadow-[0_4px_12px_rgba(0,0,0,0.28)]">
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 7h11M12 4l3 3-3 3M16 13H5M8 10l-3 3 3 3" />
      </svg>
    </span>
  </div>
);

/* ── Contenuto dei cartelli, 1:1 dal prototipo ──────────────────────
 *
 * Ogni sotto-tab ha il **suo** cartello, con il suo contenuto: qui non si
 * ripete niente. Testi, valori, stati degli interruttori e perfino quale
 * chip è selezionato vengono dal sorgente del prototipo.
 */

type LockedPaneCard = {
  title: string;
  /** Riga sotto il titolo, dove il prototipo la ha. */
  subtitle?: string;
  /** Mini-anteprima dentro il cartello. Assente = solo titolo e paragrafo. */
  preview?: React.ReactNode;
  /** Paragrafo di beneficio sopra i CTA. */
  description?: string;
  /** Larghezza del cartello: 420px salvo dove il prototipo dice altro. */
  width?: number;
  /** Respiro sopra il filo che precede il paragrafo (il prototipo varia). */
  ruleTight?: boolean;
};

export const LOCKED_PANE_CARDS: Record<string, LockedPaneCard> = {
  /* ── Prenotazioni e allievi › Generali ────────────────────────────── */
  "bookings:generali": {
    title: "Prenotazioni in autonomia",
    ruleTight: true,
    preview: (
      <>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Chi può prenotare">
            <FakeSelect>Allievi e istruttori</FakeSelect>
          </Field>
          <Field label="Settimane visibili">
            <FakeSelect>4 settimane</FakeSelect>
          </Field>
        </div>
        <div className="mt-3.5">
          <MiniLabel className="mb-2 !text-[11px] !tracking-[0.4px]">
            Durata prenotazione allievo
          </MiniLabel>
          <div className="flex flex-wrap gap-1.5">
            <PreviewChip>30 min</PreviewChip>
            <PreviewChip>45 min</PreviewChip>
            <PreviewChip checked>60 min</PreviewChip>
            <PreviewChip>90 min</PreviewChip>
          </div>
        </div>
        <div className="mt-1.5">
          <ToggleList>
            <PreviewToggleRow
              title="Solo orari tondi"
              note="Proponi agli allievi solo orari pieni (16:00, 17:00, ecc.)"
            />
            <PreviewToggleRow
              title="Festività non prenotabili"
              note="I giorni festivi restano chiusi alle prenotazioni"
            />
          </ToggleList>
        </div>
      </>
    ),
    description:
      "Gli allievi prenotano da soli dall'app, dentro le regole che imposti tu: l'agenda si riempie senza telefonate.",
  },

  /* ── Prenotazioni e allievi › Limiti ──────────────────────────────── */
  "bookings:limiti": {
    title: "Limiti di prenotazione",
    ruleTight: true,
    preview: (
      // Quattro interruttori, e il terzo nel prototipo è **spento**.
      <div className="-mt-2.5">
        <ToggleList>
          <PreviewToggleRow
            title="Stop alle prenotazioni last-minute"
            note="Oltre le 19:30 non si prenota più per il giorno dopo"
          />
          <PreviewToggleRow
            title="Massimo di guide a settimana"
            note="3 guide per allievo, superabili con conferma"
          />
          <PreviewToggleRow
            title="Riempi le fasce più vuote"
            note="Chi è libero in una fascia poco richiesta prenota lì"
            on={false}
          />
          <PreviewToggleRow
            title="Blocca chi ha troppe guide da pagare"
            note="Prenotazioni sospese finché non salda"
          />
        </ToggleList>
      </div>
    ),
    description:
      "Tante impostazioni per gestire tutto in tranquillità. E se non ti servono, puoi sempre far prenotare solo gli istruttori.",
  },

  /* ── Prenotazioni e allievi › Guide ───────────────────────────────── */
  "bookings:guide": {
    title: "Scambi tra allievi",
    subtitle:
      "Un imprevisto? Gli allievi si scambiano le guide da soli, senza passare dalla segreteria.",
    preview: (
      <>
        <div className="relative">
          <SwapRow
            avatar="/images/locked/allievo-1.png"
            name="Allievo 1"
            when="Guida · mar 14:00 → 15:00"
            badge="Propone lo scambio"
          />
          <SwapBadge />
          <SwapRow
            avatar="/images/locked/allievo-2.png"
            name="Allievo 2"
            when="Guida · mar 14:00 → 15:00"
            badge="✓ Accetta"
            accepted
          />
        </div>
        <div className="mt-[18px]">
          <MiniLabel className="mb-2 !text-[11px] !tracking-[0.4px]">E c&apos;è tanto altro</MiniLabel>
          <div className="flex flex-wrap gap-1.5">
            <Tag>Presenza automatica</Tag>
            <Tag>Guide di gruppo</Tag>
            <Tag>Gruppi visibili agli allievi</Tag>
          </div>
        </div>
      </>
    ),
  },

  /* ── Prenotazioni e allievi › App allievi ─────────────────────────── */
  "bookings:app": {
    title: "App allievi",
    preview: (
      <>
        <div className="-mt-2.5">
          <ToggleList>
            <PreviewToggleRow
              title="Mostra note nell'app allievi"
              note="Le note degli istruttori dopo ogni guida, direttamente in app"
            />
            <PreviewToggleRow
              title="Consenti scelta istruttore"
              note="L'allievo sceglie con chi fare la guida quando prenota"
            />
          </ToggleList>
        </div>
        <div className="mt-2 rounded-[14px] bg-[#f5f5f7] p-3.5">
          <MiniLabel>Anteprima · Nota nell&apos;app</MiniLabel>
          <div className="mt-2.5 flex items-start gap-2.5 rounded-[12px] border border-[#e8e8ee] bg-white px-[13px] py-[11px]">
            <Avatar src="/images/locked/nota-valerio.png" size={32} />
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-bold text-[#222222]">
                Nota di Valerio · guida di oggi
              </span>
              <span className="mt-0.5 block text-[12px] font-medium leading-[1.45] text-[#6a6a72]">
                Ottimi progressi in parcheggio, la prossima volta rivediamo le rotonde.
              </span>
            </span>
          </div>
        </div>
      </>
    ),
    description:
      "Decidi tu cosa vedono gli allievi in app: note delle guide e scelta dell'istruttore.",
  },

  /* ── Prenotazioni e allievi › Crediti e prezzi ────────────────────── */
  "bookings:crediti": {
    title: "Crediti e prezzi",
    preview: (
      <>
        <div className="-mt-1.5 border-b border-[#efeff2]">
          <PreviewToggleRow
            title="Crediti guida"
            note="Le guide si pagano con crediti caricati dall'autoscuola"
          />
        </div>
        <div className="mt-3.5 grid grid-cols-2 gap-2.5">
          <Field label="Guida da 30 minuti">
            <PriceField value="25" />
          </Field>
          <Field label="Guida da 60 minuti">
            <PriceField value="50" />
          </Field>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <Field label="Cutoff annullamento">
            <FakeSelect>48 ore prima</FakeSelect>
          </Field>
          <Field label="Penale">
            <FakeSelect>100% del prezzo</FakeSelect>
          </Field>
        </div>
      </>
    ),
    description:
      "Crediti, prezzi e penali si applicano da soli: annullamenti tardivi e guide senza credito risultano da pagare.",
  },

  /* ── Policy tipi guida ────────────────────────────────────────────── */
  policy: {
    title: "Policy tipi guida",
    // Il prototipo qui stringe il cartello a 400px.
    width: 400,
    preview: (
      <>
        <div className="-mt-2.5">
          <PreviewToggleRow
            title="Richiedi almeno 1 guida per tipo"
            note="Ogni allievo completa una guida per ogni tipo selezionato"
          />
        </div>
        <MiniLabel className="mb-2.5 mt-2">Configura per tipo di guida</MiniLabel>
        <div className="grid grid-cols-3 gap-2">
          <BoxChoice checked>Manovre</BoxChoice>
          <BoxChoice checked>Urbano</BoxChoice>
          <BoxChoice>Extraurbano</BoxChoice>
          {/* Nel prototipo "Notturna" è appena stata cliccata: sfondo bianco,
              ombra e il puntatore del mouse disegnato sull'angolo. */}
          <BoxChoice checked cursor>
            Notturna
          </BoxChoice>
          <BoxChoice>Autostrada</BoxChoice>
          <BoxChoice>Parcheggio</BoxChoice>
        </div>
      </>
    ),
    description:
      "Scegli i tipi di guida obbligatori: Reglo controlla la copertura di ogni allievo e mostra cosa manca prima dell'esame.",
  },

  /* ── Promemoria e notifiche ───────────────────────────────────────── */
  reminders: {
    title: "Promemoria e notifiche",
    preview: (
      <>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Promemoria allievo">
            <FakeSelect>60 minuti prima</FakeSelect>
          </Field>
          <Field label="Promemoria istruttore">
            <FakeSelect>30 minuti prima</FakeSelect>
          </Field>
        </div>
        <PreviewToggleRow
          title="Promemoria mattutino"
          note="La mattina del giorno della guida, alle 07:30"
        />
        <div className="flex items-center justify-between gap-3 py-[13px]">
          <span className="whitespace-nowrap text-[14px] font-semibold text-[#222222]">
            Modalità di invio
          </span>
          <span className="inline-flex shrink-0 gap-1.5">
            <PreviewChip checked compact>
              Notifica
            </PreviewChip>
            <PreviewChip checked compact>
              WhatsApp
            </PreviewChip>
            <PreviewChip compact>Email</PreviewChip>
          </span>
        </div>
        {/* Mockup della notifica push: immagini e misure del prototipo. */}
        <div className="relative mt-1.5 aspect-[16/9] w-full overflow-hidden rounded-[12px] bg-[#d9c9a6]">
          <Image
            src="/images/locked/promemoria-0.png"
            alt=""
            width={420}
            height={236}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-x-3 top-1/2 flex -translate-y-1/2 items-start gap-[9px] rounded-[12px] bg-[#303030]/[0.86] px-[11px] py-[9px] backdrop-blur-[4px]">
            <span className="flex size-[26px] shrink-0 items-center justify-center rounded-[7px] bg-white">
              <Image
                src="/images/locked/promemoria-1.png"
                alt=""
                width={15}
                height={15}
                className="size-[15px] object-contain"
              />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <span className="flex-1 truncate text-[11.5px] font-bold text-white">
                  Autoscuola Montreal
                </span>
                <span className="text-[9.5px] font-medium text-[#c9c9c9]">adesso</span>
              </div>
              <p className="mt-px text-[11px] font-medium leading-[1.35] text-[#efefef]">
                Guida tra 60 minuti: oggi alle 16:00 con Angelo · Fiat 500.
              </p>
            </div>
          </div>
        </div>
      </>
    ),
    description:
      "Promemoria automatici via notifica, WhatsApp o email: gli allievi non dimenticano le guide e gli slot non restano vuoti.",
  },

  /* ── Veicoli ──────────────────────────────────────────────────────── */
  vehicles: {
    title: "I tuoi veicoli",
    subtitle:
      "Aggiungi i veicoli alle guide per avere più dettagli: ogni guida ha il suo mezzo, sempre.",
    preview: (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3 rounded-[14px] bg-[#f5f5f7] px-3 py-[11px]">
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold tracking-[-0.3px] text-[#222222]">
              Veicolo 1
            </span>
            <span className="mt-px block text-[12.5px] font-medium text-[#8a8a94]">
              HA996EF · B · Manuale
            </span>
          </span>
          <span className="shrink-0 whitespace-nowrap rounded-[20px] bg-[#e9f7ef] px-[11px] py-1.5 text-[11.5px] font-bold text-[#1a8a5a]">
            Disponibile
          </span>
        </div>
        <div className="flex items-center gap-3 rounded-[14px] bg-[#f5f5f7] px-3 py-[11px]">
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold tracking-[-0.3px] text-[#222222]">
              Veicolo 2
            </span>
            <span className="mt-px block text-[12.5px] font-medium text-[#8a8a94]">
              GY355GJ · B · Automatico
            </span>
          </span>
          <span className="shrink-0 whitespace-nowrap rounded-[20px] border border-[#e4e4ea] bg-white px-[11px] py-1.5 text-[11.5px] font-bold text-[#222222]">
            In guida · 16:00
          </span>
        </div>
      </div>
    ),
    description:
      "Disponibilità, categoria, cambio e chi può usarli: più dettagli, zero sovrapposizioni.",
  },

  /* ── Segretaria › Linea ───────────────────────────────────────────── */
  "voice:linea": {
    title: "Linea telefonica",
    subtitle:
      "Un numero dedicato a cui la segretaria AI risponde 24/7, mentre tu resti sulle guide.",
    preview: (
      // Una riga sola: cerchio scuro, chi chiama, e a destra chi risponde.
      <div className="flex items-center gap-3 rounded-[14px] bg-[#f5f5f7] px-3.5 py-[13px]">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[#222222]">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold tracking-[-0.3px] text-[#222222]">
            Chiamata in arrivo
          </span>
          <span className="mt-px block text-[12.5px] font-medium text-[#8a8a94]">
            +39 340 776 2201
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[20px] bg-[#e9f7ef] px-[11px] py-1.5 text-[11.5px] font-bold text-[#1a8a5a]">
          <span className="size-1.5 rounded-full bg-[#1a8a5a]" />
          Risponde l&apos;AI
        </span>
      </div>
    ),
  },

  /* ── Segretaria › Comportamento ed azioni ─────────────────────────── */
  "voice:comportamento": {
    title: "Comportamento ed azioni",
    subtitle:
      "Decidi cosa può fare e come si presenta: saluto personalizzato, FAQ e prenotazioni vocali.",
    preview: (
      // Citazione e chip stanno **dentro lo stesso** riquadro grigio.
      <div className="rounded-[14px] bg-[#f5f5f7] px-4 py-3.5">
        <p className="text-[13px] font-medium italic leading-[1.55] text-[#444444]">
          &ldquo;Scuola Guida Montreal, buongiorno! Sono l&apos;assistente virtuale
          dell&apos;autoscuola, come posso aiutarti?&rdquo;
        </p>
        <div className="mt-[11px] flex flex-wrap gap-1.5">
          {["FAQ autoscuola", "Info lezioni", "Prenota guida"].map((label) => (
            <span
              key={label}
              className="rounded-[20px] border border-[#e4e4ea] bg-white px-[11px] py-[5px] text-[11.5px] font-bold text-[#222222]"
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    ),
  },

  /* ── Segretaria › Orari e registrazioni ───────────────────────────── */
  "voice:orari": {
    title: "Orari e registrazioni",
    subtitle: "Scegli giorni e fasce orarie in cui risponde, e cosa registrare delle chiamate.",
    preview: (
      <div>
        <SectionLabel>Registrazione</SectionLabel>
        {/* Player a pillola: tondo play, onda sonora, durata. */}
        <div className="flex items-center gap-3 rounded-[40px] bg-[#f5f5f7] py-[9px] pl-[9px] pr-4">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[#222222]">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="#ffffff" aria-hidden>
              <path d="M3 1.5v9l7.5-4.5z" />
            </svg>
          </span>
          <Waveform />
          <span className="shrink-0 text-[12px] font-semibold text-[#8a8a94]">0:42</span>
        </div>
        <SectionLabel className="mb-[7px] mt-4">Trascrizione</SectionLabel>
        {/* Nel prototipo la trascrizione è testo nudo, senza riquadro. */}
        <p className="text-[13px] font-medium leading-[1.6] text-[#444444]">
          Buongiorno, sono Marco Rossi. Volevo sapere se avete disponibilità questa settimana per
          una guida, preferibilmente il pomeriggio…
        </p>
      </div>
    ),
  },

  /* ── Segretaria › Istruzioni ──────────────────────────────────────── */
  "voice:istruzioni": {
    title: "Istruzioni",
    subtitle:
      "Dai alla segretaria le informazioni della tua autoscuola: risponde seguendo le tue regole.",
    preview: (
      <div className="rounded-[14px] bg-[#f5f5f7] px-4 py-3.5">
        <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.8px] text-[#8a8a94]">
          Cosa sa la segretaria
        </p>
        <div className="flex flex-col gap-2">
          {[
            "Rinnovo patente: documenti, costi e tempi",
            "Prezzi patente nuova → rimanda alla mail",
            "Orari segreteria: 9:00–12:00 e 15:30–18:30",
          ].map((line) => (
            <div key={line} className="flex items-center gap-[9px] text-[12.5px] font-medium text-[#444444]">
              <span className="size-1.5 shrink-0 rounded-full bg-[#222222]" />
              {line}
            </div>
          ))}
        </div>
      </div>
    ),
  },

  /* ── Sezioni che il prototipo non ha: stessa forma, senza anteprima ── */
  evaluation: {
    title: "Pagellino di valutazione",
    /*
      A differenza degli altri mockup, che sono disegnati in markup, questo è
      l'immagine che ha scelto Tiziano: il modello base con le cinque voci a
      cinque stelline. Se un giorno si vorrà uniformarlo agli altri, la card
      bianca dentro la foto è ricostruibile in markup senza perdere niente.
    */
    preview: (
      <div className="mt-1.5 overflow-hidden rounded-[12px]">
        <Image
          src="/images/locked/pagellino-teaser.jpg"
          alt=""
          width={1600}
          height={900}
          className="block h-full w-full object-cover"
        />
      </div>
    ),
    description:
      "Alla fine di ogni guida l'istruttore dà un voto sulle voci che decidi tu: l'allievo vede i suoi progressi e tu sai chi è pronto per l'esame.",
  },
  aspetto: {
    title: "Aspetto",
    description:
      "Ordine delle colonne in agenda, colori e preferenze di visualizzazione della tua autoscuola.",
  },
};

/* ── Sotto-tab: le stesse delle pane vere, e del prototipo ──────────── */

/**
 * `bookings` e `voice` hanno le sotto-tab anche da bloccate: nel prototipo la
 * barra resta nitida e ogni scheda ha il **suo** cartello. Le etichette sono
 * quelle di `BookingsTab` / `VoiceSettingsPane`, che già combaciano col
 * prototipo.
 */
const SUB_TABS: Record<string, Array<{ key: string; label: string }>> = {
  bookings: [
    { key: "generali", label: "Generali" },
    { key: "limiti", label: "Limiti" },
    { key: "guide", label: "Guide" },
    { key: "app", label: "App allievi" },
    { key: "crediti", label: "Crediti e prezzi" },
  ],
  voice: [
    { key: "linea", label: "Linea" },
    { key: "comportamento", label: "Comportamento ed azioni" },
    { key: "orari", label: "Orari e registrazioni" },
    { key: "istruzioni", label: "Istruzioni" },
  ],
};

/* ── Fondale sfocato + cartello ─────────────────────────────────────── */

/**
 * Dietro il cartello ci vanno i **campi veri** della sezione, sfocati: barre
 * grigie dicono che manca qualcosa, non cosa. Contenuti finti e locali
 * (`demo-settings.tsx`) — la pane vera non si monta, chiamerebbe action chiuse.
 *
 * Numeri dal prototipo: `blur(3px)`, `opacity .55`, altezza tagliata a 620px.
 */
function BlurredBackdrop({ contentKey }: { contentKey: string }) {
  const preview = DEMO_SETTINGS_PREVIEWS[contentKey];
  return (
    <div
      className="pointer-events-none max-h-[620px] select-none overflow-hidden opacity-55 blur-[3px]"
      aria-hidden
    >
      {preview ?? (
        <div className="space-y-6">
          {[0, 1, 2].map((block) => (
            <div key={block} className="space-y-3">
              <div className="h-3.5 w-[150px] rounded-full bg-[#ededed]" />
              <div className="h-11 w-full rounded-[10px] bg-[#f4f4f4]" />
              <div className="h-11 w-[72%] rounded-[10px] bg-[#f4f4f4]" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * "Sede e luoghi" nel prototipo **non è un cartello di blocco**: è lo stato
 * vuoto della sezione — due illustrazioni, l'invito a impostare la sede e i
 * due CTA, senza lucchetto e senza sfocatura. Lo riproduciamo così com'è
 * invece di forzarlo nella forma delle altre.
 */
function LocationsEmptyState() {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center px-6 text-center">
      <div className="mb-6 flex items-end justify-center gap-1">
        <Image
          src="/images/locked/sede-0.png"
          alt=""
          width={210}
          height={210}
          className="h-[150px] w-[150px] object-contain"
        />
        <Image
          src="/images/locked/sede-1.png"
          alt=""
          width={210}
          height={210}
          className="h-[150px] w-[150px] object-contain"
        />
      </div>
      <h3 className="mb-2 text-[19px] font-bold tracking-[-0.2px] text-foreground">
        Imposta la sede della tua autoscuola
      </h3>
      <p className="mb-6 max-w-[430px] text-[14.5px] leading-[1.55] text-muted-foreground">
        La sede è il luogo di partenza predefinito di ogni guida. Aggiungila ora per iniziare a
        creare le prenotazioni, poi potrai gestire eventuali{" "}
        <b className="font-semibold text-foreground">luoghi extra</b>.
      </p>
      <CtaRow />
    </div>
  );
}

/** I due pulsanti, identici in ogni cartello. Primario nero. */
function CtaRow() {
  return (
    <div className="flex items-center justify-center gap-2.5">
      <a
        href="https://reglo.it"
        target="_blank"
        rel="noreferrer"
        className="rounded-[32px] border-[1.5px] border-[#dddddd] px-5 py-2.5 text-[14px] font-semibold text-[#222222] transition-colors hover:border-[#b5b5b5]"
      >
        Scopri di più
      </a>
      <a
        href={ATTIVA_REGLO_URL}
        target="_blank"
        rel="noreferrer"
        style={{ backgroundColor: NERO }}
        className="rounded-[32px] px-[22px] py-[11px] text-[14px] font-bold text-white transition-colors hover:!bg-[#3a3a3a]"
      >
        Attiva Reglo
      </a>
    </div>
  );
}

/** Il cartello: 420px, ombra alta, contenuto secondo il prototipo. */
function LockedCardBody({ card }: { card: LockedPaneCard }) {
  // Il testo che accompagna il titolo: `subtitle` dove il prototipo ce l'ha,
  // altrimenti il paragrafo di beneficio — le sezioni senza anteprima (quelle
  // che il prototipo non copre) hanno solo quello.
  const lead = card.subtitle ?? (card.preview ? undefined : card.description);
  return (
    <>
      <h3 className="text-[21px] font-bold tracking-[-0.7px] text-[#222222]">{card.title}</h3>
      {lead ? (
        <p className="mt-2 text-[14px] font-medium leading-[1.45] text-[#5a5a66]">{lead}</p>
      ) : null}
      {card.preview ? <div className="mt-[18px]">{card.preview}</div> : null}
      {card.preview && card.description ? (
        <>
          <div className={cn("h-px bg-[#efeff2]", card.ruleTight ? "mb-[18px] mt-3.5" : "my-[18px]")} />
          <p className="mb-4 text-center text-[13.5px] font-medium leading-[1.5] text-[#6a6a6a]">
            {card.description}
          </p>
        </>
      ) : (
        <div className="mb-4 mt-[18px]" />
      )}
      <CtaRow />
    </>
  );
}

export function LockedSettingsPane({
  pane,
  onDetailOpenChange,
}: {
  pane: string;
  /**
   * Istruttori: aprendo il dettaglio il titolo della pane sparisce, come nel
   * prototipo e come fa già la sezione vera. La shell stampa quel titolo,
   * quindi deve saperlo.
   */
  onDetailOpenChange?: (open: boolean) => void;
}) {
  // Sede: stato vuoto, non cartello (vedi LocationsEmptyState).
  // Istruttori: lista aperta + dettaglio con quattro sotto-tab, come il
  // prototipo (vedi LockedInstructors).
  const tabs = SUB_TABS[pane];
  const [subTab, setSubTab] = React.useState(() => tabs?.[0]?.key ?? "");

  // La sezione cambia: si riparte dalla prima scheda, come le pane vere.
  React.useEffect(() => {
    setSubTab(SUB_TABS[pane]?.[0]?.key ?? "");
  }, [pane]);

  if (pane === "locations") return <LocationsEmptyState />;
  if (pane === "instructors") return <LockedInstructors onDetailOpenChange={onDetailOpenChange} />;

  const contentKey = tabs ? `${pane}:${subTab}` : pane;
  const card = LOCKED_PANE_CARDS[contentKey];
  if (!card) return null;

  return (
    <div>
      {/* Barra delle sotto-tab: nitida e cliccabile, come nel prototipo. */}
      {tabs ? (
        <div className="mb-7 flex flex-wrap items-center gap-8 border-b border-[#e8e8e8]">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setSubTab(tab.key)}
              className={cn(
                "-mb-px cursor-pointer select-none whitespace-nowrap border-b-[2.5px] px-px pb-3 text-[15px] transition-colors",
                subTab === tab.key
                  ? "border-[#222222] font-semibold text-foreground"
                  : "border-transparent font-medium text-[#6a6a6a] hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="relative min-h-[520px]">
        <BlurredBackdrop contentKey={contentKey} />
        <div className="absolute inset-0 flex items-start justify-center px-6 pt-9">
          <div
            data-testid="locked-pane-card"
            style={{ maxWidth: card.width ?? 420 }}
            className="w-full rounded-[22px] bg-white p-[26px_24px_24px] shadow-[0_26px_70px_rgba(10,20,30,0.32)]"
          >
            <LockedCardBody card={card} />
          </div>
        </div>
      </div>
    </div>
  );
}
