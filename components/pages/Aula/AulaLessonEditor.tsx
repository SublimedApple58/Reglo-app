"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createAulaLiveSession,
  saveAulaPackage,
} from "@/lib/actions/aula.actions";
import type { SlidePackage } from "@/lib/aula/slides";

type Lesson = {
  id: string;
  companyId: string | null;
  title: string;
  isTemplate: boolean;
  chapterId: string | null;
};

/**
 * Reglo Aula — editor del pacchetto slide + avvio quiz live.
 * Skeleton: l'editor a blocchi completo (heading/text/image/bullets/quizRef)
 * e la modalità presentazione full-screen arrivano in una passata dedicata.
 */
export function AulaLessonEditor({
  lesson,
  initialPackage,
}: {
  lesson: Lesson;
  initialPackage: SlidePackage;
}) {
  const router = useRouter();
  const [pkg, setPkg] = useState<SlidePackage>(initialPackage);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const editable = !lesson.isTemplate && lesson.companyId !== null;

  const addTextSlide = () => {
    setPkg((p) => ({
      ...p,
      slides: [...p.slides, [{ type: "heading", text: "Nuova slide" }]],
    }));
  };

  const handleSave = () => {
    startTransition(async () => {
      const res = await saveAulaPackage(lesson.id, pkg);
      setMessage(res.success ? "Salvato." : (res.message ?? "Errore"));
    });
  };

  const handleStartQuiz = () => {
    startTransition(async () => {
      const res = await createAulaLiveSession({ lessonId: lesson.id, count: 5 });
      if (res.success && res.data) {
        router.push(`live/${res.data.code}`);
      } else {
        setMessage(res.message ?? "Impossibile avviare il quiz");
      }
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{lesson.title}</h1>
        <button
          className="rounded-md bg-pink-500 px-4 py-2 text-white disabled:opacity-50"
          disabled={pending}
          onClick={handleStartQuiz}
        >
          Avvia quiz
        </button>
      </div>

      {!editable && (
        <p className="text-amber-600">
          Questa è una lezione standard (sola lettura). Personalizzala dalla lista
          per poterla modificare.
        </p>
      )}
      {message && <p className="text-neutral-600">{message}</p>}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Slide ({pkg.slides.length})</h2>
          {editable && (
            <div className="flex gap-2">
              <button className="rounded-md border px-3 py-1 text-sm" onClick={addTextSlide}>
                + Slide
              </button>
              <button
                className="rounded-md border px-3 py-1 text-sm disabled:opacity-50"
                disabled={pending}
                onClick={handleSave}
              >
                Salva
              </button>
            </div>
          )}
        </div>
        <ol className="space-y-2">
          {pkg.slides.map((slide, i) => (
            <li key={i} className="rounded-lg border p-3">
              <span className="text-sm text-neutral-500">Slide {i + 1}</span>
              <pre className="mt-1 whitespace-pre-wrap text-sm">
                {JSON.stringify(slide, null, 2)}
              </pre>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
