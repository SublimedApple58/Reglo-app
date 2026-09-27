"use client";

/**
 * Fondali **finti ma verosimili** delle Impostazioni: quello che si intravede
 * dietro il cartello di una sezione non comprata (REG-429).
 *
 * Nel prototipo ogni sezione bloccata mostra il **contenuto vero della pagina**
 * dentro un wrapper `blur(3px) / opacity .55 / max-height 620px`, col titolo e
 * la barra delle sotto-tab fuori dalla sfocatura. Quindi qui non servono barre
 * grigie: servono i campi di quella sezione, con valori plausibili. È la stessa
 * idea dell'agenda demo — niente chiamate al server, nessun dato di altre
 * autoscuole, solo la forma della funzione che si comprerebbe.
 *
 * I testi sono presi dal prototipo standalone (sorgente, non a memoria: le
 * pagine sono stringhe HTML dentro il bundle, `config-tab-*` / `pa-group-*` /
 * `seg-group-*`). Le chiavi seguono le sotto-tab vere delle nostre pane
 * (`BookingsTab`, `VoiceSettingsPane`), così `pane:subtab` combacia con quello
 * che l'utente vede nella barra sopra.
 */

import { FakeSelect, FieldLabel, PreviewChip, PreviewToggleRow } from "./LockedSettingsPane";

/** Blocco-accordion come nelle pane vere: titolo, riga di spiegazione, campi. */
const Card = ({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children?: React.ReactNode;
}) => (
  <div className="rounded-[14px] border border-[#e8e8e8] bg-white px-5 py-4">
    <p className="text-[15px] font-semibold text-foreground">{title}</p>
    {note ? <p className="mt-1 text-[13px] leading-[1.45] text-[#929292]">{note}</p> : null}
    {children ? <div className="mt-3">{children}</div> : null}
  </div>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section>
    <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.7px] text-[#929292]">{title}</p>
    <div className="space-y-3">{children}</div>
  </section>
);

const Field = ({ label, value }: { label: string; value: string }) => (
  <div>
    <FieldLabel>{label}</FieldLabel>
    <FakeSelect>{value}</FakeSelect>
  </div>
);

