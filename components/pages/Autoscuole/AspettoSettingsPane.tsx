"use client";

import React from "react";
import { ChevronDown, GripVertical } from "lucide-react";
import { Reorder, useDragControls } from "motion/react";

import {
  getAutoscuolaSettings,
  updateAutoscuolaSettings,
} from "@/lib/actions/autoscuole-settings.actions";
import {
  AGENDA_COLOR_EXCEPTIONS,
  DEFAULT_AGENDA_COLOR_CRITERION,
  DURATION_COLOR_ENTRIES,
  LICENSE_COLOR_ENTRIES,
  LICENSE_COLOR_GROUPS,
  agendaBlockStyle,
  resolveColorOverride,
  asAgendaColorExceptions,
  type AgendaColorCriterion,
  type AgendaColorEntry,
  type AgendaColorExceptions,
  type AgendaColorOverrides,
} from "@/lib/autoscuole/agenda-color-criterion";
import { sortInstructorsForAgenda } from "@/lib/autoscuole/agenda-instructor-order";
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

// ─── Riga istruttore (trascinabile) ──────────────────────────────────────────

/**
 * Una riga della lista "Istruttori in agenda": maniglia di trascinamento,
 * pallino del colore e picker. Il drag parte SOLO dalla maniglia
 * (`dragListener={false}` + `dragControls`), così il click sul picker non
 * diventa un trascinamento per sbaglio.
 */
