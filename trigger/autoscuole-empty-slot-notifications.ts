import { schedules } from "@trigger.dev/sdk/v3";
import { getPrisma } from "@/trigger/prisma";
import { processEmptySlotNotifications } from "@/lib/autoscuole/communications";

export const autoscuoleEmptySlotNotifications = schedules.task({
  id: "autoscuole-empty-slot-notifications",
  cron: "0 17 * * *",
  run: async () => {
    const prisma = await getPrisma();
    const result = await processEmptySlotNotifications({ prisma });
    return { ok: true, ...result };
  },
});
