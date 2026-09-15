/**
 * Email segnaposto per gli utenti creati SENZA credenziali d'app.
 *
 * `User.email` è obbligatoria e unica a schema, ma gli allievi di un consorzio
 * (REG-464) nascono spesso con soli nome, cognome e telefono: l'app non è
 * obbligatoria per loro. A questi account assegniamo un indirizzo sintetico su
 * un dominio riservato — stesso precedente degli account anonimizzati
 * (`deleted+<id>@deleted.reglo.local`, vedi lib/account-deletion.ts) — e lo
 * nascondiamo ovunque in UI: `displayEmail` restituisce null, così l'interfaccia
 * mostra "—" invece di un indirizzo finto.
 *
 * Un account con email segnaposto non ha password (`User.password = null`) e
 * quindi non può accedere: le credenziali si aggiungono dopo, se servono.
 */

export const PLACEHOLDER_EMAIL_DOMAIN = "no-app.reglo.local";

/** Indirizzo sintetico univoco per un utente senza credenziali. */
export const buildPlaceholderEmail = (seed: string): string =>
  `allievo+${seed}@${PLACEHOLDER_EMAIL_DOMAIN}`;

export const isPlaceholderEmail = (email: string | null | undefined): boolean =>
  typeof email === "string" && email.toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);

/** L'email da mostrare in UI: null quando è un segnaposto (→ "—"). */
export const displayEmail = (email: string | null | undefined): string | null =>
  !email || isPlaceholderEmail(email) ? null : email;
