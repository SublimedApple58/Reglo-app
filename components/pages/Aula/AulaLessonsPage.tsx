"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { forkAulaLessonTemplate } from "@/lib/actions/aula.actions";

type Lesson = {
  id: string;
  companyId: string | null;
  title: string;
  description: string | null;
  isTemplate: boolean;
  order: number;
};

/**
 * Reglo Aula — lista lezioni (template Reglo + fork/proprie della scuola).
 * Skeleton: stile da rifinire con design-system in una passata dedicata.
 */
export function AulaLessonsPage({
  lessons,
  error,
}: {
  lessons: Lesson[];
  error?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const templates = lessons.filter((l) => l.isTemplate);
  const mine = lessons.filter((l) => !l.isTemplate);

  const handleFork = (id: string) => {
    startTransition(async () => {
      const res = await forkAulaLessonTemplate(id);
      if (res.success) router.refresh();
      else setMessage(res.message ?? "Errore");
    });
  };

  return (
    <div className="p-6 space-y-8">
      <h1 className="text-2xl font-semibold">Reglo Aula — Lezioni</h1>
      {error && <p className="text-red-600">{error}</p>}
      {message && <p className="text-red-600">{message}</p>}

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Le tue lezioni</h2>
        {mine.length === 0 && (
          <p className="text-neutral-500">
            Nessuna lezione personalizzata. Personalizza una lezione standard qui sotto.
          </p>
        )}
        <ul className="space-y-2">
          {mine.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <span>{l.title}</span>
              <div className="flex gap-2">
                <button
                  className="rounded-md border px-3 py-1 text-sm"
                  onClick={() => router.push(`aula/${l.id}`)}
                >
                  Modifica
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Lezioni standard (Reglo)</h2>
        <ul className="space-y-2">
          {templates.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <span>{l.title}</span>
              <button
                className="rounded-md border px-3 py-1 text-sm disabled:opacity-50"
                disabled={pending}
                onClick={() => handleFork(l.id)}
              >
                Personalizza
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
