-- CreateTable
CREATE TABLE "BackofficeAdmin" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "passwordSetAt" TIMESTAMP(6),
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(6),
    "lastLoginAt" TIMESTAMP(6),
    "disabledAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackofficeAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackofficeAdminToken" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "adminId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(6) NOT NULL,
    "consumedAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackofficeAdminToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackofficeSession" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "adminId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(6) NOT NULL,
    "lastUsedAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackofficeSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BackofficeAdmin_email_key" ON "BackofficeAdmin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "BackofficeAdminToken_tokenHash_key" ON "BackofficeAdminToken"("tokenHash");

-- CreateIndex
CREATE INDEX "BackofficeAdminToken_adminId_idx" ON "BackofficeAdminToken"("adminId");

-- CreateIndex
CREATE UNIQUE INDEX "BackofficeSession_tokenHash_key" ON "BackofficeSession"("tokenHash");

-- CreateIndex
CREATE INDEX "BackofficeSession_adminId_idx" ON "BackofficeSession"("adminId");

-- AddForeignKey
ALTER TABLE "BackofficeAdminToken" ADD CONSTRAINT "BackofficeAdminToken_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "BackofficeAdmin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackofficeSession" ADD CONSTRAINT "BackofficeSession_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "BackofficeAdmin"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Le due persone con accesso al backoffice (REG-413). Nessuna password: la
-- sceglie ciascuno dal link di attivazione che arriva alla propria mail Reglo.
INSERT INTO "BackofficeAdmin" ("email", "name") VALUES
    ('tiziano.difelice@reglo.it', 'Tiziano Di Felice'),
    ('gabriele.ruzzu@reglo.it', 'Gabriele Ruzzu')
ON CONFLICT ("email") DO NOTHING;
