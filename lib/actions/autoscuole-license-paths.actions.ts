"use server";

import { z } from "zod";

import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import { requireServiceAccess } from "@/lib/service-access";
import { isOwner } from "@/lib/autoscuole/roles";
import { LICENSE_CATEGORIES, TRANSMISSIONS } from "@/lib/autoscuole/license";
import {
  AUTOSCUOLE_CACHE_SEGMENTS,
  invalidateAutoscuoleCache,
} from "@/lib/autoscuole/cache";
import {
  closeActivePath,
  getStudentPaths,
  openNewPath,
} from "@/lib/autoscuole/license-path-writes";
import { notifyNewLicensePath } from "@/lib/autoscuole/student-phase-notifications";

/**
 * Percorsi patente dell'allievo (REG-458): lettura dello storico e apertura di
 * un percorso nuovo.
 *
 * La correzione del percorso in corso resta `updateStudentLicensePath` in
 * `autoscuole.actions.ts`, dove e' sempre stata: correggere un errore di
 * battitura e ricominciare da capo sono due gesti diversi, e tenerli separati
 * anche nel codice e' il motivo per cui prima lo storico si perdeva.
 */

const canManageStudents = (membership: {
  role: string;
  autoscuolaRole: string | null;
}) => membership.role === "admin" || isOwner(membership.autoscuolaRole);

export type StudentLicensePathDto = {
  id: string;
  licenseCategory: string | null;
  transmission: string | null;
  status: string;
  startedAt: string;
  closedAt: string | null;
  obtainedAt: string | null;
  licenseNumber: string | null;
};

export async function getStudentLicensePaths(input: { studentId: string }) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const studentId = z.string().uuid().parse(input.studentId);

    const paths = await getStudentPaths(prisma, {
      companyId: membership.companyId,
      studentId,
    });

    return {
      success: true as const,
      data: paths.map(
        (p): StudentLicensePathDto => ({
          id: p.id,
          licenseCategory: p.licenseCategory,
          transmission: p.transmission,
          status: p.status,
          startedAt: p.startedAt.toISOString(),
          closedAt: p.closedAt ? p.closedAt.toISOString() : null,
          obtainedAt: p.obtainedAt ? p.obtainedAt.toISOString() : null,
          licenseNumber: p.licenseNumber,
        }),
      ),
    };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

const startNewLicensePathSchema = z.object({
  studentId: z.string().uuid(),
  closing: z.object({
    /// Come si e' chiuso quello di prima. Non c'e' un default: e' la domanda
    /// centrale del dialogo, e indovinarla vorrebbe dire scrivere nello storico
    /// una patente che forse non e' mai stata presa.
    outcome: z.enum(["obtained", "abandoned"]),
    /// Assente = non toccare il numero gia' registrato. Stringa vuota = cancellarlo.
    licenseNumber: z.string().max(40).nullable().optional(),
  }),
  next: z.object({
    licenseCategory: z.enum(LICENSE_CATEGORIES),
    transmission: z.enum(TRANSMISSIONS),
    /// Da dove riparte. PRATICA quasi sempre; TEORIA quando la categoria nuova
    /// richiede un altro esame di teoria e la scuola quella fase ce l'ha.
    startPhase: z.enum(["PRATICA", "TEORIA"]).default("PRATICA"),
  }),
});

/**
 * Chiude il percorso in corso e ne apre uno nuovo, in **una** transazione.
 *
 * Quel che l'allievo si porta dietro e quel che no — ed e' la prima domanda che
 * fa chi sta in segreteria:
 *   - guide, valutazioni e note del percorso vecchio **restano nello storico** e
 *     smettono di contare per l'obbligo delle 6 (il conteggio guarda la data di
 *     inizio del percorso in corso);
 *   - crediti e pagamenti **restano dell'allievo**: il portafoglio e' uno solo
 *     per persona, non per percorso (decisione di prodotto, 08/10/2026);
 *   - `examReady` si azzera, perche' si riferiva all'esame di prima.
 */
export async function startNewLicensePath(
  input: z.infer<typeof startNewLicensePathSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (!canManageStudents(membership)) {
      return { success: false as const, message: "Operazione non consentita." };
    }
    const payload = startNewLicensePathSchema.parse(input);

    const student = await prisma.companyMember.findFirst({
      where: {
        companyId: membership.companyId,
        userId: payload.studentId,
        autoscuolaRole: "STUDENT",
      },
      select: { studentPhase: true, quizSeatGrantedAt: true },
    });
    if (!student) {
      return {
        success: false as const,
        message: "Allievo non valido per questa company.",
      };
    }

    // Ripartire dalla TEORIA e' legittimo (una C dopo la B vuole un altro esame
    // teorico), ma pretende le stesse due condizioni di `updateStudentPhase`:
    // la fase attiva in autoscuola e un posto quiz. Il posto e' a vita, quindi
    // chi l'ha gia' avuto passa; chi non l'ha mai avuto va detto, non fatto
    // fallire con un errore oscuro piu' avanti.
    if (payload.next.startPhase === "TEORIA") {
      const service = await prisma.companyService.findFirst({
        where: { companyId: membership.companyId, serviceKey: "AUTOSCUOLE" },
        select: { limits: true },
      });
      const phasesEnabled = (service?.limits as Record<string, unknown> | null)
        ?.phasesEnabled;
      const hasTheory =
        Array.isArray(phasesEnabled) && phasesEnabled.includes("TEORIA");
      if (!hasTheory) {
        return {
          success: false as const,
          message:
            "Questa autoscuola non ha la fase teoria attiva: il percorso puo' ripartire solo dalla pratica.",
        };
      }
      if (!student.quizSeatGrantedAt) {
        return {
          success: false as const,
          message:
            "L'allievo non ha una licenza quiz: assegnagliela prima di farlo ripartire dalla teoria.",
        };
      }
    }

    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const closed = await closeActivePath(tx, {
        companyId: membership.companyId,
        studentId: payload.studentId,
        outcome: payload.closing.outcome,
        licenseNumber: payload.closing.licenseNumber,
        at: now,
      });
      const opened = await openNewPath(tx, {
        companyId: membership.companyId,
        studentId: payload.studentId,
        licenseCategory: payload.next.licenseCategory,
        transmission: payload.next.transmission,
        at: now,
      });
      await tx.companyMember.updateMany({
        where: {
          companyId: membership.companyId,
          userId: payload.studentId,
          autoscuolaRole: "STUDENT",
        },
        data: {
          studentPhase: payload.next.startPhase,
          phaseClassifiedAt: now,
          // Si riferiva all'esame del percorso appena chiuso.
          examReady: false,
          examReadyAt: null,
          examReadyBy: null,
        },
      });
      return { closed, opened };
    });

    await invalidateAutoscuoleCache({
      companyId: membership.companyId,
      segments: [AUTOSCUOLE_CACHE_SEGMENTS.AGENDA],
    });

    void notifyNewLicensePath({
      companyId: membership.companyId,
      studentUserId: payload.studentId,
      licenseCategory: payload.next.licenseCategory,
    });

    return {
      success: true as const,
      data: {
        closedPathId: result.closed?.id ?? null,
        openedPathId: result.opened.id,
        licenseCategory: payload.next.licenseCategory,
        transmission: payload.next.transmission,
        studentPhase: payload.next.startPhase,
      },
      message: `Nuovo percorso avviato: patente ${payload.next.licenseCategory}.`,
    };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}
