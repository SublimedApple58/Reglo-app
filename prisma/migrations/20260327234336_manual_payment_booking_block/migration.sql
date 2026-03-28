-- AlterTable
ALTER TABLE "AutoscuolaAppointment" ADD COLUMN     "lateCancellationAction" TEXT,
ADD COLUMN     "manualPaymentStatus" TEXT;

-- AlterTable
ALTER TABLE "CompanyMember" ADD COLUMN     "bookingBlocked" BOOLEAN NOT NULL DEFAULT false;
