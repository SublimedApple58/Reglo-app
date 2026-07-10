"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useDragControls } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Card di creazione eventi agenda in stile popover (proto): NON modale, la
 * griglia sotto resta interattiva così il blocco ghost si vede e si può
 * riposizionare cliccando gli slot. Ancorata al punto di apertura (di solito
 * il bottone "+"), chiusa solo da X / Annulla / Escape — mai da click fuori.
 */
export function CreateEventPopover({
  open,
  onClose,
  title,
  subtitle,
  anchor,
  width = 392,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Coordinate viewport a cui ancorare l'angolo in alto a destra della card. */
  anchor: { x: number; y: number } | null;
  width?: number;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const dragControls = useDragControls();
  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Lascia chiudere prima eventuali popover interni (time/date picker).
        const inner = document.querySelector("[data-radix-popper-content-wrapper]");
        if (!inner) onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (typeof document === "undefined") return null;

  const margin = 16;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1440;
  const vh = typeof window !== "undefined" ? window.innerHeight : 900;
  const left = anchor ? Math.max(margin, Math.min(anchor.x, vw - margin) - width) : vw - width - 40;
  const top = anchor ? Math.max(margin, anchor.y) : 150;
  const maxHeight = vh - top - margin;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="create-event-popover"
          initial={{ opacity: 0, scale: 0.96, y: -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: -4 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          drag
          dragControls={dragControls}
          dragListener={false}
          dragMomentum={false}
          dragElastic={0}
          dragConstraints={{
            left: -(left - margin),
            right: vw - margin - width - left,
            top: -(top - margin),
            bottom: vh - 72 - top,
          }}
          className="fixed z-40 flex flex-col overflow-hidden rounded-[22px] border border-[#dddddd] bg-white shadow-[0_24px_64px_rgba(0,0,0,0.18)]"
          style={{ left, top, width, maxHeight }}
          role="dialog"
          aria-label={title}
        >
          {/* Header — maniglia di trascinamento della card */}
          <div
            className="flex shrink-0 cursor-grab select-none items-start justify-between gap-3 px-5 pb-3 pt-[18px] active:cursor-grabbing"
            onPointerDown={(event) => {
              if ((event.target as HTMLElement).closest("button")) return;
              dragControls.start(event);
            }}
          >
            <div className="min-w-0">
              <div className="text-[17px] font-bold tracking-[-0.2px] text-[#222222]">{title}</div>
              {subtitle ? (
                <div className="mt-0.5 text-[12.5px] font-medium text-[#929292]">{subtitle}</div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-0.5 flex size-[30px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#f2f2f2] transition-colors hover:bg-[#e8e8e8]"
            >
              <X className="size-3 text-[#555555]" strokeWidth={2} />
            </button>
          </div>
          {/* Body */}
          <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 pb-4", footer ? "" : "pb-5")}>
            {children}
          </div>
          {/* Footer */}
          {footer ? (
            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[#f0f0f0] px-5 py-3.5">
              {footer}
            </div>
          ) : null}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
