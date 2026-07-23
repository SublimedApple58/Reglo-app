"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createAulaLesson,
  forkAulaLessonTemplate,
} from "@/lib/actions/aula.actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

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

  const handleCreate = () => {
    startTransition(async () => {
      const res = await createAulaLesson();
      if (res.success && res.data) router.push(`aula/${res.data.id}`);
      else setMessage(res.message ?? "Errore");
    });
  };

  const feedback = error ?? message;

  return (
    <div className="space-y-8 p-6">
      <PageHeader
        title="Reglo Aula"
        subtitle="Lezioni di teoria in aula"
        actions={
          <Button size="sm" disabled={pending} onClick={handleCreate}>
            Nuova lezione
          </Button>
        }
      />

      {feedback && <p className="text-sm text-destructive">{feedback}</p>}

      <section className="space-y-3">
        <h2 className="ds-section-secondary">Le tue lezioni</h2>
        {mine.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nessuna lezione personalizzata. Personalizza una lezione standard qui
            sotto.
          </p>
        ) : (
          <ul className="space-y-2">
            {mine.map((l) => (
              <li key={l.id}>
                <Card
                  hierarchy="tertiary"
                  className="flex-row items-center justify-between gap-3"
                >
                  <span className="ds-card-title-tertiary truncate">
                    {l.title}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`aula/${l.id}`)}
                  >
                    Modifica
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="ds-section-secondary">Lezioni standard (Reglo)</h2>
        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nessuna lezione standard disponibile.
          </p>
        ) : (
          <ul className="space-y-2">
            {templates.map((l) => (
              <li key={l.id}>
                <Card
                  hierarchy="tertiary"
                  className="flex-row items-center justify-between gap-3"
                >
                  <span className="ds-card-title-tertiary truncate">
                    {l.title}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => handleFork(l.id)}
                  >
                    Personalizza
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
