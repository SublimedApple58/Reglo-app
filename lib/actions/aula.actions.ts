"use server";

import { z } from "zod";
import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import { requireServiceAccess } from "@/lib/service-access";
import { isOwner, isInstructor } from "@/lib/autoscuole/roles";
import {
  getServiceLimits,
  normalizeCompanyServices,
} from "@/lib/services";
import {
  AUTOSCUOLE_CACHE_SEGMENTS,
  invalidateAutoscuoleCache,
} from "@/lib/autoscuole/cache";
import { getSignedAssetUrl } from "@/lib/storage/r2";
import {
  companyPackageKey,
  copyPackage,
  loadPackage,
  putAsset,
  savePackage,
} from "@/lib/aula/package-store";
import { emptyPackage, slidePackageSchema } from "@/lib/aula/slides";
import {
  createSession,
  endSession,
  generateJoinCode,
  getSession,
  openQuestion,
  revealQuestion,
  setReviewQuestion,
  setStatus,
  startExam,
} from "@/lib/aula/live-state";
import { forceAdvanceExam } from "@/lib/aula/live-public";

/**
 * Reglo Aula — server actions (console docente).
 * Gate: servizio AUTOSCUOLE attivo + flag `aulaEnabled` + ruolo owner/instructor.
 * Le slide vivono su R2 (pacchetto .rppt); il quiz live tutto in Redis.
 * Vedi docs/features/reglo-aula.md.
 */

async function requireAulaTeacher() {
  const context = await requireServiceAccess("AUTOSCUOLE");
  const limits = getServiceLimits(
    normalizeCompanyServices(context.company.services),
    "AUTOSCUOLE",
  );
  if (!limits.aulaEnabled) throw new Error("AULA_NOT_ENABLED");

  const role = context.membership.autoscuolaRole;
  if (!isOwner(role) && !isInstructor(role)) throw new Error("FORBIDDEN");

  return context;
}

// ── Catalogo lezioni ──────────────────────────────────────────────────────────

