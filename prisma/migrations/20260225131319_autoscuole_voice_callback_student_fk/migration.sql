-- AddForeignKey
ALTER TABLE "AutoscuolaVoiceCallbackTask" ADD CONSTRAINT "AutoscuolaVoiceCallbackTask_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
