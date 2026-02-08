-- Add student contact field on user profile.
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "phone" TEXT;

-- Build a deterministic student -> user mapping.
CREATE TEMP TABLE student_user_map (
  student_id UUID PRIMARY KEY,
  user_id UUID NOT NULL
) ON COMMIT DROP;

-- 1) Exact id match (student row already aligned to user id).
INSERT INTO student_user_map (student_id, user_id)
SELECT s.id, s.id
FROM "AutoscuolaStudent" s
JOIN "CompanyMember" cm
  ON cm."companyId" = s."companyId"
 AND cm."userId" = s.id
 AND cm."autoscuolaRole" = 'STUDENT'
ON CONFLICT (student_id) DO NOTHING;

-- 2) Email match inside same company + student role.
INSERT INTO student_user_map (student_id, user_id)
SELECT s.id, u.id
FROM "AutoscuolaStudent" s
JOIN "User" u
  ON LOWER(TRIM(u.email)) = LOWER(TRIM(s.email))
JOIN "CompanyMember" cm
  ON cm."companyId" = s."companyId"
 AND cm."userId" = u.id
 AND cm."autoscuolaRole" = 'STUDENT'
WHERE s.email IS NOT NULL
  AND TRIM(s.email) <> ''
ON CONFLICT (student_id) DO NOTHING;

-- 3) Unique full-name match inside same company + student role.
WITH candidates AS (
  SELECT
    s.id AS student_id,
    cm."userId" AS user_id,
    COUNT(*) OVER (PARTITION BY s.id) AS candidate_count
  FROM "AutoscuolaStudent" s
  JOIN "CompanyMember" cm
    ON cm."companyId" = s."companyId"
   AND cm."autoscuolaRole" = 'STUDENT'
  JOIN "User" u
    ON u.id = cm."userId"
  WHERE REGEXP_REPLACE(LOWER(TRIM(COALESCE(u.name, ''))), '\\s+', ' ', 'g') =
        REGEXP_REPLACE(
          LOWER(TRIM(COALESCE(s."firstName", '') || ' ' || COALESCE(s."lastName", ''))),
          '\\s+',
          ' ',
          'g'
        )
)
INSERT INTO student_user_map (student_id, user_id)
SELECT student_id, user_id
FROM candidates
WHERE candidate_count = 1
ON CONFLICT (student_id) DO NOTHING;

-- Drop legacy student FKs before remapping ids to User ids.
ALTER TABLE "AutoscuolaCase"
DROP CONSTRAINT IF EXISTS "AutoscuolaCase_studentId_fkey";

ALTER TABLE "AutoscuolaAppointment"
DROP CONSTRAINT IF EXISTS "AutoscuolaAppointment_studentId_fkey";

ALTER TABLE "AutoscuolaBookingRequest"
DROP CONSTRAINT IF EXISTS "AutoscuolaBookingRequest_studentId_fkey";

ALTER TABLE "AutoscuolaWaitlistResponse"
DROP CONSTRAINT IF EXISTS "AutoscuolaWaitlistResponse_studentId_fkey";

ALTER TABLE "AutoscuolaDocument"
DROP CONSTRAINT IF EXISTS "AutoscuolaDocument_studentId_fkey";

ALTER TABLE "AutoscuolaPaymentPlan"
DROP CONSTRAINT IF EXISTS "AutoscuolaPaymentPlan_studentId_fkey";

ALTER TABLE "AutoscuolaMessageLog"
DROP CONSTRAINT IF EXISTS "AutoscuolaMessageLog_studentId_fkey";

DO $$
DECLARE
  unresolved_count INTEGER;
  duplicate_target_count INTEGER;
  invalid_reference_count INTEGER;
