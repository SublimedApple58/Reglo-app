"use client";

import React from "react";
import { Pencil, X } from "lucide-react";

import {
  getAutoscuolaSettings,
  updateAutoscuolaSettings,
} from "@/lib/actions/autoscuole-settings.actions";
import {
  ROAD_CUSTOM_MARKER_LABEL_MAX,
  ROAD_CUSTOM_MARKERS_MAX,
  type RoadCustomMarker,
} from "@/lib/autoscuole/road/catalog";
import { CUSTOM_MARKER_SYMBOL, ROAD_BASE_SYMBOLS } from "@/lib/autoscuole/road/symbols";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { InlineToggle } from "@/components/ui/inline-toggle";
import { LoadingDots } from "@/components/ui/loading-dots";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { RoadExamRoutesSection } from "./road/RoadExamRoutesSection";

const newId = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
  ).slice(0, 8);

/**
 * Impostazioni › Reglo Road (REG-638): la lista base delle segnalazioni (sola
 * lettura) e quelle personalizzate dell'autoscuola, che compaiono agli
 * istruttori nella sezione «Della tua autoscuola». Ogni modifica si salva
 * subito (`updateAutoscuolaSettings({ roadCustomMarkers })`). Sotto, i percorsi
 * d'esame (REG-645, `RoadExamRoutesSection`).
 *
 * In cima (REG-651) i due interruttori del giro, accesi di default e salvati
 * al tocco: «Proponi il giro» (`roadPlanEnabled`) e «Avvisi delle tappe»
 * (`roadPlanAlertsEnabled`, conta solo col giro acceso).
 */
