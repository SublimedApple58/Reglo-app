"use client";

import React from "react";
import { Reorder, useDragControls } from "motion/react";
import { GripVertical, Plus, Star, X } from "lucide-react";

import {
  getEvaluationSheet,
  saveEvaluationSheet,
} from "@/lib/actions/autoscuole-evaluation.actions";
import {
  BASE_EVALUATION_TEMPLATE,
  DEFAULT_EVALUATION_SCALE,
  EVALUATION_SCALES,
  MAX_EVALUATION_ITEMS,
  MAX_EVALUATION_LABEL_LENGTH,
  type EvaluationScale,
} from "@/lib/autoscuole/evaluation-sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InlineToggle } from "@/components/ui/inline-toggle";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { LoadingDots } from "@/components/ui/loading-dots";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Riga in editing: `id` assente = voce non ancora salvata. `key` è stabile e
 *  serve a React/Reorder anche prima che la voce esista a DB. */
type DraftItem = {
  key: string;
  id?: string;
  label: string;
  scaleMax: EvaluationScale;
};

const newKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `tmp-${Math.random().toString(36).slice(2)}`;

const scaleLabel = (scale: number) => `${scale} stelline`;

// ─── Stelline ────────────────────────────────────────────────────────────────

/** Fila di stelline non interattiva: mostra com'è fatta la voce sul telefono. */
function StarRow({
  total,
  filled,
  size = 15,
}: {
  total: number;
  filled?: number;
  size?: number;
}) {
  const on = filled ?? total;
  return (
    <span className="flex items-center gap-[3px]" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <Star
          key={i}
          width={size}
          height={size}
          strokeWidth={0}
          className={i < on ? "fill-[#facc15]" : "fill-[#e7e7ec]"}
        />
      ))}
    </span>
  );
}

// ─── Riga voce ───────────────────────────────────────────────────────────────

