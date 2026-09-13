-- Link "KPI per investor" (pagina pubblica a token). Additivo: nessuna tabella
-- esistente viene toccata.
CREATE TABLE "InvestorKpiLink" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(6),
    "revokedAt" TIMESTAMP(6),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestorKpiLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InvestorKpiLink_token_key" ON "InvestorKpiLink"("token");
CREATE INDEX "InvestorKpiLink_revokedAt_idx" ON "InvestorKpiLink"("revokedAt");
