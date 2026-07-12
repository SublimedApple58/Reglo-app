"use client";

import React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";

import { cn } from "@/lib/utils";

/**
 * Overlay di esito del proto (_istrInfoBanner / "Notifica inviata!"): card
 * centrata con illustrazione + titolo + sottotitolo, backdrop in fade e card
 * a molla, auto-chiusura dopo 1.8s (o click ovunque). Portal su body,
 * montato solo client-side.
 */
export function SuccessOverlay({
  open,
  onClose,
  image,
  title,
  subtitle,
  /** mix-blend-multiply sull'immagine (per PNG con fondo bianco, es. campanella) */
  blend,
}: {
  open: boolean;
  onClose: () => void;
  image: string;
  title: string;
  subtitle?: string;
  blend?: boolean;
}) {
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;
  React.useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => onCloseRef.current(), 1800);
    return () => clearTimeout(timer);
  }, [open]);

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/[0.32]"
          onClick={() => onCloseRef.current()}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 6 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="flex w-[400px] max-w-[90vw] flex-col items-center rounded-[20px] bg-white px-10 pb-9 pt-10 text-center shadow-[0_8px_32px_rgba(0,0,0,0.18)]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image}
              alt=""
              className={cn(
                "mx-auto mb-5 block size-[96px] select-none object-contain",
                blend && "mix-blend-multiply",
              )}
            />
            <div className="mb-2 text-xl font-bold tracking-[-0.2px] text-[#222222]">{title}</div>
            {subtitle && (
              <div className="text-sm font-medium leading-normal text-[#6a6a6a]">{subtitle}</div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
