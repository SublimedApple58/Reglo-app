import type { AutoscuolaLicensePath, Prisma } from "@prisma/client";

import { prisma } from "@/db/prisma";

import { asLicensePathStatus, type LicensePathStatus } from "./license-paths";

/**
 * Scritture sui percorsi patente (REG-458).
 *
 * **Punto unico.** Qui dentro vive l'unica cosa che conta davvero: la riga del
 * percorso e lo **specchio** su `CompanyMember` si muovono SEMPRE insieme, nella
 * stessa transazione. Se divergessero, il prodotto comincerebbe a dire due cose
 * diverse sulla stessa persona — l'abbinamento veicoli leggerebbe una categoria,
 * lo storico un'altra.
 *
 * Non e' un file "use server": lo importano sia le action dei percorsi sia
 * `setExamOutcome`, che vive altrove e deve poter chiudere un percorso dentro la
 * propria sequenza di scritture. `tests/unit/autoscuole/license-path-guard.test.ts`
 * impedisce che qualcun altro scriva quei campi per conto suo.
 */

type Db = Prisma.TransactionClient | typeof prisma;

const PATH_SELECT = {
  id: true,
  companyId: true,
  studentId: true,
  licenseCategory: true,
  transmission: true,
  status: true,
  startedAt: true,
  closedAt: true,
  obtainedAt: true,
  licenseNumber: true,
} satisfies Prisma.AutoscuolaLicensePathSelect;

export type StoredLicensePath = Pick<
  AutoscuolaLicensePath,
  keyof typeof PATH_SELECT
>;

export async function getStudentPaths(
  db: Db,
  params: { companyId: string; studentId: string },
): Promise<StoredLicensePath[]> {
  return db.autoscuolaLicensePath.findMany({
    where: { companyId: params.companyId, studentId: params.studentId },
    select: PATH_SELECT,
    orderBy: { startedAt: "asc" },
  });
}

/**
 * Il percorso da cui lo specchio prende i valori: quello aperto se c'e',
 * altrimenti l'ultimo chiuso. L'allievo patentato continua cosi' a mostrare la
 * patente che ha preso, esattamente come prima di REG-458.
 */
const mirrorSource = (paths: StoredLicensePath[]): StoredLicensePath | null => {
  const open = paths.find((p) => asLicensePathStatus(p.status) === "active");
  if (open) return open;
  const closed = [...paths].sort(
    (a, b) => (b.closedAt?.getTime() ?? 0) - (a.closedAt?.getTime() ?? 0),
  );
  return closed[0] ?? null;
};

/**
 * Riallinea `CompanyMember` ai percorsi. Da chiamare dopo OGNI scrittura.
 *
 * Volutamente ricalcolato dai percorsi invece che aggiornato "a mano" dal
 * chiamante: cosi' lo specchio non puo' restare indietro per una svista, e
 * rieseguirla due volte non cambia niente.
 */
export async function syncMemberMirror(
  db: Db,
  params: { companyId: string; studentId: string },
): Promise<void> {
  const paths = await getStudentPaths(db, params);
  const open = paths.find((p) => asLicensePathStatus(p.status) === "active");
  const source = mirrorSource(paths);

  await db.companyMember.updateMany({
    where: {
      companyId: params.companyId,
      userId: params.studentId,
      autoscuolaRole: "STUDENT",
    },
    data: {
      activeLicensePathId: open?.id ?? null,
      licenseCategory: source?.licenseCategory ?? null,
      transmission: source?.transmission ?? null,
      licenseNumber: source?.licenseNumber ?? null,
      licenseObtainedAt: source?.obtainedAt ?? null,
    },
  });
}

/**
 * Il percorso aperto dell'allievo, creandolo se manca.
 *
 * La rete di sicurezza serve per gli allievi nati **dopo** la migrazione: i
 * tredici punti che creano un allievo non sono stati toccati, e lasciarli senza
 * percorso avrebbe significato tredici occasioni di dimenticarsene. Qui invece
 * il percorso compare alla prima operazione che ne ha bisogno, ricavato dallo
 * specchio che l'allievo ha gia' addosso.
 */