BEGIN
  -- Mapping must not collapse multiple students into one user automatically.
  SELECT COUNT(*)
    INTO duplicate_target_count
  FROM (
    SELECT user_id
    FROM student_user_map
    GROUP BY user_id
    HAVING COUNT(*) > 1
  ) dup;

  IF duplicate_target_count > 0 THEN
    RAISE EXCEPTION
      'Migrazione bloccata: % utenti STUDENT hanno piu record AutoscuolaStudent associati.',
      duplicate_target_count;
  END IF;

  -- Every referenced student id (including availability ownerId) must map to a user.
  WITH referenced AS (
    SELECT DISTINCT "studentId" AS id FROM "AutoscuolaCase"
    UNION
    SELECT DISTINCT "studentId" AS id FROM "AutoscuolaAppointment"
    UNION
    SELECT DISTINCT "studentId" AS id FROM "AutoscuolaBookingRequest"
    UNION
    SELECT DISTINCT "studentId" AS id FROM "AutoscuolaWaitlistResponse"
    UNION
    SELECT DISTINCT "studentId" AS id FROM "AutoscuolaDocument"
    UNION
    SELECT DISTINCT "studentId" AS id FROM "AutoscuolaPaymentPlan"
    UNION
    SELECT DISTINCT "studentId" AS id FROM "AutoscuolaMessageLog" WHERE "studentId" IS NOT NULL
    UNION
    SELECT DISTINCT "ownerId" AS id FROM "AutoscuolaWeeklyAvailability" WHERE "ownerType" = 'student'
    UNION
    SELECT DISTINCT "ownerId" AS id FROM "AutoscuolaAvailabilitySlot" WHERE "ownerType" = 'student'
  ),
  unresolved AS (
    SELECT r.id
    FROM referenced r
    LEFT JOIN student_user_map m ON m.student_id = r.id
    LEFT JOIN "User" u ON u.id = r.id
    WHERE m.user_id IS NULL
      AND u.id IS NULL
  )
  SELECT COUNT(*) INTO unresolved_count FROM unresolved;

  IF unresolved_count > 0 THEN
    RAISE EXCEPTION
      'Migrazione bloccata: % riferimenti studente non mappabili verso utenti Directory.',
      unresolved_count;
  END IF;

  -- Preserve student phone where user phone is empty.
  UPDATE "User" u
  SET "phone" = s.phone
  FROM "AutoscuolaStudent" s
  JOIN student_user_map m ON m.student_id = s.id
  WHERE u.id = m.user_id
    AND s.phone IS NOT NULL
    AND TRIM(s.phone) <> ''
    AND (u."phone" IS NULL OR TRIM(u."phone") = '');

  -- Remove duplicates that would violate owner uniqueness after id remap.
  WITH mapped AS (
    SELECT
      wa.id,
      ROW_NUMBER() OVER (
        PARTITION BY wa."companyId", wa."ownerType", m.user_id
        ORDER BY wa."updatedAt" DESC, wa."createdAt" DESC, wa.id DESC
      ) AS rn
    FROM "AutoscuolaWeeklyAvailability" wa
    JOIN student_user_map m
      ON wa."ownerType" = 'student'
     AND wa."ownerId" = m.student_id
  )
  DELETE FROM "AutoscuolaWeeklyAvailability" wa
  USING mapped
  WHERE wa.id = mapped.id
    AND mapped.rn > 1;

  WITH mapped AS (
    SELECT
      slot.id,
      ROW_NUMBER() OVER (
        PARTITION BY slot."companyId", slot."ownerType", m.user_id, slot."startsAt"
        ORDER BY (slot.status = 'booked') DESC, slot."updatedAt" DESC, slot.id DESC
      ) AS rn
    FROM "AutoscuolaAvailabilitySlot" slot
    JOIN student_user_map m
      ON slot."ownerType" = 'student'
     AND slot."ownerId" = m.student_id
  )
  DELETE FROM "AutoscuolaAvailabilitySlot" slot
  USING mapped
  WHERE slot.id = mapped.id
    AND mapped.rn > 1;

  -- Remap owner ids in availability records.
  UPDATE "AutoscuolaWeeklyAvailability" wa
  SET "ownerId" = m.user_id
  FROM student_user_map m
  WHERE wa."ownerType" = 'student'
    AND wa."ownerId" = m.student_id;

  UPDATE "AutoscuolaAvailabilitySlot" slot
  SET "ownerId" = m.user_id
  FROM student_user_map m
  WHERE slot."ownerType" = 'student'
    AND slot."ownerId" = m.student_id;

  -- Remap all studentId foreign keys.
  UPDATE "AutoscuolaCase" c
  SET "studentId" = m.user_id
  FROM student_user_map m
  WHERE c."studentId" = m.student_id;

  UPDATE "AutoscuolaAppointment" a
  SET "studentId" = m.user_id
  FROM student_user_map m
  WHERE a."studentId" = m.student_id;

  UPDATE "AutoscuolaBookingRequest" br
  SET "studentId" = m.user_id
  FROM student_user_map m
  WHERE br."studentId" = m.student_id;

  UPDATE "AutoscuolaWaitlistResponse" wr
  SET "studentId" = m.user_id
  FROM student_user_map m
  WHERE wr."studentId" = m.student_id;

  UPDATE "AutoscuolaDocument" d
  SET "studentId" = m.user_id
  FROM student_user_map m
  WHERE d."studentId" = m.student_id;

  UPDATE "AutoscuolaPaymentPlan" pp
  SET "studentId" = m.user_id
  FROM student_user_map m
  WHERE pp."studentId" = m.student_id;

  UPDATE "AutoscuolaMessageLog" ml
  SET "studentId" = m.user_id
  FROM student_user_map m
  WHERE ml."studentId" = m.student_id;

  -- Final guard: all student references must now point to existing users.
  WITH referenced AS (
    SELECT DISTINCT "studentId" AS id FROM "AutoscuolaCase"
    UNION
    SELECT DISTINCT "studentId" AS id FROM "AutoscuolaAppointment"
    UNION
    SELECT DISTINCT "studentId" AS id FROM "AutoscuolaBookingRequest"
    UNION
    SELECT DISTINCT "studentId" AS id FROM "AutoscuolaWaitlistResponse"
    UNION
    SELECT DISTINCT "studentId" AS id FROM "AutoscuolaDocument"
    UNION
    SELECT DISTINCT "studentId" AS id FROM "AutoscuolaPaymentPlan"
    UNION
    SELECT DISTINCT "studentId" AS id FROM "AutoscuolaMessageLog" WHERE "studentId" IS NOT NULL
    UNION
    SELECT DISTINCT "ownerId" AS id FROM "AutoscuolaWeeklyAvailability" WHERE "ownerType" = 'student'
    UNION
    SELECT DISTINCT "ownerId" AS id FROM "AutoscuolaAvailabilitySlot" WHERE "ownerType" = 'student'
  )
  SELECT COUNT(*)
    INTO invalid_reference_count
  FROM referenced r
  LEFT JOIN "User" u ON u.id = r.id
  WHERE u.id IS NULL;

  IF invalid_reference_count > 0 THEN
    RAISE EXCEPTION
      'Migrazione bloccata: % riferimenti studente non validi dopo remap.',
      invalid_reference_count;
  END IF;
