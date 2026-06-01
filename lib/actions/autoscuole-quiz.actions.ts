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
const SCHEDA_MAX_ERRORS = 3;
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
  mode: z.enum(["EXAM", "PRACTICE", "CHAPTER", "REVIEW"]),
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
      case "PRACTICE":
        questionIds = await generateExamQuestions(
          membership.userId,
          membership.companyId,
        );
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

    // For REVIEW mode, fetch error stats for each question
    let reviewStatMap: Map<string, { wrongCount: number; timesAnswered: number; correctRate: number }> | null = null;
    if (payload.mode === "REVIEW") {
      const reviewStats = await prisma.quizStudentQuestionStat.findMany({
        where: {
          studentId: membership.userId,
          companyId: membership.companyId,
          questionId: { in: questionIds },
        },
      });
      reviewStatMap = new Map(
        reviewStats.map((s) => [
          s.questionId,
          {
            wrongCount: s.timesAnswered - s.timesCorrect,
            timesAnswered: s.timesAnswered,
            correctRate: Math.round((s.timesCorrect / s.timesAnswered) * 100),
          },
        ]),
      );
    }

    // Preserve the order from questionIds
    const qMap = new Map(questions.map((q) => [q.id, q]));
    const orderedQuestions = await Promise.all(
      questionIds.map(async (id) => {
        const q = qMap.get(id)!;
        const stat = reviewStatMap?.get(id);
        return {
          id: q.id,
          questionText: q.questionText,
          imageUrl: await resolveImageUrl(q.imageKey),
          chapterNumber: q.chapter.chapterNumber,
          correctAnswer: q.correctAnswer,
          hint: q.hint
            ? { title: q.hint.title, descriptionHtml: q.hint.descriptionHtml }
            : null,
          ...(stat ? { wrongCount: stat.wrongCount, timesAnswered: stat.timesAnswered, correctRate: stat.correctRate } : {}),
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

    // Auto-fail exam/scheda if too many errors (NOT for SCHEDA_ESAME — continues until end)
    let sessionStatus: "in_progress" | "completed" | "auto_failed" = "in_progress";
    const shouldAutoFail =
      (session.mode === "EXAM" && updatedSession.wrongCount > EXAM_MAX_ERRORS) ||
      (session.mode === "SCHEDA" && updatedSession.wrongCount > SCHEDA_MAX_ERRORS);
    if (shouldAutoFail) {
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
      session.mode === "EXAM" || session.mode === "SCHEDA_ESAME"
        ? session.wrongCount <= EXAM_MAX_ERRORS
        : session.mode === "SCHEDA"
          ? session.wrongCount <= SCHEDA_MAX_ERRORS
          : null;

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
        scheda: { select: { schedaNumber: true } },
        chapter: { select: { description: true } },
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

    // Fetch student stats for wrong answers (error frequency)
    const wrongQuestionIds = session.answers
      .filter((a) => !a.isCorrect)
      .map((a) => a.question.id);
    const wrongQuestionStats = wrongQuestionIds.length > 0
      ? await prisma.quizStudentQuestionStat.findMany({
          where: {
            studentId: session.studentId,
            companyId: session.companyId,
            questionId: { in: wrongQuestionIds },
          },
        })
      : [];
    const wrongStatMap = new Map(wrongQuestionStats.map((s) => [s.questionId, s]));

    // Wrong answers with hints + error stats
    const wrongAnswers = await Promise.all(
      session.answers
        .filter((a) => !a.isCorrect)
        .map(async (a) => {
          const stat = wrongStatMap.get(a.question.id);
          return {
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
            ...(stat
              ? {
                  wrongCount: stat.timesAnswered - stat.timesCorrect,
                  timesAnswered: stat.timesAnswered,
                  correctRate: Math.round((stat.timesCorrect / stat.timesAnswered) * 100),
                }
              : {}),
          };
        }),
    );

    const skippedCount = session.totalQuestions - session.correctCount - session.wrongCount;
    const durationSec =
      session.startedAt && session.completedAt
        ? Math.round((session.completedAt.getTime() - session.startedAt.getTime()) / 1000)
        : null;

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
        skippedCount,
        durationSec,
        startedAt: session.startedAt.toISOString(),
        completedAt: session.completedAt?.toISOString() ?? null,
        timeLimitSec: session.timeLimitSec,
        schedaNumber: session.scheda?.schedaNumber ?? null,
        chapterDescription: session.chapter?.description ?? null,
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

// ── getChaptersWithSchedeProgress ────────────────────────────────────────────

export async function getChaptersWithSchedeProgress() {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (!isStudent(membership.autoscuolaRole)) {
      throw new Error("Solo gli studenti possono visualizzare le schede.");
    }

    const chapters = await prisma.quizChapter.findMany({
      orderBy: { chapterNumber: "asc" },
      include: {
        schede: { where: { type: "CHAPTER" }, select: { id: true } },
      },
    });

    const completedSessions = await prisma.quizSession.findMany({
      where: {
        companyId: membership.companyId,
        studentId: membership.userId,
        mode: "SCHEDA",
        status: "completed",
        schedaId: { not: null },
      },
      select: {
        schedaId: true,
        passed: true,
        correctCount: true,
        wrongCount: true,
        totalQuestions: true,
      },
    });

    const sessionByScheda = new Map(
      completedSessions.map((s) => [s.schedaId!, s]),
    );

    const data = chapters.map((ch) => {
      const totalSchede = ch.schede.length;
      let completedSchede = 0;
      let passedSchede = 0;
      let failedSchede = 0;
      let totalCorrect = 0;
      let totalQuestions = 0;

      for (const scheda of ch.schede) {
        const session = sessionByScheda.get(scheda.id);
        if (session) {
          completedSchede++;
          if (session.passed === true) passedSchede++;
          else failedSchede++;
          totalCorrect += session.correctCount;
          totalQuestions += session.totalQuestions;
        }
      }

      return {
        id: ch.id,
        chapterNumber: ch.chapterNumber,
        description: ch.description,
        totalSchede,
        completedSchede,
        passedSchede,
        failedSchede,
        correctRate: totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0,
      };
    });

    return { success: true, data };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ── getChapterSchede ─────────────────────────────────────────────────────────

export async function getChapterSchede(chapterId: string) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (!isStudent(membership.autoscuolaRole)) {
      throw new Error("Solo gli studenti possono visualizzare le schede.");
    }

    const chapter = await prisma.quizChapter.findUnique({
      where: { id: chapterId },
      include: {
        schede: { where: { type: "CHAPTER" }, orderBy: { schedaNumber: "asc" } },
      },
    });

    if (!chapter) throw new Error("Capitolo non trovato.");

    const schedaIds = chapter.schede.map((s) => s.id);
    const sessions = await prisma.quizSession.findMany({
      where: {
        companyId: membership.companyId,
        studentId: membership.userId,
        mode: "SCHEDA",
        schedaId: { in: schedaIds },
      },
      orderBy: { startedAt: "desc" },
    });

    const sessionByScheda = new Map<string, (typeof sessions)[0]>();
    for (const s of sessions) {
      if (s.schedaId && !sessionByScheda.has(s.schedaId)) {
        sessionByScheda.set(s.schedaId, s);
      }
    }

    let completedCount = 0;
    let passedCount = 0;
    let failedCount = 0;
    let totalCorrect = 0;
    let totalQuestions = 0;

    const schede = chapter.schede.map((scheda) => {
      const session = sessionByScheda.get(scheda.id);
      let status: "not_started" | "in_progress" | "passed" | "failed" = "not_started";

      if (session) {
        if (session.status === "in_progress") {
          status = "in_progress";
        } else if (session.status === "completed") {
          status = session.passed === true ? "passed" : "failed";
          completedCount++;
          if (session.passed === true) passedCount++;
          else failedCount++;
          totalCorrect += session.correctCount;
          totalQuestions += session.totalQuestions;
        }
      }

      return {
        id: scheda.id,
        schedaNumber: scheda.schedaNumber,
        totalQuestions: scheda.totalQuestions,
        status,
        errorCount: session?.status === "completed" ? session.wrongCount : null,
        correctCount: session?.status === "completed" ? session.correctCount : null,
        completedAt: session?.completedAt?.toISOString() ?? null,
        sessionId: session?.id ?? null,
      };
    });

    return {
      success: true,
      data: {
        chapter: {
          id: chapter.id,
          chapterNumber: chapter.chapterNumber,
          description: chapter.description,
        },
        schede,
        summary: {
          totalSchede: chapter.schede.length,
          completedCount,
          passedCount,
          failedCount,
          correctRate: totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0,
        },
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ── startSchedaSession ───────────────────────────────────────────────────────

const startSchedaSessionSchema = z.object({
  schedaId: z.string().uuid(),
});

export async function startSchedaSession(
  input: z.infer<typeof startSchedaSessionSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (!isStudent(membership.autoscuolaRole)) {
      throw new Error("Solo gli studenti possono avviare schede.");
    }

    const payload = startSchedaSessionSchema.parse(input);

    const scheda = await prisma.quizScheda.findUnique({
      where: { id: payload.schedaId },
      include: { chapter: { select: { id: true, chapterNumber: true, description: true } } },
    });
    if (!scheda) throw new Error("Scheda non trovata.");
    if (scheda.type !== "CHAPTER") throw new Error("Questa scheda non è di tipo capitolo.");

    // Check immutability: only passed schede are locked (failed can be retried)
    const passedSession = await prisma.quizSession.findFirst({
      where: {
        companyId: membership.companyId,
        studentId: membership.userId,
        schedaId: payload.schedaId,
        mode: "SCHEDA",
        status: "completed",
        passed: true,
      },
    });
    if (passedSession) {
      throw new Error("Scheda già superata.");
    }

    // Check in-progress: resume existing session
    const inProgressSession = await prisma.quizSession.findFirst({
      where: {
        companyId: membership.companyId,
        studentId: membership.userId,
        schedaId: payload.schedaId,
        mode: "SCHEDA",
        status: "in_progress",
      },
      include: {
        answers: { select: { questionId: true, studentAnswer: true, isCorrect: true } },
      },
    });

    if (inProgressSession) {
      const questions = await prisma.quizQuestion.findMany({
        where: { id: { in: scheda.questionIds } },
        select: {
          id: true,
          questionText: true,
          imageKey: true,
          correctAnswer: true,
          chapter: { select: { chapterNumber: true } },
          hint: { select: { title: true, descriptionHtml: true } },
        },
      });

      const qMap = new Map(questions.map((q) => [q.id, q]));
      const answersMap = new Map(
        inProgressSession.answers.map((a) => [a.questionId, a]),
      );
      const orderedQuestions = await Promise.all(
        scheda.questionIds.map(async (id) => {
          const q = qMap.get(id)!;
          const existingAnswer = answersMap.get(id);
          return {
            id: q.id,
            questionText: q.questionText,
            imageUrl: await resolveImageUrl(q.imageKey),
            chapterNumber: q.chapter.chapterNumber,
            correctAnswer: q.correctAnswer,
            hint: q.hint
              ? { title: q.hint.title, descriptionHtml: q.hint.descriptionHtml }
              : null,
            answered: existingAnswer
              ? { studentAnswer: existingAnswer.studentAnswer, isCorrect: existingAnswer.isCorrect }
              : null,
          };
        }),
      );

      return {
        success: true,
        data: {
          sessionId: inProgressSession.id,
          questions: orderedQuestions,
          timeLimitSec: null,
          totalQuestions: scheda.totalQuestions,
          schedaNumber: scheda.schedaNumber,
          chapterDescription: scheda.chapter.description,
          resuming: true,
          correctCount: inProgressSession.correctCount,
          wrongCount: inProgressSession.wrongCount,
        },
      };
    }

    // Create new session
    const session = await prisma.quizSession.create({
      data: {
        companyId: membership.companyId,
        studentId: membership.userId,
        mode: "SCHEDA",
        chapterId: scheda.chapterId,
        schedaId: scheda.id,
        questionIds: scheda.questionIds,
        totalQuestions: scheda.totalQuestions,
        timeLimitSec: null,
      },
    });

    const questions = await prisma.quizQuestion.findMany({
      where: { id: { in: scheda.questionIds } },
      select: {
        id: true,
        questionText: true,
        imageKey: true,
        correctAnswer: true,
        chapter: { select: { chapterNumber: true } },
        hint: { select: { title: true, descriptionHtml: true } },
      },
    });

    const qMap = new Map(questions.map((q) => [q.id, q]));
    const orderedQuestions = await Promise.all(
      scheda.questionIds.map(async (id) => {
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
          answered: null,
        };
      }),
    );

    return {
      success: true,
      data: {
        sessionId: session.id,
        questions: orderedQuestions,
        timeLimitSec: null,
        totalQuestions: scheda.totalQuestions,
        schedaNumber: scheda.schedaNumber,
        chapterDescription: scheda.chapter.description,
        resuming: false,
        correctCount: 0,
        wrongCount: 0,
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ── getExamSchedeProgress ───────────────────────────────────────────────────

export async function getExamSchedeProgress() {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (!isStudent(membership.autoscuolaRole)) {
      throw new Error("Solo gli studenti possono visualizzare le schede d'esame.");
    }

    const schede = await prisma.quizScheda.findMany({
      where: { type: "EXAM" },
      orderBy: { schedaNumber: "asc" },
    });

    const schedaIds = schede.map((s) => s.id);
    const sessions = await prisma.quizSession.findMany({
      where: {
        companyId: membership.companyId,
        studentId: membership.userId,
        mode: "SCHEDA_ESAME",
        schedaId: { in: schedaIds },
      },
      orderBy: { startedAt: "desc" },
    });

    const sessionByScheda = new Map<string, (typeof sessions)[0]>();
    for (const s of sessions) {
      if (s.schedaId && !sessionByScheda.has(s.schedaId)) {
        sessionByScheda.set(s.schedaId, s);
      }
    }

    let completedCount = 0;
    let passedCount = 0;
    let failedCount = 0;
    let totalCorrect = 0;
    let totalQuestions = 0;

    const schedeData = schede.map((scheda) => {
      const session = sessionByScheda.get(scheda.id);
      let status: "not_started" | "in_progress" | "passed" | "failed" = "not_started";

      if (session) {
        if (session.status === "in_progress") {
          status = "in_progress";
        } else if (session.status === "completed") {
          status = session.passed === true ? "passed" : "failed";
          completedCount++;
          if (session.passed === true) passedCount++;
          else failedCount++;
          totalCorrect += session.correctCount;
          totalQuestions += session.totalQuestions;
        }
      }

      return {
        id: scheda.id,
        schedaNumber: scheda.schedaNumber,
        totalQuestions: scheda.totalQuestions,
        status,
        errorCount: session?.status === "completed" ? session.wrongCount : null,
        correctCount: session?.status === "completed" ? session.correctCount : null,
        completedAt: session?.completedAt?.toISOString() ?? null,
        sessionId: session?.id ?? null,
      };
    });

    return {
      success: true,
      data: {
        schede: schedeData,
        summary: {
          totalSchede: schede.length,
          completedCount,
          passedCount,
          failedCount,
          correctRate: totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0,
        },
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ── startExamSchedaSession ──────────────────────────────────────────────────

const startExamSchedaSessionSchema = z.object({
  schedaId: z.string().uuid(),
});

export async function startExamSchedaSession(
  input: z.infer<typeof startExamSchedaSessionSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (!isStudent(membership.autoscuolaRole)) {
      throw new Error("Solo gli studenti possono avviare schede d'esame.");
    }

    const payload = startExamSchedaSessionSchema.parse(input);

    const scheda = await prisma.quizScheda.findUnique({
      where: { id: payload.schedaId },
    });
    if (!scheda || scheda.type !== "EXAM") throw new Error("Scheda d'esame non trovata.");

    // Check immutability: only passed exam schede are locked (failed can be retried)
    const passedSession = await prisma.quizSession.findFirst({
      where: {
        companyId: membership.companyId,
        studentId: membership.userId,
        schedaId: payload.schedaId,
        mode: "SCHEDA_ESAME",
        status: "completed",
        passed: true,
      },
    });
    if (passedSession) {
      throw new Error("Scheda d'esame già superata.");
    }

    // Check in-progress: resume existing session
    const inProgressSession = await prisma.quizSession.findFirst({
      where: {
        companyId: membership.companyId,
        studentId: membership.userId,
        schedaId: payload.schedaId,
        mode: "SCHEDA_ESAME",
        status: "in_progress",
      },
      include: {
        answers: { select: { questionId: true, studentAnswer: true, isCorrect: true } },
      },
    });

    if (inProgressSession) {
      const questions = await prisma.quizQuestion.findMany({
        where: { id: { in: scheda.questionIds } },
        select: {
          id: true,
          questionText: true,
          imageKey: true,
          correctAnswer: true,
          chapter: { select: { chapterNumber: true } },
          hint: { select: { title: true, descriptionHtml: true } },
        },
      });

      const qMap = new Map(questions.map((q) => [q.id, q]));
      const answersMap = new Map(
        inProgressSession.answers.map((a) => [a.questionId, a]),
      );
      const orderedQuestions = await Promise.all(
        scheda.questionIds.map(async (id) => {
          const q = qMap.get(id)!;
          const existingAnswer = answersMap.get(id);
          return {
            id: q.id,
            questionText: q.questionText,
            imageUrl: await resolveImageUrl(q.imageKey),
            chapterNumber: q.chapter.chapterNumber,
            correctAnswer: q.correctAnswer,
            hint: q.hint
              ? { title: q.hint.title, descriptionHtml: q.hint.descriptionHtml }
              : null,
            answered: existingAnswer
              ? { studentAnswer: existingAnswer.studentAnswer, isCorrect: existingAnswer.isCorrect }
              : null,
          };
        }),
      );

      return {
        success: true,
        data: {
          sessionId: inProgressSession.id,
          questions: orderedQuestions,
          timeLimitSec: EXAM_TIME_LIMIT_SEC,
          totalQuestions: scheda.totalQuestions,
          schedaNumber: scheda.schedaNumber,
          resuming: true,
          correctCount: inProgressSession.correctCount,
          wrongCount: inProgressSession.wrongCount,
        },
      };
    }

    // Create new session
    const session = await prisma.quizSession.create({
      data: {
        companyId: membership.companyId,
        studentId: membership.userId,
        mode: "SCHEDA_ESAME",
        schedaId: scheda.id,
        questionIds: scheda.questionIds,
        totalQuestions: scheda.totalQuestions,
        timeLimitSec: EXAM_TIME_LIMIT_SEC,
      },
    });

    const questions = await prisma.quizQuestion.findMany({
      where: { id: { in: scheda.questionIds } },
      select: {
        id: true,
        questionText: true,
        imageKey: true,
        correctAnswer: true,
        chapter: { select: { chapterNumber: true } },
        hint: { select: { title: true, descriptionHtml: true } },
      },
    });

    const qMap = new Map(questions.map((q) => [q.id, q]));
    const orderedQuestions = await Promise.all(
      scheda.questionIds.map(async (id) => {
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
          answered: null,
        };
      }),
    );

    return {
      success: true,
      data: {
        sessionId: session.id,
        questions: orderedQuestions,
        timeLimitSec: EXAM_TIME_LIMIT_SEC,
        totalQuestions: scheda.totalQuestions,
        schedaNumber: scheda.schedaNumber,
        resuming: false,
        correctCount: 0,
        wrongCount: 0,
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}