export async function ensureActivePath(
  tx: Prisma.TransactionClient,
  params: { companyId: string; studentId: string },
): Promise<StoredLicensePath> {
  const existing = await tx.autoscuolaLicensePath.findFirst({
    where: { ...params, status: "active" },
    select: PATH_SELECT,
  });
  if (existing) return existing;

  const member = await tx.companyMember.findUnique({
    where: { companyId_userId: { companyId: params.companyId, userId: params.studentId } },
    select: {
      licenseCategory: true,
      transmission: true,
      licenseNumber: true,
      licenseObtainedAt: true,
      createdAt: true,
    },
  });

  const created = await tx.autoscuolaLicensePath.create({
    data: {
      companyId: params.companyId,
      studentId: params.studentId,
      licenseCategory: member?.licenseCategory ?? null,
      transmission: member?.transmission ?? null,
      status: "active",
      startedAt: member?.createdAt ?? new Date(),
      licenseNumber: member?.licenseNumber ?? null,
      obtainedAt: member?.licenseObtainedAt ?? null,
    },
    select: PATH_SELECT,
  });
  await syncMemberMirror(tx, params);
  return created;
}

/**
 * Chiude il percorso aperto. Idempotente: se non ce n'e' uno, non fa niente e lo
 * dice (torna `null`), invece di inventarne uno da chiudere.
 *
 * `licenseNumber` assente = non toccare quello gia' registrato; stringa vuota o
 * `null` = cancellarlo. Stessa semantica di `setExamOutcome`, da cui questa
 * funzione viene chiamata.
 */
export async function closeActivePath(
  tx: Prisma.TransactionClient,
  params: {
    companyId: string;
    studentId: string;
    outcome: Extract<LicensePathStatus, "obtained" | "abandoned">;
    licenseNumber?: string | null;
    at?: Date;
  },
): Promise<StoredLicensePath | null> {
  const open = await tx.autoscuolaLicensePath.findFirst({
    where: {
      companyId: params.companyId,
      studentId: params.studentId,
      status: "active",
    },
    select: PATH_SELECT,
  });
  if (!open) return null;

  const at = params.at ?? new Date();
  const touchesNumber = params.licenseNumber !== undefined;
  const nextNumber = touchesNumber
    ? (params.licenseNumber ?? "").trim() || null
    : open.licenseNumber;

  const closed = await tx.autoscuolaLicensePath.update({
    where: { id: open.id },
    data: {
      status: params.outcome,
      closedAt: at,
      licenseNumber: nextNumber,
      // La data di conseguimento si scrive solo su una patente presa davvero, e
      // solo se non c'era gia': un percorso abbandonato non ha un conseguimento.
      obtainedAt:
        params.outcome === "obtained" ? (open.obtainedAt ?? at) : null,
    },
    select: PATH_SELECT,
  });

  await syncMemberMirror(tx, {
    companyId: params.companyId,
    studentId: params.studentId,
  });
  return closed;
}

/**
 * Apre un percorso nuovo. Il chiamante deve aver gia' chiuso quello precedente:
 * l'indice unico parziale in database rifiuta il secondo percorso `active` dello
 * stesso allievo, ed e' giusto che sia un errore rumoroso.
 */
export async function openNewPath(
  tx: Prisma.TransactionClient,
  params: {
    companyId: string;
    studentId: string;
    licenseCategory: string;
    transmission: string | null;
    at?: Date;
  },
): Promise<StoredLicensePath> {
  const created = await tx.autoscuolaLicensePath.create({
    data: {
      companyId: params.companyId,
      studentId: params.studentId,
      licenseCategory: params.licenseCategory,
      transmission: params.transmission,
      status: "active",
      startedAt: params.at ?? new Date(),
    },
    select: PATH_SELECT,
  });
  await syncMemberMirror(tx, {
    companyId: params.companyId,
    studentId: params.studentId,
  });
  return created;
}

/** Correzione del percorso in corso: categoria e cambio, niente altro. */
export async function updateOpenPath(
  tx: Prisma.TransactionClient,
  params: {
    companyId: string;
    studentId: string;
    licenseCategory: string;
    transmission: string | null;
  },
): Promise<StoredLicensePath> {
  const open = await ensureActivePath(tx, {
    companyId: params.companyId,
    studentId: params.studentId,
  });
  const updated = await tx.autoscuolaLicensePath.update({
    where: { id: open.id },
    data: {
      licenseCategory: params.licenseCategory,
      transmission: params.transmission,
    },
    select: PATH_SELECT,
  });
  await syncMemberMirror(tx, {
    companyId: params.companyId,
    studentId: params.studentId,
  });
  return updated;
}
