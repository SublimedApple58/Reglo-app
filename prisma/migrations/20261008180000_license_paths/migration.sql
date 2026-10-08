-- REG-458 — Percorsi patente multipli per allievo.
--
-- Additiva e reversibile: una tabella nuova piu' una colonna nullable. Nessuna
-- colonna esistente cambia significato, nessun dato viene cancellato.
--
-- Il backfill in coda da' a ogni allievo esattamente UN percorso, ricavato dai
-- campi che ha gia' addosso. Effetto visibile il giorno del rilascio: nessuno.

-- CreateTable
CREATE TABLE "AutoscuolaLicensePath" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "licenseCategory" TEXT,
    "transmission" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(6),
    "obtainedAt" TIMESTAMP(6),
    "licenseNumber" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoscuolaLicensePath_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutoscuolaLicensePath_companyId_studentId_idx" ON "AutoscuolaLicensePath"("companyId", "studentId");
CREATE INDEX "AutoscuolaLicensePath_companyId_studentId_status_idx" ON "AutoscuolaLicensePath"("companyId", "studentId", "status");

-- Un solo percorso APERTO per allievo. Indice unico PARZIALE: Prisma non sa
-- esprimerlo nello schema, quindi non e' gestito da lui e va preservato a mano
-- se qualcuno tocca il modello. Stessa tecnica gia' in uso per
-- "AutoscuolaLocation_companyId_isDefault_key" e "QuizScheda_exam_schedaNumber_key".
CREATE UNIQUE INDEX "AutoscuolaLicensePath_companyId_studentId_active_key"
    ON "AutoscuolaLicensePath" ("companyId", "studentId")
    WHERE "status" = 'active';

-- AddForeignKey
ALTER TABLE "AutoscuolaLicensePath" ADD CONSTRAINT "AutoscuolaLicensePath_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutoscuolaLicensePath" ADD CONSTRAINT "AutoscuolaLicensePath_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "CompanyMember" ADD COLUMN "activeLicensePathId" UUID;

-- AddForeignKey
ALTER TABLE "CompanyMember" ADD CONSTRAINT "CompanyMember_activeLicensePathId_fkey" FOREIGN KEY ("activeLicensePathId") REFERENCES "AutoscuolaLicensePath"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- BACKFILL
-- ---------------------------------------------------------------------------

-- 1. Un percorso per ogni allievo, dai campi che ha gia'.
--    PATENTATO -> percorso gia' chiuso come "obtained"; tutti gli altri aperto.
--    `closedAt` dei patentati: la data di conseguimento se c'e' (5 su 72),
--    altrimenti l'ultima modifica del membro — e' una data plausibile, e il
--    campo serve solo a ordinare lo storico.
INSERT INTO "AutoscuolaLicensePath" (
    "id", "companyId", "studentId", "licenseCategory", "transmission",
    "status", "startedAt", "closedAt", "obtainedAt", "licenseNumber",
    "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid(),
    m."companyId",
    m."userId",
    m."licenseCategory",
    m."transmission",
    CASE WHEN m."studentPhase" = 'PATENTATO' THEN 'obtained' ELSE 'active' END,
    m."createdAt",
    CASE WHEN m."studentPhase" = 'PATENTATO'
         THEN COALESCE(m."licenseObtainedAt", m."updatedAt")
         ELSE NULL END,
    m."licenseObtainedAt",
    m."licenseNumber",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "CompanyMember" m
WHERE m."autoscuolaRole" = 'STUDENT';

-- 2. Lo specchio sull'allievo punta al percorso aperto (i patentati restano a NULL:
--    non hanno un percorso in corso, ed e' esattamente cio' che significa).
UPDATE "CompanyMember" m
SET "activeLicensePathId" = p."id"
FROM "AutoscuolaLicensePath" p
WHERE p."companyId" = m."companyId"
  AND p."studentId" = m."userId"
  AND p."status" = 'active';

-- Le guide non vengono toccate: non hanno una colonna di percorso, e non per
-- dimenticanza. Il percorso di una guida si ricava dalla sua data (`pathForDate`
-- in lib/autoscuole/license-paths.ts), cosi' non c'e' niente da tenere allineato
-- nei 13 punti del prodotto che creano appuntamenti.
