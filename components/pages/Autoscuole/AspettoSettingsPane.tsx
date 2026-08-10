"use client";

import React from "react";

import {
  getAutoscuolaSettings,
  updateAutoscuolaSettings,
} from "@/lib/actions/autoscuole-settings.actions";
import {
  DEFAULT_AGENDA_COLOR_CRITERION,
  DURATION_COLOR_ENTRIES,
  LICENSE_COLOR_ENTRIES,
  agendaBlockStyle,
  type AgendaColorCriterion,
  type AgendaColorEntry,
  type AgendaColorOverrides,
} from "@/lib/autoscuole/agenda-color-criterion";
import { INSTRUCTOR_COLOR_CHOICES } from "@/lib/autoscuole/instructor-colors";
import { ColorSwatchPicker } from "@/components/ui/color-swatch-picker";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { LoadingDots } from "@/components/ui/loading-dots";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Sottoinsieme di InstructorDetail (AutoscuoleResourcesPage) che serve qui. */
type AspettoInstructor = { id: string; name: string; color?: string | null };

// ─── Constants ────────────────────────────────────────────────────────────────

// Anteprima patenti nei card del criterio: le voci più comuni (B, B autom., AM, A).
const LICENSE_PREVIEW = LICENSE_COLOR_ENTRIES.filter((e) =>
  ["b", "autom", "am", "a"].includes(e.key),
);

const CRITERION_OPTIONS: Array<{
  value: AgendaColorCriterion;
  label: string;
  description: string;
}> = [
  {
    value: "durata",
    label: "Durata guida",
    description: "Ogni blocco prende il colore in base alla durata della guida.",
  },
  {
    value: "patente",
    label: "Tipo patente",
    description:
      "Ogni blocco prende il colore della patente della guida (la B automatica è distinta dalla B).",
  },
];

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * Pane "Aspetto" delle Impostazioni: personalizzazione visiva dell'agenda.
 * - Criterio colore dei blocchi guida (setting company in CompanyService.limits)
 * - Colori istruttori (spostati qui dal dettaglio "Gestisci istruttore")
 * Gli istruttori arrivano via props dal parent (stesso stato di InstructorsTab)
 * così il cambio colore resta coerente in tutto l'overlay.
 */
