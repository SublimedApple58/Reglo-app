-- REG-500: consenso agli avvisi di servizio su WhatsApp.
ALTER TABLE "User" ADD COLUMN "whatsappConsentAt" TIMESTAMP(6);
ALTER TABLE "User" ADD COLUMN "whatsappConsentSource" TEXT;
