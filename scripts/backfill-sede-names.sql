-- One-shot backfill: rename default sede locations to use the company name.
-- Idempotent: only touches rows that still have the original placeholder name,
-- so re-running the script does nothing and never overwrites a sede the
-- titolare has already customised.
--
-- Run after the locations feature is deployed:
--   pnpm prisma db execute --file scripts/backfill-sede-names.sql --schema prisma/schema.prisma
-- Use .env.prod for the prod DB:
--   DOTENV_CONFIG_PATH=.env.prod NODE_OPTIONS=--require=dotenv/config \
--     npx prisma db execute --file scripts/backfill-sede-names.sql \
--     --schema prisma/schema.prisma

UPDATE "AutoscuolaLocation" AS loc
SET name = 'Sede ' || c.name,
    "updatedAt" = NOW()
FROM "Company" AS c
WHERE loc."companyId" = c.id
  AND loc."isDefault" = true
  AND loc.name = 'Sede dell''autoscuola';
