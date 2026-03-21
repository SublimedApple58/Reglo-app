import { schedules } from "@trigger.dev/sdk/v3";
import { getPrisma } from "@/trigger/prisma";
import {
  processAutoscuolaAutoCompleteCheckedIn,
  processAutoscuolaAutoPendingReview,
  processAutoscuolaConfiguredAppointmentReminders,
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
    await processAutoscuolaAutoCompleteCheckedIn({ prisma });
    await processAutoscuolaAutoPendingReview({ prisma });
    await processAutoscuolaPenaltyCharges({ prisma });
    await processAutoscuolaLessonSettlement({ prisma });
    await processAutoscuolaPaymentRetries({ prisma });
    await processAutoscuolaInvoiceFinalization({ prisma });
    await processAutoscuolaPendingRepositions({ prisma, limit: 50 });
    await processAutoscuolaConfiguredAppointmentReminders({ prisma });
    await processAutoscuolaAppointmentReminders({ prisma });
    await processAutoscuolaCaseDeadlines({ prisma });
    if (now.getUTCMinutes() === 0) {
      await cleanupAutoscuolaVoiceRetention({ prisma, now });
    }
    return { ok: true };
  },
});
