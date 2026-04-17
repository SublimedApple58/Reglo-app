import { schedules } from "@trigger.dev/sdk/v3";
import { getPrisma } from "@/trigger/prisma";
import {
  processAutoscuolaAutoCompleteCheckedIn,
  processAutoscuolaAutoPendingReview,
  processAutoscuolaConfiguredAppointmentReminders,
  processAutoscuolaMorningReminders,
  processAutoscuolaAppointmentReminders,
  processAutoscuolaCaseDeadlines,
  processAutoscuolaPenaltyCharges,
  processAutoscuolaLessonSettlement,
  processAutoscuolaPaymentRetries,
  processAutoscuolaInvoiceFinalization,
} from "@/lib/autoscuole/communications";
import { processAutoscuolaPendingRepositions } from "@/lib/autoscuole/repositioning";
import { cleanupAutoscuolaVoiceRetention } from "@/lib/autoscuole/voice";

export const autoscuoleReminders = schedules.task({
  id: "autoscuole-reminders",
  cron: "*/1 * * * *",
  run: async () => {
    const prisma = await getPrisma();
    const now = new Date();
    const errors: string[] = [];
    const safe = async (name: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[reminders] ${name} failed: ${msg}`);
        errors.push(name);
      }
    };
    await safe("autoComplete", () => processAutoscuolaAutoCompleteCheckedIn({ prisma }));
    await safe("autoPendingReview", () => processAutoscuolaAutoPendingReview({ prisma }));
    await safe("penaltyCharges", () => processAutoscuolaPenaltyCharges({ prisma }));
    await safe("lessonSettlement", () => processAutoscuolaLessonSettlement({ prisma }));
    await safe("paymentRetries", () => processAutoscuolaPaymentRetries({ prisma }));
    await safe("invoiceFinalization", () => processAutoscuolaInvoiceFinalization({ prisma }));
    await safe("pendingRepositions", () => processAutoscuolaPendingRepositions({ prisma, limit: 50 }));
    await safe("configuredReminders", () => processAutoscuolaConfiguredAppointmentReminders({ prisma }));
    await safe("morningReminders", () => processAutoscuolaMorningReminders({ prisma, now }));
    await safe("appointmentReminders", () => processAutoscuolaAppointmentReminders({ prisma }));
    await safe("caseDeadlines", () => processAutoscuolaCaseDeadlines({ prisma }));
    if (now.getUTCMinutes() === 0) {
      await safe("voiceRetention", () => cleanupAutoscuolaVoiceRetention({ prisma, now }));
    }
    return { ok: errors.length === 0, errors };
  },
});
