import { sendAutoscuolaPushToUsers } from "@/lib/autoscuole/push";

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

  try {
    await sendAutoscuolaPushToUsers({
      companyId,
      userIds: [studentUserId],
      title: copy.title,
      body: copy.body,
      data: {
        kind: "student_phase_change",
        fromPhase,
        toPhase,
      },
    });
  } catch (error) {
    console.error("[student-phase-notifications] push failed", error);
  }
}