function ItemRow({
  item,
  disabled,
  onChange,
  onRemove,
}: {
  item: DraftItem;
  disabled: boolean;
  onChange: (next: DraftItem) => void;
  onRemove: () => void;
}) {
  // dragListener={false} + controls sulla maniglia: altrimenti il drag parte
  // anche selezionando il testo dentro l'input del nome.
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      className="list-none"
      whileDrag={{ scale: 1.01, boxShadow: "0 10px 24px rgba(0,0,0,0.10)" }}
    >
      <div className="grid grid-cols-[26px_minmax(0,1fr)_auto_140px_34px] items-center gap-3 rounded-[12px] border-[1.5px] border-[#e4e4e4] bg-white px-3 py-2">
        <button
          type="button"
          onPointerDown={(e) => !disabled && controls.start(e)}
          className={cn(
            "flex h-7 w-6 cursor-grab items-center justify-center text-[#c2c2c2] active:cursor-grabbing",
            disabled && "cursor-default opacity-50",
          )}
          aria-label={`Sposta ${item.label || "voce"}`}
        >
          <GripVertical className="size-4" strokeWidth={2} />
        </button>

        <input
          value={item.label}
          maxLength={MAX_EVALUATION_LABEL_LENGTH}
          disabled={disabled}
          onChange={(e) => onChange({ ...item, label: e.target.value })}
          placeholder="Nome della voce"
          className="w-full bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-[#c2c2c2]"
        />

        <StarRow total={item.scaleMax} />

        <Select
          value={String(item.scaleMax)}
          disabled={disabled}
          onValueChange={(v) => onChange({ ...item, scaleMax: Number(v) as EvaluationScale })}
        >
          <SelectTrigger className="h-[34px] rounded-[9px] border-[1.5px] border-[#e4e4e4] bg-[#fbfbfb] text-[12.5px] font-semibold text-[#6a6a6a]">
            <SelectValue />
          </SelectTrigger>
          {/* L'overlay Impostazioni è sopra la pagina: il dropdown deve stargli sopra. */}
          <SelectContent className="z-[300]">
            {EVALUATION_SCALES.map((scale) => (
              <SelectItem key={scale} value={String(scale)}>
                {scaleLabel(scale)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Togli ${item.label || "voce"}`}
          className="flex size-7 cursor-pointer items-center justify-center rounded-[8px] text-[#b0b0b0] transition-colors hover:bg-[#f7f7f7] hover:text-[#6a6a6a] disabled:opacity-50"
        >
          <X className="size-4" strokeWidth={2} />
        </button>
      </div>
    </Reorder.Item>
  );
}

// ─── Pane ────────────────────────────────────────────────────────────────────

export function EvaluationSheetPane() {
  const toast = useFeedbackToast();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [enabled, setEnabled] = React.useState(false);
  const [items, setItems] = React.useState<DraftItem[]>([]);
  /** true finché l'autoscuola non ha mai salvato un pagellino: mostra il
   *  modello base invece di una lista vuota. */
  const [pristine, setPristine] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const res = await getEvaluationSheet();
      if (!alive) return;
      if (res.success) {
        setEnabled(res.data.enabled);
        setItems(
          res.data.items.map((i) => ({
            key: i.id,
            id: i.id,
            label: i.label,
            scaleMax: (i.scaleMax as EvaluationScale) ?? DEFAULT_EVALUATION_SCALE,
          })),
        );
        setPristine(res.data.items.length === 0);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const addItem = () => {
    if (items.length >= MAX_EVALUATION_ITEMS) return;
    setPristine(false);
    setItems((prev) => [
      ...prev,
      { key: newKey(), label: "", scaleMax: DEFAULT_EVALUATION_SCALE },
    ]);
  };

  const useTemplate = () => {
    setPristine(false);
    setEnabled(true);
    setItems(
      BASE_EVALUATION_TEMPLATE.map((t) => ({
        key: newKey(),
        label: t.label,
        scaleMax: t.scaleMax,
      })),
    );
  };

  const handleSave = async () => {
    const cleaned = items.map((i) => ({ ...i, label: i.label.trim() }));
    if (cleaned.some((i) => !i.label)) {
      toast.error({ description: "Dai un nome a tutte le voci prima di salvare." });
      return;
    }
    setSaving(true);
    const res = await saveEvaluationSheet({
      enabled,
      items: cleaned.map((i) => ({ id: i.id, label: i.label, scaleMax: i.scaleMax })),
    });
    setSaving(false);
    if (!res.success) {
      toast.error({ description: res.message ?? "Impossibile salvare il pagellino." });
      return;
    }
    setItems(
      res.data.items.map((i) => ({
        key: i.id,
        id: i.id,
        label: i.label,
        scaleMax: i.scaleMax as EvaluationScale,
      })),
    );
    setPristine(false);
    toast.success({ description: "Pagellino aggiornato." });
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-[86px] w-full rounded-[16px]" />
        <Skeleton className="h-[52px] w-full rounded-[12px]" />
        <Skeleton className="h-[52px] w-full rounded-[12px]" />
        <Skeleton className="h-[52px] w-full rounded-[12px]" />
      </div>
    );
  }

  // Prima apertura: modello base pronto da adottare.
  if (pristine && !items.length) {
    return (
      <div className="rounded-[14px] border-[1.5px] border-dashed border-[#e0e0e0] px-6 py-7 text-center">
        <div className="text-sm font-semibold text-foreground">
          Modello base, 5 voci a 5 stelline
        </div>
        <div className="mx-auto mt-1.5 max-w-[420px] text-[12.5px] font-medium leading-[1.55] text-[#929292]">
          Sono le voci più usate dalle autoscuole. Puoi rinominarle, cambiarne la scala o
          toglierle in qualsiasi momento.
        </div>
        <div className="mx-auto mt-4 max-w-[430px] rounded-[14px] border-[1.5px] border-[#e4e4e4] bg-white px-4 text-left">
          {BASE_EVALUATION_TEMPLATE.map((t, i) => (
            <div
              key={t.label}
              className={cn(
                "flex items-center justify-between py-2.5",
                i > 0 && "border-t border-[#f4f4f6]",
              )}
            >
              <span className="text-[12.5px] font-semibold text-foreground">{t.label}</span>
              <StarRow total={t.scaleMax} size={16} />
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={useTemplate}
            className="cursor-pointer rounded-[10px] bg-navy-900 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-navy-800"
          >
            Usa il modello base
          </button>
          <button
            type="button"
            onClick={addItem}
            className="cursor-pointer rounded-[10px] border-[1.5px] border-[#e4e4e4] bg-white px-4 py-2.5 text-[13px] font-semibold text-foreground transition-colors hover:border-[#cdcdcd]"
          >
            Parti da zero
          </button>
        </div>
      </div>
    );
  }

  const previewItems = items.filter((i) => i.label.trim()).slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="rounded-[16px] border border-[#ededed] p-[22px]">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="text-[11.5px] font-semibold text-[#929292]">Valutazione guida</div>
            <div className="mt-0.5 text-[15px] font-semibold text-foreground">
              Pagellino attivo
            </div>
            <div className="mt-1 max-w-[540px] text-[12.5px] font-medium leading-[1.5] text-[#929292]">
              Quando è spento gli istruttori non valutano più le guide: la sezione sparisce
              dal foglio &quot;Dettagli guida&quot;. Le valutazioni già salvate restano leggibili.
            </div>
          </div>
          <InlineToggle
            checked={enabled}
            size="lg"
            disabled={saving}
            onChange={() => setEnabled((v) => !v)}
          />
        </div>

        <Reorder.Group
          axis="y"
          values={items}
          onReorder={setItems}
          className="mt-5 flex list-none flex-col gap-2.5"
        >
          {items.map((item) => (
            <ItemRow
              key={item.key}
              item={item}
              disabled={saving}
              onChange={(next) =>
                setItems((prev) => prev.map((i) => (i.key === item.key ? next : i)))
              }
              onRemove={() => setItems((prev) => prev.filter((i) => i.key !== item.key))}
            />
          ))}
        </Reorder.Group>

        {items.length < MAX_EVALUATION_ITEMS && (
          <button
            type="button"
            onClick={addItem}
            disabled={saving}
            className="mt-2.5 flex w-full cursor-pointer items-center gap-2 rounded-[12px] border-[1.5px] border-dashed border-[#dcdcdc] px-3 py-2.5 text-[13.5px] font-semibold text-[#6a6a6a] transition-colors hover:border-[#c9c9c9] hover:text-foreground"
          >
            <span className="flex size-5 items-center justify-center rounded-[6px] bg-[#f0f0f2] text-[13px] text-[#444]">
              <Plus className="size-3.5" strokeWidth={2.4} />
            </span>
            Aggiungi voce
          </button>
        )}

        <div className="mt-[22px] flex items-center gap-3.5">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex min-w-[150px] cursor-pointer items-center justify-center rounded-[10px] bg-navy-900 px-[22px] py-[11px] text-[13.5px] font-semibold text-white transition-colors hover:bg-navy-800 disabled:opacity-60"
          >
            {saving ? <LoadingDots className="min-h-5" /> : "Salva pagellino"}
          </button>
          <span className="text-[12.5px] font-medium text-[#b0b0b0]">
            {items.length === 0
              ? "Nessuna voce: gli istruttori vedranno solo le stelle complessive"
              : `${items.length} ${items.length === 1 ? "voce" : "voci"} · l'istruttore le compila in pochi secondi`}
          </span>
        </div>
      </div>

      {previewItems.length > 0 && (
        <div className="rounded-[16px] border border-[#ededed] bg-[#fbfbfc] px-[22px] py-5">
          <div className="text-[11.5px] font-semibold text-[#929292]">Anteprima</div>
          <div className="mt-0.5 text-[15px] font-semibold text-foreground">
            Come la vede l&apos;istruttore
          </div>
          <div className="mt-3.5 w-[320px] max-w-full rounded-[16px] border border-[#ececec] bg-white px-3.5">
            {previewItems.map((item, i) => (
              <div
                key={item.key}
                className={cn(
                  "flex items-center justify-between py-3",
                  i > 0 && "border-t border-[#f4f4f6]",
                )}
              >
                <span className="text-[12.5px] font-semibold text-foreground">{item.label}</span>
                {/* Stelline VUOTE: l'istruttore parte da zero e tocca solo ciò
                    che vuole davvero valutare (niente più precompilazione). */}
                <StarRow total={item.scaleMax} filled={0} size={18} />
              </div>
            ))}
          </div>
          <div className="mt-2.5 text-[12px] font-medium text-[#b0b0b0]">
            L&apos;istruttore aggiunge le voci che quella guida ha toccato: le altre non
            finiscono nel pagellino.
          </div>
        </div>
      )}
    </div>
  );
}
