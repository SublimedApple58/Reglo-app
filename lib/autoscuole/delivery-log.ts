/**
 * Registrare OGNI tentativo di invio, non solo quelli che nascono da una regola
 * (REG-500).
 *
 * Il problema che risolve: nei promemoria l'invio stava in un `try/catch` che
 * faceva solo `console.error`. Nessuna riga, nessun avviso. L'autoscuola
 * spuntava WhatsApp, credeva che i promemoria partissero, e per mesi non è
 * arrivato niente a nessuno senza che si potesse accorgersene da dentro il
 * prodotto. I 110 `401 Authenticate` che abbiamo trovato venivano dall'unico
 * percorso che scriveva a log — gli altri non li ha contati nessuno.
 *
 * Da qui passano tutti e tre i canali, push compresa: anche una push che non
 * parte è un allievo che non viene avvisato.
 */
import { prisma } from "@/db/prisma";

export type DeliveryChannel = "push" | "whatsapp" | "email";

export type DeliveryAttempt = {
  companyId: string;
  /** Che messaggio era: `morning_reminder_student`, `appointment_reminder_instructor`, … */
  kind: string;
  channel: DeliveryChannel;
  /** Email, numero, o l'id utente per la push. */
  recipient: string;
  appointmentId?: string | null;
  studentId?: string | null;
  body?: string;
};

/**
 * Non lancia mai. Un log che fa saltare l'invio sarebbe peggio del problema che
 * risolve: il cron dei promemoria gira ogni minuto e un errore qui fermerebbe
 * i messaggi di tutte le autoscuole.
 */
const write = async (
  attempt: DeliveryAttempt,
  status: "sent" | "failed" | "skipped",
  extra?: { error?: string; providerMessageId?: string | null },
) => {
  try {
    await prisma.autoscuolaMessageLog.create({
      data: {
        companyId: attempt.companyId,
        ruleId: null,
        templateId: null,
        kind: attempt.kind,
        appointmentId: attempt.appointmentId ?? null,
        studentId: attempt.studentId ?? null,
        channel: attempt.channel,
        recipient: attempt.recipient,
        status,
        error: extra?.error ? extra.error.slice(0, 500) : null,
        providerMessageId: extra?.providerMessageId ?? null,
        payload: attempt.body ? { body: attempt.body.slice(0, 500) } : undefined,
      },
    });
  } catch (error) {
    console.error("[delivery-log] impossibile registrare il tentativo", error);
  }
};

/**
 * Esegue l'invio e ne registra l'esito, qualunque sia.
 *
 * Restituisce `true` se è partito, così chi chiama può decidere se fermarsi
 * (è la cascata: un messaggio, un canale) o provare il canale dopo.
 */
export async function deliverAndLog(
  attempt: DeliveryAttempt,
  /**
   * Riceve il destinatario come parametro, non lo richiude dal contesto: così
   * TypeScript sa che è una stringa piena (il controllo qui sopra l'ha già
   * verificato) e chi chiama non deve mettere toppe per il narrowing perso
   * dentro la closure.
   */
  send: (recipient: string) => Promise<unknown>,
): Promise<boolean> {
  if (!attempt.recipient) {
    await write(attempt, "skipped", { error: "destinatario mancante" });
    return false;
  }
  try {
    const result = await send(attempt.recipient);
    const providerMessageId =
      result && typeof result === "object" && "providerMessageId" in result
        ? ((result as { providerMessageId?: string | null }).providerMessageId ?? null)
        : null;
    await write(attempt, "sent", { providerMessageId });
    return true;
  } catch (error) {
    await write(attempt, "failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    // Si continua: un canale caduto non deve fermare gli altri né il ciclo.
    console.error(`[${attempt.kind}] ${attempt.channel} fallito`, error);
    return false;
  }
}

/** Canale acceso ma senza recapito per quella persona: va registrato lo stesso. */
export async function logSkipped(attempt: DeliveryAttempt, reason: string) {
  await write(attempt, "skipped", { error: reason });
}