const Row = ({ title, value }: { title: string; value: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-6 border-b border-[#f2f2f2] py-3 last:border-b-0">
    <p className="min-w-0 text-[14.5px] font-medium text-foreground">{title}</p>
    <div className="shrink-0">{value}</div>
  </div>
);

const ListCard = ({ title, meta }: { title: string; meta: string }) => (
  <div className="flex items-center justify-between gap-4 border-b border-[#f2f2f2] py-3.5 last:border-b-0">
    <div className="min-w-0">
      <p className="text-[14.5px] font-semibold text-foreground">{title}</p>
      <p className="mt-0.5 truncate text-[12.5px] text-[#929292]">{meta}</p>
    </div>
    <span className="shrink-0 text-[13px] font-semibold text-[#444444] underline">Scopri</span>
  </div>
);

/* ── Prenotazioni e allievi ─────────────────────────────────────────────── */

const BookingsGenerali = () => (
  <div className="space-y-5">
    <div className="grid grid-cols-2 gap-5">
      <Field label="Settimane di disponibilità" value="4 settimane" />
      <Field label="Prenotazioni aperte dal" value="31 mar 2026" />
      <Field label="Chi può prenotare" value="Allievi e istruttori" />
      <Field label="Modalità istruttore" value="Proposte automatiche" />
    </div>
    <div>
      <FieldLabel>Durata prenotazione allievo</FieldLabel>
      <div className="grid grid-cols-5 gap-2">
        <PreviewChip>30 min</PreviewChip>
        <PreviewChip>45 min</PreviewChip>
        <PreviewChip checked>60 min</PreviewChip>
        <PreviewChip>90 min</PreviewChip>
        <PreviewChip>120 min</PreviewChip>
      </div>
    </div>
    <Card title="Solo orari tondi" note="Proponi agli allievi solo orari pieni (16:00, 17:00, ecc.)">
      <PreviewToggleRow title="Solo orari tondi" note="Attivo per tutti i percorsi patente" />
    </Card>
    <Card
      title="Festività non prenotabili"
      note="I giorni segnati come festivi sul calendario (nazionali e locali) restano chiusi alle prenotazioni."
    >
      <PreviewToggleRow title="Festività non prenotabili" note="Mostra festività (14)" />
    </Card>
  </div>
);

const BookingsLimiti = () => (
  <div className="space-y-3">
    <Card
      title="Fascia oraria ristretta"
      note="Definisci una fascia oraria difficile da riempire. Gli allievi disponibili in quella fascia potranno prenotare solo lì."
    >
      <div className="grid grid-cols-2 gap-5">
        <Field label="Inizio fascia" value="11:00" />
        <Field label="Fine fascia" value="13:00" />
      </div>
    </Card>
    <Card
      title="Limite prenotazione"
      note="Imposta un orario limite il giorno prima entro cui gli allievi possono prenotare."
    >
      <div className="max-w-[240px]">
        <Field label="Orario di chiusura" value="19:30" />
      </div>
    </Card>
    <Card
      title="Limite guide settimanali"
      note="Limita il numero massimo di guide prenotabili da un allievo per settimana."
    >
      <Row title="Guide a settimana per allievo" value={<FakeSelect>3</FakeSelect>} />
      <PreviewToggleRow
        title="Precedenza a chi ha l'esame vicino"
        note="Gli allievi con l'esame in arrivo possono prenotare più guide degli altri"
      />
    </Card>
    <Card
      title="Blocca chi ha troppe guide da pagare"
      note="Quando un allievo supera il numero di guide da pagare non ancora saldate, le sue prenotazioni vengono bloccate automaticamente finché non salda."
    />
  </div>
);

const BookingsGuide = () => (
  <div className="space-y-3">
    <Card title="Sostituiscimi" note="Consenti agli allievi di proporre scambi guide tra loro.">
      <PreviewToggleRow
        title="Consenti scambi tra allievi"
        note="Gli allievi potranno proporre ad altri di prendere il loro posto in una guida futura"
      />
    </Card>
    <Card
      title="Annullamento guide"
      note="Consenti o blocca l'annullamento delle guide da parte degli allievi."
    >
      <PreviewToggleRow title="Consenti annullamento guide da app" note="Entro il cutoff impostato" />
    </Card>
    <Card
      title="Presenza automatica"
      note="Check-in automatico delle guide all'orario di inizio. L'istruttore può segnare solo l'assenza."
    />
    <Card
      title="Guide di gruppo"
      note="Guide con 1 istruttore e 1 veicolo per fino a 3 allievi abilitati. Si abilita l'allievo dal suo dettaglio."
    >
      <PreviewToggleRow
        title="Gruppi visibili agli allievi"
        note="Se disattivo, gli allievi vedono solo i gruppi in cui li inserisci tu"
      />
    </Card>
  </div>
);

const BookingsApp = () => (
  <div className="space-y-3">
    <Card title="Note allievi" note="Consenti agli allievi di vedere le note delle guide dall'app.">
      <PreviewToggleRow
        title="Mostra note nell'app allievi"
        note="Gli allievi potranno consultare le note rilasciate dagli istruttori dopo ogni guida"
      />
    </Card>
    <Card
      title="Preferenza istruttore"
      note="Consenti agli allievi di scegliere l'istruttore quando prenotano una guida."
    >
      <PreviewToggleRow
        title="Consenti scelta istruttore"
        note="Se non ne selezionano uno, vedranno le proposte di tutti gli istruttori"
      />
    </Card>
  </div>
);

const BookingsCrediti = () => (
  <div className="space-y-3">
    <Card title="Crediti guida e penali" note="Gestisci crediti e penali per annullamenti tardivi.">
      <PreviewToggleRow
        title="Crediti obbligatori per prenotare"
        note="Le guide senza credito risulteranno da pagare"
      />
      <div className="mt-3 grid grid-cols-2 gap-5">
        <Field label="Prezzo guida 30m" value="25 €" />
        <Field label="Prezzo guida 60m" value="50 €" />
        <Field label="Cutoff penale" value="48 ore prima" />
        <Field label="Penale" value="100% del prezzo" />
      </div>
    </Card>
  </div>
);

/* ── Policy, Promemoria, Veicoli, Istruttori ────────────────────────────── */

const PolicyBackdrop = () => (
  <div className="space-y-3">
    <Card
      title="Abilita policy tipi guida"
      note="Attiva le regole di copertura e orario per i tipi di guida."
    >
      <PreviewToggleRow
        title="Richiedi almeno 1 guida per tipo"
        note="Ogni allievo deve completare almeno una guida per ogni tipo selezionato"
      />
    </Card>
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

const RemindersBackdrop = () => (
  <div className="space-y-5">
    <div className="grid grid-cols-2 gap-5">
      <Field label="Promemoria allievo" value="60 minuti prima" />
      <Field label="Promemoria istruttore" value="30 minuti prima" />
    </div>
    <Card title="Promemoria mattutino" note="La mattina del giorno della guida, alle 07:30." />
    <Card title="Promemoria il giorno prima" note="La sera prima, alle 19:00." />
    <Section title="Modalità di invio">
      <div className="grid grid-cols-3 gap-2.5">
        <PreviewChip checked>Notifica</PreviewChip>
        <PreviewChip checked>WhatsApp</PreviewChip>
        <PreviewChip>Email</PreviewChip>
      </div>
    </Section>
  </div>
);

const VehiclesBackdrop = () => (
  <div className="space-y-5">
    <Card
      title="Percorso patente di default"
      note="Assegnato ai nuovi allievi alla registrazione."
    >
      <div className="grid grid-cols-2 gap-5">
        <Field label="Categoria" value="B (auto)" />
        <Field label="Cambio" value="Manuale" />
      </div>
    </Card>
    <Card
      title="Auto al seguito (moto)"
      note="Quando attivo, ogni guida moto prenota anche un'auto al seguito; entrambi i veicoli risultano occupati in agenda."
    />
    <div>
      <ListCard title="Veicolo 1" meta="HA996EF · B · Manuale · 00:00–23:30" />
      <ListCard title="Veicolo 2" meta="GY355GJ · B · Manuale · 00:00–23:30" />
      <ListCard title="Veicolo 3" meta="GY356GJ · B · Manuale · 00:00–23:30" />
    </div>
  </div>
);

const InstructorsBackdrop = () => (
  <div>
    <ListCard title="Istruttore 1" meta="17:00–20:00 · Lun, Mar, Mer, Gio" />
    <ListCard title="Istruttore 2" meta="07:00–17:00 · Lun, Mar, Mer, Gio, Ven, Sab" />
    <ListCard title="Istruttore 3" meta="Nessuna disponibilità settimanale" />
    <ListCard title="Istruttore 4" meta="11:00–13:00, 15:00–17:00 · Lun–Ven" />
  </div>
);

/* ── Segretaria ─────────────────────────────────────────────────────────── */

const VoiceLinea = () => (
  <div className="space-y-5">
    <Card title="Numero della segretaria" note="Il numero a cui rispondono le chiamate.">
      <p className="text-[15px] font-semibold text-foreground">+39 0542 371032</p>
    </Card>
    <Card title="Numero di telefono" note="Numero a cui trasferire la chiamata fuori orario.">
      <p className="text-[15px] font-semibold text-foreground">+39 045 832 5559</p>
    </Card>
    <Card title="Linea attiva" note="La segretaria risponde alle chiamate. Disattivala per fermarla.">
      <PreviewToggleRow title="Linea attiva" note="Risponde 24/7 negli orari impostati" />
    </Card>
  </div>
);

const VoiceComportamento = () => (
  <div className="space-y-5">
    <Section title="Azioni consentite">
      <p className="-mt-1 mb-2 text-[13px] text-[#929292]">
        Clicca per scegliere cosa può fare l&apos;assistente
      </p>
      <div className="grid grid-cols-3 gap-2.5">
        <PreviewChip checked>FAQ autoscuola</PreviewChip>
        <PreviewChip checked>Info lezioni</PreviewChip>
        <PreviewChip>Prenota guida</PreviewChip>
      </div>
    </Section>
    <Card
      title="Avviso legale"
      note="Avvisa il chiamante che la chiamata è gestita da un AI."
    />
    <Card
      title="Saluto personalizzato"
      note="Messaggio iniziale personalizzato prima della conversazione."
    >
      <div className="rounded-[12px] border border-[#ececec] px-4 py-3 text-[13.5px] leading-[1.5] text-[#444444]">
        Scuola Guida Montreal, buongiorno! Sono l&apos;assistente virtuale dell&apos;autoscuola e
        sono qui per rispondere alle tue domande! Per essere ricontattato dalla segreteria puoi
        lasciarmi il numero di telefono e ti farò ricontattare al più presto!
      </div>
      <p className="mt-1.5 text-[12px] text-[#929292]">234/500 caratteri</p>
    </Card>
  </div>
);

const VoiceOrari = () => (
  <div className="space-y-5">
    <Section title="Giorni attivi">
      <div className="grid grid-cols-7 gap-2">
        {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((day, index) => (
          <PreviewChip key={day} checked={index < 6}>
            {day}
          </PreviewChip>
        ))}
      </div>
    </Section>
    <div className="grid grid-cols-2 gap-5">
      <Field label="Inizio" value="09:00" />
      <Field label="Fine" value="18:30" />
    </div>
    <Card
      title="Trasferimento durante chiamata"
      note="Consenti alla segretaria AI di trasferire la chiamata al numero handoff in base a regole personalizzate."
    >
      <div className="rounded-[12px] border border-[#ececec] px-4 py-3 text-[13.5px] leading-[1.5] text-[#444444]">
        Se il cliente chiede di parlare direttamente con una persona fisica giraci la chiamata
      </div>
    </Card>
    <Card title="Registra audio" note="Salva una registrazione audio della chiamata." />
    <Card title="Trascrivi chiamate" note="Genera trascrizione testuale della conversazione." />
  </div>
);

const VoiceIstruzioni = () => (
  <div className="space-y-3">
    <Section title="Istruzioni personalizzate">
      <div className="rounded-[12px] border border-[#ececec] px-4 py-3.5 text-[13.5px] leading-[1.55] text-[#444444]">
        Di seguito hai tutte le informazioni per rispondere alle domande.
        <br />- Se chiedono informazioni per i prezzi della patente, chiedigli di scriverci una mail
        a info@scuolaguidamontreal.it
        <br />- Se chiedono info per il rinnovo patente: serve una foto e la patente, il costo
        totale comprensivo di tutto è di 105,00€. I tempi sono molto brevi.
        <br />- Gli orari di apertura della segreteria sono dalle 9:00 alle 12:00 il mattino e dalle
        15:30 alle 18:30 il pomeriggio.
      </div>
      <p className="text-[12px] text-[#929292]">
        Policy, tono comunicativo e regole operative dell&apos;assistente.
      </p>
    </Section>
  </div>
);


/* ── Sezioni fuori dal prototipo: fondale coi nostri campi veri ────────── */

const EvaluationBackdrop = () => (
  <div className="space-y-5">
    <Card
      title="Valutazione a fine guida"
      note="L'istruttore dà un voto su ogni voce che scegli tu, subito dopo la guida."
    >
      <PreviewToggleRow title="Pagellino attivo" note="Visibile all'allievo nell'app" />
    </Card>
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

const AspettoBackdrop = () => (
  <div className="space-y-5">
    <div className="grid grid-cols-2 gap-5">
      <Field label="Colore dei blocchi" value="Per durata" />
      <Field label="Ordine delle colonne" value="Personalizzato" />
    </div>
    <Section title="Istruttori in agenda">
      <div>
        <ListCard title="Istruttore 1" meta="Prima colonna" />
        <ListCard title="Istruttore 2" meta="Seconda colonna" />
        <ListCard title="Istruttore 3" meta="Terza colonna" />
      </div>
    </Section>
  </div>
);

/**
 * Fondale per pane (o `pane:subtab` dove la sezione ha le sotto-tab).
 * Assente = nessuno sfondo, solo il cartello.
 */
export const DEMO_SETTINGS_PREVIEWS: Record<string, React.ReactNode> = {
  "bookings:generali": <BookingsGenerali />,
  "bookings:limiti": <BookingsLimiti />,
  "bookings:guide": <BookingsGuide />,
  "bookings:app": <BookingsApp />,
  "bookings:crediti": <BookingsCrediti />,
  policy: <PolicyBackdrop />,
  reminders: <RemindersBackdrop />,
  vehicles: <VehiclesBackdrop />,
  instructors: <InstructorsBackdrop />,
  evaluation: <EvaluationBackdrop />,
  aspetto: <AspettoBackdrop />,
  "voice:linea": <VoiceLinea />,
  "voice:comportamento": <VoiceComportamento />,
  "voice:orari": <VoiceOrari />,
  "voice:istruzioni": <VoiceIstruzioni />,
};
