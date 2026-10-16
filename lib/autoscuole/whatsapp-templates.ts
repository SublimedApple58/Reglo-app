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

export type WhatsAppTemplate = {
  /** Nome su Meta: minuscolo, underscore. È la chiave dell'invio. */
  name: string;
  category: WhatsAppTemplateCategory;
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
    name: "promemoria_guida_allievo",
    category: "utility",
    variables: ["nome", "quando", "durata"],
    body:
      "Ciao {{1}}, ti ricordiamo la tua guida di {{2}}, della durata di {{3}} minuti. " +
      "A presto!",
  },
  morning_reminder_student: {
    name: "promemoria_guida_mattutino",
    category: "utility",
    variables: ["nome", "ora"],
    body: "Ciao {{1}}, oggi hai la guida alle {{2}}. Ci vediamo!",
  },
  day_before_reminder_student: {
    name: "promemoria_guida_giorno_prima",
    category: "utility",
    variables: ["nome", "quando"],
    body: "Ciao {{1}}, domani hai la guida: {{2}}. A domani!",
  },
  // L'esame non porta mai l'orario: la convocazione la dà l'autoscuola e può
  // cambiare fino all'ultimo (decisione del 31/07, richiesta Macchiavello).
  exam_reminder_student: {
    name: "promemoria_esame_allievo",
    category: "utility",
    variables: ["nome", "data"],
    body:
      "Ciao {{1}}, il {{2}} hai l'esame di guida. Orario e luogo ti verranno " +
      "comunicati dall'autoscuola. In bocca al lupo!",
  },
  appointment_reminder_instructor: {
    name: "promemoria_guida_istruttore",
    category: "utility",
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
    name: "guida_annullata_allievo",
    category: "utility",
    variables: ["nome", "appuntamento"],
    body:
      "Ciao {{1}}, {{2}} non si terrà più. " +
      "Contatta l'autoscuola per riprenotarla.",
  },
  appointment_rescheduled: {
    name: "guida_spostata_allievo",
    category: "utility",
    variables: ["nome", "appuntamento", "prima", "adesso"],
    body:
      "Ciao {{1}}, {{2}} si sposta: non più {{3}}, ma {{4}}. " +
      "Ci vediamo nel nuovo orario!",
  },
  appointment_location_changed: {
    name: "guida_cambio_luogo",
    category: "utility",
    variables: ["nome", "appuntamento", "luogo"],
    body:
      "Ciao {{1}}, cambia il luogo di ritrovo per {{2}}: ora è {{3}}. " +
      "Ci vediamo lì!",
  },
  // Come il promemoria esame, non promette un orario: `quando` porta l'ora solo
  // quando l'autoscuola l'ha davvero definita, altrimenti è la sola data.
  exam_scheduled: {
    name: "esame_fissato_allievo",
    category: "utility",
    variables: ["nome", "quando"],
    body:
      "Ciao {{1}}, il tuo esame di guida è fissato: {{2}}. " +
      "Il luogo ti verrà comunicato dall'autoscuola. In bocca al lupo!",
  },
  case_deadline: {
    name: "scadenza_documento_allievo",
    category: "utility",
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
