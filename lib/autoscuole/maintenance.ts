/**
 * REG-773 — Modalità manutenzione: scritture e letture lato server.
 * Regole pure in `lib/maintenance.ts`; doc in docs/features/maintenance-mode.md.
 *
 * - Il titolare la ACCENDE (web o mobile), scegliendo l'ambito.
 * - Il backoffice la accende, cambia ambito, la SPEGNE. Il titolare non può
 *   spegnerla: è il senso della funzione.
 * - Ogni cambio scrive una riga in `CompanyMaintenanceEvent`.
 * - Nessun dato viene toccato: niente sessioni revocate, niente guide annullate.
 */

import { prisma as defaultPrisma } from "@/db/prisma";
import { sendDynamicEmail } from "@/email";
import { isOwner } from "@/lib/autoscuole/roles";
import { getActiveCompanyContext } from "@/lib/company-context";
import { confirmsCompanyName, type MaintenanceScope } from "@/lib/maintenance";

export type MaintenanceActor =
  | { kind: "owner"; userId: string; label: string }
  | { kind: "backoffice"; adminId: string | null; label: string };

export type CompanyMaintenanceState = {
  scope: MaintenanceScope | null;
  since: string | null;
};

const SCOPE_LABEL: Record<MaintenanceScope, string> = {
  OWNER_ONLY: "solo titolare",
  EVERYONE: "titolare, istruttori e allievi",
};

/**
 * Accende, cambia o spegne la manutenzione (`scope: null` = spegni) e scrive
 * il registro, in una transazione. Il cambio è condizionato allo stato letto:
 * due richieste simultanee non scrivono due volte lo stesso evento.
 */
export async function setCompanyMaintenance({
  companyId,
  scope,
  actor,
}: {
  companyId: string;
  scope: MaintenanceScope | null;
  actor: MaintenanceActor;
}): Promise<{ changed: boolean; state: CompanyMaintenanceState; companyName: string }> {
  const result = await defaultPrisma.$transaction(async (tx) => {
    const company = await tx.company.findUnique({
      where: { id: companyId },
      select: { name: true, maintenanceScope: true, maintenanceSince: true },
    });
    if (!company) throw new Error("Autoscuola non trovata.");

    const previous = company.maintenanceScope ?? null;
    if (previous === scope) {
      return { changed: false, company, previous };
    }

    const since =
      scope === null ? null : previous === null ? new Date() : company.maintenanceSince;
    const updated = await tx.company.updateMany({
      where: { id: companyId, maintenanceScope: previous },
      data: { maintenanceScope: scope, maintenanceSince: since },
    });
    if (updated.count === 0) {
      throw new Error("Lo stato della manutenzione è appena cambiato. Riprova.");
    }

    await tx.companyMaintenanceEvent.create({
      data: {
        companyId,
        action: scope === null ? "unlock" : previous === null ? "activate" : "change_scope",
        scope,
        previousScope: previous,
        actorKind: actor.kind,
        actorUserId: actor.kind === "owner" ? actor.userId : null,
        actorBackofficeAdminId: actor.kind === "backoffice" ? actor.adminId : null,
        actorLabel: actor.label,
      },
    });

    return {
      changed: true,
      company: { ...company, maintenanceScope: scope, maintenanceSince: since },
      previous,
    };
  });

  if (result.changed) {
    await notifyReglo({
      companyName: result.company.name,
      scope,
      previous: result.previous,
      actor,
    });
  }

  return {
    changed: result.changed,
    companyName: result.company.name,
    state: {
      scope: result.company.maintenanceScope ?? null,
      since: result.company.maintenanceSince?.toISOString() ?? null,
    },
  };
}

/**
 * Il titolare accende la manutenzione della SUA autoscuola. Chiede il nome
 * dell'autoscuola scritto per conferma: è un'azione che non può annullare.
 * Dall'impersonazione no: il backoffice ha il suo comando, e nel registro
 * finirebbe un titolare che non ha fatto niente.
 */
export async function activateMaintenanceAsOwner({
  scope,
  confirmName,
}: {
  scope: MaintenanceScope;
  confirmName: string;
}) {
  const { session, membership, company } = await getActiveCompanyContext();
  if (session?.impersonation) {
    throw new Error("Dall'impersonazione usa il comando del backoffice.");
  }
  if (!isOwner(membership.autoscuolaRole)) {
    throw new Error("Solo il titolare può attivare la manutenzione.");
  }
  if (!confirmsCompanyName(confirmName, company.name)) {
    throw new Error("Il nome non corrisponde a quello dell'autoscuola.");
  }

  const user = await defaultPrisma.user.findUnique({
    where: { id: membership.userId },
    select: { name: true, email: true },
  });
  return setCompanyMaintenance({
    companyId: membership.companyId,
    scope,
    actor: {
      kind: "owner",
      userId: membership.userId,
      label: user?.name?.trim() || user?.email || "Titolare",
    },
  });
}

export async function listCompanyMaintenanceEvents(companyId: string, take = 20) {
  const rows = await defaultPrisma.companyMaintenanceEvent.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    take,
  });
  return rows.map((row) => ({
    id: row.id,
    action: row.action as "activate" | "unlock" | "change_scope",
    scope: row.scope,
    previousScope: row.previousScope,
    actorKind: row.actorKind as "owner" | "backoffice",
    actorLabel: row.actorLabel,
    createdAt: row.createdAt.toISOString(),
  }));
}

/**
 * Mail interna al team Reglo a ogni cambio: lo sblocco passa da noi, il
 * supporto deve saperlo subito. Solo destinatari @reglo.it (vale anche su
 * staging, vedi `internalStaffOnly`). Non lancia mai.
 */
async function notifyReglo({
  companyName,
  scope,
  previous,
  actor,
}: {
  companyName: string;
  scope: MaintenanceScope | null;
  previous: MaintenanceScope | null;
  actor: MaintenanceActor;
}) {
  try {
    const admins = await defaultPrisma.backofficeAdmin.findMany({
      where: { disabledAt: null, email: { endsWith: "@reglo.it" } },
      select: { email: true },
    });
    const to = admins.map((admin) => admin.email);
    if (!to.length) return;

    const who = actor.kind === "owner" ? `${actor.label} (titolare)` : `${actor.label} (backoffice)`;
    const what =
      scope === null
        ? "è uscita dalla manutenzione"
        : previous === null
          ? `è entrata in manutenzione — ${SCOPE_LABEL[scope]}`
          : `ha cambiato ambito di manutenzione — ora ${SCOPE_LABEL[scope]}`;

    await sendDynamicEmail({
      to,
      internalStaffOnly: true,
      subject: `${companyName} ${what}`,
      heading: "Modalità manutenzione",
      body: [`${companyName} ${what}.`, "", `Da: ${who}.`, "", "Lo sblocco si fa dal backoffice."].join("\n"),
    });
  } catch (error) {
    console.error("[maintenance] notifica interna non inviata", error);
  }
}
