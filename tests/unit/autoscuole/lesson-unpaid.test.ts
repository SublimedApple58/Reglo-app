import {
  isLessonUnpaid,
  unpaidLessonCandidatesWhere,
  type UnpaidLessonFields,
} from "@/lib/autoscuole/lesson-unpaid";
import {
  resolveUnpaidAutoBlock,
  type MemberBlockState,
} from "@/lib/autoscuole/unpaid-auto-block";

// REG-634 — le guide reali dell'allieva che ha segnalato il bug (Autoscuola
// Robatto, pagamento manuale, soglia 5). La penale del 10/9 13:00 è stata
// rimossa dallo storico ma conserva `charged` + `unpaid`.
const CABRAS_LESSONS: UnpaidLessonFields[] = [
  // 14/7 no-show con penale addebitata
  { status: "no_show", manualPaymentStatus: "unpaid", creditApplied: false, lateCancellationAction: "charged", cancellationKind: null },
  // 10/9 12:00 rimossa dallo storico
  { status: "cancelled", manualPaymentStatus: null, creditApplied: false, lateCancellationAction: null, cancellationKind: "record_cleanup" },
  // 10/9 13:00 penale addebitata, poi rimossa dallo storico
  { status: "cancelled", manualPaymentStatus: "unpaid", creditApplied: false, lateCancellationAction: "charged", cancellationKind: "record_cleanup" },
  // 14/10 e 20/10 (x2) svolte, non pagate
  { status: "completed", manualPaymentStatus: null, creditApplied: false, lateCancellationAction: null, cancellationKind: null },
  { status: "completed", manualPaymentStatus: "unpaid", creditApplied: false, lateCancellationAction: null, cancellationKind: null },
  { status: "completed", manualPaymentStatus: "unpaid", creditApplied: false, lateCancellationAction: null, cancellationKind: null },
];

const ROBATTO = { enabled: true, threshold: 5 };

describe("REG-634 — guide rimosse dallo storico e blocco per debito", () => {
  it("non conta una penale rimossa dallo storico", () => {
    expect(
      isLessonUnpaid(
        { status: "cancelled", manualPaymentStatus: "unpaid", lateCancellationAction: "charged", cancellationKind: "record_cleanup" },
        true,
      ),
    ).toBe(false);
  });

  it("non conta una guida svolta rimossa dallo storico (keepInHours)", () => {
    expect(isLessonUnpaid({ status: "completed", cancellationKind: "record_cleanup" }, true)).toBe(false);
  });

  it("caso Cabras: 4 guide da pagare, non 5", () => {
    expect(CABRAS_LESSONS.filter((l) => isLessonUnpaid(l, true))).toHaveLength(4);
  });

  it("caso Cabras: con 4 sotto soglia 5 il blocco automatico si toglie e non torna", () => {
    const autoBlocked: MemberBlockState = {
      bookingBlocked: true,
      bookingBlockReason: "unpaid_threshold",
      unpaidBlockClearedAtCount: null,
    };
    const released = resolveUnpaidAutoBlock(autoBlocked, 4, ROBATTO);
    expect(released).toEqual({
      changed: true,
      bookingBlocked: false,
      bookingBlockReason: null,
      unpaidBlockClearedAtCount: null,
    });
    // Il tentativo di prenotazione successivo ricalcola 4: niente nuovo blocco.
    const unblocked: MemberBlockState = {
      bookingBlocked: false,
      bookingBlockReason: null,
      unpaidBlockClearedAtCount: null,
    };
    expect(resolveUnpaidAutoBlock(unblocked, 4, ROBATTO)).toEqual({ changed: false });
  });
});

// Il pre-filtro Prisma deve lasciar passare OGNI guida che il predicato conta:
// se escludesse qualcosa, il conteggio server tornerebbe a divergere.
type Where = Record<string, unknown>;
const matchField = (value: unknown, cond: unknown): boolean => {
  if (cond === null) return value === null;
  if (typeof cond === "object" && cond !== null) {
    const c = cond as { in?: unknown[]; not?: unknown };
    if (c.in) return c.in.includes(value);
    if ("not" in c) return value !== null && value !== c.not; // semantica SQL
  }
  return value === cond;
};
const matches = (row: Record<string, unknown>, where: Where): boolean =>
  Object.entries(where).every(([key, cond]) => {
    if (key === "AND") return (cond as Where[]).every((w) => matches(row, w));
    if (key === "OR") return (cond as Where[]).some((w) => matches(row, w));
    return matchField(row[key], cond);
  });

describe("unpaidLessonCandidatesWhere", () => {
  const statuses = ["completed", "checked_in", "cancelled", "no_show", "scheduled", "pending_review"];
  const payments = [null, "unpaid", "paid"];
  const actions = [null, "charged", "dismissed"];
  const kinds = [null, "manual_cancel", "record_cleanup"];
  const rows: UnpaidLessonFields[] = [];
  for (const status of statuses)
    for (const manualPaymentStatus of payments)
      for (const lateCancellationAction of actions)
        for (const cancellationKind of kinds)
          for (const creditApplied of [false, true])
            rows.push({ status, manualPaymentStatus, lateCancellationAction, cancellationKind, creditApplied });

  it.each([true, false])("coincide con isLessonUnpaid (manualMode=%s)", (manualMode) => {
    const where = unpaidLessonCandidatesWhere(manualMode);
    for (const row of rows) {
      expect({ row, selected: matches(row, where) }).toEqual({
        row,
        selected: isLessonUnpaid(row, manualMode),
      });
    }
  });
});
