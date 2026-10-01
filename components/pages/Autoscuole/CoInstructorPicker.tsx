"use client";

import React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * REG-585 — i colleghi che portano la guida di gruppo (o l'esame) INSIEME
 * all'istruttore principale.
 *
 * Il principale resta nella Select sopra e qui non compare: questa è solo la
 * lista di chi si aggiunge. Nessun tetto al numero (scelta di Tiziano). Chip
 * a toggle invece di una multi-select perché gli istruttori di un'autoscuola
 * sono una manciata e si leggono tutti in un colpo d'occhio.
 *
 * Senza un principale scelto non si può aggiungere nessuno — il backend
 * rifiuterebbe comunque ("Scegli prima l'istruttore principale").
 */
export function CoInstructorPicker({
  instructors,
  mainInstructorId,
  value,
  onChange,
  disabled,
  label = "Altri istruttori",
}: {
  instructors: Array<{ id: string; name: string }>;
  mainInstructorId: string | null;
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  label?: string;
}) {
  const selectable = React.useMemo(
    () => instructors.filter((i) => i.id !== mainInstructorId),
    [instructors, mainInstructorId],
  );

  // Se il principale cambia e diventa uno di quelli già selezionati, va tolto
  // dagli aggiuntivi: sarebbe la stessa persona due volte.
  React.useEffect(() => {
    if (mainInstructorId && value.includes(mainInstructorId)) {
      onChange(value.filter((id) => id !== mainInstructorId));
    }
  }, [mainInstructorId, value, onChange]);

  if (!selectable.length) return null;

  const toggle = (id: string) => {
    if (disabled) return;
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  };

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-muted-foreground">
        {label} <span className="text-[#929292]">(facoltativo)</span>
      </p>
      {!mainInstructorId ? (
        <p className="text-[12.5px] font-medium text-[#929292]">
          Prima scegli l&apos;istruttore.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {selectable.map((instructor) => {
            const active = value.includes(instructor.id);
            return (
              <button
                key={instructor.id}
                type="button"
                onClick={() => toggle(instructor.id)}
                disabled={disabled}
                aria-pressed={active}
                className={cn(
                  "inline-flex cursor-pointer items-center gap-1.5 rounded-full border-[1.5px] px-3 py-1.5 text-[12.5px] font-medium transition-colors disabled:cursor-default disabled:opacity-50",
                  active
                    ? "border-[#222222] bg-[#f7f7f7] text-foreground"
                    : "border-[#dddddd] text-[#6a6a6a] hover:border-[#929292]",
                )}
              >
                {active && <Check className="size-3.5" strokeWidth={2.5} aria-hidden />}
                {instructor.name}
              </button>
            );
          })}
        </div>
      )}
      {value.length > 0 && (
        <p className="text-[12px] font-medium text-[#6a6a6a]">
          La guida comparirà in agenda anche a chi aggiungi, e le ore contano per tutti.
        </p>
      )}
    </div>
  );
}
