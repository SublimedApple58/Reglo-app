"use client";

import React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { EXAMINERS_MAX, EXAMINER_NAME_MAX } from "@/lib/autoscuole/exam-examiners";

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * REG-640 — gli esaminatori dell'esame: nomi liberi di persone esterne (la
 * motorizzazione), non istruttori. Di solito uno, quindi parte con una riga
 * sola e «Aggiungi esaminatore» compare quando quella è compilata.
 *
 * Il valore può contenere righe vuote mentre si scrive: si ripulisce al
 * salvataggio (`normalizeExaminers`). I suggerimenti sono i nomi già usati
 * dall'autoscuola, filtrati su quello che si sta scrivendo.
 */
export function ExaminersField({
  value,
  onChange,
  suggestions,
  disabled,
  autoFocusNew = true,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions: string[];
  disabled?: boolean;
  autoFocusNew?: boolean;
}) {
  const rows = value.length ? value : [""];
  const [focused, setFocused] = React.useState<number | null>(null);
  const [highlight, setHighlight] = React.useState(0);
  const inputs = React.useRef<Array<HTMLInputElement | null>>([]);
  const listRef = React.useRef<HTMLUListElement | null>(null);
  const focusNext = React.useRef<number | null>(null);
  // Chiave stabile per riga: l'indice cambierebbe togliendone una in mezzo
  // e l'animazione d'uscita colpirebbe la riga sbagliata.
  const keys = React.useRef<number[]>([]);
  const nextKey = React.useRef(0);
  while (keys.current.length < rows.length) keys.current.push(nextKey.current++);
  keys.current.length = rows.length;

  React.useEffect(() => {
    if (focusNext.current !== null) {
      inputs.current[focusNext.current]?.focus();
      focusNext.current = null;
    }
  });

  const setRow = (idx: number, name: string) => {
    const next = [...rows];
    next[idx] = name;
    onChange(next);
  };

  const removeRow = (idx: number) => {
    if (rows.length === 1) {
      onChange([]);
      return;
    }
    keys.current.splice(idx, 1);
    onChange(rows.filter((_, i) => i !== idx));
  };

  const addRow = () => {
    if (rows.length >= EXAMINERS_MAX) return;
    if (autoFocusNew) focusNext.current = rows.length;
    onChange([...rows, ""]);
  };

  const matchesFor = (idx: number) => {
    const typed = rows[idx].trim().toLocaleLowerCase("it");
    const taken = new Set(
      rows.filter((_, i) => i !== idx).map((n) => n.trim().toLocaleLowerCase("it")),
    );
    return suggestions
      .filter((s) => {
        const key = s.toLocaleLowerCase("it");
        if (taken.has(key) || key === typed) return false;
        return !typed || key.includes(typed);
      })
      .slice(0, 5);
  };

  const canAdd = rows.length < EXAMINERS_MAX && rows[rows.length - 1].trim() !== "";

  return (
    <div>
      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {rows.map((name, idx) => {
            const open = focused === idx && !disabled;
            const matches = open ? matchesFor(idx) : [];
            return (
              <motion.div
                key={keys.current[idx]}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22, ease: EASE }}
                className="relative"
              >
                <div className="relative">
                  <input
                    ref={(el) => {
                      inputs.current[idx] = el;
                    }}
                    value={name}
                    disabled={disabled}
                    maxLength={EXAMINER_NAME_MAX}
                    autoComplete="off"
                    placeholder={idx === 0 ? "Nome e cognome" : "Altro esaminatore"}
                    aria-label={`Esaminatore ${idx + 1}`}
                    onFocus={() => {
                      setFocused(idx);
                      setHighlight(0);
                    }}
                    onBlur={() => setFocused((f) => (f === idx ? null : f))}
                    onChange={(e) => {
                      setRow(idx, e.target.value);
                      setHighlight(0);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown" && matches.length) {
                        e.preventDefault();
                        setHighlight((h) => (h + 1) % matches.length);
                      } else if (e.key === "ArrowUp" && matches.length) {
                        e.preventDefault();
                        setHighlight((h) => (h - 1 + matches.length) % matches.length);
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        if (matches.length && name.trim()) setRow(idx, matches[highlight] ?? matches[0]);
                        else if (canAdd && idx === rows.length - 1) addRow();
                      } else if (e.key === "Escape") {
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className="w-full rounded-lg border-[1.5px] border-[#dddddd] bg-white py-[11px] pl-3.5 pr-10 text-sm font-medium text-foreground outline-none transition-colors placeholder:text-[#c1c1c1] focus:border-[#222222] disabled:opacity-60"
                  />
                  {(name || rows.length > 1) && !disabled ? (
                    <button
                      type="button"
                      aria-label="Togli esaminatore"
                      // mousedown: il blur dell'input non deve chiudere prima del click.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => removeRow(idx)}
                      className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-[#929292] transition-colors hover:bg-[#f2f2f2] hover:text-[#222222]"
                    >
                      <X className="size-4" strokeWidth={2} />
                    </button>
                  ) : null}
                </div>
                <AnimatePresence>
                  {matches.length > 0 ? (
                    // Nel flusso e non sovrapposta: i dialog che la ospitano
                    // scorrono e una tendina assoluta verrebbe tagliata.
                    <motion.ul
                      role="listbox"
                      // A fine apertura, non al montaggio: prima l'altezza è 0.
                      onAnimationComplete={(def) => {
                        if ((def as { height?: unknown }).height !== "auto") return;
                        listRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
                      }}
                      ref={listRef}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2, ease: EASE }}
                      className="mt-1.5 overflow-hidden rounded-[12px] border border-[#ebebeb] bg-white py-1 shadow-[0_6px_20px_rgba(0,0,0,0.08)]"
                    >
                      {!name.trim() ? (
                        <li className="px-3.5 pb-1 pt-1.5 text-[11.5px] font-medium text-[#929292]">
                          Già usati dall&apos;autoscuola
                        </li>
                      ) : null}
                      {matches.map((m, i) => (
                        <li
                          key={m}
                          role="option"
                          aria-selected={i === highlight}
                          onMouseDown={(e) => e.preventDefault()}
                          onMouseEnter={() => setHighlight(i)}
                          onClick={() => {
                            setRow(idx, m);
                            inputs.current[idx]?.blur();
                          }}
                          className={cn(
                            "cursor-pointer px-3.5 py-2 text-sm font-medium text-foreground",
                            i === highlight && "bg-[#f5f5f5]",
                          )}
                        >
                          {m}
                        </li>
                      ))}
                    </motion.ul>
                  ) : null}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      {canAdd && !disabled ? (
        <button
          type="button"
          onClick={addRow}
          className="mt-2.5 inline-flex cursor-pointer items-center gap-1.5 rounded-full py-1 text-[13px] font-semibold text-[#222222] transition-opacity hover:opacity-70"
        >
          <Plus className="size-3.5" strokeWidth={2.2} />
          Aggiungi esaminatore
        </button>
      ) : null}
    </div>
  );
}
