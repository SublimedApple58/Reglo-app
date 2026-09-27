"use client";

/**
 * Anteprime **finte ma verosimili** delle Impostazioni, per lo sfondo sfocato
 * delle sezioni non comprate (REG-429).
 *
 * Prima dietro il cartello c'erano barre grigie: si capiva che qualcosa
 * mancava, non *cosa*. Qui ci sono i campi veri di quella sezione, con valori
 * plausibili — sfocati, ma riconoscibili. È la stessa idea dell'agenda demo:
 * niente chiamate al server, nessun dato di altre autoscuole, solo la forma
 * della funzione che si comprerebbe.
 *
 * I controlli riusano i primitivi delle card (`LockedSettingsPane`), che sono
 * già copiati dal prototipo: così sfondo e cartello parlano la stessa lingua.
 */

import { FakeSelect, FieldLabel, PreviewChip, PreviewToggleRow } from "./LockedSettingsPane";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="border-b border-[#f0f0f0] pb-7 last:border-b-0">
    <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.7px] text-[#929292]">{title}</p>
    {children}
  </section>
);

const Row = ({
  title,
  note,
  value,
}: {
  title: string;
  note?: string;
  value: React.ReactNode;
}) => (
  <div className="flex items-center justify-between gap-6 py-3">
    <div className="min-w-0">
      <p className="text-[14.5px] font-medium text-foreground">{title}</p>
      {note ? <p className="mt-0.5 text-[12.5px] text-[#929292]">{note}</p> : null}
    </div>
    <div className="shrink-0">{value}</div>
  </div>
);

const ListCard = ({
  title,
  meta,
  right,
}: {
  title: string;
  meta: string;
  right?: React.ReactNode;
}) => (
  <div className="flex items-center justify-between gap-4 border-b border-[#f2f2f2] py-3.5 last:border-b-0">
    <div className="min-w-0">
      <p className="text-[14.5px] font-semibold text-foreground">{title}</p>
      <p className="mt-0.5 truncate text-[12.5px] text-[#929292]">{meta}</p>
    </div>
    {right ?? <span className="shrink-0 text-[13px] font-semibold text-[#444444] underline">Scopri</span>}
  </div>
);

function BookingsPreview() {
  return (
    <div className="space-y-7">
      <Section title="Generali">
        <div className="grid grid-cols-2 gap-5">
          <div>
            <FieldLabel>Settimane di disponibilità</FieldLabel>
            <FakeSelect>4 settimane</FakeSelect>
          </div>
          <div>
            <FieldLabel>Prenotazioni aperte dal</FieldLabel>
            <FakeSelect>31 mar 2026</FakeSelect>
          </div>
          <div>
            <FieldLabel>Chi può prenotare</FieldLabel>
            <FakeSelect>Allievi e istruttori</FakeSelect>
          </div>
          <div>
            <FieldLabel>Durata prenotazione allievo</FieldLabel>
            <FakeSelect>60 minuti</FakeSelect>
          </div>
        </div>
      </Section>
      <Section title="Limiti">
        <PreviewToggleRow
          title="Solo orari tondi"
          note="Proponi agli allievi solo orari pieni (16:00, 17:00, ecc.)"
        />
        <PreviewToggleRow
          title="Festività non prenotabili"
          note="I giorni segnati come festivi sul calendario restano chiusi"
        />
        <PreviewToggleRow
          title="Limite guide settimanali"
          note="Massimo 3 guide a settimana per allievo"
        />
      </Section>
    </div>
  );
}

function PolicyPreview() {
  return (
    <div className="space-y-7">
      <Section title="Obbligo per tipo">
        <PreviewToggleRow
          title="Richiedi almeno 1 guida per tipo"
          note="Ogni allievo completa una guida per ogni tipo selezionato"
        />
      </Section>
      <Section title="Configura per tipo di guida">
        <div className="grid grid-cols-3 gap-2.5">
          <PreviewChip checked>Manovre</PreviewChip>
          <PreviewChip checked>Urbano</PreviewChip>
          <PreviewChip>Extraurbano</PreviewChip>
          <PreviewChip checked>Notturna</PreviewChip>
          <PreviewChip>Autostrada</PreviewChip>
          <PreviewChip>Parcheggio</PreviewChip>
        </div>
      </Section>
    </div>
  );
}

function RemindersPreview() {
  return (
    <div className="space-y-7">
      <Section title="Promemoria">
        <div className="grid grid-cols-2 gap-5">
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
        <PreviewToggleRow
          title="Promemoria il giorno prima"
          note="La sera prima, alle 19:00"
        />
      </Section>
      <Section title="Modalità di invio">
        <div className="flex gap-2.5">
          <PreviewChip checked>Notifica</PreviewChip>
          <PreviewChip checked>WhatsApp</PreviewChip>
          <PreviewChip>Email</PreviewChip>
        </div>
      </Section>
    </div>
  );
}

