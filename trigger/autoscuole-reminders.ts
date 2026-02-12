import { schedules } from "@trigger.dev/sdk/v3";
import { getPrisma } from "@/trigger/workflow-runner/prisma";
import {
  processAutoscuolaAutoCompleteCheckedIn,
  processAutoscuolaConfiguredAppointmentReminders,
  processAutoscuolaAppointmentReminders,
  processAutoscuolaCaseDeadlines,
  processAutoscuolaPenaltyCharges,
  processAutoscuolaLessonSettlement,
  processAutoscuolaPaymentRetries,
  processAutoscuolaInvoiceFinalization,
} from "@/lib/autoscuole/communications";

export const autoscuoleReminders = schedules.task({
  id: "autoscuole-reminders",
  cron: "*/1 * * * *",
  run: async () => {
    const prisma = await getPrisma();
    await processAutoscuolaAutoCompleteCheckedIn({ prisma });
    await processAutoscuolaPenaltyCharges({ prisma });
    await processAutoscuolaLessonSettlement({ prisma });
    await processAutoscuolaPaymentRetries({ prisma });
    await processAutoscuolaInvoiceFinalization({ prisma });
    await processAutoscuolaConfiguredAppointmentReminders({ prisma });
    await processAutoscuolaAppointmentReminders({ prisma });
    await processAutoscuolaCaseDeadlines({ prisma });
    return { ok: true };
  },
});
