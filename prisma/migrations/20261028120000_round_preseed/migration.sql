-- CreateTable
CREATE TABLE "FundraisingRound" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "targetCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundraisingRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoundInvestor" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "roundId" UUID NOT NULL,
    "importKey" TEXT,
    "name" TEXT NOT NULL,
    "organization" TEXT,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "city" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "linkedinUrl" TEXT,
    "websiteUrl" TEXT,
    "channel" TEXT,
    "channelDetail" TEXT,
    "owner" TEXT,
    "status" TEXT NOT NULL DEFAULT 'da_contattare',
    "blockedReason" TEXT,
    "leadRole" TEXT,
    "priority" TEXT,
    "ticket" TEXT,
    "fit" TEXT,
    "source" TEXT,
    "notes" TEXT,
    "commitmentCents" INTEGER,
    "lastContactOn" DATE,
    "nextStepOn" DATE,
    "nextStepNote" TEXT,
    "contactedOn" DATE,
    "respondedOn" DATE,
    "callOn" DATE,
    "interestedOn" DATE,
    "committedOn" DATE,
    "excludedAt" TIMESTAMP(6),
    "excludedReason" TEXT,
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoundInvestor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoundInteraction" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "investorId" UUID NOT NULL,
    "occurredOn" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorName" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoundInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoundInvestor_roundId_status_idx" ON "RoundInvestor"("roundId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RoundInvestor_roundId_importKey_key" ON "RoundInvestor"("roundId", "importKey");

-- CreateIndex
CREATE INDEX "RoundInteraction_investorId_occurredOn_idx" ON "RoundInteraction"("investorId", "occurredOn");

-- AddForeignKey
ALTER TABLE "RoundInvestor" ADD CONSTRAINT "RoundInvestor_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "FundraisingRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundInteraction" ADD CONSTRAINT "RoundInteraction_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "RoundInvestor"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Chi è escluso ha sempre un motivo (non basta il form).
ALTER TABLE "RoundInvestor" ADD CONSTRAINT "RoundInvestor_excluded_reason_check"
  CHECK ("excludedAt" IS NULL OR length(btrim(coalesce("excludedReason", ''))) > 0);
