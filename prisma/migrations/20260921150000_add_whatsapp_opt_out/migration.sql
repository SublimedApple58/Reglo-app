-- REG-500: revoca del consenso a ricevere messaggi WhatsApp.
-- Colonna nullable e additiva: nessun backfill, nessuno perde niente.
-- NULL = può ricevere. Valorizzata = ha detto STOP.
ALTER TABLE "User" ADD COLUMN "whatsappOptOutAt" TIMESTAMP(6);