END
$$;

-- Switch foreign keys from AutoscuolaStudent to User.
ALTER TABLE "AutoscuolaCase"
DROP CONSTRAINT IF EXISTS "AutoscuolaCase_studentId_fkey";

ALTER TABLE "AutoscuolaAppointment"
DROP CONSTRAINT IF EXISTS "AutoscuolaAppointment_studentId_fkey";

ALTER TABLE "AutoscuolaBookingRequest"
DROP CONSTRAINT IF EXISTS "AutoscuolaBookingRequest_studentId_fkey";

ALTER TABLE "AutoscuolaWaitlistResponse"
DROP CONSTRAINT IF EXISTS "AutoscuolaWaitlistResponse_studentId_fkey";

ALTER TABLE "AutoscuolaDocument"
DROP CONSTRAINT IF EXISTS "AutoscuolaDocument_studentId_fkey";

ALTER TABLE "AutoscuolaPaymentPlan"
DROP CONSTRAINT IF EXISTS "AutoscuolaPaymentPlan_studentId_fkey";

ALTER TABLE "AutoscuolaMessageLog"
DROP CONSTRAINT IF EXISTS "AutoscuolaMessageLog_studentId_fkey";

ALTER TABLE "AutoscuolaCase"
ADD CONSTRAINT "AutoscuolaCase_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AutoscuolaAppointment"
ADD CONSTRAINT "AutoscuolaAppointment_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AutoscuolaBookingRequest"
ADD CONSTRAINT "AutoscuolaBookingRequest_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AutoscuolaWaitlistResponse"
ADD CONSTRAINT "AutoscuolaWaitlistResponse_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AutoscuolaDocument"
ADD CONSTRAINT "AutoscuolaDocument_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AutoscuolaPaymentPlan"
ADD CONSTRAINT "AutoscuolaPaymentPlan_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AutoscuolaMessageLog"
ADD CONSTRAINT "AutoscuolaMessageLog_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Legacy table removed: students now live in Directory (User + CompanyMember.autoscuolaRole=STUDENT).
DROP TABLE IF EXISTS "AutoscuolaStudent";
