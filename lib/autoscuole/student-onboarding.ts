/**
 * Onboarding dell'allievo in app (REG-802) — regola PURA degli step.
 *
 * Il server decide cosa manca e lo manda in `GET /api/mobile/me` come
 * `onboarding: { steps: [{ key, required }] } | null`; l'app mostra solo quegli
 * step, con lo stesso scheletro del «Primo accesso». Le app vecchie ignorano il
 * campo.
 *
 * - Profilo mai completato (`User.profileCompletedAt` null: account creato
 *   dall'autoscuola con email e password, mai entrato in app) → «primo accesso
 *   normale»: nome, email (solo da confermare), cellulare.
 * - Profilo completo ma senza cellulare → solo il cellulare (era il PhoneGate).
 * - Percorso patente (REG-812): chi si è registrato da solo e non ha ancora
 *   scelto patente e cambio → step `license`, salvato da
 *   `PATCH /api/autoscuole/me/license-path`. Le app precedenti non conoscono lo
 *   step, lo saltano e mostrano il loro blocco nelle tab (`needsLicensePath`).
 * - Disponibilità: vedi `studentAvailabilityStepMode` (bloccante in fase guide,
 *   rimandabile prima, assente per chi ha finito).
 *
 * «Prima volta in app» = `profileCompletedAt` null. La migrazione
 * `20261127160000_backfill_profile_completed_at` lo valorizza per chi ha già
 * usato l'app; da lì in poi lo valorizzano la fine dell'onboarding, il Primo
 * accesso col telefono e la registrazione dall'app.
 */

import type { StudentAvailabilityStepMode } from "@/lib/autoscuole/student-availability";
import { normalizeToE164 } from "@/lib/phone-e164";

export type OnboardingStepKey = "name" | "email" | "phone" | "license" | "availability";
export type OnboardingStep = { key: OnboardingStepKey; required: boolean };
export type StudentOnboarding = { steps: OnboardingStep[] } | null;

export const buildOnboardingSteps = (input: {
  profileCompleted: boolean;
  hasPhone: boolean;
  /** Email vera (non segnaposto `@no-app.reglo.local`): solo allora si conferma. */
  hasRealEmail: boolean;
  availabilityMode: StudentAvailabilityStepMode;
  /**
   * REG-812: allievo registrato da solo che non ha ancora scelto patente e
   * cambio (era il blocco REG-410 dentro le tab). Viene PRIMA delle
   * disponibilità: prima si sa che patente fa, poi quando può guidare.
   */
  needsLicensePath?: boolean;
}): StudentOnboarding => {
  const steps: OnboardingStep[] = [];
  if (!input.profileCompleted) {
    steps.push({ key: "name", required: true });
    if (input.hasRealEmail) steps.push({ key: "email", required: true });
    steps.push({ key: "phone", required: true });
  } else if (!input.hasPhone) {
    steps.push({ key: "phone", required: true });
  }
  if (input.needsLicensePath) steps.push({ key: "license", required: true });
  if (input.availabilityMode !== "none") {
    steps.push({ key: "availability", required: input.availabilityMode === "required" });
  }
  return steps.length ? { steps } : null;
};

/**
 * Cellulare dell'allievo in E.164, o il messaggio d'errore. Con +39 servono
 * almeno 9 cifre nazionali (un cellulare italiano ne ha 9–10); per gli altri
 * prefissi vale la regola generale di `normalizeToE164`.
 */
export const validateStudentPhone = (
  raw: string,
): { ok: true; e164: string } | { ok: false; message: string } => {
  const normalized = normalizeToE164(raw);
  if (!normalized.ok) {
    return {
      ok: false,
      message: normalized.reason === "troppo corto" ? "Il numero sembra incompleto." : "Il numero di cellulare non è valido.",
    };
  }
  if (normalized.e164.startsWith("+39") && normalized.e164.length - 3 < 9) {
    return { ok: false, message: "Il numero sembra incompleto." };
  }
  return { ok: true, e164: normalized.e164 };
};
