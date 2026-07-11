"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useDragControls } from "motion/react";
import { ChevronDown, X } from "lucide-react";
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
  width = 460,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Coordinate viewport a cui ancorare l'angolo in alto a destra della card. */
  anchor: { x: number; y: number } | null;
  /** Larghezza di partenza (poi ridimensionabile dal grip). */
  width?: number;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const dragControls = useDragControls();
  const cardRef = React.useRef<HTMLDivElement>(null);

  // Ridimensionamento col mouse dal grip in basso a destra: il contenuto è
  // fluido (input w-full, chips flex-wrap) quindi si riadatta da solo.
  const [size, setSize] = React.useState<{ w: number; h: number | null }>({ w: width, h: null });
  React.useEffect(() => {
    if (open) setSize({ w: width, h: null });
  }, [open, width]);
  const startResize = (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const onMove = (ev: PointerEvent) => {
      // clamp sul viewport usando la posizione REALE della card (drag incluso)
      const w = Math.min(Math.max(340, rect.width + ev.clientX - startX), window.innerWidth - rect.left - 8);
      const h = Math.min(Math.max(320, rect.height + ev.clientY - startY), window.innerHeight - rect.top - 8);
      setSize({ w, h });
    };
    const onUp = () => window.removeEventListener("pointermove", onMove);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  };

  // Affordance di scroll: il body può nascondere campi sotto la piega senza
  // che nulla lo segnali. Tracciamo se c'è contenuto sopra/sotto e mostriamo
  // fade + pill "Altri campi" finché non si arriva in fondo.
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = React.useState(false);
  const [canScrollDown, setCanScrollDown] = React.useState(false);
  const updateScrollHints = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 4);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  }, []);
  React.useEffect(() => {
    if (!open) return;
    // il contenuto cambia altezza quando si espandono sezioni: riosserva sempre
    const raf = requestAnimationFrame(updateScrollHints);
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return () => cancelAnimationFrame(raf);
    const observer = new ResizeObserver(updateScrollHints);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [open, updateScrollHints]);

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
  // Posizionamento "smart": la card va sul lato di schermo OPPOSTO al punto di
  // apertura (dove sta il blocco ghost / l'evento), così non lo copre, e parte
  // alta per avere il massimo spazio verticale disponibile.
  const preferLeft = anchor ? anchor.x > vw / 2 : false;
  const left = preferLeft ? margin + 8 : vw - width - margin - 8;
  const top = margin + 72;
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
          ref={cardRef}
          className="fixed z-40 flex flex-col overflow-hidden rounded-[22px] border border-[#dddddd] bg-white shadow-[0_24px_64px_rgba(0,0,0,0.18)]"
          style={{
            left,
            top,
            width: size.w,
            // finché l'utente non ridimensiona, l'altezza è naturale (capped)
            height: size.h ?? undefined,
            maxHeight: size.h ? undefined : maxHeight,
          }}
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
          <div className="relative flex min-h-0 flex-1 flex-col">
            <div
              ref={scrollRef}
              onScroll={updateScrollHints}
              className={cn("min-h-0 flex-1 overflow-y-auto px-5 pb-4", footer ? "" : "pb-5")}
            >
              {/* wrapper unico: è lui che il ResizeObserver osserva per l'altezza totale */}
              <div>{children}</div>
            </div>
            {/* Fade in alto quando c'è contenuto scrollato sopra */}
            <div
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-white to-transparent transition-opacity duration-200",
                canScrollUp ? "opacity-100" : "opacity-0",
              )}
            />
            {/* Fade + pill "Altri campi" quando c'è contenuto sotto la piega */}
            <div
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white via-white/70 to-transparent transition-opacity duration-200",
                canScrollDown ? "opacity-100" : "opacity-0",
              )}
            />
            {canScrollDown && (
              <button
                type="button"
                onClick={() => {
                  const el = scrollRef.current;
                  el?.scrollBy({ top: el.clientHeight - 80, behavior: "smooth" });
                }}
                className="absolute bottom-2 left-1/2 flex -translate-x-1/2 cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border border-[#e3e3e3] bg-white py-[5px] pl-3 pr-2 text-xs font-semibold text-[#222222] shadow-[0_2px_10px_rgba(0,0,0,0.12)] transition-colors hover:bg-[#f7f7f7]"
              >
                Altri campi
                <ChevronDown className="size-3.5" strokeWidth={2.2} />
              </button>
            )}
          </div>
          {/* Footer */}
          {footer ? (
            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[#f0f0f0] px-5 py-3.5">
              {footer}
            </div>
          ) : null}
          {/* Grip di ridimensionamento — rimbalza verso l'angolo alla prima
              apertura per segnalare che la card è ridimensionabile */}
          <motion.div
            onPointerDown={startResize}
            title="Ridimensiona"
            animate={{ x: [0, 3, 0, 3, 0], y: [0, 3, 0, 3, 0] }}
            transition={{ duration: 1.1, ease: "easeInOut", delay: 0.7, repeat: 2, repeatDelay: 1.6 }}
            className="absolute bottom-0 right-0 z-20 flex size-[20px] cursor-nwse-resize items-end justify-end p-1 text-[#b2b2b2] transition-colors hover:text-[#555555]"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M9 1 1 9M9 5.5 5.5 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
