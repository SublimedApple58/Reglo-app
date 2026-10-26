/**
 * "Guida da pagare non saldata": definizione UNICA (REG-634).
 *
 * La usano il blocco automatico per debito (prenotazione da app, lista Allievi,
 * scheda allievo, sblocco manuale), il pallino/filtro "Da pagare" del drawer
 * web e gli ex allievi. Modulo puro, senza Prisma: lo importano anche i client
 * component. Il mobile ne ha una copia gemella in
 * `reglo-mobile/src/utils/lessonPayments.ts`: vanno cambiate insieme.
 *
 * Prima di REG-634 la scheda allievo escludeva le guide rimosse dallo storico
 * e gli altri conteggi no: la scheda toglieva il blocco, la prenotazione lo
 * rimetteva al primo tentativo.
 */

const normalizeStatus = (value: string) => value.trim().toLowerCase();

/** Guide effettuate: da pagare solo in pagamento manuale. */
const DONE_STATUSES = ["completed", "checked_in"];
/** Guide saltate: da pagare solo se la penale è stata addebitata. */
const MISSED_STATUSES = ["cancelled", "no_show"];

/**
 * Marcatore di "Rimuovi dallo storico": la guida esce da storico, agenda e da
 * tutti i conteggi, debito compreso, anche se conserva la penale addebitata.
 */
export const RECORD_CLEANUP_KIND = "record_cleanup";

/**
 * Filtro Prisma "non rimossa dallo storico". In Prisma `{ not: "x" }` non
 * include le righe NULL, quindi serve l'OR esplicito.
 */
export const NOT_CLEANED_UP_WHERE = {
  OR: [
    { cancellationKind: null },
    { cancellationKind: { not: RECORD_CLEANUP_KIND } },
  ],
};

/**
 * Campi che servono al predicato. `cancellationKind` è obbligatorio di
 * proposito: chi conta il debito deve selezionarlo, o il compilatore lo ferma.
 */
export type UnpaidLessonFields = {
  status: string;
  manualPaymentStatus?: string | null;
  creditApplied?: boolean | null;
  lateCancellationAction?: string | null;
  cancellationKind: string | null;
};

/** Select Prisma minimo per valutare `isLessonUnpaid`. */
export const UNPAID_LESSON_SELECT = {
  status: true,
  manualPaymentStatus: true,
  creditApplied: true,
  lateCancellationAction: true,
  cancellationKind: true,
} as const;

export function isCompanyManualMode(config: {
  enabled: boolean;
  lessonCreditFlowEnabled: boolean;
  lessonCreditsRequired: boolean;
}): boolean {
  return (
    (!config.enabled && !config.lessonCreditFlowEnabled) ||
    (config.lessonCreditFlowEnabled && !config.lessonCreditsRequired)
  );
}

export function isLessonUnpaid(l: UnpaidLessonFields, manualMode: boolean): boolean {
  if (l.cancellationKind === RECORD_CLEANUP_KIND) return false;
  if (l.creditApplied) return false;
  if (l.manualPaymentStatus === "paid") return false;
  const s = normalizeStatus(l.status);
  return (
    (DONE_STATUSES.includes(s) && manualMode) ||
    (MISSED_STATUSES.includes(s) &&
      l.lateCancellationAction === "charged" &&
      l.manualPaymentStatus === "unpaid")
  );
}

/**
 * Filtro Prisma che restringe la lettura alle sole guide che POSSONO essere da
 * pagare. È un pre-filtro: il conteggio applica comunque `isLessonUnpaid` sulle
 * righe lette, così la regola resta una sola. Serve a non leggere tutto lo
 * storico (e a non doverlo troncare con un `take`).
 */
export function unpaidLessonCandidatesWhere(manualMode: boolean) {
  const branches: Array<Record<string, unknown>> = [
    {
      status: { in: MISSED_STATUSES },
      lateCancellationAction: "charged",
      manualPaymentStatus: "unpaid",
    },
  ];
  if (manualMode) branches.push({ status: { in: DONE_STATUSES } });
  return {
    creditApplied: false,
    AND: [
      NOT_CLEANED_UP_WHERE,
      { OR: [{ manualPaymentStatus: null }, { manualPaymentStatus: { not: "paid" } }] },
      { OR: branches },
    ],
  };
}
