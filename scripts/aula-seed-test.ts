import "dotenv/config";
import { PrismaClient } from "@prisma/client";

/**
 * Reglo Aula — seed di TEST per provare il modulo end-to-end senza UI di editor.
 *
 * Per una company:
 *  1. abilita il flag `aulaEnabled` in CompanyService(AUTOSCUOLE).limits
 *  2. crea una AulaLesson mappata a un capitolo che ha domande (per il quiz live)
 *
 * Il quiz live NON legge R2: per testarlo basta questa lezione (packageR2Key fittizio).
 *
 * Uso:
 *   DOTENV_CONFIG_PATH=.env.dev NODE_OPTIONS=--require=dotenv/config \
 *     npx tsx scripts/aula-seed-test.ts "<nome o id company>"
 */

const prisma = new PrismaClient();

async function main() {
  const arg = process.argv[2];
  if (!arg) throw new Error('Passa nome o id della company: npx tsx scripts/aula-seed-test.ts "<company>"');

  const company = await prisma.company.findFirst({
    where: { OR: [{ id: arg }, { name: { contains: arg, mode: "insensitive" } }] },
    select: { id: true, name: true },
  });
  if (!company) throw new Error(`Company non trovata per "${arg}"`);
  console.log(`Company: ${company.name} (${company.id})`);

  // 1. abilita aulaEnabled
  const service = await prisma.companyService.findUnique({
    where: { companyId_serviceKey: { companyId: company.id, serviceKey: "AUTOSCUOLE" } },
  });
  const limits = { ...((service?.limits as Record<string, unknown>) ?? {}), aulaEnabled: true };
  await prisma.companyService.upsert({
    where: { companyId_serviceKey: { companyId: company.id, serviceKey: "AUTOSCUOLE" } },
    update: { limits },
    create: { companyId: company.id, serviceKey: "AUTOSCUOLE", status: "ACTIVE", limits },
  });
  console.log("aulaEnabled = true");

  // 2. trova un capitolo con domande
  const chapter = await prisma.quizChapter.findFirst({
    where: { questions: { some: {} } },
    orderBy: { chapterNumber: "asc" },
    select: { id: true, chapterNumber: true, description: true },
  });
  if (!chapter) throw new Error("Nessun QuizChapter con domande: esegui prima il seed del quiz.");

  // 3. crea (o riusa) una lezione di test per la company
  const existing = await prisma.aulaLesson.findFirst({
    where: { companyId: company.id, title: "Lezione di test" },
  });
  const lesson =
    existing ??
    (await prisma.aulaLesson.create({
      data: {
        companyId: company.id,
        chapterId: chapter.id,
        title: "Lezione di test",
        description: `Quiz live sul capitolo ${chapter.chapterNumber}`,
        isTemplate: false,
        packageR2Key: `aula/${company.id}/test-lesson.json`,
      },
    }));

  console.log(`Lezione: ${lesson.title} (${lesson.id}) → capitolo ${chapter.chapterNumber}`);
  console.log("\nOra: pnpm dev → apri /aula → 'Avvia quiz' sulla lezione di test.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
