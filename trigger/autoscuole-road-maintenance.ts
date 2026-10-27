import { schedules } from "@trigger.dev/sdk/v3";
import { getPrisma } from "@/trigger/prisma";
import { runRoadMaintenance } from "@/lib/autoscuole/road/maintenance";

/**
 * REG-638 Reglo Road: chiude le sessioni GPS dimenticate aperte (fine guida
 * + 30 min) e cancella percorsi e segnalazioni oltre i 12 mesi.
 */
export const autoscuoleRoadMaintenance = schedules.task({
  id: "autoscuole-road-maintenance",
  cron: "*/15 * * * *",
  run: async () => {
    const prisma = await getPrisma();
    const result = await runRoadMaintenance(prisma);
    return { ok: true, ...result };
  },
});
