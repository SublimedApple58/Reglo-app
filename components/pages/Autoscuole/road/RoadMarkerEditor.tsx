"use client";

import * as React from "react";
import { Crosshair, X } from "lucide-react";

import { roadApi, type RoadMarker } from "@/lib/autoscuole/road/client";
import { CUSTOM_KIND_PREFIX, ROAD_BASE_MARKERS, type RoadCustomMarker } from "@/lib/autoscuole/road/catalog";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LoadingDots } from "@/components/ui/loading-dots";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { hhmm, SymbolTile } from "./road-ui";

type Busy = null | "sentiment" | "kind" | "note" | "remove";

/**
 * Road novembre R3 (anteprima r3-r7-web approvata da Tiziano il 10/11/2026) —
 * modifica di una segnalazione dal dettaglio guida: giudizio, tipo, nota,
 * «Sposta sulla mappa» (clic sulla mappa, lo gestisce la pagina) ed
 * «Elimina». Ogni modifica si salva subito; la pagina ricarica il dettaglio
 * con `onChanged`. Titolare e istruttore della guida, senza limite di tempo
 * (il server rifiuta gli altri con un messaggio).
 */
export function RoadMarkerEditor({
  sessionId,
  marker,
  custom,
  moving,
  onMove,
  onClose,
  onChanged,
}: {
  sessionId: string;
  marker: RoadMarker;
  custom: RoadCustomMarker[];
  moving: boolean;
  onMove: () => void;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const toast = useFeedbackToast();
  const [busy, setBusy] = React.useState<Busy>(null);
  const [note, setNote] = React.useState(marker.note ?? "");
  const [confirm, setConfirm] = React.useState(false);
  React.useEffect(() => setNote(marker.note ?? ""), [marker.id, marker.note]);

  const run = async (what: Exclude<Busy, null>, fn: () => Promise<unknown>) => {
    if (busy) return false;
    setBusy(what);
    try {
      await fn();
      await onChanged();
      return true;
    } catch (e) {
      toast.error({ description: e instanceof Error ? e.message : "Segnalazione non modificata." });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const patch = (what: Exclude<Busy, null>, body: Parameters<typeof roadApi.updateMarker>[2]) =>
    run(what, () => roadApi.updateMarker(sessionId, marker.id, body));

  const saveNote = () => {
    const next = note.trim() ? note.trim() : null;
    if (next === (marker.note?.trim() || null)) return;
    void patch("note", { note: next });
  };

  const kinds = [
    ...ROAD_BASE_MARKERS.map((b) => ({ value: b.key as string, label: b.label })),
    ...custom.map((c) => ({ value: `${CUSTOM_KIND_PREFIX}${c.id}`, label: c.label })),
  ];
  if (!kinds.some((k) => k.value === marker.kind)) kinds.push({ value: marker.kind, label: marker.label });

  return (
    <div className="rounded-[22px] border border-[#ebebeb] p-[18px] er-panel-in" data-testid="road-marker-editor">
      <style>{`.er-panel-in{animation:er-panel-in 220ms cubic-bezier(.2,.8,.2,1) backwards}@keyframes er-panel-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}`}</style>
      <div className="flex items-center gap-3">
        <SymbolTile kind={marker.kind} size={40} sentiment={marker.sentiment} />
        <div className="min-w-0 flex-1">
          <b className="block truncate text-[17px] font-semibold tracking-[-0.2px] text-[#111111]">{marker.label}</b>
          <span className="block truncate text-[13px] text-[#6a6a6a]">
            {[hhmm(marker.recordedAt), marker.street].filter(Boolean).join(" · ")}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Chiudi"
          className="grid size-[30px] cursor-pointer place-items-center rounded-full bg-[#f4f4f4] text-[#111111] transition-colors duration-200 hover:bg-[#ebebeb]"
        >
          <X className="size-4" strokeWidth={2} />
        </button>
      </div>

      <div className="mt-3.5 flex rounded-xl bg-[#f2f2f2] p-[3px]" role="radiogroup" aria-label="Giudizio">
        {(
          [
            ["bad", "Da migliorare"],
            ["good", "Fatto bene"],
          ] as const
        ).map(([v, label]) => {
          const on = marker.sentiment === v;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={Boolean(busy)}
              onClick={() => !on && void patch("sentiment", { sentiment: v })}
              className={cn(
                "flex h-9 flex-1 cursor-pointer items-center justify-center rounded-[9px] text-[13.5px] font-medium transition-colors duration-200",
                on ? "bg-[#111111] font-semibold text-white" : "text-[#3a3a3c] hover:text-[#111111]",
              )}
            >
              {busy === "sentiment" && !on ? <LoadingDots /> : label}
            </button>
          );
        })}
      </div>

      <label className="mt-3.5 block text-[12.5px] font-semibold text-[#6a6a6a]" htmlFor="road-marker-kind">
        Tipo
      </label>
      <select
        id="road-marker-kind"
        value={marker.kind}
        disabled={Boolean(busy)}
        onChange={(e) => void patch("kind", { kind: e.target.value })}
        className="mt-1.5 h-[42px] w-full cursor-pointer rounded-xl border border-[#dcdcdc] bg-white px-3 text-[14px] text-[#111111] outline-none transition-colors duration-200 focus:border-[#111111]"
      >
        {kinds.map((k) => (
          <option key={k.value} value={k.value}>
            {k.label}
          </option>
        ))}
      </select>

      <label className="mt-3.5 block text-[12.5px] font-semibold text-[#6a6a6a]" htmlFor="road-marker-note">
        Nota
      </label>
      <textarea
        id="road-marker-note"
        value={note}
        maxLength={500}
        disabled={busy === "note"}
        onChange={(e) => setNote(e.target.value)}
        onBlur={saveNote}
        placeholder="Aggiungi una nota"
        rows={2}
        className="mt-1.5 w-full resize-none rounded-xl border border-[#dcdcdc] bg-white px-3 py-2.5 text-[14px] text-[#111111] outline-none transition-colors duration-200 placeholder:text-[#9a9a9a] focus:border-[#111111]"
      />

      <div className="mt-3.5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onMove}
          disabled={Boolean(busy)}
          aria-pressed={moving}
          className={cn(
            "flex h-9 cursor-pointer items-center gap-2 rounded-[18px] border px-3.5 text-[13.5px] font-semibold transition-colors duration-200",
            moving ? "border-[#111111] bg-[#111111] text-white" : "border-[#dcdcdc] text-[#111111] hover:bg-[#f6f6f6]",
          )}
        >
          <Crosshair className="size-4" strokeWidth={1.9} />
          Sposta sulla mappa
        </button>
        <button
          type="button"
          onClick={() => setConfirm(true)}
          disabled={Boolean(busy)}
          className="cursor-pointer text-[13.5px] font-medium text-[#DC2626] transition-opacity duration-200 hover:opacity-70"
        >
          {busy === "remove" ? <LoadingDots /> : "Elimina"}
        </button>
      </div>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare «{marker.label}»?</AlertDialogTitle>
            <AlertDialogDescription>Sparisce dal percorso e dai punti critici.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (await run("remove", () => roadApi.removeMarker(sessionId, marker.id))) onClose();
              }}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
