import 'dotenv/config';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { neonConfig, neon } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@prisma/client';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const DATA_DIR = join(__dirname, '../data/quiz-raw/avalla/src/services');

type RawChapter = { id_chapter: number; descrizione: string };
type RawHint = { result: string; id: number; title: string; description: string };
type RawQuestion = {
  id: number;
  id_argument: string;
  image: number;
  answer: number;
  question: string;
  theory: number;
  id_chapter: number;
};

async function main() {
  const [chaptersRaw, hintsRaw, questionsRaw] = await Promise.all([
    readFile(join(DATA_DIR, 'chapters.json'), 'utf-8').then((d) => JSON.parse(d) as RawChapter[]),
    readFile(join(DATA_DIR, 'hints.json'), 'utf-8').then((d) => JSON.parse(d) as RawHint[]),
    readFile(join(DATA_DIR, 'questions.json'), 'utf-8').then((d) => JSON.parse(d) as RawQuestion[]),
  ]);

  // Filter out error entries from hints
  const validHints = hintsRaw.filter((h) => h.result === 'success' && h.id && h.title);
  console.log(`Chapters: ${chaptersRaw.length}, Hints: ${validHints.length} (${hintsRaw.length - validHints.length} skipped), Questions: ${questionsRaw.length}`);

  // Use raw SQL with ON CONFLICT for idempotency (Neon adapter doesn't support createMany skipDuplicates)
  const sql = neon(process.env.DATABASE_URL!);

  // 1. Insert chapters
  for (const ch of chaptersRaw) {
    await sql`
      INSERT INTO "QuizChapter" (id, "chapterNumber", description, "createdAt")
      VALUES (gen_random_uuid(), ${ch.id_chapter}, ${ch.descrizione}, NOW())
      ON CONFLICT ("chapterNumber") DO NOTHING
    `;
  }
  console.log('Chapters inserted');

  // 2. Insert hints
  const HINT_BATCH = 50;
  for (let i = 0; i < validHints.length; i += HINT_BATCH) {
    const batch = validHints.slice(i, i + HINT_BATCH);
    for (const h of batch) {
      await sql`
        INSERT INTO "QuizHint" (id, "externalId", title, "descriptionHtml", "createdAt")
        VALUES (gen_random_uuid(), ${h.id}, ${h.title}, ${h.description}, NOW())
        ON CONFLICT ("externalId") DO NOTHING
      `;
    }
    console.log(`Hints: ${Math.min(i + HINT_BATCH, validHints.length)}/${validHints.length}`);
  }

  // 3. Build lookup maps
  const chapters = await prisma.quizChapter.findMany();
  const chapterMap = new Map(chapters.map((ch) => [ch.chapterNumber, ch.id]));

  const hints = await prisma.quizHint.findMany();
  const hintMap = new Map(hints.map((h) => [h.externalId, h.id]));

  // 4. Insert questions in batches
  const BATCH_SIZE = 100;
  let inserted = 0;

  for (let i = 0; i < questionsRaw.length; i += BATCH_SIZE) {
    const batch = questionsRaw.slice(i, i + BATCH_SIZE);
    for (const q of batch) {
      const chapterId = chapterMap.get(q.id_chapter);
      if (!chapterId) throw new Error(`Missing chapter for id_chapter=${q.id_chapter}`);
      const hintId = q.theory !== 0 ? (hintMap.get(q.theory) ?? null) : null;
      const imageKey = q.image !== 0 ? `quiz/images/${String(q.image).padStart(3, '0')}.gif` : null;
      const correctAnswer = q.answer === 1;

      await sql`
        INSERT INTO "QuizQuestion" (id, "externalId", "argumentId", "chapterId", "hintId", "imageKey", "questionText", "correctAnswer", "createdAt")
        VALUES (gen_random_uuid(), ${q.id}, ${q.id_argument}, ${chapterId}::uuid, ${hintId}::uuid, ${imageKey}, ${q.question}, ${correctAnswer}, NOW())
        ON CONFLICT ("externalId") DO NOTHING
      `;
    }
    inserted += batch.length;
    console.log(`Questions: ${inserted}/${questionsRaw.length}`);
  }

  console.log('Done. Seed complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
