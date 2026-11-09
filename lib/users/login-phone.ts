/**
 * Accesso all'app col numero di telefono, in alternativa all'email.
 *
 * Gli allievi creati dall'autoscuola con solo telefono + password (richiesta
 * Ricca) entrano col numero: l'email resta il segnaposto di
 * `placeholder-email.ts` finché l'allievo non ne inserisce una sua.
 *
 * Il numero di accesso sta in `User.loginPhone`, sempre in E.164 e unico. NON
 * si usa `User.phone`: è un recapito, non è unico e in produzione è in buona
 * parte senza prefisso (vedi `lib/phone-e164.ts`).
 */

import { normalizeToE164 } from "@/lib/phone-e164";

/**
 * Il login riceve un solo campo, «email o telefono»: senza `@` è un telefono.
 * Le app già installate mandano questo valore nel campo `email`, quindi il
 * riconoscimento sta tutto qui sul server.
 */
export const isPhoneIdentifier = (identifier: string): boolean =>
  identifier.trim() !== "" && !identifier.includes("@");

/**
 * Forma E.164 di un numero di accesso, o null se non è un numero utilizzabile.
 * `333 1234567`, `+39 333 1234567` e `0039 333…` danno tutti `+393331234567`;
 * un numero estero va scritto col suo prefisso.
 */
export function normalizeLoginPhone(raw: string | null | undefined): string | null {
  const normalized = normalizeToE164(raw);
  return normalized.ok ? normalized.e164 : null;
}
