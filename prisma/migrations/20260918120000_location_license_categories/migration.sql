-- REG-409: tipi di patente serviti da ogni luogo guida.
-- Il campo precompila il "Luogo" in creazione guida in base alla patente.
ALTER TABLE "AutoscuolaLocation"
  ADD COLUMN "licenseCategories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