export function AspettoSettingsPane<T extends AspettoInstructor>({
  instructors,
  changeInstructorColor,
}: {
  instructors: T[];
  changeInstructorColor: (instructor: T, color: string | null) => Promise<void>;
}) {
  const toast = useFeedbackToast();

  const [loading, setLoading] = React.useState(true);
  const [criterion, setCriterion] = React.useState<AgendaColorCriterion>(
    DEFAULT_AGENDA_COLOR_CRITERION,
  );
  const [savingCriterion, setSavingCriterion] = React.useState(false);
  const [overrides, setOverrides] = React.useState<AgendaColorOverrides>({});

  React.useEffect(() => {
    let active = true;
    const load = async () => {
      const res = await getAutoscuolaSettings();
      if (!active) return;
      if (res.success && res.data) {
        setCriterion(res.data.agendaColorCriterion);
        setOverrides(res.data.agendaColorOverrides);
      }
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const saveCriterion = async (value: AgendaColorCriterion) => {
    if (value === criterion || savingCriterion) return;
    const previous = criterion;
    setCriterion(value);
    setSavingCriterion(true);
    const res = await updateAutoscuolaSettings({ agendaColorCriterion: value });
    setSavingCriterion(false);
    if (!res.success || !res.data) {
      setCriterion(previous);
      toast.error({ description: res.message ?? "Impossibile salvare l'impostazione." });
      return;
    }
    setCriterion(res.data.agendaColorCriterion);
  };

  // Salva il colore personalizzato di una voce (null = torna al default).
  // Il picker attende la promise → spinner sul trigger finché non risolve.
  const saveOverride = async (entryKey: string, hex: string | null) => {
    const current = overrides[criterion] ?? {};
    const nextRecord: Record<string, string> = { ...current };
    if (hex) nextRecord[entryKey] = hex;
    else delete nextRecord[entryKey];
    const next: AgendaColorOverrides = { ...overrides };
    if (Object.keys(nextRecord).length) next[criterion] = nextRecord;
    else delete next[criterion];

    const res = await updateAutoscuolaSettings({ agendaColorOverrides: next });
    if (!res.success || !res.data) {
      toast.error({ description: res.message ?? "Impossibile salvare il colore." });
      return;
    }
    setOverrides(res.data.agendaColorOverrides);
  };

  const entriesForCriterion: AgendaColorEntry[] =
    criterion === "patente" ? LICENSE_COLOR_ENTRIES : DURATION_COLOR_ENTRIES;

  // Colore effettivo mostrato in anteprima: custom oppure palette posizionale
  // (stessa regola di InstructorsTab/agenda per gli istruttori senza colore).
  const effectiveHex = (instructor: AspettoInstructor, index: number) =>
    instructor.color ?? INSTRUCTOR_COLOR_CHOICES[index % 8].hex;

  if (loading) {
    return (
      <div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-start justify-between gap-4 border-b border-[#ebebeb] py-5">
            <div className="min-w-0 flex-1">
              <Skeleton className="mb-2 h-4 w-48" />
              <Skeleton className="h-3.5 w-72 max-w-full" />
            </div>
            <Skeleton className="h-7 w-7 rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div data-testid="aspetto-settings-pane">
      {/* ── Colore dei blocchi in agenda ── */}
      <section>
        <div className="flex items-center gap-2.5">
          <h3 className="text-base font-semibold text-[#222222]">Colore dei blocchi in agenda</h3>
          {savingCriterion && <LoadingDots className="text-[#929292]" />}
        </div>
        <p className="mt-1 max-w-[560px] text-[13px] font-medium leading-normal text-[#929292]">
          Scegli come colorare le guide normali in agenda. Esami, guide di gruppo e blocchi
          (malattia, ferie, teoria) mantengono sempre il loro colore per tipo.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {CRITERION_OPTIONS.map((option) => {
            const active = criterion === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => void saveCriterion(option.value)}
                disabled={savingCriterion}
                className={cn(
                  "cursor-pointer rounded-2xl border-[1.5px] p-4 text-left transition-colors",
                  active
                    ? "border-[#222222] bg-[#fafafa]"
                    : "border-[#dddddd] hover:border-[#b8b8b8]",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-[#222222]">{option.label}</div>
                  <span
                    className={cn(
                      "flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px]",
                      active ? "border-[#222222]" : "border-[#c9c9c9]",
                    )}
                  >
                    {active && <span className="size-2.5 rounded-full bg-[#222222]" />}
                  </span>
                </div>
                <div className="mt-1 text-[12.5px] font-medium leading-snug text-[#929292]">
                  {option.description}
                </div>
                {/* Anteprima chip (coi colori personalizzati, se presenti) */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {(option.value === "durata"
                    ? DURATION_COLOR_ENTRIES.filter((e) => e.key !== "autom")
                    : LICENSE_PREVIEW
                  ).map((entry) => (
                    <span
                      key={entry.key}
                      className="rounded-md px-2 py-1 text-[10px] font-semibold text-[#3a3a3a]"
                      style={{
                        backgroundColor: agendaBlockStyle(
                          entry,
                          overrides[option.value]?.[entry.key],
                        ).backgroundColor,
                      }}
                    >
                      {entry.short}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Colori delle voci del criterio attivo ── */}
      <section className="mt-10">
        <h3 className="text-base font-semibold text-[#222222]">Colori delle voci</h3>
        <p className="mt-1 max-w-[560px] text-[13px] font-medium leading-normal text-[#929292]">
          {criterion === "patente"
            ? "Personalizza il colore di ogni patente. “Colore standard” ripristina la palette Reglo."
            : "Personalizza il colore di ogni durata. “Colore standard” ripristina la palette Reglo."}
        </p>
        <div className="mt-2">
          {entriesForCriterion.map((entry, index) => (
            <div
              key={entry.key}
              className={cn(
                "flex items-center justify-between gap-4 py-3.5",
                index < entriesForCriterion.length - 1 && "border-b border-[#eeeeee]",
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="h-6 w-9 shrink-0 rounded-md"
                  style={agendaBlockStyle(entry, overrides[criterion]?.[entry.key])}
                />
                <div className="truncate text-sm font-semibold text-[#222222]">{entry.label}</div>
              </div>
              <ColorSwatchPicker
                value={overrides[criterion]?.[entry.key] ?? null}
                title={`Colore per ${entry.label}`}
                resetLabel="Colore standard"
                onSelect={(hex) => saveOverride(entry.key, hex)}
              />
            </div>
          ))}
        </div>
      </section>

      {/* ── Colori istruttori ── */}
      <section className="mt-10">
        <h3 className="text-base font-semibold text-[#222222]">Colori istruttori</h3>
        <p className="mt-1 max-w-[560px] text-[13px] font-medium leading-normal text-[#929292]">
          Il colore identifica l&apos;istruttore in agenda (banda di disponibilità, avatar e
          stampa). &quot;Automatico&quot; assegna una tinta dalla palette.
        </p>

        <div className="mt-2">
          {instructors.length === 0 ? (
            <div className="py-5 text-[13px] font-medium italic text-[#a8a8a8]">
              Nessun istruttore attivo.
            </div>
          ) : (
            instructors.map((instructor, index) => {
              const taken = instructors
                .filter((i) => i.id !== instructor.id && i.color)
                .map((i) => i.color as string);
              return (
                <div
                  key={instructor.id}
                  className={cn(
                    "flex items-center justify-between gap-4 py-3.5",
                    index < instructors.length - 1 && "border-b border-[#eeeeee]",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: effectiveHex(instructor, index) }}
                    />
                    <div className="truncate text-sm font-semibold text-[#222222]">
                      {instructor.name}
                    </div>
                  </div>
                  <ColorSwatchPicker
                    value={instructor.color}
                    taken={taken}
                    title={`Colore di ${instructor.name}`}
                    onSelect={(hex) => changeInstructorColor(instructor, hex)}
                  />
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
