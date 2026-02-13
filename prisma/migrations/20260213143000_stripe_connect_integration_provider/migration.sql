DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'IntegrationProvider'
      AND e.enumlabel = 'STRIPE_CONNECT'
  ) THEN
    ALTER TYPE "IntegrationProvider" ADD VALUE 'STRIPE_CONNECT';
  END IF;
END $$;
