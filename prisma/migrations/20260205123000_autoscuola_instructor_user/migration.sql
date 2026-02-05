ALTER TABLE "AutoscuolaInstructor" ADD COLUMN "userId" UUID;

CREATE INDEX "AutoscuolaInstructor_userId_idx" ON "AutoscuolaInstructor"("userId");

CREATE UNIQUE INDEX "AutoscuolaInstructor_companyId_userId_key" ON "AutoscuolaInstructor"("companyId", "userId");

ALTER TABLE "AutoscuolaInstructor"
ADD CONSTRAINT "AutoscuolaInstructor_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
