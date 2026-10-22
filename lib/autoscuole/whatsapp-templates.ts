/**
 * Registro dei template WhatsApp (REG-500).
 *
 * Meta consente testo libero SOLO entro 24 ore da un messaggio dell'utente. Un
 * promemoria per la guida di domani è per definizione fuori da quella finestra,
 * quindi **ogni messaggio che parte per iniziativa nostra deve essere un template
 * approvato**. È il motivo per cui il vecchio `sendAutoscuolaWhatsApp({body})`
 * non poteva funzionare nemmeno con credenziali valide.
 *
 * Qui c'è la sola fonte di verità: nome del template su Meta, categoria,
 * variabili in ordine, e il testo italiano da sottomettere per l'approvazione.
 * Il testo NON viene mandato a runtime (lo rende Meta dal template approvato):
 * serve a tenere allineato quello che abbiamo sottomesso con quello che il
 * codice si aspetta, e a generare la lista per chi sottomette.
 *
 * Categorie e costo: `utility` è la fascia economica e non richiede opt-in
 * pubblicitario; `marketing` costa di più e lo richiede. I promemoria sono
 * utility — un comunicato promozionale no, e infatti non sta qui.
 */

/**
 * Due regole di Meta che hanno respinto la prima stesura di tutti e dieci i
 * testi (16/10/2026), e che qui si pagano in anticipo:
 *
 * 1. **Nessuna variabile a inizio o fine corpo** (`2388299`, «Leading or
 *    Trailing Params Not Allowed»). Un punto finale non basta: dopo l'ultima
 *    variabile ci vogliono parole. È il motivo per cui nessun testo si chiude
 *    con «… {{n}}.».
 * 2. **Rapporto variabili/parole** (`2388293`, «Params Words Ratio Exceeds
 *    Limit»): un testo corto con molte variabili viene rifiutato. Se serve
 *    allungare, si allungano **solo le parti fisse**.
 *
 * E una regola di prodotto, che viene prima delle due: **i messaggi non sono
 * firmati dall'autoscuola** (decisione di Tiziano, 16/10). Il mittente è già
 * «Reglo» nel telefono dell'allievo; mettere anche il nome della scuola in coda
 * faceva sembrare il messaggio una firma commerciale. Per questo la variabile
 * `autoscuola` non esiste più in nessun template, e le chiuse sono neutre
 * («A presto!», «Ci vediamo!»). Dove serve dire chi darà un'informazione, si
 * scrive «l'autoscuola» come parola fissa, non come variabile.
 */
export type WhatsAppTemplateCategory = "utility" | "authentication" | "marketing";

export type WhatsAppTemplateApproval = "approved" | "pending" | "rejected";

/**
 * Il piè di pagina di ogni template `_v3` (decisione di Tiziano del 22/10):
 * per gli allievi già in anagrafica il consenso è implicito, e la revoca deve
 * stare scritta nel primo messaggio che ricevono. Il testo di un template è
 * fisso, quindi «solo nel primo» non si può fare: sta in tutti. È statico, non
 * ha variabili, e il codice non lo manda — lo rende Meta.
 */
export const WHATSAPP_FOOTER = "Rispondi STOP per non ricevere più questi avvisi";

export type WhatsAppTemplate = {
  /**
   * Nome su Meta: minuscolo, underscore. È la chiave dell'invio.
   *
   * `_v3` (22/10): tutti e dieci risottomessi col piè di pagina STOP
   * (`WHATSAPP_FOOTER`), e i due riclassificati marketing riscritti.
   *
   * Il suffisso `_v2` non era una versione del testo: era la cicatrice del ritiro
   * del 16/10. Dopo aver cancellato i dieci template per sostituirne i testi,
   * Meta ha tenuto i nomi bloccati (`2388023`, «Message template language is
   * being deleted») per oltre venti minuti e sei tentativi, quindi si è
   * ripartiti col suffisso invece di aspettare un blocco di durata ignota.
   * Non rinominarli: un nome nuovo è un template nuovo da far approvare.
   */
  name: string;
  /**
   * La categoria **assegnata da Meta**, non quella chiesta: Meta riclassifica
   * a sua discrezione (il 22/10 due `_v2` sottomessi come utility sono tornati
   * marketing). `deliverWhatsApp` manda solo `utility`.
   */
  category: WhatsAppTemplateCategory;
  /**
   * `pending` finché Meta non approva. Un template non approvato non si manda:
   * il fornitore lo rifiuterebbe, e a registro finirebbe come errore invece
   * che come motivo leggibile.
   */
  approval: WhatsAppTemplateApproval;
  /**
   * La versione precedente su Meta, da usare finché questa non è approvata
   * (22/10: i `_v3` in attesa, gli 8 `_v2` utility già approvati). Stesse
   * variabili nello stesso ordine — se no non è un ripiego, è un altro template.
   */
  previous?: {
    name: string;
    category: WhatsAppTemplateCategory;
    approval: WhatsAppTemplateApproval;
  };
  /** Variabili {{1}}, {{2}}… nell'ordine esatto in cui Meta le sostituisce. */
  variables: readonly string[];
  /** Testo italiano sottomesso per l'approvazione (documentazione, non runtime). */
  body: string;
};

