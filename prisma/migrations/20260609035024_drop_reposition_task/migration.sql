-- DropForeignKey
ALTER TABLE "AutoscuolaAppointmentRepositionTask" DROP CONSTRAINT "AutoscuolaAppointmentRepositionTask_companyId_fkey";

-- DropForeignKey
ALTER TABLE "AutoscuolaAppointmentRepositionTask" DROP CONSTRAINT "AutoscuolaAppointmentRepositionTask_createdByUserId_fkey";

-- DropForeignKey
ALTER TABLE "AutoscuolaAppointmentRepositionTask" DROP CONSTRAINT "AutoscuolaAppointmentRepositionTask_matchedAppointmentId_fkey";

-- DropForeignKey
ALTER TABLE "AutoscuolaAppointmentRepositionTask" DROP CONSTRAINT "AutoscuolaAppointmentRepositionTask_sourceAppointmentId_fkey";

-- DropForeignKey
ALTER TABLE "AutoscuolaAppointmentRepositionTask" DROP CONSTRAINT "AutoscuolaAppointmentRepositionTask_studentId_fkey";

-- DropTable
DROP TABLE "AutoscuolaAppointmentRepositionTask";

