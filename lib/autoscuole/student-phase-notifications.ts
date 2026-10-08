import { sendAutoscuolaPushToUsers } from "@/lib/autoscuole/push";
import { notifyAutoscuolaUser, PUSH_ONLY } from "@/lib/autoscuole/notify";

export type StudentPhase = "AWAITING" | "TEORIA" | "PRATICA" | "PATENTATO";

type Copy = {
  title: string;
  body: string;
};

/**
 * Picks the celebratory copy for a phase transition. Returns null when the
 * transition is not user-facing (e.g. a regression or a no-op): in that
 * case we don't push anything.
 *
 * The copy uses leading emojis on the title so the OS-level banner is
 * immediately readable as a celebration.
 */
function copyFor(fromPhase: StudentPhase, toPhase: StudentPhase): Copy | null {
  if (fromPhase === toPhase) return null;

  // Forward, celebratory transitions
  if (fromPhase === "AWAITING" && toPhase === "TEORIA") {
    return {
      title: "🎉 Il tuo percorso è attivo!",
      body:
        "L'autoscuola ti ha appena attivato. Puoi iniziare subito a studiare per l'esame teorico.",
    };
  }
  if (toPhase === "PRATICA") {
    return {
      title: "🚗 Hai il foglio rosa!",
      body: "Ora puoi prenotare le tue prime guide. Buona strada!",
    };
  }
  if (toPhase === "PATENTATO") {
    return {
      title: "🏆 Sei patentato!",
      body: "Hai concluso il percorso. Congratulazioni per la patente!",
    };
  }

  // Backwards / neutral transitions (e.g. PRATICA → TEORIA, anything → AWAITING)
  // are intentionally silent: they typically represent an admin correction
  // and we don't want to ping the student.
  return null;
}

/**
 * Sends a celebratory push to the student when the owner advances their phase.
 *
 * Best-effort: failures are logged but never thrown, so the calling
 * server action keeps its happy-path semantics intact.
 */
export async function notifyStudentPhaseChange({
  companyId,
  studentUserId,
  fromPhase,
  toPhase,
}: {
  companyId: string;
  studentUserId: string;
  fromPhase: StudentPhase;
  toPhase: StudentPhase;
}): Promise<void> {
  const copy = copyFor(fromPhase, toPhase);
  if (!copy) return;

  await notifyAutoscuolaUser({
    companyId,
    kind: "student_phase_change",
    audience: "student",
    recipient: { userId: studentUserId },
    supports: PUSH_ONLY,
    title: copy.title,
    body: copy.body,
    data: { fromPhase, toPhase },
  });
}

/**
 * Un percorso patente nuovo che riparte (REG-458).
 *
 * Non passa da `notifyStudentPhaseChange` di proposito. Quella, su una
 * transizione verso PRATICA, direbbe «🚗 Hai il foglio rosa! Ora puoi prenotare
 * le tue **prime** guide»: a uno che la patente ce l'ha gia' e sta cominciando
 * la A dopo la B e' semplicemente falso. Il messaggio nomina la patente nuova,
 * che e' l'unica informazione che gli serve.
 */
export async function notifyNewLicensePath({
  companyId,
  studentUserId,
  licenseCategory,
}: {
  companyId: string;
  studentUserId: string;
  licenseCategory: string;
}): Promise<void> {
  await notifyAutoscuolaUser({
    companyId,
    kind: "license_path_started",
    audience: "student",
    recipient: { userId: studentUserId },
    supports: PUSH_ONLY,
    title: `🚗 Nuovo percorso: patente ${licenseCategory}`,
    body: "L'autoscuola ha avviato il tuo nuovo percorso. Puoi prenotare le guide.",
    data: { licenseCategory },
  });
}
