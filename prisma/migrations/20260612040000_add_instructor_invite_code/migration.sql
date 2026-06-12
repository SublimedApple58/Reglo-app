-- Per-instructor invite code: student signup with this code joins the school
-- AND is assigned to the instructor (only while active + autonomousMode).
ALTER TABLE "AutoscuolaInstructor" ADD COLUMN "inviteCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AutoscuolaInstructor_inviteCode_key" ON "AutoscuolaInstructor"("inviteCode");