export async function listAulaLessons() {
  try {
    const { membership } = await requireAulaTeacher();
    // Template globali (companyId null) + lezioni della company (fork/proprie).
    const lessons = await prisma.aulaLesson.findMany({
      where: {
        OR: [{ companyId: null }, { companyId: membership.companyId }],
      },
      orderBy: [{ isTemplate: "desc" }, { order: "asc" }, { createdAt: "asc" }],
    });
    return { success: true, data: lessons };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getAulaLesson(lessonId: string) {
  try {
    const { membership } = await requireAulaTeacher();
    const lesson = await prisma.aulaLesson.findFirst({
      where: {
        id: lessonId,
        OR: [{ companyId: null }, { companyId: membership.companyId }],
      },
    });
    if (!lesson) throw new Error("LESSON_NOT_FOUND");
    const pkg = await loadPackage(lesson.packageR2Key);
    return { success: true, data: { lesson, package: pkg } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

/** Fork di una lezione template → copia il pacchetto su R2 + riga company. */
export async function forkAulaLessonTemplate(templateLessonId: string) {
  try {
    const { membership } = await requireAulaTeacher();
    const template = await prisma.aulaLesson.findFirst({
      where: { id: templateLessonId, isTemplate: true, companyId: null },
    });
    if (!template) throw new Error("TEMPLATE_NOT_FOUND");

    const created = await prisma.aulaLesson.create({
      data: {
        companyId: membership.companyId,
        chapterId: template.chapterId,
        title: template.title,
        description: template.description,
        order: template.order,
        isTemplate: false,
        sourceLessonId: template.id,
        // key provvisoria: la rimpiazziamo con quella definitiva basata sull'id
        packageR2Key: "",
      },
    });
    const destKey = companyPackageKey(membership.companyId, created.id);
    await copyPackage(template.packageR2Key, destKey);
    const updated = await prisma.aulaLesson.update({
      where: { id: created.id },
      data: { packageR2Key: destKey },
    });

    await invalidateAutoscuoleCache({
      companyId: membership.companyId,
      segments: [AUTOSCUOLE_CACHE_SEGMENTS.AULA],
    });
    return { success: true, data: updated };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

const createLessonSchema = z.object({
  title: z.string().trim().min(1).max(200).default("Nuova lezione"),
  chapterId: z.string().uuid().optional(),
});

/** Crea una lezione vuota da zero (riga company + pacchetto vuoto su R2). */
export async function createAulaLesson(
  input?: z.infer<typeof createLessonSchema>,
) {
  try {
    const { membership } = await requireAulaTeacher();
    const parsed = createLessonSchema.parse(input ?? {});

    const created = await prisma.aulaLesson.create({
      data: {
        companyId: membership.companyId,
        chapterId: parsed.chapterId ?? null,
        title: parsed.title,
        isTemplate: false,
        // key provvisoria: la rimpiazziamo con quella definitiva basata sull'id
        packageR2Key: "",
      },
    });
    const destKey = companyPackageKey(membership.companyId, created.id);
    await savePackage(destKey, emptyPackage());
    const updated = await prisma.aulaLesson.update({
      where: { id: created.id },
      data: { packageR2Key: destKey },
    });

    await invalidateAutoscuoleCache({
      companyId: membership.companyId,
      segments: [AUTOSCUOLE_CACHE_SEGMENTS.AULA],
    });
    return { success: true, data: updated };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ── Editor pacchetto slide ────────────────────────────────────────────────────

export async function saveAulaPackage(lessonId: string, pkg: unknown) {
  try {
    const { membership } = await requireAulaTeacher();
    const lesson = await prisma.aulaLesson.findFirst({
      where: { id: lessonId, companyId: membership.companyId },
    });
    if (!lesson) throw new Error("LESSON_NOT_EDITABLE"); // i template non si editano
    const validated = slidePackageSchema.parse(pkg);
    await savePackage(lesson.packageR2Key, validated);
    await prisma.aulaLesson.update({
      where: { id: lesson.id },
      data: { updatedAt: new Date() },
    });
    await invalidateAutoscuoleCache({
      companyId: membership.companyId,
      segments: [AUTOSCUOLE_CACHE_SEGMENTS.AULA],
    });
    return { success: true };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

const uploadImageSchema = z.object({
  base64: z.string().min(1),
  ext: z.string().min(1).max(8),
  contentType: z.string().min(1).max(100),
});

export async function uploadAulaImage(input: z.infer<typeof uploadImageSchema>) {
  try {
    const { membership } = await requireAulaTeacher();
    const { base64, ext, contentType } = uploadImageSchema.parse(input);
    const bytes = Buffer.from(base64, "base64");
    const r2Key = await putAsset(membership.companyId, bytes, ext, contentType);
    return { success: true, data: { r2Key } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ── Quiz live (solo Redis) ────────────────────────────────────────────────────

const createSessionSchema = z.object({
  lessonId: z.string().uuid(),
  chapterId: z.string().uuid().optional(),
  count: z.number().int().min(1).max(30).default(5),
  questionIds: z.array(z.string().uuid()).max(30).optional(),
  // LIVE: una domanda alla volta (default). EXAM: tutte insieme, correzione finale.
  mode: z.enum(["LIVE", "EXAM"]).default("LIVE"),
});

/** Estrae N domande casuali da un capitolo (o usa quelle passate dal docente). */
async function resolveQuestionIds(input: {
  chapterId: string | null;
  count: number;
  explicit?: string[];
}): Promise<string[]> {
  if (input.explicit?.length) return input.explicit;
  if (!input.chapterId) throw new Error("NO_CHAPTER_FOR_QUIZ");
  const rows = await prisma.quizQuestion.findMany({
    where: { chapterId: input.chapterId },
    select: { id: true },
  });
  // shuffle semplice e taglio
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  return rows.slice(0, input.count).map((r) => r.id);
}

export async function createAulaLiveSession(
  input: z.infer<typeof createSessionSchema>,
) {
  try {
    const { membership } = await requireAulaTeacher();
    const parsed = createSessionSchema.parse(input);
    const lesson = await prisma.aulaLesson.findFirst({
      where: {
        id: parsed.lessonId,
        OR: [{ companyId: null }, { companyId: membership.companyId }],
      },
    });
    if (!lesson) throw new Error("LESSON_NOT_FOUND");

    const questionIds = await resolveQuestionIds({
      chapterId: parsed.chapterId ?? lesson.chapterId,
      count: parsed.count,
      explicit: parsed.questionIds,
    });

    const code = generateJoinCode();
    await createSession({
      code,
      lessonId: lesson.id,
      teacherId: membership.userId,
      mode: parsed.mode,
      questionIds,
      now: Date.now(),
    });
    return { success: true, data: { code, questionIds, mode: parsed.mode } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

async function requireSessionTeacher(code: string) {
  const { membership } = await requireAulaTeacher();
  const session = await getSession(code);
  if (!session) throw new Error("SESSION_NOT_FOUND");
  if (session.teacherId !== membership.userId) throw new Error("FORBIDDEN");
  return session;
}

export async function openAulaQuestion(code: string, questionId: string) {
  try {
    await requireSessionTeacher(code);
    const state = await openQuestion(code, questionId);
    return { success: true, data: state };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

/** Apre la prossima domanda della sessione (in base all'indice corrente). */
export async function openNextAulaQuestion(code: string) {
  try {
    const session = await requireSessionTeacher(code);
    const currentIndex = session.currentQuestionId
      ? session.questionIds.indexOf(session.currentQuestionId)
      : -1;
    const nextIndex = currentIndex + 1;
    const nextId = session.questionIds[nextIndex];
    if (!nextId) {
      const state = await endSession(code);
      return { success: true, data: { state, finished: true } };
    }
    const state = await openQuestion(code, nextId);
    return { success: true, data: { state, finished: false } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

/**
 * EXAM sincronizzato: avvia il quiz sulla PRIMA domanda. Da qui i partecipanti
 * avanzano insieme (barriera per-domanda), senza intervento del docente.
 */
export async function startAulaExam(code: string) {
  try {
    const session = await requireSessionTeacher(code);
    if (session.mode !== "EXAM") throw new Error("NOT_EXAM_MODE");
    const first = session.questionIds[0];
    if (!first) {
      const state = await endSession(code);
      return { success: true, data: { state, finished: true } };
    }
    const state = await startExam(code, first, Date.now());
    return { success: true, data: { state, finished: false } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

/**
 * EXAM sincronizzato: il docente forza la domanda successiva (sblocca i
 * ritardatari quando l'allineamento si ferma). Normalmente non serve: la
 * barriera avanza da sola quando tutti hanno risposto.
 */
export async function forceNextAulaExamQuestion(code: string) {
  try {
    const session = await requireSessionTeacher(code);
    if (session.mode !== "EXAM") throw new Error("NOT_EXAM_MODE");
    await forceAdvanceExam(code);
    return { success: true };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

/** EXAM: avvia la correzione a schermo dalla prima domanda. */
export async function startAulaExamReview(code: string) {
  try {
    const session = await requireSessionTeacher(code);
    if (session.mode !== "EXAM") throw new Error("NOT_EXAM_MODE");
    const first = session.questionIds[0];
    if (!first) {
      const state = await endSession(code);
      return { success: true, data: { state, finished: true } };
    }
    const state = await setReviewQuestion(code, first);
    return { success: true, data: { state, finished: false } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

/** EXAM: passa alla prossima domanda in correzione (o termina → classifica). */
export async function nextAulaExamReview(code: string) {
  try {
    const session = await requireSessionTeacher(code);
    if (session.mode !== "EXAM") throw new Error("NOT_EXAM_MODE");
    const currentIndex = session.currentQuestionId
      ? session.questionIds.indexOf(session.currentQuestionId)
      : -1;
    const nextId = session.questionIds[currentIndex + 1];
    if (!nextId) {
      const state = await endSession(code);
      return { success: true, data: { state, finished: true } };
    }
    const state = await setReviewQuestion(code, nextId);
    return { success: true, data: { state, finished: false } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function revealAulaQuestion(code: string) {
  try {
    await requireSessionTeacher(code);
    const state = await revealQuestion(code);
    return { success: true, data: state };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function nextAulaQuestion(code: string) {
  try {
    await requireSessionTeacher(code);
    const state = await setStatus(code, "LOBBY");
    return { success: true, data: state };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function endAulaLiveSession(code: string) {
  try {
    await requireSessionTeacher(code);
    const state = await endSession(code);
    return { success: true, data: state };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ── Helper condiviso: reveal per il proiettore ────────────────────────────────

export async function resolveAulaImageUrl(imageKey: string | null) {
  if (!imageKey) return null;
  return getSignedAssetUrl(imageKey);
}

/** Elenco capitoli del quiz (per il selettore domande nell'editor slide). */
export async function listAulaChapters() {
  try {
    await requireAulaTeacher();
    const chapters = await prisma.quizChapter.findMany({
      orderBy: { chapterNumber: "asc" },
      select: { id: true, chapterNumber: true, description: true },
    });
    return { success: true, data: chapters };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

/** Domande di un capitolo (per il selettore quizRef nell'editor slide). */
export async function listAulaChapterQuestions(chapterId: string) {
  try {
    await requireAulaTeacher();
    const parsed = z.string().uuid().parse(chapterId);
    const questions = await prisma.quizQuestion.findMany({
      where: { chapterId: parsed },
      orderBy: { externalId: "asc" },
      select: { id: true, questionText: true },
    });
    return {
      success: true,
      data: questions.map((q) => ({ id: q.id, text: q.questionText })),
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

/**
 * Risolve i blocchi `quizRef` per la modalità presentazione: testo domanda,
 * immagine firmata e risposta corretta. Read-only sulla banca globale.
 */
export async function resolveAulaQuizRefs(ids: string[]) {
  try {
    await requireAulaTeacher();
    const unique = [
      ...new Set(ids.filter((id) => z.string().uuid().safeParse(id).success)),
    ];
    if (unique.length === 0) {
      return {
        success: true,
        data: [] as {
          id: string;
          text: string;
          imageUrl: string | null;
          correctAnswer: boolean;
        }[],
      };
    }
    const questions = await prisma.quizQuestion.findMany({
      where: { id: { in: unique } },
      select: { id: true, questionText: true, imageKey: true, correctAnswer: true },
    });
    const data = await Promise.all(
      questions.map(async (q) => ({
        id: q.id,
        text: q.questionText,
        imageUrl: q.imageKey ? await getSignedAssetUrl(q.imageKey) : null,
        correctAnswer: q.correctAnswer,
      })),
    );
    return { success: true, data };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}
