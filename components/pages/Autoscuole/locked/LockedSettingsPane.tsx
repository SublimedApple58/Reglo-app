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

/* ── Primitivi dell'anteprima (stessi stili del prototipo) ───────────── */

export const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.6px] text-[#929292]">
    {children}
  </p>
);

export const FakeSelect = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-2 rounded-[10px] border border-[#e2e2e2] px-3 py-2.5">
    <span className="truncate text-[13.5px] font-medium text-foreground">{children}</span>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 9l6 6 6-6" stroke="#9a9a9a" strokeWidth="2" strokeLinecap="round" />
    </svg>
  </div>
);

export const PreviewChip = ({
  checked,
  children,
}: {
  checked?: boolean;
  children: React.ReactNode;
}) => (
  <span
    className={
      checked
        ? "flex items-center justify-center gap-1 rounded-full border-[1.5px] border-[#222222] bg-[#f6f6f6] px-[11px] py-1.5 text-[12px] font-semibold text-foreground"
        : "flex items-center justify-center rounded-full border-[1.5px] border-[#e4e4ea] px-[11px] py-1.5 text-[12px] font-medium text-[#6a6a6a]"
    }
  >
    {checked ? "✓ " : ""}
    {children}
  </span>
);

const Toggle = ({ on = true }: { on?: boolean }) => (
  <span
    className={cn(
      "flex h-6 w-11 shrink-0 items-center rounded-full px-0.5",
      on ? "justify-end bg-[#222222]" : "justify-start bg-[#dcdcdc]",
    )}
  >
    <span className="block size-5 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.2)]" />
  </span>
);

export const PreviewToggleRow = ({
  title,
  note,
  on = true,
}: {
  title: string;
  note: string;
  on?: boolean;
}) => (
  <div className="flex items-center justify-between gap-3 py-2.5">
    <div className="min-w-0">
      <p className="text-[13.5px] font-semibold text-foreground">{title}</p>
      <p className="mt-0.5 text-[12px] font-medium leading-snug text-[#929292]">{note}</p>
    </div>
    <Toggle on={on} />
  </div>
);

/* ── Primitivi usati dentro i cartelli ──────────────────────────────── */

/** Riga titolo + nota, senza toggle: le "tante impostazioni" elencate. */
const CardRow = ({ title, note }: { title: string; note: string }) => (
  <div className="flex items-start gap-2.5 border-b border-[#f2f2f2] py-2.5 last:border-b-0">
    <span className="mt-[5px] block size-[7px] shrink-0 rounded-full bg-[#cfcfcf]" />
    <div className="min-w-0">
      <p className="text-[13.5px] font-semibold text-foreground">{title}</p>
      <p className="mt-0.5 text-[12px] font-medium leading-snug text-[#929292]">{note}</p>
    </div>
  </div>
);

/** Riga etichetta → valore (prezzi, cutoff, penale). */
const CardValueRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between gap-3 border-b border-[#f2f2f2] py-2.5 last:border-b-0">
    <span className="text-[13px] font-medium text-[#6a6a6a]">{label}</span>
    <span className="text-[13.5px] font-bold text-foreground">{value}</span>
  </div>
);

/** Riga della lista mezzi/allievi dentro il cartello (fondo grigio, badge). */
const CardTile = ({
  title,
  meta,
  badge,
  tone = "plain",
}: {
  title: string;
  meta: string;
  badge?: string;
  tone?: "plain" | "ok";
}) => (
  <div className="mb-2 flex items-center justify-between gap-3 rounded-[14px] bg-[#f5f5f5] px-3.5 py-3 last:mb-0">
    <div className="min-w-0">
      <p className="text-[13.5px] font-bold text-foreground">{title}</p>
      <p className="mt-0.5 text-[12.5px] font-medium text-[#929292]">{meta}</p>
    </div>
    {badge ? (
      <span
        className={cn(
          "shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold",
          tone === "ok"
            ? "bg-[#e6f6ec] text-[#177e45]"
            : "border border-[#e4e4ea] bg-white text-foreground",
        )}
      >
        {badge}
      </span>
    ) : null}
  </div>
);

const CardMiniLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.7px] text-[#929292]">{children}</p>
);

/* ── Contenuto dei cartelli, 1:1 dal prototipo ──────────────────────── */

type LockedPaneCard = {
  title: string;
  /** Riga sotto il titolo, dove il prototipo la ha. */
  subtitle?: string;
  /** Mini-anteprima dentro il cartello. Assente = cartello generico. */
  preview?: React.ReactNode;
  /** Paragrafo di beneficio sopra i CTA. Il prototipo a volte non lo ha. */
  description?: string;
};

export const LOCKED_PANE_CARDS: Record<string, LockedPaneCard> = {
  /* ── Prenotazioni e allievi ───────────────────────────────────────── */
  "bookings:generali": {
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
          <PreviewChip>30 min</PreviewChip>
          <PreviewChip>45 min</PreviewChip>
          <PreviewChip checked>60 min</PreviewChip>
          <PreviewChip>90 min</PreviewChip>
        </div>
        <PreviewToggleRow
          title="Solo orari tondi"
          note="Proponi agli allievi solo orari pieni (16:00, 17:00, ecc.)"
        />
        <PreviewToggleRow
          title="Festività non prenotabili"
          note="I giorni festivi restano chiusi alle prenotazioni"
        />
      </>
    ),
    description:
      "Gli allievi prenotano da soli dall'app, dentro le regole che imposti tu: l'agenda si riempie senza telefonate.",
  },
  "bookings:limiti": {
    title: "Limiti di prenotazione",
    preview: (
      <>
        <CardRow
          title="Stop alle prenotazioni last-minute"
          note="Oltre le 19:30 non si prenota più per il giorno dopo"
        />
        <CardRow
          title="Massimo di guide a settimana"
          note="3 guide per allievo, superabili con conferma"
        />
        <CardRow
          title="Riempi le fasce più vuote"
          note="Chi è libero in una fascia poco richiesta prenota lì"
        />
        <CardRow
          title="Blocca chi ha troppe guide da pagare"
          note="Prenotazioni sospese finché non salda"
        />
      </>
    ),
    description:
      "Tante impostazioni per gestire tutto in tranquillità. E se non ti servono, puoi sempre far prenotare solo gli istruttori.",
  },
  "bookings:guide": {
    title: "Scambi tra allievi",
    subtitle:
      "Un imprevisto? Gli allievi si scambiano le guide da soli, senza passare dalla segreteria.",
    preview: (
      <>
        <CardTile title="Allievo 1" meta="Guida · mar 14:00 → 15:00" badge="Propone lo scambio" />
        <CardTile title="Allievo 2" meta="Guida · mar 14:00 → 15:00" badge="✓ Accetta" tone="ok" />
        <div className="mt-4">
          <CardMiniLabel>E c&apos;è tanto altro</CardMiniLabel>
          <div className="flex flex-wrap gap-2">
            <PreviewChip checked>Presenza automatica</PreviewChip>
            <PreviewChip checked>Guide di gruppo</PreviewChip>
            <PreviewChip checked>Gruppi visibili agli allievi</PreviewChip>
          </div>
        </div>
      </>
    ),
  },
  "bookings:app": {
    title: "App allievi",
    preview: (
      <>
        <PreviewToggleRow
          title="Mostra note nell'app allievi"
          note="Le note degli istruttori dopo ogni guida, direttamente in app"
        />
        <PreviewToggleRow
          title="Consenti scelta istruttore"
          note="L'allievo sceglie con chi fare la guida quando prenota"
        />
        <div className="mt-3.5 rounded-[14px] bg-[#f5f5f5] px-4 py-3.5">
          <CardMiniLabel>Anteprima · Nota nell&apos;app</CardMiniLabel>
          <p className="text-[12.5px] font-bold text-foreground">Nota di Valerio · guida di oggi</p>
          <p className="mt-1 text-[13px] leading-[1.45] text-[#5a5a66]">
            Ottimi progressi in parcheggio, la prossima volta rivediamo le rotonde.
          </p>
        </div>
      </>
    ),
    description:
      "Decidi tu cosa vedono gli allievi in app: note delle guide e scelta dell'istruttore.",
  },
  "bookings:crediti": {
    title: "Crediti e prezzi",
    preview: (
      <>
        <PreviewToggleRow
          title="Crediti guida"
          note="Le guide si pagano con crediti caricati dall'autoscuola"
        />
        <div className="mt-2.5">
          <CardValueRow label="Guida da 30 minuti" value="25 €" />
          <CardValueRow label="Guida da 60 minuti" value="50 €" />
          <CardValueRow label="Cutoff annullamento" value="48 ore prima" />
          <CardValueRow label="Penale" value="100% del prezzo" />
        </div>
      </>
    ),
    description:
      "Crediti, prezzi e penali si applicano da soli: annullamenti tardivi e guide senza credito risultano da pagare.",
  },

  /* ── Policy tipi guida ────────────────────────────────────────────── */
  policy: {
    title: "Policy tipi guida",
    preview: (
      <>
        <PreviewToggleRow
          title="Richiedi almeno 1 guida per tipo"
          note="Ogni allievo completa una guida per ogni tipo selezionato"
        />
        <div className="mt-3">
          <CardMiniLabel>Configura per tipo di guida</CardMiniLabel>
          <div className="grid grid-cols-3 gap-2">
            <PreviewChip checked>Manovre</PreviewChip>
            <PreviewChip checked>Urbano</PreviewChip>
            <PreviewChip>Extraurbano</PreviewChip>
            <PreviewChip checked>Notturna</PreviewChip>
            <PreviewChip>Autostrada</PreviewChip>
            <PreviewChip>Parcheggio</PreviewChip>
          </div>
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
        <PreviewToggleRow
          title="Promemoria mattutino"
          note="La mattina del giorno della guida, alle 07:30"
        />
        <div className="my-2.5 h-px bg-[#f0f0f0]" />
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-[13.5px] font-semibold text-foreground">Modalità di invio</span>
          <span className="flex gap-1.5">
            <PreviewChip checked>Notifica</PreviewChip>
            <PreviewChip checked>WhatsApp</PreviewChip>
            <PreviewChip>Email</PreviewChip>
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
      <>
        <CardTile title="Veicolo 1" meta="HA996EF · B · Manuale" badge="Disponibile" tone="ok" />
        <CardTile title="Veicolo 2" meta="GY355GJ · B · Automatico" badge="In guida · 16:00" />
      </>
    ),
    description:
      "Disponibilità, categoria, cambio e chi può usarli: più dettagli, zero sovrapposizioni.",
  },

  /* ── Segretaria ───────────────────────────────────────────────────── */
  "voice:linea": {
    title: "Linea telefonica",
    subtitle:
      "Un numero dedicato a cui la segretaria AI risponde 24/7, mentre tu resti sulle guide.",
    preview: (
      <div className="rounded-[16px] bg-[#f5f5f5] px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#e6f6ec]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M5 4h3l2 5-2 1a11 11 0 0 0 5 5l1-2 5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"
                stroke="#177e45"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.7px] text-[#929292]">
              Chiamata in arrivo
            </p>
            <p className="mt-0.5 text-[15px] font-bold text-foreground">+39 340 776 2201</p>
          </div>
        </div>
        <p className="mt-3 flex items-center gap-2 text-[12.5px] font-semibold text-[#177e45]">
          <span className="block size-[7px] rounded-full bg-[#177e45]" />
          Risponde l&apos;AI
        </p>
      </div>
    ),
  },
  "voice:comportamento": {
    title: "Comportamento ed azioni",
    subtitle:
      "Decidi cosa può fare e come si presenta: saluto personalizzato, FAQ e prenotazioni vocali.",
    preview: (
      <>
        <div className="rounded-[16px] bg-[#f5f5f5] px-4 py-3.5 text-[13px] leading-[1.5] text-[#5a5a66]">
          &ldquo;Scuola Guida Montreal, buongiorno! Sono l&apos;assistente virtuale
          dell&apos;autoscuola, come posso aiutarti?&rdquo;
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <PreviewChip checked>FAQ autoscuola</PreviewChip>
          <PreviewChip checked>Info lezioni</PreviewChip>
          <PreviewChip checked>Prenota guida</PreviewChip>
        </div>
      </>
    ),
  },
  "voice:orari": {
    title: "Orari e registrazioni",
    subtitle: "Scegli giorni e fasce orarie in cui risponde, e cosa registrare delle chiamate.",
    preview: (
      <>
        <div className="rounded-[16px] bg-[#f5f5f5] px-4 py-3.5">
          <CardMiniLabel>Registrazione</CardMiniLabel>
          <div className="flex items-center gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#222222]">
              <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden>
                <path d="M8 5l11 7-11 7V5Z" fill="#ffffff" />
              </svg>
            </span>
            <span className="h-[3px] flex-1 rounded-full bg-[#dcdcdc]">
              <span className="block h-full w-[38%] rounded-full bg-[#222222]" />
            </span>
            <span className="shrink-0 text-[12.5px] font-semibold text-[#6a6a6a]">0:42</span>
          </div>
        </div>
        <div className="mt-3 rounded-[16px] bg-[#f5f5f5] px-4 py-3.5">
          <CardMiniLabel>Trascrizione</CardMiniLabel>
          <p className="text-[13px] leading-[1.5] text-[#5a5a66]">
            Buongiorno, sono Marco Rossi. Volevo sapere se avete disponibilità questa settimana per
            una guida, preferibilmente il pomeriggio…
          </p>
        </div>
      </>
    ),
  },
  "voice:istruzioni": {
    title: "Istruzioni",
    subtitle:
      "Dai alla segretaria le informazioni della tua autoscuola: risponde seguendo le tue regole.",
    preview: (
      <div className="rounded-[16px] bg-[#f5f5f5] px-4 py-3.5">
        <CardMiniLabel>Cosa sa la segretaria</CardMiniLabel>
        <ul className="space-y-1.5">
          {[
            "Rinnovo patente: documenti, costi e tempi",
            "Prezzi patente nuova → rimanda alla mail",
            "Orari segreteria: 9:00–12:00 e 15:30–18:30",
          ].map((line) => (
            <li key={line} className="flex items-start gap-2 text-[13px] leading-[1.45] text-[#5a5a66]">
              <span className="mt-[2px] shrink-0 font-bold text-[#177e45]">✓</span>
              {line}
            </li>
          ))}
        </ul>
      </div>
    ),
  },

  /* ── Sezioni che il prototipo non ha: stessa forma, senza anteprima ── */
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

