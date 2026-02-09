-- Ensure MobilePushDevice.updatedAt precision is consistent.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'MobilePushDevice'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'MobilePushDevice'
      AND column_name = 'updatedAt'
  ) THEN
    ALTER TABLE "MobilePushDevice"
    ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);
  END IF;
END
$$;
