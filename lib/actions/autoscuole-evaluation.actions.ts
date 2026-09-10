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
import {
  EVALUATION_SCALES,
  MAX_EVALUATION_ITEMS,
  MAX_EVALUATION_LABEL_LENGTH,
  asEvaluationScale,
} from "@/lib/autoscuole/evaluation-sheet";

// Pagellino di valutazione (REG-443): le voci sono righe di
// AutoscuolaEvaluationItem, l'interruttore "pagellino attivo" vive nei limits
// AUTOSCUOLE (come gli altri flag di impostazioni) dietro la cache SETTINGS.

const itemSchema = z.object({
  /** Assente per una voce nuova. */
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1, "Dai un nome alla voce.").max(MAX_EVALUATION_LABEL_LENGTH),
  scaleMax: z
    .number()
    .int()
    .refine((v) => EVALUATION_SCALES.includes(v as 3 | 5), "Scala non valida."),
});

const saveSchema = z.object({
  enabled: z.boolean(),
  /** L'ordine dell'array È l'ordine del pagellino sul telefono. */
  items: z.array(itemSchema).max(MAX_EVALUATION_ITEMS),
});

export type EvaluationItemDTO = {
  id: string;
  label: string;
  scaleMax: number;
  position: number;
};

export type EvaluationSheetDTO = {
  enabled: boolean;
  items: EvaluationItemDTO[];
};

const canManageSettings = (role: string, autoscuolaRole: string | null) =>
  role === "admin" || isOwner(autoscuolaRole);

/** Voci ATTIVE di una company, in ordine. Usata anche dalla route mobile. */
export async function listCompanyEvaluationItems(
  companyId: string,
): Promise<EvaluationItemDTO[]> {
  const rows = await prisma.autoscuolaEvaluationItem.findMany({
    where: { companyId, archivedAt: null },
    orderBy: { position: "asc" },
    select: { id: true, label: true, scaleMax: true, position: true },
  });
  return rows.map((r) => ({ ...r, scaleMax: asEvaluationScale(r.scaleMax) }));
}

export async function isEvaluationSheetEnabled(companyId: string): Promise<boolean> {
  const service = await prisma.companyService.findFirst({
    where: { companyId, serviceKey: "AUTOSCUOLE" },
    select: { limits: true },
  });
  const limits = (service?.limits ?? {}) as Record<string, unknown>;
  return limits.evaluationSheetEnabled === true;
}

/** Pagellino della company corrente (pane Impostazioni web). */
export async function getEvaluationSheet(): Promise<
  { success: true; data: EvaluationSheetDTO } | { success: false; message: string }
> {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const [items, enabled] = await Promise.all([
      listCompanyEvaluationItems(membership.companyId),
      isEvaluationSheetEnabled(membership.companyId),
    ]);
    return { success: true as const, data: { enabled, items } };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

/**
 * Salva voci + interruttore in un colpo solo. Le voci sparite dall'elenco
 * vengono ARCHIVIATE, non cancellate: i punteggi già dati restano leggibili
 * con la loro etichetta.
 */
export async function saveEvaluationSheet(input: z.infer<typeof saveSchema>) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (!canManageSettings(membership.role, membership.autoscuolaRole)) {
      throw new Error("Operazione non consentita.");
    }
    const payload = saveSchema.parse(input);
    const companyId = membership.companyId;

    const existing = await prisma.autoscuolaEvaluationItem.findMany({
      where: { companyId, archivedAt: null },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((e) => e.id));
    const keptIds = new Set(
      payload.items.map((i) => i.id).filter((id): id is string => Boolean(id)),
    );
    // Un id sconosciuto (o di un'altra autoscuola) viene trattato come voce
    // nuova invece di far fallire il salvataggio.
    const toArchive = [...existingIds].filter((id) => !keptIds.has(id));

    await prisma.$transaction(async (tx) => {
      if (toArchive.length) {
        await tx.autoscuolaEvaluationItem.updateMany({
          where: { companyId, id: { in: toArchive } },
          data: { archivedAt: new Date() },
        });
      }

      for (const [index, item] of payload.items.entries()) {
        const data = {
          label: item.label,
          scaleMax: asEvaluationScale(item.scaleMax),
          position: index,
        };
        if (item.id && existingIds.has(item.id)) {
          await tx.autoscuolaEvaluationItem.update({ where: { id: item.id }, data });
        } else {
          await tx.autoscuolaEvaluationItem.create({ data: { ...data, companyId } });
        }
      }

      const service = await tx.companyService.findFirst({
        where: { companyId, serviceKey: "AUTOSCUOLE" },
        select: { id: true, limits: true },
      });
      if (service) {
        const limits = (service.limits ?? {}) as Record<string, unknown>;
        await tx.companyService.update({
          where: { id: service.id },
          data: { limits: { ...limits, evaluationSheetEnabled: payload.enabled } },
        });
      }
    });

    // I limits stanno dietro la cache SETTINGS (TTL 5 min): senza bump il
    // pagellino comparirebbe sull'app solo al giro di cache successivo.
    await invalidateAutoscuoleCache({
      companyId,
      segments: [AUTOSCUOLE_CACHE_SEGMENTS.SETTINGS],
    });

    const items = await listCompanyEvaluationItems(companyId);
    return { success: true as const, data: { enabled: payload.enabled, items } };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

/**
 * Tutto ciò che serve al foglio "Dettagli guida" dell'app istruttore in UNA
 * chiamata: interruttore, voci attive e punteggi già dati su questa guida.
 * Le voci archiviate compaiono solo se hanno un punteggio su questa guida,
 * così un pagellino vecchio resta leggibile senza sporcare le guide nuove.
 */
export async function getAppointmentEvaluation(appointmentId: string): Promise<
  | {
      success: true;
      data: {
        enabled: boolean;
        items: Array<EvaluationItemDTO & { archived: boolean }>;
        scores: Array<{ itemId: string; score: number }>;
      };
    }
  | { success: false; message: string }
> {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const appointment = await prisma.autoscuolaAppointment.findFirst({
      where: { id: appointmentId, companyId: membership.companyId },
      select: { id: true },
    });
    if (!appointment) {
      return { success: false as const, message: "Guida non trovata." };
    }

    const [active, enabled, saved] = await Promise.all([
      listCompanyEvaluationItems(membership.companyId),
      isEvaluationSheetEnabled(membership.companyId),
      prisma.autoscuolaAppointmentEvaluation.findMany({
        where: { appointmentId },
        select: {
          itemId: true,
          score: true,
          item: { select: { id: true, label: true, scaleMax: true, position: true, archivedAt: true } },
        },
      }),
    ]);

    const activeIds = new Set(active.map((i) => i.id));
    const archivedWithScore = saved
      .filter((s) => s.item.archivedAt && !activeIds.has(s.itemId))
      .map((s) => ({
        id: s.item.id,
        label: s.item.label,
        scaleMax: asEvaluationScale(s.item.scaleMax),
        position: s.item.position,
        archived: true,
      }));

    return {
      success: true as const,
      data: {
        enabled,
        items: [...active.map((i) => ({ ...i, archived: false })), ...archivedWithScore],
        scores: saved.map((s) => ({ itemId: s.itemId, score: s.score })),
      },
    };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}
