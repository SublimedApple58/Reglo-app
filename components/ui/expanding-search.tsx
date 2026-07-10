"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Search, X } from "lucide-react";

/**
 * Ricerca espandibile stile proto (agenda): lente compatta che si espande in
 * una pillola con bordo navy; chiusura simmetrica (X o Escape) con reset del
 * testo. Controlled sia sul testo che sull'apertura.
 */
export function ExpandingSearch({
  value,
  onChange,
  open,
  onOpenChange,
  placeholder = "Cerca…",
  width = 220,
}: {
  value: string;
  onChange: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placeholder?: string;
  width?: number;
}) {
  const close = () => {
    onChange("");
    onOpenChange(false);
  };
  return (
    <AnimatePresence mode="wait" initial={false}>
      {open ? (
        <motion.div
          key="expanding-search-open"
          initial={{ width: 34, opacity: 0.5 }}
          animate={{ width, opacity: 1 }}
          exit={{ width: 34, opacity: 0, transition: { duration: 0.2, ease: [0.4, 0, 0.7, 0.2] } }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="flex h-[38px] shrink-0 items-center gap-2 overflow-hidden rounded-full border-[1.5px] border-[#1a1a2e] bg-white px-3.5 shadow-[0_2px_8px_rgba(26,26,46,0.15)]"
        >
          <Search className="size-[15px] shrink-0 text-[#1a1a2e]" strokeWidth={1.8} />
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.08 } }}
            transition={{ duration: 0.18, delay: 0.12 }}
            className="flex min-w-0 flex-1 items-center gap-2"
          >
            <input
              autoFocus
              placeholder={placeholder}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Escape") close(); }}
              className="min-w-0 flex-1 border-none bg-transparent text-sm font-medium text-[#222222] outline-none placeholder:text-[#929292]"
            />
            <button
              type="button"
              onClick={close}
              className="flex size-[18px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#ebebeb] transition-colors hover:bg-[#dddddd]"
            >
              <X className="size-2.5 text-[#555555]" strokeWidth={2} />
            </button>
          </motion.div>
        </motion.div>
      ) : (
        <motion.button
          key="expanding-search-closed"
          type="button"
          title="Cerca"
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.08 } }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          onClick={() => onOpenChange(true)}
          className="flex size-[34px] shrink-0 cursor-pointer items-center justify-center rounded-lg text-[#888888] transition-colors hover:bg-[#f0f0f0] hover:text-[#222222]"
        >
          <Search className="size-[17px]" strokeWidth={1.6} />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
