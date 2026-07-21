import { schedules } from "@trigger.dev/sdk/v3";
import { getPrisma } from "@/trigger/prisma";
import { processNationalHolidaysSync } from "@/lib/autoscuole/national-holidays-sync";

/**
 * Rolling window delle festività nazionali materializzate: ogni notte
 * estende/allinea le righe AutoscuolaHoliday del preset (anno corrente +
 * successivo) per le autoscuole con "Festività non prenotabili" attivo.
 */
export const autoscuoleNationalHolidays = schedules.task({
  id: "autoscuole-national-holidays",
  cron: "0 4 * * *",
  run: async () => {
    const prisma = await getPrisma();
    const result = await processNationalHolidaysSync({ prisma });
    return { ok: true, ...result };
  },
});
