"use client";

import React from "react";
import { ChevronDown } from "lucide-react";

import {
  getAutoscuolaSettings,
  updateAutoscuolaSettings,
} from "@/lib/actions/autoscuole-settings.actions";
import {
  AGENDA_COLOR_EXCEPTIONS,
  DEFAULT_AGENDA_COLOR_CRITERION,
  DURATION_COLOR_ENTRIES,
  LICENSE_COLOR_ENTRIES,
  agendaBlockStyle,
  asAgendaColorExceptions,
  type AgendaColorCriterion,
  type AgendaColorEntry,
  type AgendaColorExceptions,
  type AgendaColorOverrides,
} from "@/lib/autoscuole/agenda-color-criterion";
import { InlineToggle } from "@/components/ui/inline-toggle";
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

// Anteprima patenti nei card del criterio: le voci più comuni.
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
  // Pannellini on-demand sotto i card (accordion: uno aperto alla volta).
  const [openPanel, setOpenPanel] = React.useState<"colors" | "exceptions" | null>(null);
  const [exceptions, setExceptions] = React.useState<AgendaColorExceptions>(() =>
    asAgendaColorExceptions(null),
  );
  const [savingExceptionKey, setSavingExceptionKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    const load = async () => {
      const res = await getAutoscuolaSettings();
      if (!active) return;
      if (res.success && res.data) {
        setCriterion(res.data.agendaColorCriterion);
        setOverrides(res.data.agendaColorOverrides);
        setExceptions(res.data.agendaColorExceptions);
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
  const saveOverride = async (
    namespace: keyof AgendaColorOverrides,
    entryKey: string,
    hex: string | null,
  ) => {
    const current = overrides[namespace] ?? {};
    const nextRecord: Record<string, string> = { ...current };
    if (hex) nextRecord[entryKey] = hex;
    else delete nextRecord[entryKey];
    const next: AgendaColorOverrides = { ...overrides };
    if (Object.keys(nextRecord).length) next[namespace] = nextRecord;
    else delete next[namespace];

    const res = await updateAutoscuolaSettings({ agendaColorOverrides: next });
    if (!res.success || !res.data) {
      toast.error({ description: res.message ?? "Impossibile salvare il colore." });
      return;
    }
    setOverrides(res.data.agendaColorOverrides);
  };

  // Attiva/disattiva un'eccezione (toggle con spinner per riga).
  const saveException = async (key: string, enabled: boolean) => {
    if (savingExceptionKey) return;
    setSavingExceptionKey(key);
    const next = { ...exceptions, [key]: enabled };
    const res = await updateAutoscuolaSettings({ agendaColorExceptions: next });
    setSavingExceptionKey(null);
    if (!res.success || !res.data) {
      toast.error({ description: res.message ?? "Impossibile salvare l'eccezione." });
      return;
    }
    setExceptions(res.data.agendaColorExceptions);
  };

  const entriesForCriterion: AgendaColorEntry[] =
    criterion === "patente" ? LICENSE_COLOR_ENTRIES : DURATION_COLOR_ENTRIES;

  // Eccezioni pertinenti al criterio attivo (le altre restano salvate ma
  // né mostrate né applicate finché non si torna a un criterio compatibile).
  const applicableExceptions = AGENDA_COLOR_EXCEPTIONS.filter((exc) =>
    exc.criteria.includes(criterion),
  );
  const activeExceptionCount = applicableExceptions.filter((exc) =>
    Boolean(exceptions[exc.key]),
  ).length;

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

      {/* ── Pannellini on-demand: colori + eccezioni (nascosti di default) ── */}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <button
          type="button"
          onClick={() => setOpenPanel((p) => (p === "colors" ? null : "colors"))}
          className="inline-flex cursor-pointer select-none items-center gap-1.5 text-[13px] font-semibold text-[#222222] underline decoration-1 underline-offset-2 transition-all hover:decoration-2"
        >
          Personalizza i colori
          <ChevronDown
            className={cn("size-3.5 transition-transform", openPanel === "colors" && "rotate-180")}
            strokeWidth={2}
          />
        </button>
        <button
          type="button"
          onClick={() => setOpenPanel((p) => (p === "exceptions" ? null : "exceptions"))}
          className="inline-flex cursor-pointer select-none items-center gap-1.5 text-[13px] font-semibold text-[#222222] underline decoration-1 underline-offset-2 transition-all hover:decoration-2"
        >
          Eccezioni
          {activeExceptionCount > 0 && (
            <span className="rounded-full bg-[#f2f2f2] px-1.5 py-0.5 text-[11px] font-semibold no-underline">
              {activeExceptionCount}
            </span>
          )}
          <ChevronDown
            className={cn("size-3.5 transition-transform", openPanel === "exceptions" && "rotate-180")}
            strokeWidth={2}
          />
        </button>
      </div>
      {openPanel === "colors" && (
        <div className="mt-3 rounded-2xl bg-[#fafafa] p-4">
          <p className="text-[12.5px] font-medium leading-normal text-[#929292]">
            Tocca una voce per cambiarne il colore. &laquo;Colore standard&raquo; ripristina la
            palette Reglo.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {entriesForCriterion.map((entry) => (
              <ColorSwatchPicker
                key={entry.key}
                value={overrides[criterion]?.[entry.key] ?? null}
                title={`Colore per ${entry.label}`}
                resetLabel="Colore standard"
                onSelect={(hex) => saveOverride(criterion, entry.key, hex)}
                renderTrigger={({ saving }) => (
                  <button
                    type="button"
                    title={entry.label}
                    className={cn(
                      "cursor-pointer rounded-full px-3 py-1.5 text-[12px] font-semibold text-[#3a3a3a] ring-1 ring-inset ring-black/5 transition hover:ring-black/25",
                      saving && "animate-pulse opacity-60",
                    )}
                    style={{
                      backgroundColor: agendaBlockStyle(
                        entry,
                        overrides[criterion]?.[entry.key],
                      ).backgroundColor,
                    }}
                  >
                    {entry.short}
                  </button>
                )}
              />
            ))}
          </div>
        </div>
      )}

      {openPanel === "exceptions" && (
        <div className="mt-3 rounded-2xl bg-[#fafafa] p-4">
          <p className="text-[12.5px] font-medium leading-normal text-[#929292]">
            Regole pronte all&apos;uso che vincono sul criterio scelto: le guide che
            corrispondono prendono il colore dell&apos;eccezione. Tocca il colore per
            personalizzarlo.
          </p>
          {applicableExceptions.map((exc, index) => {
            const enabled = Boolean(exceptions[exc.key]);
            return (
              <div
                key={exc.key}
                className={cn(
                  "flex items-center justify-between gap-4 py-3.5",
                  index < applicableExceptions.length - 1 && "border-b border-[#eeeeee]",
                )}
              >
                <div className="flex min-w-0 items-center gap-3.5">
                  <ColorSwatchPicker
                    value={overrides.eccezioni?.[exc.key] ?? null}
                    title={`Colore per ${exc.entry.label}`}
                    resetLabel="Colore standard"
                    onSelect={(hex) => saveOverride("eccezioni", exc.key, hex)}
                    renderTrigger={({ saving }) => (
                      <button
                        type="button"
                        title={`Colore per ${exc.entry.label}`}
                        className={cn(
                          "h-8 w-11 shrink-0 cursor-pointer rounded-lg ring-1 ring-inset ring-black/5 transition hover:ring-black/25",
                          saving && "animate-pulse opacity-60",
                          !enabled && "opacity-45",
                        )}
                        style={{
                          backgroundColor: agendaBlockStyle(
                            exc.entry,
                            overrides.eccezioni?.[exc.key],
                          ).backgroundColor,
                        }}
                      />
                    )}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground">{exc.label}</div>
                    <div className="mt-0.5 max-w-[460px] text-[13px] font-medium leading-normal text-[#929292]">
                      {exc.description}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center">
                  {savingExceptionKey === exc.key ? (
                    <LoadingDots className="text-[#929292]" />
                  ) : (
                    <InlineToggle
                      checked={enabled}
                      size="lg"
                      onChange={() => void saveException(exc.key, !enabled)}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

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
