-- REG-802: «prima volta in app» = `User.profileCompletedAt` null.
-- Chi ha già usato l'app (ha o ha avuto un accesso mobile o un dispositivo push)
-- non deve rivedere l'onboarding del «primo accesso normale»: si segna il
-- profilo come completo alla data di creazione. Restano null solo gli account
-- creati dall'autoscuola e mai entrati in app, che vedranno l'onboarding al
-- primo login. Solo dati, idempotente (tocca solo i null).
UPDATE "User" u
SET "profileCompletedAt" = u."createdAt"
WHERE u."profileCompletedAt" IS NULL
  AND (
    EXISTS (SELECT 1 FROM "MobileAccessToken" t WHERE t."userId" = u."id")
    OR EXISTS (SELECT 1 FROM "MobilePushDevice" d WHERE d."userId" = u."id")
  );
