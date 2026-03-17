const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");

const prisma = new PrismaClient();

const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateInviteCode(): string {
  const bytes = crypto.randomBytes(6);
  return Array.from(bytes)
    .map((b: number) => CHARSET[b % CHARSET.length])
    .join("");
}

async function main() {
  const companies = await prisma.company.findMany({
    where: { inviteCode: null },
    select: { id: true, name: true },
  });

  console.log(`Found ${companies.length} companies without invite codes`);

  for (const company of companies) {
    let code: string;
    let attempts = 0;
    do {
      code = generateInviteCode();
      attempts++;
    } while (
      (await prisma.company.findUnique({ where: { inviteCode: code } })) &&
      attempts < 100
    );

    await prisma.company.update({
      where: { id: company.id },
      data: { inviteCode: code },
    });

    console.log(`  ${company.name} → ${code}`);
  }

  console.log("Done!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
