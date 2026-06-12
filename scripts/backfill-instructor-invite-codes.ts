// One-shot backfill: generate a per-instructor invite code for every
// AutoscuolaInstructor that doesn't have one yet (ALL instructors, including
// non-autonomous: the code is inert until autonomousMode is enabled — signup
// rejects codes of non-autonomous/inactive instructors).
//
// Run (dev):
//   DOTENV_CONFIG_PATH=.env.dev NODE_OPTIONS=--require=dotenv/config npx ts-node scripts/backfill-instructor-invite-codes.ts
// Run (prod):
//   DOTENV_CONFIG_PATH=.env.prod NODE_OPTIONS=--require=dotenv/config npx ts-node scripts/backfill-instructor-invite-codes.ts
import { PrismaClient } from "@prisma/client";
import nodeCrypto from "node:crypto";

const prisma = new PrismaClient();

// No 0/O/1/I — easy to read aloud and retype (same charset as the company backfill).
const INSTRUCTOR_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(): string {
  const bytes = nodeCrypto.randomBytes(6);
  return Array.from(bytes)
    .map((b) => INSTRUCTOR_CHARSET[b % INSTRUCTOR_CHARSET.length])
    .join("");
}

async function main() {
  const instructors = await prisma.autoscuolaInstructor.findMany({
    where: { inviteCode: null },
    select: { id: true, name: true, companyId: true, autonomousMode: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Found ${instructors.length} instructors without invite codes`);

  for (const instructor of instructors) {
    let code: string;
    let attempts = 0;
    do {
      code = generateCode();
      attempts++;
      // Cross-table uniqueness: the signup field is shared with the company
      // code (company-first lookup) — never mint a code that exists in EITHER
      // table.
    } while (
      ((await prisma.autoscuolaInstructor.findUnique({ where: { inviteCode: code } })) ||
        (await prisma.company.findUnique({ where: { inviteCode: code } }))) &&
      attempts < 100
    );

    await prisma.autoscuolaInstructor.update({
      where: { id: instructor.id },
      data: { inviteCode: code },
    });

    console.log(
      `  ${instructor.name} (${instructor.autonomousMode ? "autonomo" : "non autonomo"}) → ${code}`,
    );
  }

  console.log("Done!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
