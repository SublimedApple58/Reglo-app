/**
 * REG-783 — crediti guida a guide o a tempo (minuti). Funzioni pure, usabili
 * anche lato client.
 *
 * L'autoscuola tiene i crediti in una sola unità (`limits.lessonCreditUnit`):
 * - "lessons": ogni guida scala 1, qualunque sia la durata;
 * - "minutes": ogni guida scala la sua durata in minuti.
 * Il passaggio da un'unità all'altra converte tutti i saldi (vedi
 * `lesson-credit-switch.ts`), quindi un saldo è sempre nell'unità corrente.
 *
 * Regole decise da Tiziano (24/11/2026, casi limite in docs/features/payments.md):
 * - si rende sempre nell'unità di adesso;
 * - guida pagata a guide e resa dopo il passaggio a minuti → la sua durata al
 *   momento del rimborso (non la guida convertita);
 * - guida pagata a minuti e resa dopo il ritorno a guide → 1 guida;
 * - stessa unità → quanto la guida aveva consumato davvero (`creditAmount`).
 */
import { formatDrivingMinutes, lessonMinutes } from "./weekly-limit";

export type LessonCreditUnit = "lessons" | "minutes";

export type CreditRemainderPolicy = "floor" | "ceil" | "round";

export const CREDIT_MINUTES_PER_LESSON_MIN = 15;
export const CREDIT_MINUTES_PER_LESSON_MAX = 240;
export const DEFAULT_CREDIT_MINUTES_PER_LESSON = 60;

export function parseLessonCreditUnit(value: unknown): LessonCreditUnit {
  return value === "minutes" ? "minutes" : "lessons";
}

export function parseRemainderPolicy(value: unknown): CreditRemainderPolicy {
  return value === "floor" || value === "ceil" ? value : "round";
}

/** Quanto costa una guida nell'unità data: 1, oppure la durata in minuti. */
export function creditCost(unit: LessonCreditUnit, startsAt: Date, endsAt: Date | null | undefined): number {
  return unit === "minutes" ? lessonMinutes(startsAt, endsAt) : 1;
}

/** Quanto ha consumato una guida pagata a credito. Null = guida pagata prima di REG-783 = 1 guida. */
export function paidCredit(appointment: {
  creditAmount?: number | null;
  creditUnit?: string | null;
}): { amount: number; unit: LessonCreditUnit } {
  if (appointment.creditUnit == null || appointment.creditAmount == null) return { amount: 1, unit: "lessons" };
  return { amount: appointment.creditAmount, unit: parseLessonCreditUnit(appointment.creditUnit) };
}

/**
 * Quanto si rende di una guida pagata a credito, nell'unità di adesso.
 * Vedi le regole in testa al file.
 */
export function refundAmount({
  currentUnit,
  appointment,
}: {
  currentUnit: LessonCreditUnit;
  appointment: {
    startsAt: Date;
    endsAt: Date | null;
    creditAmount?: number | null;
    creditUnit?: string | null;
  };
}): number {
  const paid = paidCredit(appointment);
  if (paid.unit === currentUnit) return paid.amount;
  return currentUnit === "minutes" ? lessonMinutes(appointment.startsAt, appointment.endsAt) : 1;
}

/** Un saldo nell'unità nuova, col resto trattato (solo da minuti a guide). */
export function convertCreditBalance({
  amount,
  fromUnit,
  toUnit,
  minutesPerLesson,
  remainderPolicy,
}: {
  amount: number;
  fromUnit: LessonCreditUnit;
  toUnit: LessonCreditUnit;
  minutesPerLesson: number;
  remainderPolicy: CreditRemainderPolicy;
}): { amount: number; remainderMinutes: number } {
  if (fromUnit === toUnit) return { amount, remainderMinutes: 0 };
  if (toUnit === "minutes") return { amount: amount * minutesPerLesson, remainderMinutes: 0 };
  const exact = amount / minutesPerLesson;
  const lessons =
    remainderPolicy === "floor" ? Math.floor(exact) : remainderPolicy === "ceil" ? Math.ceil(exact) : Math.round(exact);
  // Positivo = minuti in più regalati, negativo = minuti persi.
  return { amount: lessons, remainderMinutes: lessons * minutesPerLesson - amount };
}

/** Un saldo a parole: «3 guide», «1 guida», «5 ore e 30», «50 minuti», «0 ore». */
export function formatCredits(unit: LessonCreditUnit, amount: number): string {
  if (unit === "minutes") return amount <= 0 ? "0 ore" : formatDrivingMinutes(amount);
  return `${amount} ${amount === 1 ? "guida" : "guide"}`;
}

/** Un movimento a parole, col segno: «+2 ore e 30», «−1 guida». */
export function formatCreditDelta(unit: LessonCreditUnit, delta: number): string {
  return `${delta >= 0 ? "+" : "−"}${formatCredits(unit, Math.abs(delta))}`;
}

/** Il resto della conversione a parole: «30 minuti in più», «15 minuti persi». */
export function formatRemainder(remainderMinutes: number): string | null {
  if (!remainderMinutes) return null;
  const abs = formatDrivingMinutes(Math.abs(remainderMinutes));
  return remainderMinutes > 0 ? `${abs} in più` : `${abs} persi`;
}

const roundTo5 = (minutes: number) => Math.max(5, Math.round(minutes / 5) * 5);

/**
 * REG-788: esempi concreti per spiegare cosa succede ai minuti che avanzano
 * passando a guide, senza termini tecnici: «2 ore e 20 → 2 guide».
 * «Al più vicino» mostra un caso sotto e uno sopra la mezza guida.
 */
export function remainderPolicyExamples(
  minutesPerLesson: number,
): { policy: CreditRemainderPolicy; examples: string[] }[] {
  const low = 2 * minutesPerLesson + roundTo5(minutesPerLesson / 3);
  const high = 2 * minutesPerLesson + roundTo5((2 * minutesPerLesson) / 3);
  const line = (amount: number, remainderPolicy: CreditRemainderPolicy) => {
    const { amount: lessons } = convertCreditBalance({
      amount,
      fromUnit: "minutes",
      toUnit: "lessons",
      minutesPerLesson,
      remainderPolicy,
    });
    return `${formatDrivingMinutes(amount)} → ${formatCredits("lessons", lessons)}`;
  };
  return [
    { policy: "round", examples: [line(low, "round"), line(high, "round")] },
    { policy: "floor", examples: [line(low, "floor")] },
    { policy: "ceil", examples: [line(low, "ceil")] },
  ];
}
