import { schedules } from "@trigger.dev/sdk/v3";
import { getPrisma } from "@/trigger/workflow-runner/prisma";
import { processAutoscuolaAppointmentReminders } from "@/lib/autoscuole/communications";

export const autoscuoleReminders = schedules.task({
  id: "autoscuole-reminders",
  cron: "*/1 * * * *",
  run: async () => {
    const prisma = await getPrisma();
    await processAutoscuolaAppointmentReminders({ prisma });
    return { ok: true };
  },
});