/** I due pulsanti, identici in ogni cartello. */
function CtaRow() {
  return (
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
      <h3 className="text-[21px] font-bold tracking-[-0.7px] text-foreground">{card.title}</h3>
      {lead ? (
        <p className="mt-2 text-[14px] font-medium leading-[1.45] text-[#5a5a66]">{lead}</p>
      ) : null}
      {card.preview ? <div className="mt-[18px]">{card.preview}</div> : null}
      {card.preview && card.description ? (
        <>
          <div className="my-[18px] h-px bg-[#efeff2]" />
          <p className="mb-4 text-center text-[13.5px] font-medium leading-[1.5] text-muted-foreground">
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

export function LockedSettingsPane({ pane }: { pane: string }) {
  // Sede: stato vuoto, non cartello (vedi LocationsEmptyState).
  const tabs = SUB_TABS[pane];
  const [subTab, setSubTab] = React.useState(() => tabs?.[0]?.key ?? "");

  // La sezione cambia: si riparte dalla prima scheda, come le pane vere.
  React.useEffect(() => {
    setSubTab(SUB_TABS[pane]?.[0]?.key ?? "");
  }, [pane]);

  if (pane === "locations") return <LocationsEmptyState />;

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
          <div className="w-full max-w-[420px] rounded-[22px] bg-white p-[26px_24px_24px] shadow-[0_26px_70px_rgba(10,20,30,0.32)]">
            <LockedCardBody card={card} />
          </div>
        </div>
      </div>
    </div>
  );
}
