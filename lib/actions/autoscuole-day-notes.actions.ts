"use server";

import { z } from "zod";
import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import { requireServiceAccess } from "@/lib/service-access";
import { isOwner } from "@/lib/autoscuole/roles";
import {
  AUTOSCUOLE_CACHE_SEGMENTS,
  invalidateAutoscuoleCache,
} from "@/lib/autoscuole/cache";
import { DAY_NOTE_MAX_LENGTH, dayNoteDate } from "@/lib/autoscuole/day-notes";

// ─────────────────────────────────────────────────────────────────────────────
// REG-632: nota del giorno dell'agenda («Genova quiz»). Una per data e per
// autoscuola, la scrive e la legge solo l'ufficio (titolare e segreteria).
// Non blocca niente: è un'etichetta, non un festivo.
// ─────────────────────────────────────────────────────────────────────────────

const saveDayNoteSchema = z.object({
  /** YYYY-MM-DD */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Vuota = toglie la nota. */
  text: z.string().max(DAY_NOTE_MAX_LENGTH),
});

export async function saveAutoscuolaDayNote(input: z.infer<typeof saveDayNoteSchema>) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (membership.role !== "admin" && !isOwner(membership.autoscuolaRole)) {
      return { success: false as const, message: "La nota del giorno la scrive solo l'ufficio." };
    }
    const payload = saveDayNoteSchema.parse(input);
    const companyId = membership.companyId;
    const date = dayNoteDate(payload.date);
    const text = payload.text.trim();

    if (!text) {
      await prisma.autoscuolaDayNote.deleteMany({ where: { companyId, date } });
    } else {
      await prisma.autoscuolaDayNote.upsert({
        where: { companyId_date: { companyId, date } },
        create: { companyId, date, text, createdBy: membership.userId, updatedBy: membership.userId },
        update: { text, updatedBy: membership.userId },
      });
    }

    await invalidateAutoscuoleCache({ companyId, segments: [AUTOSCUOLE_CACHE_SEGMENTS.AGENDA] });
    return { success: true as const, data: { date: payload.date, text: text || null } };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}
