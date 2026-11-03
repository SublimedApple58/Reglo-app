import { prisma } from "@/db/prisma";
import { getLocationAvailabilityState } from "@/lib/autoscuole/member-locations";

/**
 * Codice inserito dall'allievo in registrazione (campo unico): autoscuola,
 * istruttore autonomo (REG-451) o luogo (REG-706). L'ordine di ricerca è
 * autoscuola → istruttore → luogo; i codici sono unici tra le tre tabelle.
 *
 * Il codice di un luogo vale solo con «Disponibilità per luogo» effettiva
 * (interruttore acceso + almeno 2 luoghi) e luogo non archiviato: altrimenti
 * è un codice non valido come gli altri (stesso messaggio generico).
 */
export type SignupInvite = {
  companyId: string;
  /** Codice istruttore: l'allievo entra nel suo gruppo. */
  assignedInstructorId: string | null;
  /** Codice luogo: l'allievo riceve il luogo (tra i suoi + principale). */
  locationId: string | null;
};

export type SignupInviteDeps = {
  findCompany: (code: string) => Promise<{ id: string } | null>;
  findInstructor: (
    code: string,
  ) => Promise<{ id: string; companyId: string; status: string; autonomousMode: boolean } | null>;
  findLocation: (
    code: string,
  ) => Promise<{ id: string; companyId: string; archivedAt: Date | null } | null>;
  locationModeEnabled: (companyId: string) => Promise<boolean>;
};

const defaultDeps: SignupInviteDeps = {
  findCompany: (code) =>
    prisma.company.findUnique({ where: { inviteCode: code }, select: { id: true } }),
  findInstructor: (code) =>
    prisma.autoscuolaInstructor.findUnique({
      where: { inviteCode: code },
      select: { id: true, companyId: true, status: true, autonomousMode: true },
    }),
  findLocation: (code) =>
    prisma.autoscuolaLocation.findUnique({
      where: { inviteCode: code },
      select: { id: true, companyId: true, archivedAt: true },
    }),
  locationModeEnabled: async (companyId) => (await getLocationAvailabilityState(companyId)).enabled,
};

export function normalizeSignupCode(raw: string | null | undefined): string {
  return (raw ?? "").trim().toUpperCase();
}

export async function resolveSignupInviteCode(
  rawCode: string | null | undefined,
  deps: SignupInviteDeps = defaultDeps,
): Promise<SignupInvite | null> {
  const code = normalizeSignupCode(rawCode);
  if (!code) return null;

  const company = await deps.findCompany(code);
  if (company) return { companyId: company.id, assignedInstructorId: null, locationId: null };

  // Codici istruttore: solo istruttori attivi in modalità autonoma.
  const instructor = await deps.findInstructor(code);
  if (instructor) {
    return instructor.status === "active" && instructor.autonomousMode
      ? { companyId: instructor.companyId, assignedInstructorId: instructor.id, locationId: null }
      : null;
  }

  const location = await deps.findLocation(code);
  if (!location || location.archivedAt) return null;
  if (!(await deps.locationModeEnabled(location.companyId))) return null;
  return { companyId: location.companyId, assignedInstructorId: null, locationId: location.id };
}
