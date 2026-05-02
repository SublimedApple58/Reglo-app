"use server";

import { z } from "zod";
import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import { requireServiceAccess } from "@/lib/service-access";
import { isOwner, isStudent } from "@/lib/autoscuole/roles";
import { getSignedAssetUrl } from "@/lib/storage/r2";
import {
  generateExamQuestions,
  generateChapterQuestions,
  generateReviewQuestions,
} from "@/lib/autoscuole/quiz-engine";
import {
  AUTOSCUOLE_CACHE_SEGMENTS,
  buildAutoscuoleCacheKey,
  hashCacheInput,
  invalidateAutoscuoleCache,
  readAutoscuoleCache,
  writeAutoscuoleCache,
} from "@/lib/autoscuole/cache";

const EXAM_TIME_LIMIT_SEC = 1200; // 20 minutes
const EXAM_MAX_ERRORS = 3;
const CACHE_TTL = 3600;

async function resolveImageUrl(imageKey: string | null): Promise<string | null> {
  if (!imageKey) return null;
  return getSignedAssetUrl(imageKey);
}

// ── getQuizChapters ───────────────────────────────────────────────────────────

export async function getQuizChapters(studentId?: string) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const targetStudentId =
      isOwner(membership.autoscuolaRole) && studentId
        ? studentId
        : membership.userId;

    const cacheKey = await buildAutoscuoleCacheKey({
      companyId: membership.companyId,
      segment: AUTOSCUOLE_CACHE_SEGMENTS.QUIZ,
      scope: hashCacheInput({ action: "chapters", studentId: targetStudentId }),
    });
    const cached = await readAutoscuoleCache<unknown>(cacheKey);
    if (cached) return { success: true, data: cached };

    const chapters = await prisma.quizChapter.findMany({
      orderBy: { chapterNumber: "asc" },
      include: { _count: { select: { questions: true } } },
    });

    const stats = await prisma.quizStudentQuestionStat.findMany({
      where: { studentId: targetStudentId, companyId: membership.companyId },
      include: { question: { select: { chapterId: true } } },
    });

    const statsByChapter = new Map<string, { attempted: number; correct: number }>();
    for (const s of stats) {
      const chId = s.question.chapterId;
      const existing = statsByChapter.get(chId) ?? { attempted: 0, correct: 0 };
      existing.attempted += 1;
      existing.correct += s.timesCorrect > 0 ? 1 : 0;
      statsByChapter.set(chId, existing);
    }

    const data = chapters.map((ch) => {
      const chStats = statsByChapter.get(ch.id) ?? { attempted: 0, correct: 0 };
      return {
        id: ch.id,
        chapterNumber: ch.chapterNumber,
        description: ch.description,
        totalQuestions: ch._count.questions,
        attemptedCount: chStats.attempted,
        correctCount: chStats.correct,
      };
    });

    await writeAutoscuoleCache(cacheKey, data, CACHE_TTL);
    return { success: true, data };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ── startQuizSession ──────────────────────────────────────────────────────────

const startQuizSessionSchema = z.object({
  mode: z.enum(["EXAM", "CHAPTER", "REVIEW"]),
  chapterId: z.string().uuid().optional(),
});

