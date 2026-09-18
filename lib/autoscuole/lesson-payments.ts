/**
 * Permessi del tracciamento pagamento manuale di una guida (REG-450).
 *
 * Volutamente SEPARATO dai crediti: `canManageStudentCredits` (admin ∨ OWNER)
 * governa il ledger (grant/revoke, "copri con credito"), che resta in mano al
 * titolare. Qui si tocca solo `manualPaymentStatus` — "questa guida è stata
 * pagata?" — ed è un gesto di segreteria quotidiana che anche l'istruttore fa.
 *
 * NB: chi può segnare, segna QUALSIASI guida dell'allievo, non solo le proprie.
 * Una prima versione restringeva l'istruttore alle sue guide, per simmetria con
 * `updateAutoscuolaAppointmentDetails`; è stata rimossa di proposito: l'incasso
 * non è un dato didattico della guida, è un fatto amministrativo dell'allievo, e
 * chi incassa in autoscuola spesso non è l'istruttore che ha fatto quella guida.
 *
 * La copia gemella lato app è `reglo-mobile/src/utils/lessonPayments.ts`.
 */
export const canManageLessonPayments = (membership: {
  role: string;
  autoscuolaRole: string | null;
}): boolean =>
  membership.role === "admin" ||
  membership.autoscuolaRole === "OWNER" ||
  membership.autoscuolaRole === "INSTRUCTOR_OWNER" ||
  membership.autoscuolaRole === "INSTRUCTOR";
