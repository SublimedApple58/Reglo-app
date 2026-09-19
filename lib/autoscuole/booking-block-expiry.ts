import { prisma } from "@/db/prisma";
import { EXPIRED_BLOCK_PATCH } from "@/lib/autoscuole/booking-block";

/**
 * Lato DB del blocco prenotazioni a tempo (REG-442). I predicati puri — usati
 * anche dal client — stanno in `booking-block.ts`, che NON importa Prisma.
 */

/**
 * Ripulisce le righe con un blocco a tempo scaduto. Scoped a una company (e
 * opzionalmente a un allievo) per le chiamate on-read; senza `companyId` è la
 * spazzata globale del cron notturno.
 */
export async function releaseExpiredManualBlocks(params?: {
  companyId?: string;
  userId?: string;
  now?: Date;
}): Promise<number> {
  const now = params?.now ?? new Date();
  const result = await prisma.companyMember.updateMany({
    where: {
      ...(params?.companyId ? { companyId: params.companyId } : {}),
      ...(params?.userId ? { userId: params.userId } : {}),
      autoscuolaRole: "STUDENT",
      bookingBlocked: true,
      bookingBlockUntil: { lte: now },
    },
    data: EXPIRED_BLOCK_PATCH,
  });
  return result.count;
}