export function RoadSettingsPane() {
  const toast = useFeedbackToast();
  const [items, setItems] = React.useState<RoadCustomMarker[] | null>(null);
  const [draft, setDraft] = React.useState("");
  const [saving, setSaving] = React.useState<"add" | string | null>(null);
  const [editing, setEditing] = React.useState<{ id: string; label: string } | null>(null);
  const [plan, setPlan] = React.useState<{ roadPlanEnabled: boolean; roadPlanAlertsEnabled: boolean } | null>(null);
  const [planSaving, setPlanSaving] = React.useState<PlanKey | null>(null);

  React.useEffect(() => {
    let alive = true;
    void getAutoscuolaSettings().then((res) => {
      if (!alive) return;
      if (res.success && res.data) {
        setItems(res.data.roadCustomMarkers ?? []);
        setPlan({
          roadPlanEnabled: res.data.roadPlanEnabled !== false,
          roadPlanAlertsEnabled: res.data.roadPlanAlertsEnabled !== false,
        });
      } else {
        setItems([]);
        toast.error({ description: res.message ?? "Impossibile caricare le segnalazioni." });
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (next: RoadCustomMarker[], busy: "add" | string, done: string) => {
    setSaving(busy);
    const res = await updateAutoscuolaSettings({ roadCustomMarkers: next });
    setSaving(null);
    if (!res.success) {
      toast.error({ description: res.message ?? "Impossibile salvare le segnalazioni." });
      return false;
    }
    setItems(next);
    toast.success({ description: done });
    return true;
  };

  const togglePlan = async (key: PlanKey) => {
    if (!plan || planSaving) return;
    const value = !plan[key];
    setPlanSaving(key);
    const res = await updateAutoscuolaSettings({ [key]: value });
    setPlanSaving(null);
    if (!res.success) {
      toast.error({ description: res.message ?? "Impossibile salvare l'impostazione." });
      return;
    }
    setPlan({ ...plan, [key]: value });
  };

  const add = async () => {
    const label = draft.trim();
    if (!label || !items || saving) return;
    if (items.some((i) => i.label.toLowerCase() === label.toLowerCase())) {
      toast.error({ description: "Questa segnalazione c'è già." });
      return;
    }
    if (await save([...items, { id: newId(), label }], "add", "Segnalazione aggiunta.")) setDraft("");
  };

  const rename = async () => {
    if (!editing || !items) return;
    const label = editing.label.trim();
    const current = items.find((i) => i.id === editing.id);
    if (!label || !current || label === current.label) {
      setEditing(null);
      return;
    }
    const ok = await save(
      items.map((i) => (i.id === editing.id ? { ...i, label } : i)),
      editing.id,
      "Segnalazione rinominata.",
    );
    if (ok) setEditing(null);
  };

  const remove = (id: string) => {
    if (!items || saving) return;
    void save(
      items.filter((i) => i.id !== id),
      id,
      "Segnalazione tolta.",
    );
  };

  const full = (items?.length ?? 0) >= ROAD_CUSTOM_MARKERS_MAX;

  return (
    <div className="-mt-7" data-testid="road-settings-pane">
      <p className="max-w-[680px] text-[15px] leading-[1.5] text-[#6a6a6a]">
        Durante la guida l&apos;istruttore segna gli errori sul punto esatto del percorso. Qui scegli quali
        segnalazioni avere sotto mano oltre a quelle di base.
      </p>

      <div className="mt-[30px] text-base font-semibold text-[#222222]">Il giro</div>
      <div className="mt-3.5 rounded-[18px] border border-[#ebebeb]" data-testid="road-plan-settings">
        {!plan ? (
          <div className="space-y-3 p-[18px]">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-2/3" />
          </div>
        ) : (
          <>
            <PlanToggleRow
              title="Proponi il giro della prossima guida"
              description="Prima di partire l'istruttore vede le tappe consigliate: gli errori ripetuti dell'allievo, i punti critici della zona e i percorsi d'esame. In guida, una linea suggerita le collega e torna in sede."
              checked={plan.roadPlanEnabled}
              saving={planSaving === "roadPlanEnabled"}
              onToggle={() => void togglePlan("roadPlanEnabled")}
              testId="road-plan-toggle"
            />
            <PlanToggleRow
              title="Avvisi delle tappe durante la guida"
              description="Poco prima di ogni tappa compare un avviso sullo schermo dell'istruttore, senza voce."
              checked={plan.roadPlanAlertsEnabled}
              disabled={!plan.roadPlanEnabled}
              saving={planSaving === "roadPlanAlertsEnabled"}
              onToggle={() => void togglePlan("roadPlanAlertsEnabled")}
              testId="road-plan-alerts-toggle"
              divided
            />
          </>
        )}
      </div>

      <div className="mt-[30px] flex items-baseline justify-between text-base font-semibold text-[#222222]">
        Segnalazioni di base
        <span className="text-[13px] font-medium text-[#6a6a6a]">uguali per tutte le autoscuole</span>
      </div>
      <div className="mt-3.5 grid grid-cols-3 gap-2.5 sm:grid-cols-6">
        {ROAD_BASE_SYMBOLS.map((m) => (
          <div
            key={m.key}
            title={m.label}
            className="flex h-[92px] flex-col items-center justify-center gap-1.5 rounded-2xl bg-[#f7f7f7] text-[13px] text-[#333333]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.src} alt="" className="size-9 object-contain" draggable={false} />
            {m.shortLabel}
          </div>
        ))}
      </div>

      <div className="mt-[30px] flex items-baseline justify-between text-base font-semibold text-[#222222]">
        Le tue segnalazioni
        <span className="text-[13px] font-medium text-[#6a6a6a]">
          {items ? `${items.length} di ${ROAD_CUSTOM_MARKERS_MAX}` : ""}
        </span>
      </div>

      <div className="mt-3.5 rounded-[18px] border border-[#ebebeb]">
        {!items ? (
          <div className="space-y-3 p-[18px]">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-2/3" />
          </div>
        ) : null}
        {items?.map((item, index) => {
          const isEditing = editing?.id === item.id;
          return (
            <div
              key={item.id}
              data-testid="road-custom-row"
              className={cn("flex h-16 items-center gap-3.5 px-[18px]", index > 0 && "border-t border-[#f0f0f0]")}
            >
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f7f7f7]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={CUSTOM_MARKER_SYMBOL} alt="" className="w-[26px]" draggable={false} />
              </div>
              {isEditing ? (
                <input
                  autoFocus
                  value={editing.label}
                  maxLength={ROAD_CUSTOM_MARKER_LABEL_MAX}
                  aria-label="Nome della segnalazione"
                  onChange={(e) => setEditing({ id: item.id, label: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void rename();
                    if (e.key === "Escape") setEditing(null);
                  }}
                  onBlur={() => void rename()}
                  className="h-10 min-w-0 flex-1 rounded-[10px] border border-[#d9d9d9] bg-white px-3 text-[15px] text-[#222222] outline-none focus:border-[#111111]"
                />
              ) : (
                <b className="min-w-0 flex-1 truncate text-[15px] font-medium text-[#222222]">{item.label}</b>
              )}
              {saving === item.id ? <LoadingDots className="mr-2" /> : null}
              <div className="flex gap-1.5">
                <button
                  type="button"
                  aria-label={`Rinomina ${item.label}`}
                  disabled={Boolean(saving)}
                  onMouseDown={(e) => isEditing && e.preventDefault()}
                  onClick={() => (isEditing ? void rename() : setEditing({ id: item.id, label: item.label }))}
                  className="grid size-[34px] cursor-pointer place-items-center rounded-[10px] text-[#6a6a6a] transition-colors hover:bg-[#f2f2f2] hover:text-[#111111] disabled:cursor-default"
                >
                  <Pencil className="size-4" strokeWidth={1.8} />
                </button>
                <button
                  type="button"
                  aria-label={`Togli ${item.label}`}
                  disabled={Boolean(saving)}
                  onClick={() => remove(item.id)}
                  className="grid size-[34px] cursor-pointer place-items-center rounded-[10px] text-[#6a6a6a] transition-colors hover:bg-[#f2f2f2] hover:text-[#111111] disabled:cursor-default"
                >
                  <X className="size-[18px]" strokeWidth={1.8} />
                </button>
              </div>
            </div>
          );
        })}
        {items ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
            className={cn(
              "flex gap-2.5 rounded-b-[18px] bg-[#fcfcfc] px-[18px] py-3.5",
              items.length > 0 ? "border-t border-[#f0f0f0]" : "rounded-t-[18px]",
            )}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={ROAD_CUSTOM_MARKER_LABEL_MAX}
              disabled={full}
              placeholder={full ? `Hai già ${ROAD_CUSTOM_MARKERS_MAX} segnalazioni` : "Es. Uso del freno a mano"}
              aria-label="Nuova segnalazione"
              className="h-11 min-w-0 flex-1 rounded-xl border border-[#d9d9d9] bg-white px-3.5 text-[14.5px] text-[#222222] outline-none placeholder:text-[#9a9a9a] focus:border-[#111111] disabled:bg-[#f7f7f7]"
            />
            <button
              type="submit"
              disabled={full || !draft.trim() || Boolean(saving)}
              className="grid h-11 min-w-[106px] cursor-pointer place-items-center rounded-[22px] bg-[#111111] px-[18px] text-[14.5px] font-semibold text-white transition-colors hover:bg-[#2a2a2a] disabled:cursor-default disabled:opacity-40"
            >
              {saving === "add" ? <LoadingDots /> : "Aggiungi"}
            </button>
          </form>
        ) : null}
      </div>

      <p className="mt-3 max-w-[680px] text-[13px] leading-[1.5] text-[#6a6a6a]">
        Le segnalazioni personalizzate compaiono agli istruttori nella sezione «Della tua autoscuola». Rinominarle o
        toglierle non cambia le guide già fatte.
      </p>

      <RoadExamRoutesSection />
    </div>
  );
}

type PlanKey = "roadPlanEnabled" | "roadPlanAlertsEnabled";

function PlanToggleRow({
  title,
  description,
  checked,
  disabled,
  saving,
  onToggle,
  testId,
  divided,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  saving: boolean;
  onToggle: () => void;
  testId: string;
  divided?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-4 px-[18px] py-4", divided && "border-t border-[#f0f0f0]")}>
      <div className={cn("min-w-0 flex-1", disabled && "opacity-50")}>
        <b className="block text-[15px] font-medium text-[#222222]">{title}</b>
        <span className="mt-0.5 block text-[13.5px] leading-[1.45] text-[#6a6a6a]">{description}</span>
      </div>
      {saving ? <LoadingDots className="mr-1" /> : null}
      <div data-testid={testId}>
        <InlineToggle checked={checked} onChange={onToggle} disabled={disabled || saving} size="lg" />
      </div>
    </div>
  );
}
