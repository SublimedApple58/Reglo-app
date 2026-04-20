/**
 * Migration script: Twilio → Telnyx
 *
 * For each active voice line with routingMode="twilio":
 * 1. Buys a new local Italian number on Telnyx
 * 2. Updates the voice line record (number, phoneSid, routingMode)
 * 3. Logs old → new number mapping
 *
 * Usage:
 *   npx tsx scripts/migrate-twilio-to-telnyx.ts [--dry-run]
 *
 * Env vars required:
 *   TELNYX_API_KEY, TELNYX_TEXML_APP_ID, TELNYX_IT_REQUIREMENT_GROUP_ID, DATABASE_URL
 */

export {};

const { PrismaClient } = require("@prisma/client") as { PrismaClient: new () => import("@prisma/client").PrismaClient };

const prisma = new PrismaClient();

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_TEXML_APP_ID = process.env.TELNYX_TEXML_APP_ID;
const TELNYX_IT_REQUIREMENT_GROUP_ID = process.env.TELNYX_IT_REQUIREMENT_GROUP_ID;
const BASE_URL = "https://api.telnyx.com/v2";

const DRY_RUN = process.argv.includes("--dry-run");

async function telnyxFetch(path: string, options?: RequestInit) {
  return fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TELNYX_API_KEY}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
}

interface MigrationResult {
  companyId: string;
  lineId: string;
  oldNumber: string;
  newNumber: string;
  newPhoneId: string;
  status: "success" | "error";
  error?: string;
}

async function main() {
  if (!TELNYX_API_KEY) {
    console.error("TELNYX_API_KEY not set");
    process.exit(1);
  }

  console.log(`Migration mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log("---");

  // Find all active Twilio voice lines
  const lines = await prisma.autoscuolaVoiceLine.findMany({
    where: { status: "ready", routingMode: "twilio" },
    include: { company: { select: { name: true } } },
  });

  console.log(`Found ${lines.length} active Twilio voice lines to migrate.\n`);

  const results: MigrationResult[] = [];

  for (const line of lines) {
    console.log(`[${line.company?.name ?? line.companyId}] ${line.twilioNumber}`);

    if (DRY_RUN) {
      results.push({
        companyId: line.companyId,
        lineId: line.id,
        oldNumber: line.twilioNumber,
        newNumber: "(dry-run)",
        newPhoneId: "(dry-run)",
        status: "success",
      });
      continue;
    }

    try {
      // 1. Search for available local number
      const searchRes = await telnyxFetch(
        "/available_phone_numbers?filter[country_code]=IT&filter[phone_number_type]=local&filter[limit]=1",
      );
      if (!searchRes.ok) {
        throw new Error(`Search failed: ${await searchRes.text()}`);
      }
      const { data: candidates } = await searchRes.json();
      if (!candidates?.length) {
        throw new Error("No local Italian numbers available");
      }

      // 2. Purchase number
      const orderRes = await telnyxFetch("/number_orders", {
        method: "POST",
        body: JSON.stringify({
          phone_numbers: [{ phone_number: candidates[0].phone_number }],
          connection_id: TELNYX_TEXML_APP_ID,
          messaging_profile_id: null,
          ...(TELNYX_IT_REQUIREMENT_GROUP_ID ? { requirement_group_id: TELNYX_IT_REQUIREMENT_GROUP_ID } : {}),
        }),
      });
      if (!orderRes.ok) {
        throw new Error(`Order failed: ${await orderRes.text()}`);
      }
      const { data: order } = await orderRes.json();
      const phoneNumbers = order?.phone_numbers ?? [];
      if (!phoneNumbers.length) {
        throw new Error("Order returned no phone numbers");
      }

      const newNumber = phoneNumbers[0].phone_number;
      const newPhoneId = phoneNumbers[0].id ?? order.id ?? "";

      // 3. Update DB
      await prisma.autoscuolaVoiceLine.update({
        where: { id: line.id },
        data: {
          twilioNumber: newNumber,
          twilioPhoneSid: newPhoneId,
          routingMode: "telnyx",
        },
      });

      console.log(`  ✓ ${line.twilioNumber} → ${newNumber}`);
      results.push({
        companyId: line.companyId,
        lineId: line.id,
        oldNumber: line.twilioNumber,
        newNumber,
        newPhoneId,
        status: "success",
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  ✗ Error: ${msg}`);
      results.push({
        companyId: line.companyId,
        lineId: line.id,
        oldNumber: line.twilioNumber,
        newNumber: "",
        newPhoneId: "",
        status: "error",
        error: msg,
      });
    }

    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 500));
  }

  // Print CSV report
  console.log("\n--- CSV Report ---");
  console.log("company_id,line_id,old_number,new_number,new_phone_id,status,error");
  for (const r of results) {
    console.log(
      `${r.companyId},${r.lineId},${r.oldNumber},${r.newNumber},${r.newPhoneId},${r.status},${r.error ?? ""}`,
    );
  }

  const successes = results.filter((r) => r.status === "success").length;
  const errors = results.filter((r) => r.status === "error").length;
  console.log(`\nDone. Success: ${successes}, Errors: ${errors}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
