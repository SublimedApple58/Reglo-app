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
    variables: ["nome", "quando", "durata", "autoscuola"],
    body:
      "Ciao {{1}}, ti ricordiamo la guida di {{2}} ({{3}} minuti). " +
      "A presto, {{4}}.",
  },
  morning_reminder_student: {
    name: "promemoria_guida_mattutino",
    category: "utility",
    variables: ["nome", "ora", "autoscuola"],
    body: "Ciao {{1}}, oggi hai la guida alle {{2}}. Ci vediamo! {{3}}.",
  },
  day_before_reminder_student: {
    name: "promemoria_guida_giorno_prima",
    category: "utility",
    variables: ["nome", "quando", "autoscuola"],
    body: "Ciao {{1}}, domani hai la guida: {{2}}. A domani! {{3}}.",
  },
  // L'esame non porta mai l'orario: la convocazione la dà l'autoscuola e può
  // cambiare fino all'ultimo (decisione del 31/07, richiesta Macchiavello).
  exam_reminder_student: {
    name: "promemoria_esame_allievo",
    category: "utility",
    variables: ["nome", "data", "autoscuola"],
    body:
      "Ciao {{1}}, il {{2}} hai l'esame di guida. Orario e luogo di presentazione " +
      "ti verranno comunicati dall'autoscuola. In bocca al lupo! {{3}}.",
  },
  appointment_reminder_instructor: {
    name: "promemoria_guida_istruttore",
    category: "utility",
    variables: ["nome_istruttore", "nome_allievo", "quando", "durata"],
    body: "Ciao {{1}}, guida con {{2}} il {{3}} ({{4}} minuti).",
  },
  case_deadline: {
    name: "scadenza_documento_allievo",
    category: "utility",
    variables: ["nome", "documento", "data", "autoscuola"],
    body:
      "Ciao {{1}}, il tuo {{2}} scade il {{3}}. Passa in segreteria per il rinnovo. {{4}}.",
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
