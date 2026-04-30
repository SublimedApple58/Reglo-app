# Database & Schema

## Stack
- PostgreSQL on Neon (serverless) with `@prisma/adapter-neon`
- Schema: `prisma/schema.prisma` (~1000 LOC, 48 models)
- Prisma client singleton: `db/prisma.ts` (with Decimal → string extension)
- UUIDs for PKs, `@db.Timestamp(6)` for timestamps

## Connection strings
- `DATABASE_URL` — pooled (for app queries)
- `DIRECT_URL` — direct (for migrations)

## Models by domain

**User & Auth (6):** User, Account, Session, VerificationToken, MobileAccessToken, MobilePushDevice

**Company (4):** Company, CompanyMember, CompanyInvite, CompanyService

**Integration (1):** IntegrationConnection

**Autoscuola Core (5):** AutoscuolaCase, AutoscuolaAppointment, AutoscuolaInstructor, AutoscuolaInstructorBlock, AutoscuolaVehicle

**Availability (5):** AutoscuolaWeeklyAvailability, AutoscuolaDailyAvailabilityOverride, AutoscuolaAvailabilitySlot, AutoscuolaHoliday, AutoscuolaInstructorPublishedWeek

**Booking (5):** AutoscuolaBookingRequest, AutoscuolaWaitlistOffer, AutoscuolaWaitlistResponse, AutoscuolaSwapOffer, AutoscuolaSwapResponse

**Payments (6):** AutoscuolaAppointmentPayment, AutoscuolaPaymentPlan, AutoscuolaPaymentInstallment, AutoscuolaStudentPaymentProfile, AutoscuolaStudentLessonCreditBalance, AutoscuolaStudentLessonCreditLedger

**Messaging (3):** AutoscuolaMessageTemplate, AutoscuolaMessageRule, AutoscuolaMessageLog

**Voice (5):** AutoscuolaVoiceLine, AutoscuolaVoiceCall, AutoscuolaVoiceCallTurn, AutoscuolaVoiceCallbackTask, AutoscuolaVoiceKnowledgeChunk

**Operations (2):** AutoscuolaAppointmentRepositionTask, AutoscuolaStudentWeeklyAbsence

## High-traffic models
- `AutoscuolaAppointment` — read/written by all action files, slot-matcher, payments, repositioning, communications
- `CompanyMember` — read by all action files for auth and role checks
- `AutoscuolaInstructor` — settings JSON parsed by instructor-clusters.ts, read by slot-matcher, repositioning
