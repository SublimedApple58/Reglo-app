/**
 * REG-767 — «Messaggio di benvenuto» su WhatsApp (scheda allievo e conferma
 * dopo la creazione).
 *
 * Il tasto apre WhatsApp (app o Web) con un link `wa.me` e il testo di presa in
 * carico già scritto: lo manda la segreteria dal suo telefono. Niente API
 * WhatsApp Business (quella è REG-500, per i promemoria automatici) e niente
 * registro «inviato»: Reglo non sa se il messaggio è partito davvero.
 *
 * Il testo è uno per azienda (autoscuola o consorzio), sta nei limits del
 * CompanyService come `studentWelcomeWhatsappTemplate` e si cambia in
 * Impostazioni → Promemoria e notifiche. Vedi docs/features/whatsapp-welcome.md.
 */

import { isWhatsAppCapable, normalizeToE164 } from "@/lib/phone-e164";
import { QUALIFICATION_BASE_VEHICLES, licenseCategoryShort } from "@/lib/autoscuole/license";

export const DEFAULT_WELCOME_TEMPLATE =
  "Ciao {nome}! Sono {staff} di {autoscuola}, abbiamo preso in carico la tua iscrizione per {categoria}: da adesso ti seguiamo noi";

/** Ancora del blocco nelle impostazioni: «Modifica messaggio» ci porta dritto. */
export const WELCOME_SECTION_ANCHOR = "messaggio-di-benvenuto";

/** Oltre questa lunghezza il testo non si salva (un messaggio, non una lettera). */
export const WELCOME_TEMPLATE_MAX_LENGTH = 1000;

export type WelcomePlaceholder = {
  token: string;
  /** Descrizione completa (suggerimento al passaggio del mouse). */
  label: string;
  /** La parola tappabile di «Inserisci» nelle impostazioni (REG-771 bis). */
  short: string;
  /** Solo per il consorzio: l'autoscuola consorziata da cui arriva l'allievo. */
  consortiumOnly?: boolean;
};

export const WELCOME_PLACEHOLDERS: WelcomePlaceholder[] = [
  { token: "{nome}", label: "Nome dell'allievo", short: "Nome" },
  { token: "{cognome}", label: "Cognome dell'allievo", short: "Cognome" },
  { token: "{staff}", label: "Il tuo nome", short: "Il tuo nome" },
  { token: "{autoscuola}", label: "Nome della tua autoscuola", short: "Autoscuola" },
  { token: "{categoria}", label: "Patente («la patente B»)", short: "Patente" },
  {
    token: "{scuola}",
    label: "Autoscuola di provenienza",
    short: "Scuola di provenienza",
    consortiumOnly: true,
  },
];

export type WelcomeValues = {
  nome: string;
  cognome: string;
  staff: string;
  autoscuola: string;
  categoria: string;
  /** Vuoto fuori dal consorzio: lì il segnaposto prende il nome dell'azienda. */
  scuola?: string | null;
};

/** Il testo salvato, o quello di default se non c'è o è vuoto. */
export function resolveWelcomeTemplate(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : DEFAULT_WELCOME_TEMPLATE;
}

/**
 * «la patente B», «la CQC persone», «il patentino ADR». Senza categoria resta
 * «la patente», che nella frase di default si legge comunque bene.
 */
export function licenseCategoryWithArticle(category: string | null | undefined): string {
  if (!category) return "la patente";
  if (category === "ADR") return "il patentino ADR";
  if (category in QUALIFICATION_BASE_VEHICLES) return `la ${licenseCategoryShort(category)}`;
  return `la patente ${category}`;
}

/** Il nome con cui si presenta chi scrive: il primo nome dell'utente. */
export function staffFirstName(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed || trimmed === "NO_NAME") return "";
  return trimmed.split(/\s+/)[0] ?? "";
}

/**
 * Sostituisce i segnaposto. Quelli sconosciuti restano come sono scritti, così
 * chi ha sbagliato a scriverne uno lo vede nell'anteprima invece di perderlo.
 */
export function renderWelcomeMessage(template: string, values: WelcomeValues): string {
  const map: Record<string, string> = {
    nome: values.nome.trim(),
    cognome: values.cognome.trim(),
    staff: values.staff.trim(),
    autoscuola: values.autoscuola.trim(),
    categoria: values.categoria.trim(),
    scuola: (values.scuola ?? "").trim() || values.autoscuola.trim(),
  };
  return template
    .replace(/\{\s*([a-zA-Z]+)\s*\}/g, (match, key: string) => {
      const value = map[key.toLowerCase()];
      return value === undefined ? match : value;
    })
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export type WhatsAppLink =
  | { state: "ready"; href: string; e164: string }
  | { state: "missing" }
  | { state: "invalid" };

/**
 * Link `wa.me` col testo precompilato, oppure perché non si può fare: numero
 * assente (→ «Aggiungi il numero») o non utilizzabile (→ «Numero non valido per
 * WhatsApp»: ambiguo, troppo corto, o un fisso italiano).
 */
export function buildWhatsAppLink(phone: string | null | undefined, text: string): WhatsAppLink {
  const normalized = normalizeToE164(phone);
  if (!normalized.ok) {
    return normalized.reason === "vuoto" ? { state: "missing" } : { state: "invalid" };
  }
  if (!isWhatsAppCapable(normalized.e164)) return { state: "invalid" };
  const digits = normalized.e164.slice(1);
  return {
    state: "ready",
    e164: normalized.e164,
    href: `https://wa.me/${digits}?text=${encodeURIComponent(text)}`,
  };
}

/**
 * REG-771 bis: inserisce un segnaposto fra `start` ed `end` (la selezione del
 * campo) aggiungendo gli spazi solo dove servono.
 */
export function insertToken(
  text: string,
  start: number,
  end: number,
  token: string,
): { text: string; caret: number } {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const pre = before && !/\s$/.test(before) ? " " : "";
  const post = after && !/^[\s.,!?:;)]/.test(after) ? " " : "";
  const head = `${before}${pre}${token}`;
  return { text: `${head}${post}${after}`, caret: head.length };
}