function VehiclesPreview() {
  return (
    <div className="space-y-7">
      <Section title="Percorso patente di default">
        <div className="grid grid-cols-2 gap-5">
          <div>
            <FieldLabel>Categoria</FieldLabel>
            <FakeSelect>B (auto)</FakeSelect>
          </div>
          <div>
            <FieldLabel>Cambio</FieldLabel>
            <FakeSelect>Manuale</FakeSelect>
          </div>
        </div>
      </Section>
      <Section title="Veicoli">
        <ListCard title="Fiat 500" meta="HA996EF · B · Manuale · 00:00–23:30" />
        <ListCard title="Lancia Ypsilon" meta="GY355GJ · B · Automatico · 08:00–19:00" />
        <ListCard title="Yamaha MT-07" meta="FA119TK · A2 · Manuale · 09:00–18:00" />
      </Section>
    </div>
  );
}

function InstructorsPreview() {
  return (
    <div className="space-y-7">
      <Section title="Istruttori">
        <ListCard title="Marco Bianchi" meta="17:00–20:00 · Lun, Mar, Mer, Gio" />
        <ListCard title="Laura Conti" meta="07:00–17:00 · Lun, Mar, Mer, Gio, Ven, Sab" />
        <ListCard title="Davide Ferri" meta="Nessuna disponibilità settimanale" />
        <ListCard title="Sara Greco" meta="11:00–13:00, 15:00–17:00 · Lun–Ven" />
      </Section>
    </div>
  );
}

function LocationsPreview() {
  return (
    <div className="space-y-7">
      <Section title="Sede">
        <Row
          title="Autoscuola Montreal"
          note="Via Giuseppe Garibaldi 12, Genova"
          value={<span className="text-[13px] font-semibold text-[#444444] underline">Modifica</span>}
        />
      </Section>
      <Section title="Luoghi extra">
        <ListCard title="Stazione Brignole" meta="Piazza Giuseppe Verdi, Genova" />
        <ListCard title="Piazzale Kennedy" meta="Corso Marconi, Genova" />
      </Section>
    </div>
  );
}

function EvaluationPreview() {
  return (
    <div className="space-y-7">
      <Section title="Pagellino">
        <PreviewToggleRow
          title="Valutazione a fine guida"
          note="L'istruttore dà un voto su ogni voce che scegli tu"
        />
      </Section>
      <Section title="Voci valutate">
        <div className="grid grid-cols-2 gap-2.5">
          <PreviewChip checked>Frizione e partenze</PreviewChip>
          <PreviewChip checked>Parcheggio</PreviewChip>
          <PreviewChip checked>Precedenze</PreviewChip>
          <PreviewChip>Autostrada</PreviewChip>
        </div>
      </Section>
    </div>
  );
}

function AspettoPreview() {
  return (
    <div className="space-y-7">
      <Section title="Agenda">
        <div className="grid grid-cols-2 gap-5">
          <div>
            <FieldLabel>Colore dei blocchi</FieldLabel>
            <FakeSelect>Per durata</FakeSelect>
          </div>
          <div>
            <FieldLabel>Ordine delle colonne</FieldLabel>
            <FakeSelect>Personalizzato</FakeSelect>
          </div>
        </div>
      </Section>
      <Section title="Istruttori in agenda">
        <ListCard title="Marco Bianchi" meta="Prima colonna" right={<span className="text-[#c4c4c4]">⠿</span>} />
        <ListCard title="Laura Conti" meta="Seconda colonna" right={<span className="text-[#c4c4c4]">⠿</span>} />
      </Section>
    </div>
  );
}

function VoicePreview() {
  return (
    <div className="space-y-7">
      <Section title="Segretaria AI">
        <PreviewToggleRow title="Risposta automatica" note="Risponde quando non rispondi tu" />
        <div className="mt-3 rounded-[14px] border border-[#ececec] px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.6px] text-[#929292]">
            Letto all&apos;inizio di ogni chiamata
          </p>
          <p className="mt-1.5 text-[13.5px] leading-[1.5] text-[#444444]">
            &ldquo;Autoscuola Montreal, buongiorno! Sono l&apos;assistente virtuale
            dell&apos;autoscuola e sono qui per rispondere alle tue domande.&rdquo;
          </p>
        </div>
      </Section>
      <Section title="Chiamate in sospeso">
        <ListCard title="Marco Rossi" meta="oggi 14:32 · prezzi del pacchetto guide" />
        <ListCard title="Laura Conti" meta="oggi 11:08 · spostare la guida di giovedì" />
      </Section>
    </div>
  );
}

/** Anteprima per pane. Assente = nessuno sfondo, solo il cartello. */
export const DEMO_SETTINGS_PREVIEWS: Record<string, React.ReactNode> = {
  bookings: <BookingsPreview />,
  policy: <PolicyPreview />,
  reminders: <RemindersPreview />,
  vehicles: <VehiclesPreview />,
  instructors: <InstructorsPreview />,
  locations: <LocationsPreview />,
  evaluation: <EvaluationPreview />,
  aspetto: <AspettoPreview />,
  voice: <VoicePreview />,
};
