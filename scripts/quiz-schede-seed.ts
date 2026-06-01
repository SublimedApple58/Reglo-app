import 'dotenv/config';
import { neonConfig, neon } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@prisma/client';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const SCHEDA_SIZE = 30;
const EXAM_SCHEDE_COUNT = 60;

// ── PRNG helpers ──────────────────────────────────────────────────────────────

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Round-robin interleave by argumentId, then shuffle within each group */
function interleaveByArgument(
  questions: { id: string; argumentId: string }[],
  rng: () => number,
): string[] {
  // Group by argumentId
  const groups = new Map<string, { id: string; argumentId: string }[]>();
  for (const q of questions) {
    const g = groups.get(q.argumentId) ?? [];
    g.push(q);
    groups.set(q.argumentId, g);
  }

  // Shuffle questions within each group
  const shuffledGroups = Array.from(groups.entries()).map(([argId, qs]) => ({
    argId,
    questions: seededShuffle(qs, rng),
  }));

  // Shuffle the group order
  const orderedGroups = seededShuffle(shuffledGroups, rng);

  // Round-robin across groups
  const result: string[] = [];
  let remaining = true;
  let round = 0;
  while (remaining) {
    remaining = false;
    for (const group of orderedGroups) {
      if (round < group.questions.length) {
        result.push(group.questions[round].id);
        remaining = true;
      }
    }
    round++;
  }

  return result;
}

// ── Seed chapter schede ──────────────────────────────────────────────────────

async function seedChapterSchede() {
  const chapters = await prisma.quizChapter.findMany({
    orderBy: { chapterNumber: 'asc' },
  });

  console.log(`Found ${chapters.length} chapters`);
  let totalSchede = 0;

  const sql = neon(process.env.DATABASE_URL!);

  for (const chapter of chapters) {
    const questions = await prisma.quizQuestion.findMany({
      where: { chapterId: chapter.id },
      select: { id: true, argumentId: true },
    });

    // Deterministic shuffle using chapter id as seed
    const rng = mulberry32(hashString(chapter.id));
    const interleaved = interleaveByArgument(questions, rng);

    // Chunk into groups of SCHEDA_SIZE
    const chunks: string[][] = [];
    for (let i = 0; i < interleaved.length; i += SCHEDA_SIZE) {
      chunks.push(interleaved.slice(i, i + SCHEDA_SIZE));
    }

    console.log(
      `  Chapter ${chapter.chapterNumber} "${chapter.description}": ${questions.length} questions → ${chunks.length} schede`,
    );

    for (let i = 0; i < chunks.length; i++) {
      const questionIds = chunks[i];
      const schedaNumber = i + 1;

      await sql`
        INSERT INTO "QuizScheda" ("id", "type", "chapterId", "schedaNumber", "questionIds", "totalQuestions", "createdAt")
        VALUES (gen_random_uuid(), 'CHAPTER', ${chapter.id}::uuid, ${schedaNumber}, ${questionIds as any}::uuid[], ${questionIds.length}, NOW())
        ON CONFLICT ("type", "chapterId", "schedaNumber") DO UPDATE SET
          "questionIds" = EXCLUDED."questionIds",
          "totalQuestions" = EXCLUDED."totalQuestions"
      `;

      totalSchede++;
    }
  }

  console.log(`\nChapter schede done: ${totalSchede} total.`);
}

// ── Seed exam schede ─────────────────────────────────────────────────────────

async function seedExamSchede() {
  const chapters = await prisma.quizChapter.findMany({
    orderBy: { chapterNumber: 'asc' },
    include: {
      questions: { select: { id: true, argumentId: true } },
    },
  });

  // Chapters 1-10: 2 questions each = 20
  // Chapters 11-25: pick 10 random out of 15, 1 question each = 10
  // Total: 30

  const first10 = chapters.filter((ch) => ch.chapterNumber >= 1 && ch.chapterNumber <= 10);
  const last15 = chapters.filter((ch) => ch.chapterNumber >= 11 && ch.chapterNumber <= 25);

  if (first10.length < 10 || last15.length < 10) {
    console.warn(`Not enough chapters: first10=${first10.length}, last15=${last15.length}. Skipping exam schede.`);
    return;
  }

  const sql = neon(process.env.DATABASE_URL!);

  for (let i = 0; i < EXAM_SCHEDE_COUNT; i++) {
    const schedaNumber = i + 1;
    const rng = mulberry32(hashString(`exam-scheda-${i}`));
    const questionIds: string[] = [];

    // Pick 2 from each of chapters 1-10
    for (const ch of first10) {
      const shuffled = seededShuffle(ch.questions, rng);
      questionIds.push(...shuffled.slice(0, 2).map((q) => q.id));
    }

    // Pick 10 random chapters from 11-25, 1 question each
    const selectedLate = seededShuffle(last15, rng).slice(0, 10);
    for (const ch of selectedLate) {
      const shuffled = seededShuffle(ch.questions, rng);
      questionIds.push(shuffled[0].id);
    }

    // Final shuffle of all 30 questions
    const finalOrder = seededShuffle(questionIds, rng);

    // For exam schede (chapterId IS NULL), upsert manually since
    // unique constraint with NULL doesn't match in Postgres ON CONFLICT
    const existing = await sql`
      SELECT id FROM "QuizScheda"
      WHERE "type" = 'EXAM' AND "chapterId" IS NULL AND "schedaNumber" = ${schedaNumber}
      LIMIT 1
    `;
    if (existing.length > 0) {
      await sql`
        UPDATE "QuizScheda"
        SET "questionIds" = ${finalOrder as any}::uuid[], "totalQuestions" = ${finalOrder.length}
        WHERE id = ${existing[0].id}::uuid
      `;
    } else {
      await sql`
        INSERT INTO "QuizScheda" ("id", "type", "chapterId", "schedaNumber", "questionIds", "totalQuestions", "createdAt")
        VALUES (gen_random_uuid(), 'EXAM', NULL, ${schedaNumber}, ${finalOrder as any}::uuid[], ${finalOrder.length}, NOW())
      `;
    }

    if ((i + 1) % 10 === 0) {
      console.log(`  Exam schede: ${i + 1}/${EXAM_SCHEDE_COUNT}`);
    }
  }

  console.log(`\nExam schede done: ${EXAM_SCHEDE_COUNT} total.`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await seedChapterSchede();
  await seedExamSchede();
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