/**
 * Le chiavi sono i `kind` già usati dal codice dei promemoria, così il punto di
 * invio non deve inventarsi una mappatura.
 */
export const WHATSAPP_TEMPLATES = {
  appointment_reminder_student: {
    name: "promemoria_guida_allievo_v3",
    category: "utility",
    approval: "pending",
    previous: { name: "promemoria_guida_allievo_v2", category: "utility", approval: "approved" },
    variables: ["nome", "quando", "durata"],
    body:
      "Ciao {{1}}, ti ricordiamo la tua guida di {{2}}, della durata di {{3}} minuti. " +
      "A presto!",
  },
  morning_reminder_student: {
    name: "promemoria_guida_mattutino_v3",
    category: "utility",
    approval: "pending",
    previous: { name: "promemoria_guida_mattutino_v2", category: "marketing", approval: "approved" },
    variables: ["nome", "ora"],
    // `_v2` («oggi hai la guida alle {{2}}. Ci vediamo!») è stato riclassificato
    // marketing: troppo colloquiale, nessun legame esplicito con la prenotazione.
    body:
      "Ciao {{1}}, ti ricordiamo la guida prenotata per oggi alle {{2}}. " +
      "Per modifiche o disdette contatta l'autoscuola.",
  },
  day_before_reminder_student: {
    name: "promemoria_guida_giorno_prima_v3",
    category: "utility",
    approval: "pending",
    previous: { name: "promemoria_guida_giorno_prima_v2", category: "utility", approval: "approved" },
    variables: ["nome", "quando"],
    body: "Ciao {{1}}, domani hai la guida: {{2}}. A domani!",
  },
  // L'esame non porta mai l'orario: la convocazione la dà l'autoscuola e può
  // cambiare fino all'ultimo (decisione del 31/07, richiesta Macchiavello).
  exam_reminder_student: {
    name: "promemoria_esame_allievo_v3",
    category: "utility",
    approval: "pending",
    previous: { name: "promemoria_esame_allievo_v2", category: "utility", approval: "approved" },
    variables: ["nome", "data"],
    body:
      "Ciao {{1}}, il {{2}} hai l'esame di guida. Orario e luogo ti verranno " +
      "comunicati dall'autoscuola. In bocca al lupo!",
  },
  appointment_reminder_instructor: {
    name: "promemoria_guida_istruttore_v3",
    category: "utility",
    approval: "pending",
    previous: { name: "promemoria_guida_istruttore_v2", category: "utility", approval: "approved" },
    variables: ["nome_istruttore", "nome_allievo", "quando", "durata"],
    body:
      "Ciao {{1}}, hai una guida con {{2}} il {{3}}, della durata di {{4}} minuti. " +
      "Buona guida!",
  },
  /* ─────────── I quattro messaggi-evento (decisione Tiziano, 16/10) ────────
   *
   * Non sono promemoria: sono **cambi di programma**. Un allievo senza app oggi
   * non sa che la guida è saltata, spostata o che il ritrovo è un altro posto.
   * Gli inviti (gruppi, posti liberi, scambi) restano fuori per scelta: sono
   * proposte, non impegni presi, e valgono da soli più di tutto il resto in
   * bolletta.
   *
   * Nota sui testi: Meta approva una frase fissa, il codice riempie solo le
   * variabili. Per questo il soggetto («la tua guida» / «il tuo esame di
   * guida») è una variabile e i verbi sono scelti per reggere entrambi i generi
   * — «non si terrà più» e «si sposta» funzionano con guida e con esame,
   * «è stata annullata» no.
   */
  appointment_cancelled: {
    name: "guida_annullata_allievo_v3",
    category: "utility",
    approval: "pending",
    previous: { name: "guida_annullata_allievo_v2", category: "utility", approval: "approved" },
    variables: ["nome", "appuntamento"],
    body:
      "Ciao {{1}}, {{2}} non si terrà più. " +
      "Contatta l'autoscuola per riprenotarla.",
  },
  appointment_rescheduled: {
    name: "guida_spostata_allievo_v3",
    category: "utility",
    approval: "pending",
    previous: { name: "guida_spostata_allievo_v2", category: "marketing", approval: "approved" },
    variables: ["nome", "appuntamento", "prima", "adesso"],
    // Riscritto il 22/10: `_v2` («… si sposta … Ci vediamo nel nuovo orario!»)
    // era stato riclassificato marketing. Ora parla di prenotazione aggiornata.
    body:
      "Ciao {{1}}, abbiamo aggiornato la prenotazione per {{2}}: l'appuntamento " +
      "passa da {{3}} a {{4}}. Per modifiche contatta l'autoscuola.",
  },
  appointment_location_changed: {
    name: "guida_cambio_luogo_v3",
    category: "utility",
    approval: "pending",
    previous: { name: "guida_cambio_luogo_v2", category: "utility", approval: "approved" },
    variables: ["nome", "appuntamento", "luogo"],
    body:
      "Ciao {{1}}, cambia il luogo di ritrovo per {{2}}: ora è {{3}}. " +
      "Ci vediamo lì!",
  },
  // Come il promemoria esame, non promette un orario: `quando` porta l'ora solo
  // quando l'autoscuola l'ha davvero definita, altrimenti è la sola data.
  exam_scheduled: {
    name: "esame_fissato_allievo_v3",
    category: "utility",
    approval: "pending",
    previous: { name: "esame_fissato_allievo_v2", category: "utility", approval: "approved" },
    variables: ["nome", "quando"],
    body:
      "Ciao {{1}}, il tuo esame di guida è fissato: {{2}}. " +
      "Il luogo ti verrà comunicato dall'autoscuola. In bocca al lupo!",
  },
  case_deadline: {
    name: "scadenza_documento_allievo_v3",
    category: "utility",
    approval: "pending",
    previous: { name: "scadenza_documento_allievo_v2", category: "utility", approval: "approved" },
    variables: ["nome", "documento", "data"],
    body:
      "Ciao {{1}}, il tuo {{2}} scade il {{3}}. Passa in segreteria per il rinnovo.",
  },
} as const satisfies Record<string, WhatsAppTemplate>;

