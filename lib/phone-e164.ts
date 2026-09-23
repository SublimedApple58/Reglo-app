/**
 * Numeri di telefono in formato E.164 (`+39…`).
 *
 * Serve a WhatsApp — Meta accetta SOLO E.164 — ma non solo: è la forma giusta
 * anche per SMS e per la voce. In produzione, al 21/09/2026, **795 numeri su
 * 1.043 erano senza prefisso** (`3331234567`): con quelli WhatsApp fallirebbe
 * comunque, qualunque provider si scelga.
 *
 * Deliberatamente conservativo: quando un numero è ambiguo NON si inventa un
 * prefisso, si restituisce `null` e lo si lascia in pace. Meglio un numero non
 * convertito che un numero convertito male — un messaggio a uno sconosciuto è
 * peggio di un messaggio non mandato.
 */

/** Prefisso assunto quando il numero non ne ha uno. L'utenza di Reglo è italiana. */
export const DEFAULT_COUNTRY_CODE = "39";

export type PhoneNormalization =
  | { ok: true; e164: string; changed: boolean }
  | { ok: false; reason: "vuoto" | "troppo corto" | "troppo lungo" | "ambiguo" };

/** Via spazi, punti, trattini, parentesi e il prefisso `whatsapp:` se presente. */
const strip = (raw: string) =>
  raw
    .trim()
    .replace(/^whatsapp:/i, "")
    .replace(/[\s.\-() ‐-―]/g, "");

export function normalizeToE164(
  raw: string | null | undefined,
  defaultCountryCode: string = DEFAULT_COUNTRY_CODE,
): PhoneNormalization {
  if (!raw) return { ok: false, reason: "vuoto" };
  let value = strip(raw);
  if (!value) return { ok: false, reason: "vuoto" };

  // `0039…` e `+39…` sono la stessa cosa scritta in due modi.
  if (value.startsWith("00")) value = `+${value.slice(2)}`;

  if (value.startsWith("+")) {
    const digits = value.slice(1);
    if (!/^\d+$/.test(digits)) return { ok: false, reason: "ambiguo" };
    if (digits.length < 8) return { ok: false, reason: "troppo corto" };
    if (digits.length > 15) return { ok: false, reason: "troppo lungo" }; // E.164 si ferma a 15
    return { ok: true, e164: `+${digits}`, changed: `+${digits}` !== raw.trim() };
  }

  if (!/^\d+$/.test(value)) return { ok: false, reason: "ambiguo" };

  // Numero italiano già completo di prefisso ma senza il `+` (es. `393331234567`).
  // Lo si riconosce solo se quello che segue è un cellulare italiano plausibile,
  // altrimenti `39…` potrebbe essere l'inizio di un numero locale qualunque.
  if (value.startsWith(defaultCountryCode) && defaultCountryCode === "39") {
    const rest = value.slice(2);
    if (/^3\d{8,9}$/.test(rest)) {
      return { ok: true, e164: `+${value}`, changed: true };
    }
  }

  // Cellulare italiano senza prefisso: `3` + 8 o 9 cifre.
  if (defaultCountryCode === "39" && /^3\d{8,9}$/.test(value)) {
    return { ok: true, e164: `+${defaultCountryCode}${value}`, changed: true };
  }

  // Fisso italiano senza prefisso (`0…`): esiste in anagrafica ma su WhatsApp non
  // serve a niente. Si converte lo stesso — è comunque il formato giusto — ma solo
  // se la lunghezza è plausibile.
  if (defaultCountryCode === "39" && /^0\d{7,10}$/.test(value)) {
    return { ok: true, e164: `+${defaultCountryCode}${value}`, changed: true };
  }

  if (value.length < 8) return { ok: false, reason: "troppo corto" };
  return { ok: false, reason: "ambiguo" };
}

/** Vero se il numero è utilizzabile per WhatsApp (E.164, e non un fisso italiano). */
export function isWhatsAppCapable(e164: string): boolean {
  if (!/^\+\d{8,15}$/.test(e164)) return false;
  // I fissi italiani non hanno WhatsApp: inutile provarci e pagare il tentativo.
  if (e164.startsWith("+390")) return false;
  return true;
}

/**
 * Forma in cui salvare un numero in anagrafica.
 *
 * Converte in E.164 quando è possibile; quando il numero è ambiguo **restituisce
 * quello che l'utente ha scritto**, ripulito degli spazi, invece di rifiutarlo o
 * di inventare un prefisso. Due ragioni: non si perde un dato che la segreteria
 * ha inserito apposta, e non si blocca l'inserimento di un numero estero o
 * strano che magari è giusto.
 *
 * L'effetto è progressivo: da qui in avanti i numeri nuovi nascono già in E.164,
 * e il backfill si occupa di quelli vecchi.
 */
export function toStoredPhone(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = normalizeToE164(trimmed);
  return normalized.ok ? normalized.e164 : trimmed;
}
