"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * Pannello di dettaglio laterale del redesign Airbnb (pattern #detail-panel
 * del prototipo): slide-in da destra sotto l'header (84px), 600px, backdrop
 * scuro leggero che chiude al click. Transizione 220ms come il proto.
 */
export function DetailPanel({
  open,
  onOpenChange,
  children,
  className,
  testId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  const [mounted, setMounted] = React.useState(false);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setMounted(true);
      // due frame per far partire la transizione dopo il mount
      const raf = requestAnimationFrame(() =>
        requestAnimationFrame(() => setVisible(true)),
      );
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
    const timer = setTimeout(() => setMounted(false), 240);
    return () => clearTimeout(timer);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Con un layer Radix aperto (Select/Dialog/Dropdown) l'Escape chiude
      // quello, non il pannello: il layer è ancora nel DOM in questo tick.
      if (
        document.querySelector(
          "[data-radix-popper-content-wrapper], [role='listbox'], [role='menu'], [role='dialog'][data-state='open']",
        )
      )
        return;
      onOpenChange(false);
    };
    // capture: va eseguito PRIMA del listener document di Radix, quando il
    // layer aperto è ancora nel DOM.
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [open, onOpenChange]);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        aria-hidden
        onClick={() => onOpenChange(false)}
        className={cn(
          "fixed inset-x-0 bottom-0 top-[84px] z-[150] bg-black/[0.12] transition-opacity duration-[220ms] ease-out",
          visible ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <div
        role="dialog"
        aria-modal="true"
        data-testid={testId}
        className={cn(
          "fixed bottom-0 right-0 top-[84px] z-[200] w-[min(600px,100vw)] overflow-y-auto border-l border-[#dddddd] bg-white shadow-[-4px_0_24px_rgba(0,0,0,0.08)] transition-transform duration-[220ms] ease-out",
          visible ? "translate-x-0" : "translate-x-full",
          className,
        )}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
