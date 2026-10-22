-- REG-629: ex allievi archiviati (additiva).
CREATE TABLE "AutoscuolaFormerStudent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT,
    "reason" TEXT NOT NULL,
    "leftAt" TIMESTAMP(6) NOT NULL,
    "actorUserId" UUID,
    "joinedAt" TIMESTAMP(6),
    "licenseCategory" TEXT,
    "transmission" TEXT,
    "nameAssignedBy" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "AutoscuolaFormerStudent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AutoscuolaFormerStudent_companyId_userId_key" ON "AutoscuolaFormerStudent"("companyId", "userId");

CREATE INDEX "AutoscuolaFormerStudent_companyId_leftAt_idx" ON "AutoscuolaFormerStudent"("companyId", "leftAt");

ALTER TABLE "AutoscuolaFormerStudent" ADD CONSTRAINT "AutoscuolaFormerStudent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutoscuolaFormerStudent" ADD CONSTRAINT "AutoscuolaFormerStudent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
