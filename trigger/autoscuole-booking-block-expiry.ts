import { schedules } from "@trigger.dev/sdk/v3";
import { getPrisma } from "@/trigger/prisma";
import { EXPIRED_BLOCK_PATCH } from "@/lib/autoscuole/booking-block";

/**
 * Blocchi prenotazioni a tempo (REG-442): ogni notte rilascia quelli scaduti.
 *
 * L'enforcement non dipende da questo job — ogni punto che decide se un allievo
 * può prenotare usa `isBookingBlockActive`, che guarda già la scadenza. Il cron
 * serve a tenere il DB pulito: la pill "Bloccato" sparisce dalla lista anche
 * senza che nessuno apra la pagina, e chi legge il booleano grezzo vede il vero.
 */
export const autoscuoleBookingBlockExpiry = schedules.task({
  id: "autoscuole-booking-block-expiry",
  // UTC come gli altri job: ~01:10/02:10 italiane. Il ritardo non si vede da
  // nessuna parte — l'enforcement guarda la scadenza, non questa riga.
  cron: "10 0 * * *",
  run: async () => {
    const prisma = await getPrisma();
    const result = await prisma.companyMember.updateMany({
      where: {
        autoscuolaRole: "STUDENT",
        bookingBlocked: true,
        bookingBlockUntil: { lte: new Date() },
      },
      data: EXPIRED_BLOCK_PATCH,
    });
    return { ok: true, released: result.count };
  },
});
