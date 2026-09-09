"use client";

import React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingDots } from "@/components/ui/loading-dots";

/**
 * Card flottante "Richiesta di guida" (consorzio) — riproduzione 1:1 della card
 * del prototipo Consorzi.html (misure estratte via computed styles): 340px,
 * radius 18, icona orologio in cerchio ambra tratteggiato, titolo/sottotitolo
 * centrati, box righe bordato, CTA "Accetta" full-width navy pill, link
 * "Rifiuta · Sposta" sotto. Non-modale (portal z-40): la griglia resta
 * cliccabile per spostare il ghost. Vedi docs/features/consorzio.md.
 */

type Props = {
  open: boolean;
  onClose: () => void;
  rows: Array<[string, string]>;
  instructors: Array<{ id: string; name: string }>;
  instructorId: string;
  onInstructorChange: (id: string) => void;
  note?: string | null;
  responding: boolean;
  onAccept: () => void;
  onReject: () => void;
  onMoveHint: () => void;
  /** Ancora viewport iniziale (centro-x, top-y). */
  anchor: { x: number; y: number } | null;
};

const CARD_WIDTH = 340;

export function GuideRequestCard({
  open,
  onClose,
  rows,
  instructors,
  instructorId,
  onInstructorChange,
  note,
  responding,
  onAccept,
  onReject,
  onMoveHint,
  anchor,
}: Props) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  const left = Math.max(
    12,
    Math.min((anchor?.x ?? window.innerWidth / 2) - CARD_WIDTH / 2, window.innerWidth - CARD_WIDTH - 12),
  );
  const top = Math.max(76, Math.min(anchor?.y ?? 140, window.innerHeight - 500));

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="guide-request-card"
          initial={{ opacity: 0, scale: 0.96, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="fixed z-40 rounded-[18px] bg-white px-[22px] pb-[18px] pt-[18px] text-center shadow-[0_20px_54px_rgba(10,20,30,0.26),0_0_0_1px_rgba(0,0,0,0.05)]"
          style={{ width: CARD_WIDTH, left, top }}
        >
          <button
            type="button"
            aria-label="Chiudi"
            onClick={onClose}
            className="absolute right-3.5 top-3.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-[#f0f0f0] text-[#484848] transition-colors hover:bg-[#e6e6e6]"
          >
            <X className="h-4 w-4" strokeWidth={2.2} />
          </button>

          {/* Icona orologio (cerchio ambra tratteggiato, dal prototipo) */}
          <div
            className="mx-auto mb-[13px] flex h-11 w-11 items-center justify-center rounded-full"
            style={{ background: "#FCEFC7", border: "1.5px dashed #DFB63A" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#B58A1F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>

          <h3 className="text-[17px] font-bold text-[#222222]">Richiesta di guida</h3>
          <p className="mx-auto mt-1.5 max-w-[282px] text-[12.5px] font-medium leading-[1.35] text-[#6a6a6a]">
            Lo slot richiesto è il blocco tratteggiato in agenda: spostalo se serve, poi
            accetta o rifiuta.
          </p>

          <div className="mt-4 rounded-[12px] border border-[#ededed] px-[13px] py-0.5">
            {rows.map(([label, value], index) => (
              <div
                key={label}
                className="flex items-center justify-between gap-3.5 py-[9px]"
                style={index > 0 ? { borderTop: "1px solid #f3f3f3" } : undefined}
              >
                <span className="shrink-0 text-[12px] font-medium text-[#929292]">{label}</span>
                <span className="truncate text-right text-[12.5px] font-bold text-[#222222]">
                  {value}
                </span>
              </div>
            ))}
            {/* Istruttore: non presente nel prototipo ma necessario (agenda a
                colonne-istruttore) — reso come ultima riga del box. */}
            <div
              className="flex items-center justify-between gap-3.5 py-[7px]"
              style={{ borderTop: "1px solid #f3f3f3" }}
            >
              <span className="shrink-0 text-[12px] font-medium text-[#929292]">Istruttore</span>
              <Select value={instructorId} onValueChange={onInstructorChange}>
                <SelectTrigger className="h-7 w-auto min-w-0 cursor-pointer gap-1.5 border-0 bg-transparent px-0 text-right text-[12.5px] font-bold text-[#222222] shadow-none focus:ring-0">
                  <SelectValue placeholder="Scegli…" />
                </SelectTrigger>
                <SelectContent className="z-[70]">
                  {instructors.map((instructor) => (
                    <SelectItem key={instructor.id} value={instructor.id} className="cursor-pointer">
                      {instructor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {note ? (
            <p className="mt-2.5 text-left text-[12.5px] text-[#6a6a6a]">
              <span className="font-semibold text-[#222222]">Nota:</span> {note}
            </p>
          ) : null}

          <button
            type="button"
            disabled={responding || !instructorId}
            onClick={onAccept}
            className="mt-5 flex w-full cursor-pointer items-center justify-center rounded-[32px] bg-[#1a1a2e] px-[22px] py-3 text-[14.5px] font-bold text-white transition-colors hover:bg-[#12122a] disabled:opacity-40"
          >
            {responding ? <LoadingDots className="min-h-[18px]" /> : "Accetta"}
          </button>

          <div className="mt-3.5 flex items-center justify-center gap-[26px]">
            <button
              type="button"
              disabled={responding}
              onClick={onReject}
              className="cursor-pointer text-[13.5px] font-semibold text-[#6a6a6a] underline underline-offset-[3px] transition-colors hover:text-[#222222] disabled:opacity-50"
            >
              Rifiuta
            </button>
            <button
              type="button"
              disabled={responding}
              onClick={onMoveHint}
              className="cursor-pointer text-[13.5px] font-semibold text-[#6a6a6a] underline underline-offset-[3px] transition-colors hover:text-[#222222] disabled:opacity-50"
            >
              Sposta
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