function InstructorOrderRow<T extends AspettoInstructor>({
  instructor,
  dotHex,
  taken,
  disabled,
  handleRef,
  onMove,
  onCommit,
  onColor,
}: {
  instructor: T;
  dotHex: string;
  taken: string[];
  disabled: boolean;
  handleRef: (el: HTMLButtonElement | null) => void;
  onMove: (direction: -1 | 1) => void;
  onCommit: () => void;
  onColor: (hex: string | null) => Promise<void>;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={instructor}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onCommit}
      className="list-none"
      whileDrag={{ scale: 1.01, boxShadow: "0 10px 24px rgba(0,0,0,0.10)" }}
    >
      <div className="flex items-center gap-3 rounded-[12px] border-[1.5px] border-[#ededed] bg-white px-3 py-2.5">
        {/* Maniglia: trascinabile col mouse, ↑/↓ da tastiera (la lista è corta,
            un drag&drop puro sarebbe inaccessibile). */}
        <button
          ref={handleRef}
          type="button"
          disabled={disabled}
          onPointerDown={(e) => !disabled && controls.start(e)}
          onKeyDown={(e) => {
            if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
            e.preventDefault();
            onMove(e.key === "ArrowUp" ? -1 : 1);
          }}
          aria-label={`Sposta ${instructor.name}`}
          className={cn(
            "flex h-7 w-6 shrink-0 cursor-grab items-center justify-center rounded-[6px] text-[#c2c2c2] transition-colors hover:text-[#8a8a8a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#222222]/25 active:cursor-grabbing",
            disabled && "cursor-default opacity-50",
          )}
        >
          <GripVertical className="size-4" strokeWidth={2} />
        </button>

        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: dotHex }}
        />
        <div className="min-w-0 flex-1 truncate text-sm font-semibold text-[#222222]">
          {instructor.name}
        </div>
        <ColorSwatchPicker
          value={instructor.color}
          taken={taken}
          title={`Colore di ${instructor.name}`}
          onSelect={onColor}
        />
      </div>
    </Reorder.Item>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * Pane "Aspetto" delle Impostazioni: personalizzazione visiva dell'agenda.
 * - Criterio colore dei blocchi guida (setting company in CompanyService.limits)
 * - Istruttori in agenda: ordine delle colonne (drag&drop, REG-443→REG-449) e
 *   colore di ciascuno (spostato qui dal dettaglio "Gestisci istruttore")
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
  // Ordine custom delle colonne istruttore in agenda (REG-449): elenco di id
  // salvato nei limits. Vuoto = ordine alfabetico (com'era prima).
  const [order, setOrder] = React.useState<string[]>([]);
  // Lista visualizzata: si muove subito col drag, il salvataggio la conferma.
  const [rows, setRows] = React.useState<T[]>([]);
  const [savingOrder, setSavingOrder] = React.useState(false);
  const handleRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  React.useEffect(() => {
    let active = true;
    const load = async () => {
      const res = await getAutoscuolaSettings();
      if (!active) return;
      if (res.success && res.data) {
        setCriterion(res.data.agendaColorCriterion);
        setOverrides(res.data.agendaColorOverrides);
        setExceptions(res.data.agendaColorExceptions);
        setOrder(res.data.agendaInstructorOrder);
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

  // La lista mostrata segue l'ordine salvato; gli istruttori non ancora
  // ordinati (es. aggiunti dopo) restano in coda in ordine alfabetico.
  React.useEffect(() => {
    setRows(sortInstructorsForAgenda(instructors, order));
  }, [instructors, order]);

  const saveOrder = async (next: T[]) => {
    const previous = rows;
    setRows(next);
    setSavingOrder(true);
    // Si salva l'elenco COMPLETO di chi è in lista: così l'ordine è esplicito e
    // un istruttore nuovo finisce in fondo invece che in mezzo.
    const res = await updateAutoscuolaSettings({
      agendaInstructorOrder: next.map((i) => i.id),
    });
    setSavingOrder(false);
    if (!res.success || !res.data) {
      setRows(previous);
      toast.error({ description: res.message ?? "Impossibile salvare l'ordine." });
      return;
    }
    setOrder(res.data.agendaInstructorOrder);
  };

  // Fine trascinamento: `rows` è già l'ordine nuovo (lo muove Reorder in
  // tempo reale), qui lo si persiste — e solo se è davvero cambiato, così un
  // drag annullato a metà non scrive niente.
  const commitOrder = () => {
    const nextIds = rows.map((i) => i.id);
    const currentIds = sortInstructorsForAgenda(instructors, order).map((i) => i.id);
    if (nextIds.join("|") === currentIds.join("|")) return;
    void saveOrder(rows);
  };

  // ↑/↓ da tastiera sulla maniglia: sposta la riga di una posizione e le
  // ridà il focus (dopo il riordino il nodo è un altro).
  const moveRow = (id: string, direction: -1 | 1) => {
    const from = rows.findIndex((i) => i.id === id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= rows.length) return;
    const next = [...rows];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    void saveOrder(next);
    requestAnimationFrame(() => handleRefs.current[id]?.focus());
  };

  const resetOrder = async () => {
    setSavingOrder(true);
    const res = await updateAutoscuolaSettings({ agendaInstructorOrder: [] });
    setSavingOrder(false);
    if (!res.success || !res.data) {
      toast.error({ description: res.message ?? "Impossibile ripristinare l'ordine." });
      return;
    }
    setOrder(res.data.agendaInstructorOrder);
  };

  const entriesForCriterion: AgendaColorEntry[] =
    criterion === "patente" ? LICENSE_COLOR_ENTRIES : DURATION_COLOR_ENTRIES;
  const entriesByKey = new Map(entriesForCriterion.map((entry) => [entry.key, entry]));

  // Chip di una voce colore: tocca → picker. Le sotto-patenti senza colore
  // proprio mostrano quello ereditato dalla madre (C/D).
  const renderColorChip = (entry: AgendaColorEntry) => {
    const own = overrides[criterion]?.[entry.key] ?? null;
    const effective = resolveColorOverride(entry, overrides[criterion]);
    return (
      <ColorSwatchPicker
        key={entry.key}
        value={own}
        title={`Colore per ${entry.label}`}
        resetLabel={entry.parent ? "Come la patente madre" : "Colore standard"}
        onSelect={(hex) => saveOverride(criterion, entry.key, hex)}
        renderTrigger={({ saving }) => (
          <button
            type="button"
            title={entry.label}
            data-testid={`color-chip-${entry.key}`}
            className={cn(
              "cursor-pointer rounded-full px-3 py-1.5 text-[12px] font-semibold text-[#3a3a3a] ring-1 ring-inset ring-black/5 transition hover:ring-black/25",
              saving && "animate-pulse opacity-60",
            )}
            style={{ backgroundColor: agendaBlockStyle(entry, effective).backgroundColor }}
          >
            {entry.short}
          </button>
        )}
      />
    );
  };

  // Eccezioni pertinenti al criterio attivo (le altre restano salvate ma
  // né mostrate né applicate finché non si torna a un criterio compatibile).
  const applicableExceptions = AGENDA_COLOR_EXCEPTIONS.filter((exc) =>
    exc.criteria.includes(criterion),
  );
  const activeExceptionCount = applicableExceptions.filter((exc) =>
    Boolean(exceptions[exc.key]),
  ).length;

  // Colore effettivo mostrato in anteprima: custom oppure palette posizionale.
  // L'indice è quello ALFABETICO, non la posizione in lista: in agenda la
  // palette automatica è agganciata all'alfabeto, quindi riordinare le colonne
  // non deve cambiare il colore di nessuno (né qui né lì).
  const alphaIndexById = React.useMemo(() => {
    const map = new Map<string, number>();
    [...instructors]
      .sort((a, b) => a.name.localeCompare(b.name, "it"))
      .forEach((instructor, index) => map.set(instructor.id, index));
    return map;
  }, [instructors]);
  const effectiveHex = (instructor: AspettoInstructor) =>
    instructor.color ??
    INSTRUCTOR_COLOR_CHOICES[(alphaIndexById.get(instructor.id) ?? 0) % 8].hex;

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
                          resolveColorOverride(entry, overrides[option.value]),
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
          {criterion === "patente" ? (
            <div className="mt-3 flex flex-col gap-2.5" data-testid="license-color-groups">
              {LICENSE_COLOR_GROUPS.map((group) => (
                <div key={group.label} className="flex flex-wrap items-center gap-2">
                  <span className="w-[104px] shrink-0 text-[12px] font-semibold text-[#929292]">
                    {group.label}
                  </span>
                  {group.keys.map((key) => {
                    const entry = entriesByKey.get(key);
                    return entry ? renderColorChip(entry) : null;
                  })}
                </div>
              ))}
              <p className="mt-1 text-[12px] font-medium leading-normal text-[#a8a8a8]">
                CE, C1, C1E e CQC hanno il colore della C, DE, D1 e D1E quello della D, finché non
                li personalizzi.
              </p>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {entriesForCriterion.map((entry) => renderColorChip(entry))}
            </div>
          )}
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

      {/* ── Istruttori in agenda: ordine delle colonne + colore ── */}
      <section className="mt-10">
        <div className="flex items-center gap-2.5">
          <h3 className="text-base font-semibold text-[#222222]">Istruttori in agenda</h3>
          {savingOrder && <LoadingDots className="text-[#929292]" />}
        </div>
        <p className="mt-1 max-w-[560px] text-[13px] font-medium leading-normal text-[#929292]">
          Trascina per scegliere in che ordine compaiono le colonne in agenda. Il colore
          identifica l&apos;istruttore (banda di disponibilit&agrave;, avatar e stampa):
          &quot;Automatico&quot; assegna una tinta dalla palette.
        </p>

        <div className="mt-4">
          {rows.length === 0 ? (
            <div className="py-5 text-[13px] font-medium italic text-[#a8a8a8]">
              Nessun istruttore attivo.
            </div>
          ) : (
            <>
              <Reorder.Group
                axis="y"
                values={rows}
                onReorder={(next) => setRows(next as T[])}
                className="flex list-none flex-col gap-2"
              >
                {rows.map((instructor) => (
                  <InstructorOrderRow
                    key={instructor.id}
                    instructor={instructor}
                    dotHex={effectiveHex(instructor)}
                    taken={rows
                      .filter((i) => i.id !== instructor.id && i.color)
                      .map((i) => i.color as string)}
                    disabled={savingOrder}
                    handleRef={(el) => {
                      handleRefs.current[instructor.id] = el;
                    }}
                    onMove={(direction) => moveRow(instructor.id, direction)}
                    onCommit={commitOrder}
                    onColor={(hex) => changeInstructorColor(instructor, hex)}
                  />
                ))}
              </Reorder.Group>
              {order.length > 0 && (
                <button
                  type="button"
                  onClick={() => void resetOrder()}
                  disabled={savingOrder}
                  className="mt-3 cursor-pointer text-[13px] font-semibold text-[#929292] underline decoration-1 underline-offset-2 transition-colors hover:text-[#222222] disabled:opacity-50"
                >
                  Ripristina l&apos;ordine alfabetico
                </button>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
