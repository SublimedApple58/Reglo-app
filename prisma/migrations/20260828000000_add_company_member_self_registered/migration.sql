-- REG-410: mark students who joined the autoscuola in autonomy (mobile self
-- sign-up), so they can be prompted to pick their own license path at first
-- access. Additive, non-null with a false default → no backfill, no gating of
-- any pre-existing member.
ALTER TABLE "CompanyMember" ADD COLUMN "selfRegistered" BOOLEAN NOT NULL DEFAULT false;