export type WhatsAppTemplateKind = keyof typeof WHATSAPP_TEMPLATES;

/**
 * I `kind` che NON passano da WhatsApp: sono inviti, non impegni presi.
 *
 * L'allievo non ha prenotato niente, quindi un invito perso non fa saltare una
 * guida — e sono il traffico che fa esplodere sia la bolletta sia il rischio di
 * segnalazione (457 broadcast in 30 giorni, fino a 183 destinatari ciascuno).
 * Restano su push. Decisione del 21/09/2026.
 */
export const PUSH_ONLY_KINDS = [
  "group_lesson_invite",
  "swap_offer",
  "empty_slot_notification",
  "waitlist_offer",
] as const;

/**
 * Il nome da mandare a Meta per questo messaggio: la versione corrente se è
 * approvata e utility, altrimenti la precedente alle stesse condizioni.
 * `null` = nessuna versione si può mandare (la cascata passa all'email).
 */
export function sendableTemplateName(template: WhatsAppTemplate): string | null {
  const candidates = [
    { name: template.name, category: template.category, approval: template.approval },
    ...(template.previous ? [template.previous] : []),
  ];
  const usable = candidates.find(
    (candidate) => candidate.approval === "approved" && candidate.category === "utility",
  );
  return usable?.name ?? null;
}

export function getWhatsAppTemplate(kind: WhatsAppTemplateKind): WhatsAppTemplate {
  return WHATSAPP_TEMPLATES[kind];
}

/** Le variabili nell'ordine che Meta si aspetta, da un oggetto con i valori. */
export function buildTemplateParameters(
  kind: WhatsAppTemplateKind,
  values: Record<string, string>,
): string[] {
  const template = WHATSAPP_TEMPLATES[kind];
  return template.variables.map((variable) => {
    const value = values[variable];
    if (value == null || value === "") {
      throw new Error(
        `Template ${template.name}: manca la variabile "${variable}". ` +
          `Meta rifiuta i template con parametri vuoti.`,
      );
    }
    // Meta rifiuta i parametri con a capo o tabulazioni.
    return value.replace(/\s+/g, " ").trim();
  });
}
