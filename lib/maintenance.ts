/**
 * REG-773 — Modalità manutenzione dell'account autoscuola: regole pure,
 * senza DB, usabili anche dal client. Vedi docs/features/maintenance-mode.md.
 *
 * Il titolare la accende (o il backoffice), solo il backoffice la spegne.
 * Non tocca nessun dato: blocca accesso, UI e invii verso le persone.
 */

import { isOwner } from "@/lib/autoscuole/roles";

export type MaintenanceScope = "OWNER_ONLY" | "EVERYONE";

/** Messaggio d'errore (e `message` delle risposte API) di un accesso bloccato. */
export const COMPANY_MAINTENANCE = "COMPANY_MAINTENANCE";

export const MAINTENANCE_SCOPES: readonly MaintenanceScope[] = ["OWNER_ONLY", "EVERYONE"];

export const isMaintenanceScope = (value: unknown): value is MaintenanceScope =>
  value === "OWNER_ONLY" || value === "EVERYONE";

/**
 * Il membro con questo ruolo è bloccato? I titolari (OWNER e INSTRUCTOR_OWNER)
 * lo sono in entrambi gli ambiti; istruttori e allievi solo con EVERYONE.
 */
export function isMemberBlockedByMaintenance(
  scope: MaintenanceScope | null | undefined,
  autoscuolaRole: string | null | undefined,
): boolean {
  if (!scope) return false;
  if (scope === "EVERYONE") return true;
  return isOwner(autoscuolaRole);
}

/** Pubblico di un messaggio, come in `reminder-channels.ts`. */
export type MaintenanceAudience = "student" | "instructor" | "owner";

/**
 * Un messaggio verso questo pubblico va taciuto? Con EVERYONE tutto; con
 * OWNER_ONLY solo quelli diretti al titolare: allievi e istruttori usano
 * l'app normalmente e devono ricevere promemoria e avvisi.
 */
export function isAudienceSilencedByMaintenance(
  scope: MaintenanceScope | null | undefined,
  audience: MaintenanceAudience,
): boolean {
  if (!scope) return false;
  if (scope === "EVERYONE") return true;
  return audience === "owner";
}

/** Il nome scritto per conferma corrisponde a quello dell'autoscuola? */
export function confirmsCompanyName(typed: string, companyName: string): boolean {
  const normalize = (value: string) =>
    value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("it-IT");
  const expected = normalize(companyName);
  return expected.length > 0 && normalize(typed) === expected;
}

export const isMaintenanceError = (error: unknown): boolean =>
  error instanceof Error && error.message === COMPANY_MAINTENANCE;

export type MemberMaintenanceState = {
  scope: MaintenanceScope;
  since: string | null;
  /** La manutenzione blocca proprio questo membro (dipende dal ruolo). */
  blocked: boolean;
} | null;

/** Lo stato che l'app mobile riceve per ogni autoscuola (login e `/me`). */
export function describeMemberMaintenance(
  company: { maintenanceScope: MaintenanceScope | null; maintenanceSince: Date | null },
  autoscuolaRole: string | null | undefined,
): MemberMaintenanceState {
  if (!company.maintenanceScope) return null;
  return {
    scope: company.maintenanceScope,
    since: company.maintenanceSince?.toISOString() ?? null,
    blocked: isMemberBlockedByMaintenance(company.maintenanceScope, autoscuolaRole),
  };
}

/** Cosa legge chi prova a entrare (codice, invito, Aula) in un'autoscuola chiusa. */
export const MAINTENANCE_PUBLIC_MESSAGE =
  "Questa autoscuola è temporaneamente in manutenzione. Riprova più tardi.";

/**
 * In ambito EVERYONE si chiudono anche le porte d'ingresso pubbliche:
 * iscrizione con codice, inviti, QR istruttore, Aula live. Con OWNER_ONLY
 * restano aperte, tranne gli inviti da titolare (entrerebbe già bloccato).
 */
export function isEntryClosedByMaintenance(
  scope: MaintenanceScope | null | undefined,
  joiningAsOwner = false,
): boolean {
  if (!scope) return false;
  return scope === "EVERYONE" || joiningAsOwner;
}

/** Cosa sente chi chiama la segreteria AI di un'autoscuola in manutenzione per tutti. */
export const MAINTENANCE_VOICE_MESSAGE =
  "Il servizio è temporaneamente non disponibile. Ti chiediamo di riprovare più tardi.";
