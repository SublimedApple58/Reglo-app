#!/usr/bin/env node
// scripts/retire-repositioning.mjs
//
// One-off cleanup for the "repositioning retired" flash release.
// Across ALL companies it cancels every live `proposal` appointment (orphaned
// offers that can no longer be regenerated), refunding the lesson credit when
// the proposal is still in the future and a credit had been applied — mirroring
// refundLessonCreditIfEligible + adjustStudentLessonCredits.
//
// (The AutoscuolaAppointmentRepositionTask table is dropped by the same release
// migration, so there are no reposition tasks left to close here.)
//
// DRY RUN by default — prints what it would do. Pass --apply to write.
//
// Usage:
//   DOTENV_CONFIG_PATH=.env.prod NODE_OPTIONS=--require=dotenv/config node scripts/retire-repositioning.mjs           # dry run
//   DOTENV_CONFIG_PATH=.env.prod NODE_OPTIONS=--require=dotenv/config node scripts/retire-repositioning.mjs --apply   # execute

import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();
const now = new Date();

const fmt = (d) =>
  new Date(d).toLocaleString("it-IT", { timeZone: "Europe/Rome" });

async function main() {
  console.log(
    `\n=== Retire repositioning — ${APPLY ? "APPLY (writing)" : "DRY RUN (no writes)"} — ${fmt(now)} ===\n`,
  );

  // ── Live proposals (all companies) ────────────────────────────────────────
  const proposals = await prisma.autoscuolaAppointment.findMany({
    where: { status: "proposal" },
    select: {
      id: true,
      companyId: true,
      studentId: true,
      startsAt: true,
      status: true,
      creditApplied: true,
      creditRefundedAt: true,
      company: { select: { name: true } },
      student: { select: { name: true } },
    },
    orderBy: { startsAt: "asc" },
  });
  console.log(`Live proposals to cancel: ${proposals.length}\n`);

  let refundCount = 0;
  for (const p of proposals) {
    const isFuture = new Date(p.startsAt).getTime() > now.getTime();
    const eligibleRefund =
      isFuture && p.creditApplied && !p.creditRefundedAt && p.status !== "no_show";
    if (eligibleRefund) refundCount += 1;
    console.log(
      `  • [${p.company?.name ?? "?"}] ${p.student?.name ?? "?"} — ${fmt(p.startsAt)} ` +
        `${isFuture ? "(futura)" : "(passata)"}${eligibleRefund ? " → +1 credito" : ""}`,
    );
  }
  console.log(
    `\nCredits to refund: ${refundCount} (only future proposals with an applied, not-yet-refunded credit)\n`,
  );

  if (!APPLY) {
    console.log("DRY RUN — nothing written. Re-run with --apply to execute.\n");
    return;
  }

  // ── Execute ───────────────────────────────────────────────────────────────
  let cancelled = 0;
  let refunded = 0;
  for (const p of proposals) {
    const isFuture = new Date(p.startsAt).getTime() > now.getTime();
    const eligibleRefund =
      isFuture && p.creditApplied && !p.creditRefundedAt && p.status !== "no_show";

    await prisma.$transaction(async (tx) => {
      if (eligibleRefund) {
        // Mark the appointment refunded (guarded so a concurrent run can't double-refund).
        const marked = await tx.autoscuolaAppointment.updateMany({
          where: { id: p.id, creditApplied: true, creditRefundedAt: null },
          data: { creditRefundedAt: now },
        });
        if (marked.count) {
          // get-or-create balance
          let balance = await tx.autoscuolaStudentLessonCreditBalance.findUnique({
            where: { companyId_studentId: { companyId: p.companyId, studentId: p.studentId } },
          });
          if (!balance) {
            balance = await tx.autoscuolaStudentLessonCreditBalance.create({
              data: { companyId: p.companyId, studentId: p.studentId, availableCredits: 0 },
            });
          }
          await tx.autoscuolaStudentLessonCreditBalance.update({
            where: { id: balance.id },
            data: { availableCredits: { increment: 1 } },
          });
          await tx.autoscuolaStudentLessonCreditLedger.create({
            data: {
              companyId: p.companyId,
              studentId: p.studentId,
              balanceId: balance.id,
              appointmentId: p.id,
              delta: 1,
              reason: "cancel_refund",
              actorUserId: null,
            },
          });
          refunded += 1;
        }
      }

      await tx.autoscuolaAppointment.update({
        where: { id: p.id },
        data: {
          status: "cancelled",
          cancelledAt: now,
          cancellationKind: "operational_cancel",
          cancellationReason: "repositioning_retired",
        },
      });
    });
    cancelled += 1;
  }

  console.log(`Cancelled ${cancelled} proposals, refunded ${refunded} credits.`);
  console.log("\nDone.\n");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
