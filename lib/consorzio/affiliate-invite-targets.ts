/**
 * Chi è "da invitare" fra le autoscuole consorziate (REG-454).
 *
 * Una regola sola, in un posto solo, perché finora era scritta a mano in
 * **tre** posti che sono andati in disaccordo: il pulsante "Invita i titolari
 * non invitati" della sezione Autoscuole del consorzio contava tutto ciò che
 * non era `active` (quindi anche le già invitate e le non collegate), il
 * pulsante gemello del backoffice contava solo le collegate, e l'anteprima del
 * modale ne contava altri. Il consorzio vedeva «37 da invitare» e apriva un
 * modale che diceva «Invita 0 titolari».
 *
 * La regola, scritta una volta:
 * - si invita chi **non può ancora entrare** e **non ha un invito valido in
 *   corso**: `not_linked`, `not_invited`, `expired`. `invited` no (l'invito è
 *   partito e vale), `active` no (ci entra già);
 * - serve un'email in anagrafica: senza, non c'è dove mandarla — quelle scuole
 *   finiscono in `missingEmail`, che la UI dice invece di tacere;
 * - si raggruppa per email, perché **l'invito è del titolare, non della sede**:
 *   in produzione 37 consorziate hanno 24 email distinte e una copre cinque
 *   sedi ODOS. Un gruppo = una mail = un titolare.
 *
 * `not_linked` sta dentro perché dal fix del 2026-10-02 l'invito crea da sé la
 * Company della consorziata che non ce l'ha ancora (`sendOwnerInvite`): non
 * essere collegata non è più un motivo per non poter invitare, ed era il
 * motivo per cui in produzione i 37 titolari erano ininvitabili.
 */

/** Stato dell'accesso del titolare di una consorziata. */
export type AffiliateAccessStatus =
  | "not_linked" // nessuna Company: la crea l'invito
  | "not_invited" // Company creata, nessun invito mai partito
  | "invited" // invito pendente e ancora valido
  | "expired" // invito partito ma scaduto: va rimandato
  | "active"; // esiste almeno un titolare che accede

/** Il minimo che serve per decidere: lo soddisfa `AffiliateSchoolRow`. */
export type InviteCandidate = {
  schoolId: string;
  schoolName: string;
  email: string | null;
  access: AffiliateAccessStatus;
};

/** Un titolare da invitare: una mail, le sue sedi. */
export type OwnerInviteGroup = {
  email: string;
  schools: string[];
  schoolIds: string[];
};

export type AffiliateInviteTargets = {
  /** Un gruppo per email distinta, i titolari con più sedi per primi. */
  groups: OwnerInviteGroup[];
  /** Quante sedi coprono quei gruppi (≥ `groups.length`). */
  schoolsCount: number;
  /** Nomi delle sedi da invitare che restano fuori per mancanza di email. */
  missingEmail: string[];
};

export const normalizeInviteEmail = (email: string | null | undefined): string =>
  (email ?? "").trim().toLowerCase();

/** true = questa scuola va invitata (a prescindere dall'email). */
export const needsOwnerInvite = (access: AffiliateAccessStatus): boolean =>
  access === "not_linked" || access === "not_invited" || access === "expired";

export function affiliateInviteTargets(rows: InviteCandidate[]): AffiliateInviteTargets {
  const groups = new Map<string, OwnerInviteGroup>();
  const missingEmail: string[] = [];

  for (const row of rows) {
    if (!needsOwnerInvite(row.access)) continue;
    const email = normalizeInviteEmail(row.email);
    if (!email) {
      missingEmail.push(row.schoolName);
      continue;
    }
    const group = groups.get(email) ?? { email, schools: [], schoolIds: [] };
    group.schools.push(row.schoolName);
    group.schoolIds.push(row.schoolId);
    groups.set(email, group);
  }

  const list = Array.from(groups.values()).sort((a, b) => b.schools.length - a.schools.length);
  return {
    groups: list,
    schoolsCount: list.reduce((total, group) => total + group.schools.length, 0),
    missingEmail,
  };
}
