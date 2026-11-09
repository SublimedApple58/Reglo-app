-- Allievo creato con telefono + password (richiesta Ricca): solo colonne nuove, nullable.
ALTER TABLE "User" ADD COLUMN "loginPhone" TEXT;
ALTER TABLE "User" ADD COLUMN "birthDate" DATE;
ALTER TABLE "User" ADD COLUMN "profileCompletedAt" TIMESTAMP(6);

CREATE UNIQUE INDEX "user_login_phone_key" ON "User"("loginPhone");
