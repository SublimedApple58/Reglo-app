import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const companyName = process.argv[2] ?? 'Reglo';

  let company = await prisma.company.findFirst({
    where: { name: companyName },
  });

  if (!company) {
    company = await prisma.company.create({
      data: { name: companyName },
    });
  }

  const users = await prisma.user.findMany({
    select: { id: true, role: true },
  });

  if (users.length === 0) {
    console.log('No users found. Nothing to link.');
    return;
  }

  await prisma.companyMember.createMany({
    data: users.map((user) => ({
      companyId: company!.id,
      userId: user.id,
      role: user.role === 'admin' ? 'admin' : 'member',
    })),
    skipDuplicates: true,
  });

  console.log(`Company created/used: ${company.name} (${company.id})`);
  console.log(`Users linked: ${users.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
