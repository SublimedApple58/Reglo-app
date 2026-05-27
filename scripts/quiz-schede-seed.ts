import 'dotenv/config';
import { neonConfig, neon } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@prisma/client';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const SCHEDA_SIZE = 30;

async function main() {
  const chapters = await prisma.quizChapter.findMany({
    orderBy: { chapterNumber: 'asc' },
  });

  console.log(`Found ${chapters.length} chapters`);
  let totalSchede = 0;

  const sql = neon(process.env.DATABASE_URL!);

  for (const chapter of chapters) {
    // Fetch questions ordered by externalId (deterministic ministerial order)
    const questions = await prisma.quizQuestion.findMany({
      where: { chapterId: chapter.id },
      orderBy: { externalId: 'asc' },
      select: { id: true },
    });

    // Chunk into groups of SCHEDA_SIZE
    const chunks: string[][] = [];
    for (let i = 0; i < questions.length; i += SCHEDA_SIZE) {
      chunks.push(questions.slice(i, i + SCHEDA_SIZE).map((q) => q.id));
    }

    console.log(
      `  Chapter ${chapter.chapterNumber} "${chapter.description}": ${questions.length} questions → ${chunks.length} schede`,
    );

    for (let i = 0; i < chunks.length; i++) {
      const questionIds = chunks[i];
      const schedaNumber = i + 1;

      // Idempotent: ON CONFLICT DO NOTHING
      await sql`
        INSERT INTO "QuizScheda" ("id", "chapterId", "schedaNumber", "questionIds", "totalQuestions", "createdAt")
        VALUES (gen_random_uuid(), ${chapter.id}::uuid, ${schedaNumber}, ${questionIds as any}::uuid[], ${questionIds.length}, NOW())
        ON CONFLICT ("chapterId", "schedaNumber") DO NOTHING
      `;

      totalSchede++;
    }
  }

  console.log(`\nDone! Created ${totalSchede} schede total.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