export async function startQuizSession(
  input: z.infer<typeof startQuizSessionSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (!isStudent(membership.autoscuolaRole)) {
      throw new Error("Solo gli studenti possono avviare quiz.");
    }

    const payload = startQuizSessionSchema.parse(input);

    let questionIds: string[];
    let chapterId: string | null = null;
    let timeLimitSec: number | null = null;

    switch (payload.mode) {
      case "EXAM":
        questionIds = await generateExamQuestions(
          membership.userId,
          membership.companyId,
        );
        timeLimitSec = EXAM_TIME_LIMIT_SEC;
        break;
      case "CHAPTER":
        if (!payload.chapterId) {
          throw new Error("chapterId obbligatorio per modalità CHAPTER.");
        }
        chapterId = payload.chapterId;
        questionIds = await generateChapterQuestions(
          membership.userId,
          membership.companyId,
          payload.chapterId,
        );
        break;
      case "REVIEW":
        questionIds = await generateReviewQuestions(
          membership.userId,
          membership.companyId,
        );
        if (questionIds.length === 0) {
          throw new Error("Nessun errore da ripassare.");
        }
        break;
    }

    const session = await prisma.quizSession.create({
      data: {
        companyId: membership.companyId,
        studentId: membership.userId,
        mode: payload.mode,
        chapterId,
        questionIds,
        totalQuestions: questionIds.length,
        timeLimitSec,
      },
    });

    const questions = await prisma.quizQuestion.findMany({
      where: { id: { in: questionIds } },
      select: {
        id: true,
        questionText: true,
        imageKey: true,
        correctAnswer: true,
        chapter: { select: { chapterNumber: true } },
        hint: { select: { title: true, descriptionHtml: true } },
      },
    });

    // Preserve the order from questionIds
    const qMap = new Map(questions.map((q) => [q.id, q]));
    const orderedQuestions = await Promise.all(
      questionIds.map(async (id) => {
        const q = qMap.get(id)!;
        return {
          id: q.id,
          questionText: q.questionText,
          imageUrl: await resolveImageUrl(q.imageKey),
          chapterNumber: q.chapter.chapterNumber,
          correctAnswer: q.correctAnswer,
          hint: q.hint
            ? { title: q.hint.title, descriptionHtml: q.hint.descriptionHtml }
            : null,
        };
      }),
    );

    return {
      success: true,
      data: {
        sessionId: session.id,
        questions: orderedQuestions,
        timeLimitSec,
        totalQuestions: questionIds.length,
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ── submitQuizAnswer ──────────────────────────────────────────────────────────

const submitQuizAnswerSchema = z.object({
  sessionId: z.string().uuid(),
  questionId: z.string().uuid(),
  answer: z.boolean(),
});

export async function submitQuizAnswer(
  input: z.infer<typeof submitQuizAnswerSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = submitQuizAnswerSchema.parse(input);

    const session = await prisma.quizSession.findUnique({
      where: { id: payload.sessionId },
    });
    if (!session || session.studentId !== membership.userId) {
      throw new Error("Sessione non trovata.");
    }
    if (session.status !== "in_progress") {
      throw new Error("Sessione non in corso.");
    }

    const question = await prisma.quizQuestion.findUnique({
      where: { id: payload.questionId },
      include: { hint: true },
    });
    if (!question) throw new Error("Domanda non trovata.");

    const isCorrect = payload.answer === question.correctAnswer;

    // Create answer record
    await prisma.quizAnswer.create({
      data: {
        sessionId: payload.sessionId,
        questionId: payload.questionId,
        studentAnswer: payload.answer,
        isCorrect,
      },
    });

    // Update session counters
    const updatedSession = await prisma.quizSession.update({
      where: { id: payload.sessionId },
      data: {
        correctCount: { increment: isCorrect ? 1 : 0 },
        wrongCount: { increment: isCorrect ? 0 : 1 },
      },
    });

    // Upsert student question stat
    await prisma.quizStudentQuestionStat.upsert({
      where: {
        companyId_studentId_questionId: {
          companyId: membership.companyId,
          studentId: membership.userId,
          questionId: payload.questionId,
        },
      },
      create: {
        companyId: membership.companyId,
        studentId: membership.userId,
        questionId: payload.questionId,
        timesAnswered: 1,
        timesCorrect: isCorrect ? 1 : 0,
        lastAnsweredAt: new Date(),
      },
      update: {
        timesAnswered: { increment: 1 },
        timesCorrect: { increment: isCorrect ? 1 : 0 },
        lastAnsweredAt: new Date(),
      },
    });

    // Auto-fail exam if too many errors
    let sessionStatus: "in_progress" | "completed" | "auto_failed" = "in_progress";
    if (
      session.mode === "EXAM" &&
      updatedSession.wrongCount > EXAM_MAX_ERRORS
    ) {
      await prisma.quizSession.update({
        where: { id: payload.sessionId },
        data: {
          status: "completed",
          passed: false,
          completedAt: new Date(),
        },
      });
      sessionStatus = "auto_failed";
    }

    // Invalidate quiz cache
    await invalidateAutoscuoleCache({
      companyId: membership.companyId,
      segments: [AUTOSCUOLE_CACHE_SEGMENTS.QUIZ],
    });

    return {
      success: true,
      data: {
        isCorrect,
        correctAnswer: question.correctAnswer,
        hint: question.hint
          ? {
              title: question.hint.title,
              descriptionHtml: question.hint.descriptionHtml,
            }
          : null,
        sessionStatus,
        correctCount: updatedSession.correctCount,
        wrongCount: updatedSession.wrongCount,
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ── completeQuizSession ───────────────────────────────────────────────────────

const completeQuizSessionSchema = z.object({
  sessionId: z.string().uuid(),
});

export async function completeQuizSession(
  input: z.infer<typeof completeQuizSessionSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = completeQuizSessionSchema.parse(input);

    const session = await prisma.quizSession.findUnique({
      where: { id: payload.sessionId },
    });
    if (!session || session.studentId !== membership.userId) {
      throw new Error("Sessione non trovata.");
    }
    if (session.status !== "in_progress") {
      throw new Error("Sessione già completata.");
    }

    const passed =
      session.mode === "EXAM" ? session.wrongCount <= EXAM_MAX_ERRORS : null;

    const updated = await prisma.quizSession.update({
      where: { id: payload.sessionId },
      data: {
        status: "completed",
        passed,
        completedAt: new Date(),
      },
    });

    await invalidateAutoscuoleCache({
      companyId: membership.companyId,
      segments: [AUTOSCUOLE_CACHE_SEGMENTS.QUIZ],
    });

    return {
      success: true,
      data: {
        sessionId: updated.id,
        passed: updated.passed,
        correctCount: updated.correctCount,
        wrongCount: updated.wrongCount,
        totalQuestions: updated.totalQuestions,
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ── abandonQuizSession ────────────────────────────────────────────────────────

export async function abandonQuizSession(
  input: z.infer<typeof completeQuizSessionSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = completeQuizSessionSchema.parse(input);

    const session = await prisma.quizSession.findUnique({
      where: { id: payload.sessionId },
    });
    if (!session || session.studentId !== membership.userId) {
      throw new Error("Sessione non trovata.");
    }
    if (session.status !== "in_progress") {
      throw new Error("Sessione non in corso.");
    }

    await prisma.quizSession.update({
      where: { id: payload.sessionId },
      data: { status: "abandoned" },
    });

    return { success: true, data: { sessionId: payload.sessionId } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ── getQuizSessionResult ──────────────────────────────────────────────────────

export async function getQuizSessionResult(sessionId: string) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");

    const session = await prisma.quizSession.findUnique({
      where: { id: sessionId },
      include: {
        answers: {
          include: {
            question: {
              include: {
                chapter: { select: { chapterNumber: true, description: true } },
                hint: true,
              },
            },
          },
        },
      },
    });

    if (!session) throw new Error("Sessione non trovata.");

    // Allow owner or the student themselves
    const canAccess =
      session.studentId === membership.userId ||
      isOwner(membership.autoscuolaRole);
    if (!canAccess) throw new Error("Accesso non consentito.");

    // Build chapters breakdown
    const chaptersMap = new Map<
      number,
      { description: string; correct: number; wrong: number; total: number }
    >();
    for (const ans of session.answers) {
      const cn = ans.question.chapter.chapterNumber;
      const desc = ans.question.chapter.description;
      const entry = chaptersMap.get(cn) ?? {
        description: desc,
        correct: 0,
        wrong: 0,
        total: 0,
      };
      entry.total++;
      if (ans.isCorrect) entry.correct++;
      else entry.wrong++;
      chaptersMap.set(cn, entry);
    }

    const chaptersBreakdown = Array.from(chaptersMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([chapterNumber, data]) => ({ chapterNumber, ...data }));

    // Wrong answers with hints
    const wrongAnswers = await Promise.all(
      session.answers
        .filter((a) => !a.isCorrect)
        .map(async (a) => ({
          id: a.question.id,
          questionText: a.question.questionText,
          imageUrl: await resolveImageUrl(a.question.imageKey),
          chapterNumber: a.question.chapter.chapterNumber,
          correctAnswer: a.question.correctAnswer,
          hint: a.question.hint
            ? {
                title: a.question.hint.title,
                descriptionHtml: a.question.hint.descriptionHtml,
              }
            : null,
        })),
    );

    return {
      success: true,
      data: {
        id: session.id,
        mode: session.mode,
        status: session.status,
        passed: session.passed,
        totalQuestions: session.totalQuestions,
        correctCount: session.correctCount,
        wrongCount: session.wrongCount,
        startedAt: session.startedAt.toISOString(),
        completedAt: session.completedAt?.toISOString() ?? null,
        timeLimitSec: session.timeLimitSec,
        chaptersBreakdown,
        wrongAnswers,
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ── getQuizStudentStats ───────────────────────────────────────────────────────

export async function getQuizStudentStats(studentId?: string) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const targetStudentId =
      isOwner(membership.autoscuolaRole) && studentId
        ? studentId
        : membership.userId;

    const cacheKey = await buildAutoscuoleCacheKey({
      companyId: membership.companyId,
      segment: AUTOSCUOLE_CACHE_SEGMENTS.QUIZ,
      scope: hashCacheInput({ action: "studentStats", studentId: targetStudentId }),
    });
    const cached = await readAutoscuoleCache<unknown>(cacheKey);
    if (cached) return { success: true, data: cached };

    const sessions = await prisma.quizSession.findMany({
      where: {
        companyId: membership.companyId,
        studentId: targetStudentId,
        status: { not: "abandoned" },
      },
      orderBy: { startedAt: "desc" },
    });

    const examSessions = sessions.filter((s) => s.mode === "EXAM" && s.status === "completed");
    const examsPassed = examSessions.filter((s) => s.passed === true).length;
    const examsFailed = examSessions.filter((s) => s.passed === false).length;
    const totalExams = examsPassed + examsFailed;
    const examPassRate = totalExams > 0 ? Math.round((examsPassed / totalExams) * 100) : 0;

    // Chapters progress
    const chapters = await prisma.quizChapter.findMany({
      orderBy: { chapterNumber: "asc" },
      include: { _count: { select: { questions: true } } },
    });

    const questionStats = await prisma.quizStudentQuestionStat.findMany({
      where: { studentId: targetStudentId, companyId: membership.companyId },
      include: { question: { select: { chapterId: true } } },
    });

    const statsByChapter = new Map<string, { attempted: number; correct: number }>();
    for (const s of questionStats) {
      const chId = s.question.chapterId;
      const existing = statsByChapter.get(chId) ?? { attempted: 0, correct: 0 };
      existing.attempted += 1;
      existing.correct += s.timesCorrect > 0 ? 1 : 0;
      statsByChapter.set(chId, existing);
    }

    const totalQuestions = chapters.reduce((sum, ch) => sum + ch._count.questions, 0);
    const totalAttempted = questionStats.length;
    const totalCorrectQuestions = questionStats.filter((s) => s.timesCorrect > 0).length;

    // readinessScore: weighted average
    const attemptedPct = totalQuestions > 0 ? totalAttempted / totalQuestions : 0;
    const correctPct = totalAttempted > 0 ? totalCorrectQuestions / totalAttempted : 0;
    const last3Exams = examSessions.slice(0, 3);
    const last3PassedPct =
      last3Exams.length > 0
        ? last3Exams.filter((s) => s.passed === true).length / last3Exams.length
        : 0;
    const readinessScore = Math.round(
      (attemptedPct * 30 + correctPct * 40 + last3PassedPct * 30),
    );

    const chaptersProgress = chapters.map((ch) => {
      const chStats = statsByChapter.get(ch.id) ?? { attempted: 0, correct: 0 };
      return {
        id: ch.id,
        chapterNumber: ch.chapterNumber,
        description: ch.description,
        totalQuestions: ch._count.questions,
        attemptedCount: chStats.attempted,
        correctCount: chStats.correct,
      };
    });

    const weakChapters = chaptersProgress
      .filter((ch) => ch.attemptedCount > 0)
      .map((ch) => ({
        chapterNumber: ch.chapterNumber,
        description: ch.description,
        correctRate: Math.round((ch.correctCount / ch.attemptedCount) * 100),
      }))
      .filter((ch) => ch.correctRate < 70)
      .sort((a, b) => a.correctRate - b.correctRate)
      .slice(0, 5);

    const recentSessions = sessions.slice(0, 10).map((s) => ({
      id: s.id,
      mode: s.mode,
      completedAt: s.completedAt?.toISOString() ?? null,
      passed: s.passed,
      correctCount: s.correctCount,
      wrongCount: s.wrongCount,
      totalQuestions: s.totalQuestions,
    }));

    const data = {
      totalSessions: sessions.length,
      examsPassed,
      examsFailed,
      examPassRate,
      readinessScore,
      chaptersProgress,
      recentSessions,
      weakChapters,
    };

    await writeAutoscuoleCache(cacheKey, data, CACHE_TTL);
    return { success: true, data };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ── getQuizStudentsOverview (owner) ───────────────────────────────────────────

export async function getQuizStudentsOverview() {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (!isOwner(membership.autoscuolaRole)) {
      throw new Error("Operazione non consentita.");
    }

    const cacheKey = await buildAutoscuoleCacheKey({
      companyId: membership.companyId,
      segment: AUTOSCUOLE_CACHE_SEGMENTS.QUIZ,
      scope: hashCacheInput({ action: "studentsOverview" }),
    });
    const cached = await readAutoscuoleCache<unknown>(cacheKey);
    if (cached) return { success: true, data: cached };

    // Get all students in the company
    const students = await prisma.companyMember.findMany({
      where: {
        companyId: membership.companyId,
        autoscuolaRole: "STUDENT",
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    // Get all quiz sessions for the company
    const sessions = await prisma.quizSession.findMany({
      where: {
        companyId: membership.companyId,
        status: "completed",
      },
    });

    // Get all question stats
    const allStats = await prisma.quizStudentQuestionStat.findMany({
      where: { companyId: membership.companyId },
      include: { question: { select: { chapterId: true } } },
    });

    const chapters = await prisma.quizChapter.findMany({
      include: { _count: { select: { questions: true } } },
    });
    const totalQuestions = chapters.reduce((sum, ch) => sum + ch._count.questions, 0);
    const chapterMap = new Map(chapters.map((ch) => [ch.id, ch]));

    const data = students.map((member) => {
      const studentSessions = sessions.filter((s) => s.studentId === member.userId);
      const exams = studentSessions.filter((s) => s.mode === "EXAM");
      const examsPassed = exams.filter((s) => s.passed === true).length;
      const totalExams = exams.length;
      const passRate = totalExams > 0 ? Math.round((examsPassed / totalExams) * 100) : 0;

      const studentStats = allStats.filter((s) => s.studentId === member.userId);
      const totalAttempted = studentStats.length;
      const totalCorrect = studentStats.filter((s) => s.timesCorrect > 0).length;

      const attemptedPct = totalQuestions > 0 ? totalAttempted / totalQuestions : 0;
      const correctPct = totalAttempted > 0 ? totalCorrect / totalAttempted : 0;
      const last3Exams = exams.slice(0, 3);
      const last3PassedPct =
        last3Exams.length > 0
          ? last3Exams.filter((s) => s.passed === true).length / last3Exams.length
          : 0;
      const readinessScore = Math.round(
        attemptedPct * 30 + correctPct * 40 + last3PassedPct * 30,
      );

      // Find weak chapters
      const statsByChapter = new Map<string, { attempted: number; correct: number }>();
      for (const s of studentStats) {
        const chId = s.question.chapterId;
        const existing = statsByChapter.get(chId) ?? { attempted: 0, correct: 0 };
        existing.attempted += 1;
        existing.correct += s.timesCorrect > 0 ? 1 : 0;
        statsByChapter.set(chId, existing);
      }

      const weakChapters = Array.from(statsByChapter.entries())
        .map(([chId, stats]) => {
          const ch = chapterMap.get(chId);
          const correctRate = Math.round((stats.correct / stats.attempted) * 100);
          return {
            chapterNumber: ch?.chapterNumber ?? 0,
            description: ch?.description ?? "",
            correctRate,
          };
        })
        .filter((ch) => ch.correctRate < 70)
        .sort((a, b) => a.correctRate - b.correctRate)
        .slice(0, 3);

      const lastSession = studentSessions[0];

      return {
        studentId: member.userId,
        studentName: member.user.name,
        studentEmail: member.user.email,
        totalExams,
        passRate,
        readinessScore,
        lastSessionAt: lastSession?.completedAt?.toISOString() ?? null,
        weakChapters,
      };
    });

    await writeAutoscuoleCache(cacheKey, data, CACHE_TTL);
    return { success: true, data };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}
