import { schedules } from "@trigger.dev/sdk/v3";
import { getPrisma } from "@/trigger/prisma";
import { runRoadCleanTracks, runRoadMaintenance } from "@/lib/autoscuole/road/maintenance";

/**
 * REG-638 Reglo Road: chiude le sessioni GPS dimenticate aperte (fine guida
 * + 30 min) e cancella percorsi e segnalazioni oltre i 12 mesi.
 * REG-713: calcola e salva la traccia pulita (con Google Roads) delle guide
 * finite che non ce l'hanno ancora agganciata, una volta sola: il dettaglio
 * della guida in lettura non la calcola più.
 */
export const autoscuoleRoadMaintenance = schedules.task({
  id: "autoscuole-road-maintenance",
  cron: "*/15 * * * *",
  run: async () => {
    const prisma = await getPrisma();
    const result = await runRoadMaintenance(prisma);
    const tracks = await runRoadCleanTracks(prisma);
    return { ok: true, ...result, ...tracks };
  },
});
