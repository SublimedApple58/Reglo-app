import { prisma } from "@/db/prisma";

function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export async function generateExamQuestions(
  studentId: string,
  companyId: string,
): Promise<string[]> {
  // Get question IDs from last 3 exam sessions to exclude
  const recentSessions = await prisma.quizSession.findMany({
    where: { studentId, companyId, mode: "EXAM" },
    orderBy: { startedAt: "desc" },
    take: 3,
    select: { questionIds: true },
  });
  const recentQuestionIds = new Set(recentSessions.flatMap((s) => s.questionIds));

  // Get all questions grouped by chapter
  const questions = await prisma.quizQuestion.findMany({
    select: { id: true, chapter: { select: { chapterNumber: true } } },
  });

  const byChapter = new Map<number, string[]>();
  for (const q of questions) {
    const cn = q.chapter.chapterNumber;
    if (!byChapter.has(cn)) byChapter.set(cn, []);
    byChapter.get(cn)!.push(q.id);
  }

  const selected: string[] = [];

  // Chapters 1-10: 2 questions each = 20
  for (let ch = 1; ch <= 10; ch++) {
    const pool = (byChapter.get(ch) ?? []).filter((id) => !recentQuestionIds.has(id));
    const fallback = byChapter.get(ch) ?? [];
    const source = pool.length >= 2 ? pool : fallback;
    const picked = shuffle(source).slice(0, 2);
    selected.push(...picked);
  }

  // Chapters 11-25: pick 10 random chapters, 1 question each = 10
  const highChapters = shuffle(
    Array.from({ length: 15 }, (_, i) => i + 11),
  ).slice(0, 10);
  for (const ch of highChapters) {
    const pool = (byChapter.get(ch) ?? []).filter((id) => !recentQuestionIds.has(id));
    const fallback = byChapter.get(ch) ?? [];
    const source = pool.length >= 1 ? pool : fallback;
    const picked = shuffle(source).slice(0, 1);
    selected.push(...picked);
  }

  return shuffle(selected);
}

export async function generateChapterQuestions(
  studentId: string,
  companyId: string,
  chapterId: string,
): Promise<string[]> {
  // Get student stats for prioritization
  const stats = await prisma.quizStudentQuestionStat.findMany({
    where: { studentId, companyId },
    select: { questionId: true, timesAnswered: true, timesCorrect: true },
  });
  const statMap = new Map(stats.map((s) => [s.questionId, s]));

  const questions = await prisma.quizQuestion.findMany({
    where: { chapterId },
    select: { id: true },
  });

  // Priority: never seen > wrong > correct
  const sorted = questions.sort((a, b) => {
    const sa = statMap.get(a.id);
    const sb = statMap.get(b.id);
    // Never seen first
    if (!sa && sb) return -1;
    if (sa && !sb) return 1;
    if (!sa && !sb) return Math.random() - 0.5;
    // Wrong answers first
    const ratioA = sa!.timesCorrect / sa!.timesAnswered;
    const ratioB = sb!.timesCorrect / sb!.timesAnswered;
    if (ratioA !== ratioB) return ratioA - ratioB;
    return Math.random() - 0.5;
  });

  return sorted.slice(0, 20).map((q) => q.id);
}

export async function generateReviewQuestions(
  studentId: string,
  companyId: string,
): Promise<string[]> {
  // Get questions where student made mistakes
  const wrongStats = await prisma.quizStudentQuestionStat.findMany({
    where: {
      studentId,
      companyId,
    },
    include: { question: { select: { chapterId: true } } },
    orderBy: { lastAnsweredAt: "asc" },
  });

  const mistakes = wrongStats.filter((s) => s.timesCorrect < s.timesAnswered);

  // Sort: worst ratio first, then oldest first
  mistakes.sort((a, b) => {
    const ratioA = a.timesCorrect / a.timesAnswered;
    const ratioB = b.timesCorrect / b.timesAnswered;
    if (ratioA !== ratioB) return ratioA - ratioB;
    return a.lastAnsweredAt.getTime() - b.lastAnsweredAt.getTime();
  });

  const selected = mistakes.slice(0, 20).map((s) => s.questionId);

  // If fewer than 10 errors, fill with random questions from weak chapters
  if (selected.length < 10) {
    const weakChapterIds = new Set(
      mistakes.map((s) => s.question.chapterId),
    );

    if (weakChapterIds.size > 0) {
      const fill = await prisma.quizQuestion.findMany({
        where: {
          chapterId: { in: Array.from(weakChapterIds) },
          id: { notIn: selected },
        },
        select: { id: true },
      });
      const shuffled = shuffle(fill.map((q) => q.id));
      selected.push(...shuffled.slice(0, 20 - selected.length));
    }
  }

  return selected;
}
